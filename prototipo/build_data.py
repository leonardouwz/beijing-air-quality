#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — Motor de datos del prototipo "Beijing Air Latent Space".

Lee los datasets CRUDOS:
  - 2013-2017 (UCI PRSA, 12 CSV horarios por estacion)
  - 2022-2026 (Open-Meteo, air_quality_historical.csv diario)

Genera DOS vectores de caracteristicas que el combo box del prototipo intercambia:

  data/aq_data.js      -> window.AQ_DATA       (TRATADO)
      Vector unificado 2013-2026, diario. Imputacion lineal, recorte IQR
      (conservando smog > 150), meteorologia del periodo actual PROYECTADA
      desde la climatologia historica, y normalizacion Min-Max 0-1.

  data/aq_data_raw.js  -> window.AQ_DATA_RAW   (CRUDO / SIN TRATAMIENTO)
      Solo datos MEDIDOS de la UCI 2013-2017, agregados a diario (resampleo
      estructural). SIN limpieza de negativos, SIN imputar, SIN recorte de
      outliers y SIN proyeccion. Solo se descartan dias sin medicion (NaN) para
      que cada punto tenga vector completo de 10D. El periodo 2022-2026 se omite
      porque, sin proyeccion, carece de TEMP/PRES/DEWP/WSPM medidos.

En ambos casos los 10 atributos se escalan Min-Max (0-1) — paso matematico
necesario para PCA/KNN, no "tratamiento" de limpieza. El navegador reconstruye
los valores originales (tooltip, histogramas) con los rangos guardados:
    original = min + norm * (max - min)

Ejecutar:  python build_data.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

# ───────────────────────── Rutas ─────────────────────────
HERE      = Path(__file__).resolve().parent
ROOT      = HERE.parent
BASE_HIST = ROOT / "datasets" / "2013-2017" / "PRSA_Data_20130301-20170228"
BASE_CURR = ROOT / "datasets" / "2022-2026" / "air_quality_historical.csv"
OUT_TREAT = HERE / "data" / "aq_data.js"
OUT_RAW   = HERE / "data" / "aq_data_raw.js"

# ───────────────────────── Constantes ─────────────────────────
ZONA_MAP = {
    "Dingling": "Norte", "Changping": "Norte", "Huairou": "Norte", "Shunyi": "Norte",
    "Aotizhongxin": "Centro", "Guanyuan": "Centro", "Dongsi": "Centro",
    "Nongzhanguan": "Centro", "Wanliu": "Centro",
    "Gucheng": "Oeste", "Tiantan": "Sur", "Wanshouxigong": "Sur",
}
SEASON_MAP = {
    12: "Invierno", 1: "Invierno", 2: "Invierno",
    3: "Primavera", 4: "Primavera", 5: "Primavera",
    6: "Verano", 7: "Verano", 8: "Verano",
    9: "Otono", 10: "Otono", 11: "Otono",
}
STATIONS = list(ZONA_MAP.keys())

# Los 10 atributos ambientales que alimentan el PCA (orden fijo).
FEATURES = ["PM2.5", "PM10", "SO2", "NO2", "CO", "O3", "TEMP", "PRES", "DEW", "WSPM"]
POLLUTANTS = ["PM2.5", "PM10", "SO2", "NO2", "CO", "O3"]
METEO = ["TEMP", "PRES", "DEW", "WSPM"]

SEASON_LEVELS = ["Invierno", "Primavera", "Verano", "Otono"]
PERIOD_LEVELS = ["2013-2017", "2022-2026"]
ZONA_LEVELS = ["Norte", "Centro", "Oeste", "Sur"]

# ───────────────────────── AQI (US EPA) ─────────────────────────
# Sub-indice lineal por tramos:  AQI = (Ihi-Ilo)/(Chi-Clo)*(C-Clo)+Ilo.
# Breakpoints en µg/m³ (24 h) para PM2.5 y PM10 — unidades que coinciden con el
# vector, asi el calculo es exacto sin convertir a ppb/ppm. El AQI final de cada
# registro = MAX de los subindices disponibles (PM2.5, PM10).  Mismas tablas y
# bandas que el cliente (aq_app.js), para que ambos coincidan.
AQI_BP = {
    "PM2.5": [(0.0, 12.0, 0, 50), (12.1, 35.4, 51, 100), (35.5, 55.4, 101, 150),
              (55.5, 150.4, 151, 200), (150.5, 250.4, 201, 300), (250.5, 350.4, 301, 400), (350.5, 500.4, 401, 500)],
    "PM10":  [(0, 54, 0, 50), (55, 154, 51, 100), (155, 254, 101, 150),
              (255, 354, 151, 200), (355, 424, 201, 300), (425, 504, 301, 400), (505, 604, 401, 500)],
}
# (limite_superior_AQI, nombre, color) — segun la tabla del plan.
AQI_BANDS = [
    (50,  "Buena",                 "#36e08a"),
    (100, "Moderada",              "#e6d152"),
    (150, "Dañina (g. sensibles)", "#ff9f45"),
    (200, "Dañina",                "#ff5d5d"),
    (300, "Muy dañina",            "#b07be0"),
    (500, "Peligrosa",             "#d1495b"),
]


def aqi_sub(conc, table):
    """Sub-indice AQI de una concentracion en su tramo (None si no es valida)."""
    if conc is None or not (conc >= 0):
        return None
    last_hi = table[-1][1]
    if conc >= last_hi:
        return 500
    for cl, ch, il, ih in table:
        if conc <= ch:
            c = max(conc, cl)
            return int(round((ih - il) / (ch - cl) * (c - cl) + il))
    return 500


def aqi_value(pm25, pm10=None):
    """AQI = maximo de los subindices disponibles (PM2.5, PM10)."""
    subs = [aqi_sub(pm25, AQI_BP["PM2.5"])]
    if pm10 is not None:
        subs.append(aqi_sub(pm10, AQI_BP["PM10"]))
    subs = [s for s in subs if s is not None]
    return max(subs) if subs else 0


def aqi_cat_idx(aqi):
    for k, (hi, _n, _c) in enumerate(AQI_BANDS):
        if aqi <= hi:
            return k
    return len(AQI_BANDS) - 1


def log(msg=""):
    print(msg, flush=True)


# ───────────────────────── ETL historico ─────────────────────────
def load_historical(base: Path, clean_negatives: bool = True) -> pd.DataFrame:
    csv_files = sorted(base.rglob("*.csv"))
    if not csv_files:
        sys.exit(f"ERROR: no se encontraron CSV historicos en {base}")
    log(f"  Archivos historicos: {len(csv_files)}")
    dfs = []
    for p in csv_files:
        df = pd.read_csv(p, low_memory=False)
        station = next((s for s in STATIONS if s.lower() in p.name.lower()), p.stem)
        df["datetime"] = pd.to_datetime(df[["year", "month", "day", "hour"]], errors="coerce")
        if "DEWP" in df.columns and "DEW" not in df.columns:
            df = df.rename(columns={"DEWP": "DEW"})
        df["station"] = station
        for col in FEATURES:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                if clean_negatives and col in POLLUTANTS:
                    df.loc[df[col] < 0, col] = np.nan  # ruido fisico imposible (solo TRATADO)
        if "wd" not in df.columns:
            df["wd"] = "unknown"
        df["wd"] = df["wd"].astype("object").fillna("unknown")
        dfs.append(df[["datetime", "station", "wd"] + [c for c in FEATURES if c in df.columns]])
    out = pd.concat(dfs, ignore_index=True)
    out = out.sort_values(["station", "datetime"]).reset_index(drop=True)
    return out


def aggregate_daily(df_hourly: pd.DataFrame, impute: bool = True) -> pd.DataFrame:
    """Horario -> diario por estacion. impute=True interpola antes de agregar."""
    df = df_hourly.copy()
    if impute:
        for col in FEATURES:
            df[col] = df.groupby("station")[col].transform(
                lambda x: x.interpolate(method="linear", limit_direction="both"))
    df["date"] = df["datetime"].dt.normalize()

    def safe_mode(x):
        m = x.mode()
        return m.iloc[0] if len(m) else "unknown"

    agg = {c: "mean" for c in FEATURES}
    agg["wd"] = safe_mode
    daily = df.groupby(["station", "date"]).agg(agg).reset_index()
    daily["period"] = "2013-2017"
    return daily


# ───────────────────────── ETL actual ─────────────────────────
def load_current(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    rename = {
        "pm2_5": "PM2.5", "pm10": "PM10", "ozone": "O3",
        "nitrogen_dioxide": "NO2", "sulphur_dioxide": "SO2",
        "carbon_monoxide": "CO",
    }
    df = df.rename(columns=rename)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    for col in POLLUTANTS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["PM2.5", "date"]).sort_values("date").reset_index(drop=True)
    return df[["date"] + [c for c in POLLUTANTS if c in df.columns]]


def build_climatology(daily_hist: pd.DataFrame):
    """Medias historicas por estacion x mes para proyectar meteorologia del actual."""
    h = daily_hist.copy()
    h["month"] = h["date"].dt.month
    clim = {}
    for st in STATIONS:
        sub = h[h["station"] == st]
        clim[st] = {}
        for m in range(1, 13):
            sm = sub[sub["month"] == m]
            src = sm if len(sm) else sub
            entry = {met: float(src[met].mean()) for met in METEO}
            wdmode = src["wd"].mode()
            entry["wd"] = wdmode.iloc[0] if len(wdmode) else "unknown"
            clim[st][m] = entry
    return clim


def project_current(df_curr: pd.DataFrame, daily_hist: pd.DataFrame) -> pd.DataFrame:
    """Redistribuye Beijing en 12 estaciones virtuales (ratios) + proyecta meteo."""
    clim = build_climatology(daily_hist)
    global_means = {p: daily_hist[p].mean() for p in POLLUTANTS}
    ratios = {}
    for st in STATIONS:
        sub = daily_hist[daily_hist["station"] == st]
        ratios[st] = {
            p: (sub[p].mean() / global_means[p]) if global_means[p] else 1.0
            for p in POLLUTANTS
        }
    rows = []
    months = df_curr["date"].dt.month.values
    for st in STATIONS:
        tmp = df_curr.copy()
        for p in POLLUTANTS:
            if p in tmp.columns:
                tmp[p] = (tmp[p] * ratios[st][p]).clip(lower=0)
        tmp["station"] = st
        for met in METEO:
            tmp[met] = [clim[st][m][met] for m in months]
        tmp["wd"] = [clim[st][m]["wd"] for m in months]
        rows.append(tmp)
    out = pd.concat(rows, ignore_index=True)
    out["period"] = "2022-2026"
    return out


# ───────────────────────── Tratamiento ─────────────────────────
def iqr_clip(series: pd.Series, protect_high: bool = False) -> pd.Series:
    q1, q3 = series.quantile(0.25), series.quantile(0.75)
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    if protect_high:  # PM2.5: conservar smog real (>150)
        out = series.copy()
        out[out < lo] = lo
        return out
    return series.clip(lower=lo, upper=hi)


def finalize_meta(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["datetime"] = pd.to_datetime(df["datetime"])
    df["zona"] = df["station"].map(ZONA_MAP).fillna("Centro")
    df["month"] = df["datetime"].dt.month
    df["season"] = df["month"].map(SEASON_MAP)
    return df


# ───────────────────────── Preparacion por modo ─────────────────────────
def prepare_treated() -> pd.DataFrame:
    log("\n[TRATADO] ETL + agregacion + estaciones virtuales + proyeccion...")
    hourly = load_historical(BASE_HIST, clean_negatives=True)
    daily_hist = aggregate_daily(hourly, impute=True)
    curr = load_current(BASE_CURR)
    daily_curr = project_current(curr, daily_hist)

    daily_hist = daily_hist.rename(columns={"date": "datetime"})
    daily_curr = daily_curr.rename(columns={"date": "datetime"})
    cols = ["datetime", "station", "period", "wd"] + FEATURES
    df = pd.concat([daily_hist[cols], daily_curr[cols]], ignore_index=True)
    df = df.sort_values(["station", "datetime"]).reset_index(drop=True)
    df = finalize_meta(df)

    for col in FEATURES:  # imputacion residual
        df[col] = df.groupby("station")[col].transform(
            lambda x: x.interpolate(method="linear", limit_direction="both"))
        df[col] = df[col].fillna(df[col].median())
    crit_before = int((df["PM2.5"] > 150).sum())
    for col in FEATURES:  # IQR protegiendo smog
        df[col] = iqr_clip(df[col], protect_high=(col == "PM2.5"))
    log(f"  Registros: {len(df):,}  | PM2.5>150 conservados: {crit_before:,}")
    return df


def prepare_raw() -> pd.DataFrame:
    log("\n[CRUDO] Registros HORARIOS originales (UCI 2013-2017), sin tratamiento...")
    df = load_historical(BASE_HIST, clean_negatives=False)  # ~420 K horarios, sin agregar
    df["period"] = "2013-2017"
    df = finalize_meta(df)
    before = len(df)
    # Solo se descartan horas sin medicion completa (PCA necesita vector de 10D).
    df = df.dropna(subset=FEATURES).reset_index(drop=True)
    log(f"  Registros: {len(df):,} horarios "
        f"(de {before:,} originales; {before - len(df):,} horas con algun NaN descartadas)")
    log(f"  Rango PM2.5 crudo: {df['PM2.5'].min():.1f} .. {df['PM2.5'].max():.1f} µg/m³ "
        f"(sin recorte de outliers)")
    return df


# ───────────────────────── Serializacion ─────────────────────────
def serialize(df: pd.DataFrame, var_name: str, out_path: Path, label: str, note: str):
    scaler = MinMaxScaler()
    norm = scaler.fit_transform(df[FEATURES].values)
    feat_min = scaler.data_min_.tolist()
    feat_max = scaler.data_max_.tolist()

    # AQI por registro (desde los valores originales PM2.5/PM10, antes de Min-Max).
    pm25 = df["PM2.5"].to_numpy()
    pm10 = df["PM10"].to_numpy() if "PM10" in df.columns else None
    aqi_arr, aqi_cat_arr = [], []
    for k in range(len(df)):
        v = aqi_value(float(pm25[k]), float(pm10[k]) if pm10 is not None else None)
        aqi_arr.append(int(v))
        aqi_cat_arr.append(aqi_cat_idx(v))

    wd_levels = sorted(df["wd"].astype(str).unique().tolist())
    season_idx = df["season"].map({s: i for i, s in enumerate(SEASON_LEVELS)}).fillna(0).astype(int)
    period_idx = df["period"].map({p: i for i, p in enumerate(PERIOD_LEVELS)}).astype(int)
    station_idx = df["station"].map({s: i for i, s in enumerate(STATIONS)}).astype(int)
    zona_idx = df["zona"].map({z: i for i, z in enumerate(ZONA_LEVELS)}).fillna(1).astype(int)
    wd_idx = df["wd"].astype(str).map({w: i for i, w in enumerate(wd_levels)}).astype(int)
    t_ms = df["datetime"].values.astype("datetime64[ms]").astype("int64")  # ms epoch

    payload = {
        "meta": {
            "label": label,
            "note": note,
            "features": FEATURES,
            "feat_min": [round(v, 4) for v in feat_min],
            "feat_max": [round(v, 4) for v in feat_max],
            "stations": STATIONS,
            "seasons": SEASON_LEVELS,
            "periods": PERIOD_LEVELS,
            "zonas": ZONA_LEVELS,
            "wd": wd_levels,
            "n": int(len(df)),
            "aqi_bands": [{"hi": hi, "name": n, "color": c} for hi, n, c in AQI_BANDS],
        },
        "t": t_ms.tolist(),
        "aqi": aqi_arr,
        "aqi_cat": aqi_cat_arr,
        "station": station_idx.tolist(),
        "zona": zona_idx.tolist(),
        "season": season_idx.tolist(),
        "period": period_idx.tolist(),
        "wd": wd_idx.tolist(),
        "X": [[round(float(norm[i, j]), 4) for i in range(norm.shape[0])]
              for j in range(norm.shape[1])],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    js = f"window.{var_name} = " + json.dumps(payload, separators=(",", ":")) + ";"
    out_path.write_text(js, encoding="utf-8")

    # Validacion
    assert int(df[FEATURES].isnull().sum().sum()) == 0, f"{var_name}: quedan nulos"
    assert norm.min() >= -1e-9 and norm.max() <= 1 + 1e-9, f"{var_name}: fuera de [0,1]"
    size_mb = out_path.stat().st_size / (1024 * 1024)
    log(f"  -> {out_path.name}  ({size_mb:.2f} MB)  registros={len(df):,}  "
        f"periodos={sorted(df['period'].unique())}")


def main():
    log("=" * 64)
    log("  MOTOR DE DATOS — Beijing Air Latent Space (TRATADO + CRUDO)")
    log("=" * 64)

    df_treat = prepare_treated()
    serialize(
        df_treat, "AQ_DATA", OUT_TREAT,
        label="Tratado",
        note="2013-2026 · imputado · IQR (smog>150 conservado) · meteo del periodo "
             "actual proyectada por climatologia · Min-Max",
    )

    df_raw = prepare_raw()
    serialize(
        df_raw, "AQ_DATA_RAW", OUT_RAW,
        label="Crudo (sin tratamiento)",
        note="UCI 2013-2017 · TODOS los registros HORARIOS originales · SIN agregar/"
             "imputar/recortar/proyectar · 2022-2026 omitido (sin meteorologia medida)",
    )

    log("\n" + "=" * 64)
    log("  LISTO. Abre prototipo/index.html y usa el combo 'Dataset'.")
    log("=" * 64)


if __name__ == "__main__":
    main()
