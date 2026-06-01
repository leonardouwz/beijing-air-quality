#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — Motor de datos del prototipo "Contrataciones — Espacio de Riesgo".

Toma la salida del notebook `fase1_Preprocesamiento.ipynb`
(`adjudicaciones_procesadas.parquet`) y COMPLETA la limpieza que faltaba para
que el vector sea apto para PCA / visualizacion, luego lo serializa para el
navegador en  data/cp_data.js  (window.CP_DATA).

Limpieza/finalizacion que se hace aqui (lo que el notebook dejo pendiente):
  • Elimina la columna cruda sobrante  '...:Nombre de Moneda'.
  • Descarta `proveedor_fuera_region` (100% NaN en la corrida del notebook).
  • Filtra adjudicaciones sin monto en PEN o sin fecha (no situables).
  • Imputa NaN de forma razonada:
        - campos de contrato (monto_contrato, duracion) -> 0  (no se firmo)
        - num_contratos_previos / montos acumulados      -> 0  (primer contrato)
        - dias_plazo / porc_adjudicado                    -> mediana
  • Recorta `porc_adjudicado` a [0, 300] (hay valores de 10 000 % por error;
    se conserva >120 % como senal de sobrecosto).
  • log1p a las variables monetarias (rango 1 .. 4.8e10) antes de escalar.
  • Normalizacion Min-Max 0-1 de las 12 features -> matriz para PCA.
  • Score de riesgo = suma de alertas (sobrecosto + plazo corto + sin competencia).

Ejecutar:
    python build_data.py [ruta_al_parquet]
Si no se pasa ruta, busca `adjudicaciones_procesadas.parquet` en ubicaciones
habituales (ver CANDIDATES).
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

HERE = Path(__file__).resolve().parent
OUT_JS = HERE / "data" / "cp_data.js"

CANDIDATES = [
    HERE / "adjudicaciones_procesadas.parquet",
    HERE.parent / "adjudicaciones_procesadas.parquet",
    HERE.parent.parent / "adjudicaciones_procesadas.parquet",
    HERE / "data" / "adjudicaciones_procesadas.parquet",
]

# Feature -> transformacion antes de Min-Max ('log' = log1p, 'lin' = tal cual)
FEATURE_DEF = [
    ("monto_adjudicado_pen",   "log"),
    ("monto_referencial_pen",  "log"),
    ("monto_contrato",         "log"),
    ("monto_promedio_previo",  "log"),
    ("num_licitantes_final",   "lin"),
    ("num_contratos_previos",  "log"),
    ("dias_plazo",             "lin"),
    ("duracion_contrato_dias", "lin"),
    ("porc_adjudicado",        "lin"),
    ("es_consorcio",           "lin"),
    ("tiene_contrato",         "lin"),
    ("metodo_desconocido",     "lin"),
]
FEATURES = [f for f, _ in FEATURE_DEF]

ALERTS = ["alerta_sobrecosto", "alerta_plazo_corto", "alerta_sin_competencia"]
JUNK_COL = "Entrega compilada:Adjudicaciones:Valor:Nombre de Moneda"


def log(m=""):
    print(m, flush=True)


def find_parquet() -> Path:
    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        if p.exists():
            return p
        sys.exit(f"ERROR: no existe el parquet indicado: {p}")
    for c in CANDIDATES:
        if c.exists():
            return c
    sys.exit(
        "ERROR: no se encontro 'adjudicaciones_procesadas.parquet'.\n"
        "  Ejecuta primero el notebook fase1_Preprocesamiento.ipynb para generarlo,\n"
        "  o pasa la ruta:  python build_data.py C:/ruta/adjudicaciones_procesadas.parquet\n"
        "  (Para una demo sin datos reales:  python make_sample_data.py)"
    )


def main():
    pq = find_parquet()
    log("=" * 66)
    log("  MOTOR DE DATOS — Contrataciones: Espacio de Riesgo")
    log("=" * 66)
    log(f"\n[1/5] Cargando {pq.name} ...")
    df = pd.read_parquet(pq)
    log(f"      {len(df):,} filas × {df.shape[1]} columnas")

    # ── Limpieza pendiente ───────────────────────────────────────────────
    log("\n[2/5] Limpieza/finalizacion (lo que faltaba)...")
    df = df.drop(columns=[JUNK_COL], errors="ignore")
    df = df.drop(columns=["proveedor_fuera_region", "alerta_proveedor_lejano"],
                 errors="ignore")  # 100% NaN en la corrida del notebook

    df["fecha_adjudicacion"] = pd.to_datetime(df.get("fecha_adjudicacion"), errors="coerce")
    n0 = len(df)
    df = df[df["monto_adjudicado_pen"].notna() & df["fecha_adjudicacion"].notna()].copy()
    log(f"      Filtradas {n0 - len(df):,} sin monto PEN o sin fecha -> {len(df):,} filas")

    # Imputaciones razonadas
    for c in ["monto_contrato", "duracion_contrato_dias",
              "num_contratos_previos", "monto_acum_proveedor", "monto_promedio_previo",
              "es_consorcio", "tiene_contrato", "metodo_desconocido"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    for c in ["dias_plazo"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
        df[c] = df[c].fillna(df[c].median())
    df["porc_adjudicado"] = pd.to_numeric(df["porc_adjudicado"], errors="coerce")
    df["porc_adjudicado"] = df["porc_adjudicado"].fillna(df["porc_adjudicado"].median()).clip(0, 300)
    df["num_licitantes_final"] = pd.to_numeric(df["num_licitantes_final"], errors="coerce").fillna(1)
    for c in FEATURES:
        if c not in df.columns:
            df[c] = 0.0
            log(f"      ⚠ columna ausente '{c}' -> rellenada con 0")

    # Score de riesgo (0-3) y bitmask de alertas
    for a in ALERTS:
        df[a] = pd.to_numeric(df.get(a), errors="coerce").fillna(0).astype(int).clip(0, 1)
    df["riesgo"] = df[ALERTS].sum(axis=1).astype(int)
    df["alert_mask"] = (df["alerta_sobrecosto"]
                        + 2 * df["alerta_plazo_corto"]
                        + 4 * df["alerta_sin_competencia"]).astype(int)

    # ── Matriz de features para PCA ──────────────────────────────────────
    log("\n[3/5] Transformacion (log montos) + Min-Max...")
    M = np.zeros((len(df), len(FEATURE_DEF)), dtype=float)
    for j, (feat, tr) in enumerate(FEATURE_DEF):
        col = pd.to_numeric(df[feat], errors="coerce").fillna(0).to_numpy(dtype=float)
        M[:, j] = np.log1p(np.clip(col, 0, None)) if tr == "log" else col
    scaler = MinMaxScaler()
    Xn = scaler.fit_transform(M)
    log(f"      {len(FEATURES)} features normalizadas en [0,1]")

    # ── Categoricas -> indices + niveles ─────────────────────────────────
    log("\n[4/5] Codificacion de categoricas y arrays de visualizacion...")

    def encode(series, fillna="(s/d)"):
        s = series.astype("object").where(series.notna(), fillna).astype(str)
        levels = sorted(s.unique().tolist())
        idx = s.map({v: i for i, v in enumerate(levels)}).astype(int)
        return idx.tolist(), levels

    metodo_idx, metodo_lv = encode(df.get("metodo_contratacion_limpio", pd.Series(index=df.index)))
    categ_idx,  categ_lv  = encode(df.get("categoria_principal", pd.Series(index=df.index)))
    dept_idx,   dept_lv   = encode(df.get("dept_entidad", pd.Series(index=df.index)))
    prov_idx,   prov_lv   = encode(df.get("nombre_proveedor", pd.Series(index=df.index)))

    t_ms = df["fecha_adjudicacion"].values.astype("datetime64[ms]").astype("int64")

    def disp(col, ndig=2):
        return [round(float(v), ndig) for v in pd.to_numeric(df[col], errors="coerce").fillna(0)]

    payload = {
        "meta": {
            "label": "Contrataciones Perú 2025 (OCDS / SEACE)",
            "note": f"{len(df):,} adjudicaciones · features log+MinMax · riesgo=alertas(0-3)",
            "features": FEATURES,
            "methods": metodo_lv,
            "categories": categ_lv,
            "depts": dept_lv,
            "providers": prov_lv,
            "alerts": ["Sobrecosto", "Plazo corto", "Sin competencia"],
            "n": int(len(df)),
        },
        "t": t_ms.tolist(),
        "metodo": metodo_idx,
        "categoria": categ_idx,
        "dept": dept_idx,
        "prov": prov_idx,
        "riesgo": df["riesgo"].tolist(),
        "amask": df["alert_mask"].tolist(),
        # valores originales para histogramas / tooltip
        "monto":    disp("monto_adjudicado_pen", 2),
        "montoref": disp("monto_referencial_pen", 2),
        "porc":     disp("porc_adjudicado", 1),
        "numlic":   [int(v) for v in df["num_licitantes_final"]],
        "dias":     disp("dias_plazo", 0),
        "dur":      disp("duracion_contrato_dias", 0),
        # matriz normalizada (columnar) para PCA
        "X": [[round(float(Xn[i, j]), 4) for i in range(Xn.shape[0])]
              for j in range(Xn.shape[1])],
    }

    log("\n[5/5] Serializando data/cp_data.js ...")
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("window.CP_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
                      encoding="utf-8")
    size_mb = OUT_JS.stat().st_size / (1024 * 1024)

    # Validacion
    assert Xn.min() >= -1e-9 and Xn.max() <= 1 + 1e-9, "Min-Max fuera de [0,1]"
    assert not np.isnan(Xn).any(), "Quedan NaN en la matriz"
    log(f"      -> {OUT_JS}  ({size_mb:.2f} MB)")
    log(f"      registros={len(df):,}  metodos={metodo_lv}")
    log(f"      riesgo (conteo): {df['riesgo'].value_counts().sort_index().to_dict()}")
    log("\n" + "=" * 66)
    log("  LISTO. Abre contrataciones/prototipo/index.html")
    log("=" * 66)


if __name__ == "__main__":
    main()
