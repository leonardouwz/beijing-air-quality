#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_graph.py — Genera data/graph_data.js para grafo.html

Lee adjudicaciones_procesadas.parquet y exporta una muestra representativa
del grafo comprador → proveedor para visualización en el navegador.

Muestra:
  • TOP_COMPRADORES compradores por monto total adjudicado.
  • Por cada uno, hasta TOP_PROV_POR_COMP proveedores más relevantes.
  • Las aristas se agregan: múltiples contratos entre el mismo par → una arista.

Uso:
  python build_graph.py                         # busca el parquet automáticamente
  python build_graph.py ruta/al.parquet         # ruta explícita
  python build_graph.py --top-comp 60           # ajustar parámetros
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT_JS = HERE / "data" / "graph_data.js"

TOP_COMPRADORES    = 80
TOP_PROV_POR_COMP  = 12

PARQUET_CANDIDATES = [
    HERE / "adjudicaciones_procesadas.parquet",
    HERE.parent / "adjudicaciones_procesadas.parquet",
    HERE.parent.parent / "adjudicaciones_procesadas.parquet",
]

JUNK_COL = "Entrega compilada:Adjudicaciones:Valor:Nombre de Moneda"


def log(m=""): print(m.encode("ascii", "replace").decode("ascii"), flush=True)


def find_parquet() -> Path:
    for p in PARQUET_CANDIDATES:
        if p.exists():
            return p
    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            p = Path(arg)
            if p.exists():
                return p
    sys.exit(
        "ERROR: no se encontró adjudicaciones_procesadas.parquet.\n"
        "  Ejecuta primero fase1_Preprocesamiento.ipynb o pasa la ruta:\n"
        "    python build_graph.py C:/ruta/adjudicaciones_procesadas.parquet"
    )


def fmt_ruc(org_id: str) -> str:
    """Extrae RUC/ID limpio desde el formato OCDS PE-RUC-XXXXXXXXXXX."""
    s = str(org_id)
    for prefix in ("PE-RUC-", "PE-DNI-", "PE-"):
        if s.startswith(prefix):
            return s[len(prefix):]
    return s


def main():
    pq = find_parquet()
    log("=" * 64)
    log("  BUILD GRAPH — Contrataciones: Red de Relaciones")
    log("=" * 64)
    log(f"\n[1/5] Cargando {pq.name} ...")
    df = pd.read_parquet(pq)
    df = df.drop(columns=[JUNK_COL], errors="ignore")
    log(f"      {len(df):,} filas × {df.shape[1]} cols")

    # ── Filtrar filas con ambos extremos del arco ─────────────────────────
    log("\n[2/5] Filtrando y preparando columnas...")
    df = df.dropna(subset=["id_organizacion_comprador", "ruc_proveedor"]).copy()
    log(f"      {len(df):,} filas con comprador + proveedor")

    # Garantizar columnas de alerta
    for col in ["alerta_sobrecosto", "alerta_plazo_corto", "alerta_sin_competencia"]:
        if col not in df.columns:
            df[col] = 0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["riesgo"] = (
        df["alerta_sobrecosto"] + df["alerta_plazo_corto"] + df["alerta_sin_competencia"]
    ).astype(int).clip(0, 3)

    # Nombre legible para compradores (usa RUC limpio)
    df["id_comp_limpio"] = df["id_organizacion_comprador"].astype(str).apply(fmt_ruc)

    # ── Selección de muestra ─────────────────────────────────────────────
    log(f"\n[3/5] Seleccionando top {TOP_COMPRADORES} compradores × "
        f"top {TOP_PROV_POR_COMP} proveedores c/u ...")
    comp_monto = df.groupby("id_comp_limpio")["monto_adjudicado_pen"].sum()
    top_comp = comp_monto.nlargest(TOP_COMPRADORES).index
    df_sub = df[df["id_comp_limpio"].isin(top_comp)].copy()

    partes = []
    for comp, grp in df_sub.groupby("id_comp_limpio"):
        prov_monto = grp.groupby("ruc_proveedor")["monto_adjudicado_pen"].sum()
        top_prov = prov_monto.nlargest(TOP_PROV_POR_COMP).index
        partes.append(grp[grp["ruc_proveedor"].isin(top_prov)])
    df_sel = pd.concat(partes, ignore_index=True)

    n_comp = df_sel["id_comp_limpio"].nunique()
    n_prov = df_sel["ruc_proveedor"].nunique()
    log(f"      {n_comp} compradores · {n_prov} proveedores · {len(df_sel):,} contratos")

    # ── Agregar aristas ──────────────────────────────────────────────────
    log("\n[4/5] Agregando aristas (un par → una arista)...")
    agg = (
        df_sel.groupby(["id_comp_limpio", "ruc_proveedor"])
        .agg(
            total_monto    = ("monto_adjudicado_pen", "sum"),
            n_contratos    = ("monto_adjudicado_pen", "count"),
            max_riesgo     = ("riesgo", "max"),
            avg_riesgo     = ("riesgo", "mean"),
            n_alertas      = ("riesgo", "sum"),
            metodo         = ("metodo_contratacion_limpio",
                              lambda x: x.mode().iloc[0] if len(x) > 0 else ""),
        )
        .reset_index()
    )

    # ── Nodos ────────────────────────────────────────────────────────────
    log("      Construyendo nodos...")

    # Compradores
    comp_stats = (
        df_sel.groupby("id_comp_limpio")
        .agg(
            total_monto = ("monto_adjudicado_pen", "sum"),
            n_contratos = ("monto_adjudicado_pen", "count"),
            avg_riesgo  = ("riesgo", "mean"),
            dept        = ("dept_entidad",
                           lambda x: x.mode().iloc[0] if x.notna().any() else ""),
        )
        .reset_index()
    )

    # Proveedores
    has_nombre = "nombre_proveedor" in df_sel.columns
    has_dept_p = "dept_proveedor"   in df_sel.columns
    prov_agg_args = {
        "total_monto": ("monto_adjudicado_pen", "sum"),
        "n_contratos": ("monto_adjudicado_pen", "count"),
        "avg_riesgo":  ("riesgo", "mean"),
    }
    if has_nombre:
        prov_agg_args["nombre"] = (
            "nombre_proveedor",
            lambda x: x.mode().iloc[0] if x.notna().any() else "",
        )
    if has_dept_p:
        prov_agg_args["dept"] = (
            "dept_proveedor",
            lambda x: x.mode().iloc[0] if x.notna().any() else "",
        )
    prov_stats = (
        df_sel[df_sel["ruc_proveedor"].isin(agg["ruc_proveedor"].unique())]
        .groupby("ruc_proveedor")
        .agg(**prov_agg_args)
        .reset_index()
    )

    # ── Serializar ───────────────────────────────────────────────────────
    log("\n[5/5] Serializando data/graph_data.js ...")
    nodes = []
    for _, r in comp_stats.iterrows():
        nodes.append({
            "id":          str(r["id_comp_limpio"]),
            "tipo":        "comprador",
            "label":       str(r["id_comp_limpio"])[:30],
            "dept":        str(r.get("dept", "") or ""),
            "total_monto": round(float(r["total_monto"]), 2),
            "n_contratos": int(r["n_contratos"]),
            "avg_riesgo":  round(float(r["avg_riesgo"]), 3),
        })

    for _, r in prov_stats.iterrows():
        nombre = str(r.get("nombre", "") or "") if has_nombre else ""
        label  = nombre[:30] if nombre else str(r["ruc_proveedor"])[:20]
        nodes.append({
            "id":          str(r["ruc_proveedor"]),
            "tipo":        "proveedor",
            "label":       label,
            "nombre":      nombre,
            "dept":        str(r.get("dept", "") or "") if has_dept_p else "",
            "total_monto": round(float(r["total_monto"]), 2),
            "n_contratos": int(r["n_contratos"]),
            "avg_riesgo":  round(float(r["avg_riesgo"]), 3),
        })

    edges = []
    for _, r in agg.iterrows():
        edges.append({
            "source":      str(r["id_comp_limpio"]),
            "target":      str(r["ruc_proveedor"]),
            "total_monto": round(float(r["total_monto"]), 2),
            "n_contratos": int(r["n_contratos"]),
            "max_riesgo":  int(r["max_riesgo"]),
            "avg_riesgo":  round(float(r["avg_riesgo"]), 3),
            "n_alertas":   int(r["n_alertas"]),
            "metodo":      str(r["metodo"]),
        })

    monto_total = float(df_sel["monto_adjudicado_pen"].sum())
    payload = {
        "meta": {
            "n_nodos":      len(nodes),
            "n_aristas":    len(edges),
            "n_compradores": n_comp,
            "n_proveedores": n_prov,
            "monto_total":  round(monto_total, 2),
            "label":        f"Top {TOP_COMPRADORES} compradores · {TOP_PROV_POR_COMP} proveedores c/u",
            "fuente":       pq.name,
        },
        "nodes": nodes,
        "edges": edges,
    }

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text(
        "window.GRAPH_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    size_kb = OUT_JS.stat().st_size / 1024
    log(f"\n{'='*64}")
    log(f"  LISTO → {OUT_JS}  ({size_kb:.0f} KB)")
    log(f"  Nodos: {len(nodes)}  Aristas: {len(edges)}")
    log(f"  Abre cts/prototipo/grafo.html")
    log(f"{'='*64}")


if __name__ == "__main__":
    main()
