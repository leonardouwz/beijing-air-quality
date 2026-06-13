#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
umap_embed.py — Embedding 2D con UMAP del vector de características, ALINEADO a los
registros del prototipo y exportado como  data/aq_umap.js  (window.AQ_UMAP).

Idea: UMAP NO sustituye al PCA. El PCA (lineal, interpretable, con % de varianza y
cargas) se calcula en el cliente; UMAP es una vista de CLÚSTERES no lineal que se
precalcula offline (no es viable en el navegador para decenas de miles de puntos).
Sus ejes NO tienen interpretación lineal y las distancias / tamaños de clúster no son
cuantitativos: sirve para "ver" grupos, no para medir.

Alineación: se reutiliza el MISMO pipeline de build_data.py (se importa) para que el
orden de filas coincida exactamente con aq_data.js / aq_data_raw.js. Así la fila i del
embedding corresponde al registro i del scatter (D.X[j][i], D.t[i], ...). La misma
normalización Min-Max se aplica antes de UMAP.

Requisitos:
    pip install umap-learn          # arrastra numpy, scipy, scikit-learn, numba

Uso:
    python umap_embed.py                                  # 'treated' (~33 K filas)
    python umap_embed.py --datasets treated,raw           # raw ~420 K: lento y pesado
    python umap_embed.py --neighbors 30 --min-dist 0.1 --metric euclidean --seed 42

Salida:  prototipo/data/aq_umap.js   ->   window.AQ_UMAP = {
             meta:{ n_neighbors, min_dist, metric, seed, features },
             treated:{ u1:[...N], u2:[...N] },
             raw?:{ u1:[...], u2:[...] }
         }
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.preprocessing import MinMaxScaler

# Importa el motor de datos del prototipo (mismo directorio) para reproducir el
# vector con el MISMO orden de filas que aq_data.js / aq_data_raw.js.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_data as bd  # noqa: E402

OUT_DEFAULT = HERE / "data" / "aq_umap.js"


def build_df(key: str):
    """Reconstruye el DataFrame de un dataset con el pipeline de build_data."""
    if key == "treated":
        return bd.prepare_treated()
    if key == "raw":
        return bd.prepare_raw()
    raise ValueError(f"dataset desconocido: {key}")


def embed(df, args):
    """Normaliza Min-Max (igual que build_data) y devuelve el embedding 2D de UMAP."""
    import umap  # import diferido: mensaje claro si falta la librería

    X = MinMaxScaler().fit_transform(df[bd.FEATURES].values)  # MISMA normalización
    reducer = umap.UMAP(
        n_neighbors=args.neighbors,
        min_dist=args.min_dist,
        metric=args.metric,
        n_components=2,
        random_state=args.seed,
        verbose=True,
    )
    return reducer.fit_transform(X)


def main():
    ap = argparse.ArgumentParser(description="UMAP 2D del vector -> data/aq_umap.js")
    ap.add_argument("--datasets", default="treated",
                    help="lista separada por comas: treated,raw  (raw ~420 K filas: lento)")
    ap.add_argument("--neighbors", type=int, default=30,
                    help="n_neighbors: estructura local (bajo) vs global (alto)")
    ap.add_argument("--min-dist", type=float, default=0.1, dest="min_dist",
                    help="min_dist: compactación de los puntos (bajo = clústeres apretados)")
    ap.add_argument("--metric", default="euclidean", help="euclidean | cosine | manhattan | ...")
    ap.add_argument("--seed", type=int, default=42, help="random_state (reproducibilidad)")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    args = ap.parse_args()

    try:
        import umap  # noqa: F401
    except ImportError:
        sys.exit("ERROR: falta 'umap-learn'.  Instala con:  pip install umap-learn")

    wanted = [d.strip() for d in args.datasets.split(",") if d.strip()]
    payload = {
        "meta": {
            "n_neighbors": args.neighbors,
            "min_dist": args.min_dist,
            "metric": args.metric,
            "seed": args.seed,
            "features": bd.FEATURES,
        }
    }

    print("=" * 64)
    print("  UMAP — embedding 2D del vector de características (Beijing Air)")
    print("=" * 64)
    for key in wanted:
        t0 = time.time()
        try:
            df = build_df(key)
        except ValueError as e:
            print(f"  {e}  (omitido)")
            continue
        print(f"\n[UMAP] {key}: {len(df):,} filas × {len(bd.FEATURES)}D  "
              f"(n_neighbors={args.neighbors}, min_dist={args.min_dist}, metric={args.metric})")
        emb = embed(df, args)
        payload[key] = {
            "u1": [round(float(v), 3) for v in emb[:, 0]],
            "u2": [round(float(v), 3) for v in emb[:, 1]],
        }
        print(f"  -> {key}: {len(df):,} puntos embebidos en {time.time() - t0:.1f}s")

    if not any(k in payload for k in ("treated", "raw")):
        sys.exit("No se generó ningún embedding (revisa --datasets).")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    js = "window.AQ_UMAP = " + json.dumps(payload, separators=(",", ":")) + ";"
    out_path.write_text(js, encoding="utf-8")
    size_mb = out_path.stat().st_size / (1024 * 1024)

    print("\n" + "=" * 64)
    print(f"  OK -> {out_path}  ({size_mb:.2f} MB)")
    print("  En index2_1.html ya se carga data/aq_umap.js (antes de aq_app_1.js):")
    print("  abre la variante y usa el botón  'layout: PCA / UMAP'  sobre el scatter A.")
    print("=" * 64)


if __name__ == "__main__":
    main()
