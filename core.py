#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
core.py — Beijing Air Quality KNN v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Algoritmos puros: métricas de distancia, KNN entre estaciones,
detección de eventos críticos, generación de hipótesis vía Claude API.

No importa nada de interface.py ni data_manager.py.
"""

import heapq
import time
import requests
import json
import numpy as np
from typing import Optional

# ══════════════════════════════════════════════════════════════════
#  FEATURES Y CONSTANTES DEL DOMINIO
# ══════════════════════════════════════════════════════════════════

# Features disponibles según el dataset histórico UCI
FEATURES_UCI = ["PM2.5", "PM10", "SO2", "NO2", "CO", "O3",
                 "TEMP", "PRES", "DEW", "WSPM"]

# Features del dataset actual (solo PM2.5 garantizado)
FEATURES_CURR = ["PM2.5"]

# Umbrales PM2.5 (µg/m³) — estándar chino GB 3095-2012
PM25_THRESHOLDS = {
    "Bueno":              (0,   35),
    "Moderado":           (35,  75),
    "Insalubre sensibles":(75, 115),
    "Insalubre":         (115, 150),
    "Muy insalubre":     (150, 250),
    "Peligroso":         (250, 999),
}

FORMULAS = {
    "coseno":     "1 − (u·v)/(‖u‖×‖v‖)",
    "pearson":    "1 − r(u,v)",
    "manhattan":  "Σ|ui−vi|",
    "euclidiana": "√Σ(ui−vi)²",
}

# ══════════════════════════════════════════════════════════════════
#  NORMALIZACIÓN
# ══════════════════════════════════════════════════════════════════

def zscore_matrix(matrix: np.ndarray) -> np.ndarray:
    """Z-score por columna. Columnas con std=0 → 0."""
    mu = matrix.mean(axis=0)
    sd = matrix.std(axis=0)
    sd[sd < 1e-10] = 1.0
    return (matrix - mu) / sd


def minmax_matrix(matrix: np.ndarray) -> np.ndarray:
    """Min-max por columna al rango [0, 1]."""
    mn = matrix.min(axis=0)
    mx = matrix.max(axis=0)
    rng = mx - mn
    rng[rng < 1e-10] = 1.0
    return (matrix - mn) / rng

# ══════════════════════════════════════════════════════════════════
#  MÉTRICAS DE DISTANCIA — implementación manual sin scipy/sklearn
# ══════════════════════════════════════════════════════════════════

def distancia_coseno(u: np.ndarray, v: np.ndarray) -> float:
    dot = float(np.dot(u, v))
    nu  = float(np.sqrt(np.dot(u, u)))
    nv  = float(np.sqrt(np.dot(v, v)))
    if nu < 1e-12 or nv < 1e-12:
        return 1.0
    return 1.0 - dot / (nu * nv)


def distancia_pearson(u: np.ndarray, v: np.ndarray) -> float:
    n = len(u)
    if n < 2:
        return 1.0
    mu, mv = u.mean(), v.mean()
    num = float(np.sum((u - mu) * (v - mv)))
    dx  = float(np.sum((u - mu) ** 2))
    dy  = float(np.sum((v - mv) ** 2))
    if dx < 1e-10 or dy < 1e-10:
        return 1.0
    r = num / (dx ** 0.5 * dy ** 0.5)
    return 1.0 - float(np.clip(r, -1.0, 1.0))


def distancia_manhattan(u: np.ndarray, v: np.ndarray) -> float:
    return float(np.sum(np.abs(u - v)))


def distancia_euclidiana(u: np.ndarray, v: np.ndarray) -> float:
    return float(np.sqrt(np.sum((u - v) ** 2)))


METRICAS = {
    "coseno":     distancia_coseno,
    "pearson":    distancia_pearson,
    "manhattan":  distancia_manhattan,
    "euclidiana": distancia_euclidiana,
}

# ══════════════════════════════════════════════════════════════════
#  CONSTRUCCIÓN DE VECTORES DE ESTACIÓN
# ══════════════════════════════════════════════════════════════════

def build_station_vectors(df, features: list[str]) -> dict:
    """
    Agrega el DataFrame por estación calculando la media de cada feature.
    Retorna dict: {station_name -> {"vec": np.ndarray, "meta": dict}}
    Solo incluye features que existan en df.
    """
    available = [f for f in features if f in df.columns]
    if not available:
        raise ValueError(f"Ninguna feature {features} encontrada en el DataFrame.")

    result = {}
    for station, grp in df.groupby("region"):
        vec  = np.array([grp[f].mean() for f in available], dtype=np.float64)
        crit = int((grp["PM2.5"] > 150).sum()) if "PM2.5" in grp.columns else 0
        mod  = int((grp["PM2.5"].between(75, 150)).sum()) if "PM2.5" in grp.columns else 0
        n    = len(grp)
        result[station] = {
            "vec":       vec,
            "features":  available,
            "n_records": n,
            "crit_pct":  crit / max(n, 1) * 100,
            "mod_pct":   mod  / max(n, 1) * 100,
            "pm25_mean": float(grp["PM2.5"].mean()) if "PM2.5" in grp.columns else np.nan,
            "pm25_std":  float(grp["PM2.5"].std())  if "PM2.5" in grp.columns else np.nan,
            "pm25_p95":  float(grp["PM2.5"].quantile(0.95)) if "PM2.5" in grp.columns else np.nan,
        }
    return result


def build_month_vectors(df, station: str, features: list[str]) -> list[dict]:
    """
    Agrega por mes para una estación dada.
    Retorna lista de 12 dicts (uno por mes), con vec y metadatos.
    """
    available = [f for f in features if f in df.columns]
    grp_st = df[df["region"] == station] if station else df
    months = []
    MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun",
                    "Jul","Ago","Sep","Oct","Nov","Dic"]
    for m in range(1, 13):
        grp = grp_st[grp_st["month"] == m] if "month" in grp_st.columns \
              else grp_st[grp_st["datetime"].dt.month == m]
        if grp.empty:
            vec = np.zeros(len(available))
            crit_pct = 0.0
        else:
            vec      = np.array([grp[f].mean() for f in available])
            crit_pct = (grp["PM2.5"] > 150).mean() * 100 if "PM2.5" in grp.columns else 0.0
        months.append({
            "month":    m,
            "label":    MONTH_LABELS[m - 1],
            "vec":      vec,
            "features": available,
            "crit_pct": crit_pct,
            "n":        len(grp),
        })
    return months

# ══════════════════════════════════════════════════════════════════
#  KNN ENTRE ESTACIONES
# ══════════════════════════════════════════════════════════════════

def knn_estaciones(
    target_station: str,
    station_vecs:   dict,
    k:              int,
    metrica:        str = "coseno",
    feat_mask:      Optional[list[bool]] = None,
    norm:           str = "zscore",       # "zscore" | "minmax" | "none"
) -> list[dict]:
    """
    KNN entre estaciones usando sus vectores de features agregadas.

    Parámetros
    ----------
    target_station : nombre de la estación objetivo.
    station_vecs   : salida de build_station_vectors().
    k              : vecinos a devolver.
    metrica        : clave de METRICAS.
    feat_mask      : lista de bool del tamaño del vector. None = todas.
    norm           : normalización aplicada antes de calcular distancias.

    Retorna
    -------
    list de dicts ordenados por distancia asc, sin incluir el target.
    Cada dict: {station, dist, similitud, vec, meta...}
    """
    if target_station not in station_vecs:
        raise ValueError(f"Estación '{target_station}' no encontrada.")

    names  = list(station_vecs.keys())
    matrix = np.array([station_vecs[s]["vec"] for s in names])

    # Aplicar máscara de features
    if feat_mask is not None and len(feat_mask) == matrix.shape[1]:
        mask_idx = [i for i, m in enumerate(feat_mask) if m]
        if not mask_idx:
            raise ValueError("Al menos una feature debe estar activa.")
        matrix = matrix[:, mask_idx]

    # Normalización
    if norm == "zscore":
        matrix = zscore_matrix(matrix)
    elif norm == "minmax":
        matrix = minmax_matrix(matrix)

    fn     = METRICAS[metrica]
    t_idx  = names.index(target_station)
    tv     = matrix[t_idx]

    dists  = []
    for i, name in enumerate(names):
        if i == t_idx:
            continue
        d = fn(tv, matrix[i])
        sim = 1.0 / (1.0 + d) if np.isfinite(d) else 0.0
        dists.append({
            "station":   name,
            "dist":      round(d, 6),
            "similitud": round(sim * 100, 2),    # 0-100 %
            **{k2: v for k2, v in station_vecs[name].items() if k2 != "vec"},
        })

    dists.sort(key=lambda x: x["dist"])
    return dists[:k]


def knn_todas_metricas(
    target_station: str,
    station_vecs:   dict,
    k:              int = 3,
) -> dict:
    """
    Ejecuta KNN con las 4 métricas y retorna un dict {metrica: [vecinos]}.
    Útil para el benchmark de comparación.
    """
    resultado = {}
    for met in METRICAS:
        t0 = time.perf_counter()
        vecinos = knn_estaciones(target_station, station_vecs, k, met)
        t1 = time.perf_counter()
        resultado[met] = {
            "vecinos":   vecinos,
            "tiempo_ms": round((t1 - t0) * 1000, 3),
        }
    return resultado

# ══════════════════════════════════════════════════════════════════
#  DETECCIÓN DE EVENTOS CRÍTICOS
# ══════════════════════════════════════════════════════════════════

def pm25_categoria(valor: float) -> str:
    for cat, (lo, hi) in PM25_THRESHOLDS.items():
        if lo <= valor < hi:
            return cat
    return "Peligroso"


def detectar_eventos_criticos(df, umbral: float = 150.0) -> list[dict]:
    """
    Devuelve lista de eventos (días × estación) donde PM2.5 > umbral,
    con el vector meteorológico del día para usarlo en KNN.
    """
    if "PM2.5" not in df.columns:
        return []

    col_fecha = "date" if "date" in df.columns else "datetime"
    agg = {c: "mean" for c in df.columns
           if c in FEATURES_UCI and c in df.columns}
    agg["PM2.5"] = "mean"

    criticos = []
    for (region, fecha), grp in df.groupby(["region", col_fecha]):
        pm25 = grp["PM2.5"].mean()
        if pm25 >= umbral:
            vec_dict = {f: grp[f].mean() for f in FEATURES_UCI if f in grp.columns}
            vec = np.array(list(vec_dict.values()), dtype=np.float64)
            criticos.append({
                "station": region,
                "date":    str(fecha),
                "pm25":    round(pm25, 1),
                "cat":     pm25_categoria(pm25),
                "vec":     vec,
                "features":list(vec_dict.keys()),
            })
    criticos.sort(key=lambda x: x["pm25"], reverse=True)
    return criticos


def knn_eventos_criticos(
    target_idx:  int,
    eventos:     list[dict],
    k:           int = 5,
    metrica:     str = "coseno",
) -> list[dict]:
    """
    KNN entre eventos críticos: dado un evento (día de alta contaminación),
    encuentra los k más similares en toda la historia.
    """
    if not eventos or target_idx >= len(eventos):
        return []
    matrix = np.array([e["vec"] for e in eventos], dtype=np.float64)
    matrix = zscore_matrix(matrix)
    fn     = METRICAS[metrica]
    tv     = matrix[target_idx]
    dists  = []
    for i, ev in enumerate(eventos):
        if i == target_idx:
            continue
        d   = fn(tv, matrix[i])
        sim = 1.0 / (1.0 + d) if np.isfinite(d) else 0.0
        dists.append({**ev, "dist": round(d, 6), "similitud": round(sim * 100, 2)})
    dists.sort(key=lambda x: x["dist"])
    return dists[:k]

# ══════════════════════════════════════════════════════════════════
#  ANÁLISIS DE INFLUENCIA CLIMÁTICA
# ══════════════════════════════════════════════════════════════════

def correlacion_viento_pm25(df) -> dict:
    """
    Calcula correlación de Pearson entre WSPM/wd y PM2.5 por estación.
    Retorna dict: {station: {"wspm_corr": float, "interpretacion": str}}
    """
    resultado = {}
    for station, grp in df.groupby("region"):
        if "WSPM" not in grp.columns or "PM2.5" not in grp.columns:
            continue
        sub = grp[["WSPM", "PM2.5"]].dropna()
        if len(sub) < 10:
            continue
        r = np.corrcoef(sub["WSPM"].values, sub["PM2.5"].values)[0, 1]
        interp = (
            "Fuerte negativa — viento dispersa contaminación"    if r < -0.5 else
            "Moderada negativa — viento reduce PM2.5"            if r < -0.2 else
            "Débil — viento tiene poca influencia"               if abs(r) < 0.2 else
            "Moderada positiva — viento transporta contaminación"if r < 0.5 else
            "Fuerte positiva — viento acumula contaminación"
        )
        resultado[station] = {"wspm_corr": round(float(r), 4), "interpretacion": interp}
    return resultado


def perfil_estacional(df, station: str) -> dict:
    """
    Retorna PM2.5 promedio por estación del año para una estación dada.
    Estaciones: invierno(12,1,2), primavera(3,4,5), verano(6,7,8), otoño(9,10,11)
    """
    grp_st = df[df["region"] == station] if station else df
    if "datetime" not in grp_st.columns:
        return {}
    grp_st = grp_st.copy()
    grp_st["mes"] = grp_st["datetime"].dt.month
    season_map = {12:"Invierno",1:"Invierno",2:"Invierno",
                  3:"Primavera",4:"Primavera",5:"Primavera",
                  6:"Verano",7:"Verano",8:"Verano",
                  9:"Otoño",10:"Otoño",11:"Otoño"}
    grp_st["season"] = grp_st["mes"].map(season_map)
    if "PM2.5" not in grp_st.columns:
        return {}
    return grp_st.groupby("season")["PM2.5"].mean().round(1).to_dict()

# ══════════════════════════════════════════════════════════════════
#  PREDICCIÓN SIMPLE DE PM2.5 (KNN-based)
# ══════════════════════════════════════════════════════════════════

def predecir_pm25_knn(
    target_vec:    np.ndarray,
    station_vecs:  dict,
    k:             int = 3,
    metrica:       str = "coseno",
) -> dict:
    """
    Dado un vector de condiciones meteorológicas actuales,
    predice PM2.5 ponderando los k vecinos más similares.

    target_vec : vector de features meteorológicas (TEMP, PRES, DEW, WSPM).
    Retorna: {"pm25_pred": float, "categoria": str, "vecinos": list}
    """
    names   = list(station_vecs.keys())
    weather = ["TEMP", "PRES", "DEW", "WSPM"]

    vecs, validos = [], []
    for s in names:
        sv = station_vecs[s]
        feats = sv.get("features", [])
        # Solo usar las features que existen tanto en weather como en el vector
        idxs  = [feats.index(f) for f in weather if f in feats]
        if len(idxs) > 0:
            vecs.append(sv["vec"][idxs])
            validos.append(s)

    if not vecs:
        return {"pm25_pred": None, "categoria": "Sin datos", "vecinos": []}

    # Asegurar que target_vec tiene la misma dimensión que los vectores de la matriz
    # target_vec viene en el orden [TEMP, PRES, DEW, WSPM]
    # matrix tendrá el orden de las features que existen en el dataset
    sample_sv = station_vecs[validos[0]]
    sample_feats = sample_sv.get("features", [])
    active_weather_idxs = [i for i, f in enumerate(weather) if f in sample_feats]
    
    if len(active_weather_idxs) != len(target_vec):
        target_vec_aligned = target_vec[active_weather_idxs]
    else:
        target_vec_aligned = target_vec

    matrix = zscore_matrix(np.array(vecs, dtype=np.float64))
    fn     = METRICAS[metrica]

    dists = [(fn(target_vec_aligned, matrix[i]), validos[i]) for i in range(len(matrix))]
    dists.sort()
    top = dists[:k]

    sims   = [1.0 / (1.0 + d) for d, _ in top]
    pm25s  = [station_vecs[s]["pm25_mean"] for _, s in top]
    total  = sum(sims)
    pm25p  = sum(sim * pm for sim, pm in zip(sims, pm25s)) / max(total, 1e-10)

    return {
        "pm25_pred": round(pm25p, 1),
        "categoria": pm25_categoria(pm25p),
        "vecinos":   [{"station": s, "dist": round(d, 4), "pm25_mean": station_vecs[s]["pm25_mean"]}
                      for d, s in top],
    }

# ══════════════════════════════════════════════════════════════════
#  ALERTAS DE RIESGO
# ══════════════════════════════════════════════════════════════════

def generar_alertas(station_vecs: dict, umbral_crit: float = 20.0) -> list[dict]:
    """
    Genera alertas para estaciones con % días críticos > umbral_crit.
    Retorna lista ordenada por criticidad descendente.
    """
    alertas = []
    for station, sv in station_vecs.items():
        cp = sv.get("crit_pct", 0)
        mp = sv.get("mod_pct",  0)
        if cp > umbral_crit or mp > 40:
            nivel = "CRÍTICO" if cp > umbral_crit else "MODERADO"
            alertas.append({
                "station":  station,
                "nivel":    nivel,
                "crit_pct": round(cp, 1),
                "mod_pct":  round(mp, 1),
                "pm25_p95": round(sv.get("pm25_p95", 0), 1),
                "accion":   (
                    "Activar protocolo hospitalario + restricción tráfico" if nivel == "CRÍTICO"
                    else "Monitoreo reforzado + alerta a grupos vulnerables"
                ),
            })
    alertas.sort(key=lambda x: x["crit_pct"], reverse=True)
    return alertas

# ══════════════════════════════════════════════════════════════════
#  GENERACIÓN DE HIPÓTESIS VÍA CLAUDE API
# ══════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """Eres un experto en ciencia de datos ambiental, salud pública y política urbana.
Tu tarea es generar hipótesis de valor científicas y accionables a partir de análisis KNN
sobre datos de calidad del aire en Beijing.
Responde ÚNICAMENTE con JSON válido. Sin markdown, sin texto extra."""

def construir_contexto_knn(
    target:       str,
    vecinos:      list[dict],
    station_vecs: dict,
    df_hist,
    df_curr,
    metrica:      str,
    k:            int,
) -> str:
    """Construye el string de contexto que se envía a la API de Claude."""
    sv_t = station_vecs.get(target, {})
    corr = correlacion_viento_pm25(df_hist)
    corr_t = corr.get(target, {})

    # Mejora entre períodos para el target
    hist_pm = df_hist[df_hist["region"] == target]["PM2.5"].mean() \
              if "PM2.5" in df_hist.columns and not df_hist.empty else None
    curr_pm = df_curr["PM2.5"].mean() \
              if "PM2.5" in df_curr.columns and not df_curr.empty else None
    mejora  = ((hist_pm - curr_pm) / hist_pm * 100) if hist_pm and curr_pm else None

    ctx = f"""DATASET: Beijing Air Quality KNN — Similitud entre Estaciones
PERÍODO ANALIZADO: {('2013-2017 (UCI)' if not df_curr.empty else '2022-2026 (Satelital)')}
MÉTRICA: {metrica} | K={k}

ESTACIÓN TARGET: {target}
  PM2.5 promedio: {sv_t.get('pm25_mean', 'N/A'):.1f} µg/m³
  Percentil 95:   {sv_t.get('pm25_p95', 'N/A'):.1f} µg/m³
  Días críticos:  {sv_t.get('crit_pct', 0):.1f}%  (PM2.5 > 150)
  Días moderados: {sv_t.get('mod_pct', 0):.1f}%   (75 < PM2.5 ≤ 150)
  Corr. viento-PM2.5: {corr_t.get('wspm_corr', 'N/A')} — {corr_t.get('interpretacion', '')}
"""
    if mejora is not None:
        ctx += f"  Mejora 2013-17→2022-26: ↓ {mejora:.1f}% en PM2.5\n"

    ctx += "\nVECINOS MÁS SIMILARES (KNN):\n"
    for i, v in enumerate(vecinos[:5], 1):
        ctx += (f"  #{i} {v['station']} — similitud {v['similitud']:.1f}%"
                f", PM2.5={v.get('pm25_mean',0):.1f}, críticos={v.get('crit_pct',0):.1f}%\n")

    # Alertas globales
    alertas = generar_alertas(station_vecs)
    if alertas:
        ctx += f"\nESTACIONES EN ALERTA CRÍTICA: {', '.join(a['station'] for a in alertas if a['nivel']=='CRÍTICO')}\n"

    return ctx


def generar_hipotesis(
    contexto: str,
    api_key:  str = "",          # vacío: usa ANTHROPIC_API_KEY del entorno
    modelo:   str = "claude-sonnet-4-20250514",
) -> list[dict]:
    """
    Llama a la API de Claude y retorna 4 hipótesis de valor.

    Cada hipótesis tiene:
      id, tipo (prediccion|clima|alerta|comparacion), titulo,
      hipotesis (Si...entonces...porque...),
      evidencia_knn, accion, impacto (Alto|Medio|Bajo), confianza (0-1)
    """
    import os
    key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("Se requiere ANTHROPIC_API_KEY.")

    prompt = f"""{contexto}

Genera exactamente 4 hipótesis de valor. Una por cada enfoque (sin repetir):
1. PREDICCIÓN   : Predecir niveles críticos de PM2.5 usando patrones de estaciones similares.
2. CLIMA        : Influencia del viento / temperatura / lluvia detectada en el KNN.
3. ALERTA       : Condición de riesgo para hospitales o restricción de tráfico.
4. COMPARACIÓN  : Cambio estructural entre períodos 2013-2017 vs 2022-2026.

JSON (array de 4 objetos):
[{{"id":1,"tipo":"prediccion","titulo":"...","hipotesis":"Si [cond] entonces [efecto] porque [mecanismo]","evidencia_knn":"...","accion":"...","impacto":"Alto|Medio|Bajo","confianza":0.0}}]"""

    headers = {
        "x-api-key":         key,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
    }
    payload = {
        "model":      modelo,
        "max_tokens": 1400,
        "system":     SYSTEM_PROMPT,
        "messages":   [{"role": "user", "content": prompt}],
    }
    resp = requests.post("https://api.anthropic.com/v1/messages",
                         headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    text = "".join(b.get("text", "") for b in resp.json().get("content", []))
    clean = text.strip().removeprefix("```json").removesuffix("```").strip()
    return json.loads(clean)


# ══════════════════════════════════════════════════════════════════
#  BENCHMARK
# ══════════════════════════════════════════════════════════════════

def benchmark_metricas(
    target:       str,
    station_vecs: dict,
    k:            int = 5,
    repeticiones: int = 3,
) -> list[dict]:
    """
    Mide tiempo de cada métrica (promedio de N repeticiones).
    Retorna lista de dicts {metrica, tiempo_ms, top1_station, top1_sim}.
    """
    resultados = []
    for met in METRICAS:
        tiempos = []
        res = None
        for _ in range(repeticiones):
            t0  = time.perf_counter()
            res = knn_estaciones(target, station_vecs, k, met)
            tiempos.append((time.perf_counter() - t0) * 1000)
        top1 = res[0] if res else {}
        resultados.append({
            "metrica":      met,
            "formula":      FORMULAS[met],
            "tiempo_ms":    round(sum(tiempos) / len(tiempos), 3),
            "top1_station": top1.get("station", "—"),
            "top1_sim":     top1.get("similitud", 0),
        })
    return resultados
