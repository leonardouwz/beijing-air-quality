#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — Motor de datos del prototipo "Diabetes — Mapa de Riesgo".

La compañera ya hizo en `correccion.ipynb` toda la limpieza + el vector de
características + el **PCA en Python** y exportó una muestra a
`datos_dashboard (3).json` (2000 registros con coordenadas x,y ya proyectadas).

Este script consume ese JSON (camino preferido) y lo serializa al formato que
usa el navegador en  data/db_data.js  (window.DB_DATA, columnar).

Fallback: si no hay JSON, reproduce su pipeline desde el CSV crudo
(dedup -> traducción -> selección de 8 variables -> StandardScaler -> PCA 2D)
y muestrea, por si se quiere regenerar con más puntos.

Ejecutar:  python build_data.py [ruta_json_o_csv]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT_JS = HERE / "data" / "db_data.js"

JSON_CANDIDATES = [
    HERE / "datos_dashboard.json",
    HERE.parent / "datos_dashboard (3).json",
    HERE.parent / "datos_dashboard.json",
]
CSV_CANDIDATES = [
    HERE.parent / "diabetes_binary_health_indicators_BRFSS2015.csv",
    HERE / "diabetes_binary_health_indicators_BRFSS2015.csv",
]

# Columnas de visualización que el prototipo usa si están disponibles.
DISPLAY = ["IMC", "Edad", "Salud_General", "Salud_Fisica",
           "Presion_Alta", "Colesterol_Alto", "Enf_Cardiaca", "Dif_Caminar"]

EDAD_LABELS = ["", "18-24", "25-29", "30-34", "35-39", "40-44", "45-49",
               "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80+"]
SALUD_LABELS = ["", "Excelente", "Muy buena", "Buena", "Regular", "Mala"]

# Pipeline de la compañera (para el fallback desde CSV)
TRAD = {
    'Diabetes_binary': 'Diabetes', 'HighBP': 'Presion_Alta', 'HighChol': 'Colesterol_Alto',
    'CholCheck': 'Revision_Colesterol', 'BMI': 'IMC', 'Smoker': 'Fumador', 'Stroke': 'Derrame',
    'HeartDiseaseorAttack': 'Enf_Cardiaca', 'PhysActivity': 'Actividad_Fisica', 'Fruits': 'Frutas',
    'Veggies': 'Vegetales', 'HvyAlcoholConsump': 'Alcohol_Pesado', 'AnyHealthcare': 'Cobertura_Salud',
    'NoDocbcCost': 'SinMedico_Costo', 'GenHlth': 'Salud_General', 'MentHlth': 'Salud_Mental',
    'PhysHlth': 'Salud_Fisica', 'DiffWalk': 'Dif_Caminar', 'Sex': 'Sexo', 'Age': 'Edad',
    'Education': 'Educacion', 'Income': 'Ingreso',
}
VARS_PCA = ['Salud_General', 'IMC', 'Edad', 'Salud_Fisica',
            'Salud_Mental', 'Ingreso', 'Educacion', 'Dif_Caminar']


def log(m=""):
    print(m, flush=True)


def from_json(path: Path) -> pd.DataFrame:
    log(f"[fuente] JSON ya proyectado: {path.name}")
    rows = json.load(open(path, encoding="utf-8"))
    return pd.DataFrame(rows)


def from_csv(path: Path, sample: int = 4000) -> pd.DataFrame:
    from sklearn.preprocessing import StandardScaler
    from sklearn.decomposition import PCA
    log(f"[fuente] CSV crudo (reproduzco pipeline): {path.name}")
    df = pd.read_csv(path).drop_duplicates().rename(columns=TRAD)
    for c in df.columns:
        if c != "IMC":
            df[c] = df[c].astype(int)
    feats = [v for v in VARS_PCA if v in df.columns]
    Xs = StandardScaler().fit_transform(df[feats])
    xy = PCA(n_components=2, random_state=42).fit_transform(Xs)
    out = pd.DataFrame({"x": xy[:, 0], "y": xy[:, 1], "diabetes": df["Diabetes"].values})
    for c in DISPLAY:
        if c in df.columns:
            out[c] = df[c].values
    if sample and len(out) > sample:
        out = out.sample(sample, random_state=42).reset_index(drop=True)
    return out


def main():
    src = None
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
        if not src.exists():
            sys.exit(f"ERROR: no existe {src}")
    if src is None:
        src = next((p for p in JSON_CANDIDATES if p.exists()), None)
    if src is None:
        src = next((p for p in CSV_CANDIDATES if p.exists()), None)
    if src is None:
        sys.exit("ERROR: no encontré el JSON del dashboard ni el CSV crudo.")

    log("=" * 64)
    log("  MOTOR DE DATOS — Diabetes: Mapa de Riesgo")
    log("=" * 64)
    df = from_json(src) if src.suffix == ".json" else from_csv(src)

    # ── Verificación / saneo (la limpieza fuerte ya la hizo el notebook) ──
    n0 = len(df)
    df = df.dropna(subset=["x", "y", "diabetes"]).copy()
    df["diabetes"] = df["diabetes"].astype(int).clip(0, 1)
    present = [c for c in DISPLAY if c in df.columns]
    for c in present:
        df[c] = pd.to_numeric(df[c], errors="coerce")
        df[c] = df[c].fillna(df[c].median())
    log(f"  Registros: {len(df):,} (de {n0:,}) · columnas display: {present}")
    prev = 100 * df["diabetes"].mean()
    log(f"  Prevalencia diabetes: {prev:.1f}%")

    def col(c, nd=2):
        return [round(float(v), nd) for v in df[c]]

    payload = {
        "meta": {
            "label": "Diabetes BRFSS-2015 (EE.UU.)",
            "note": f"{len(df):,} encuestados · PCA 2D (notebook) · prevalencia {prev:.1f}%",
            "n": int(len(df)),
            "prevalencia": round(prev, 1),
            "features": present,
            "ranges": {c: [float(df[c].min()), float(df[c].max())] for c in present},
            "edad_labels": EDAD_LABELS,
            "salud_labels": SALUD_LABELS,
            "source": src.name,
        },
        "x": col("x", 4), "y": col("y", 4),
        "diabetes": [int(v) for v in df["diabetes"]],
        "feats": {c: ([int(v) for v in df[c]] if c != "IMC" else col(c, 1)) for c in present},
    }

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("window.DB_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
                      encoding="utf-8")
    size_kb = OUT_JS.stat().st_size / 1024
    log(f"  -> {OUT_JS}  ({size_kb:.0f} KB)")
    log("=" * 64)
    log("  LISTO. Abre dbts/prototipo/index.html")
    log("=" * 64)


if __name__ == "__main__":
    main()
