#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data_manager.py — Beijing Air Quality KNN v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estado global de sesión (Sesion), carga de datos históricos (2013-2017)
y actuales (2022-2026), ETL unificado, caché Parquet, exportación.

No importa nada de interface.py.
"""

import os
import json
import hashlib
import pickle
import warnings
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)

VERSION   = "1.0.0"
CACHE_DIR = Path(".aq_cache")

# ══════════════════════════════════════════════════════════════════
#  COORDENADAS DE LAS 12 ESTACIONES
# ══════════════════════════════════════════════════════════════════

STATION_COORDS = {
    "Aotizhongxin":  (39.9821, 116.3937),
    "Changping":     (40.2181, 116.2318),
    "Dingling":      (40.2906, 116.2207),
    "Dongsi":        (39.9292, 116.4177),
    "Guanyuan":      (39.9406, 116.3626),
    "Gucheng":       (39.9147, 116.1861),
    "Huairou":       (40.3241, 116.6374),
    "Nongzhanguan":  (39.9372, 116.4474),
    "Shunyi":        (40.1302, 116.6544),
    "Tiantan":       (39.8822, 116.4117),
    "Wanliu":        (39.9561, 116.2984),
    "Wanshouxigong": (39.8661, 116.3668),
}

STATIONS_LIST = list(STATION_COORDS.keys())

# Features disponibles en el dataset histórico UCI
FEATURES_UCI = ["PM2.5", "PM10", "SO2", "NO2", "CO", "O3",
                "TEMP", "PRES", "DEW", "WSPM"]

# ══════════════════════════════════════════════════════════════════
#  ESTADO GLOBAL DE SESIÓN
# ══════════════════════════════════════════════════════════════════

@dataclass
class Sesion:
    # DataFrames crudos
    df_hist:        Optional[pd.DataFrame] = None   # 2013-2017
    df_curr:        Optional[pd.DataFrame] = None   # 2022-2026
    df_unified:     Optional[pd.DataFrame] = None   # ambos combinados

    # Vectores por estación (salida de build_station_vectors)
    station_vecs_h: dict = field(default_factory=dict)  # histórico
    station_vecs_c: dict = field(default_factory=dict)  # actual
    station_vecs_u: dict = field(default_factory=dict)  # unificado

    # Features activas en la sesión
    features_hist:  list = field(default_factory=lambda: FEATURES_UCI.copy())
    features_curr:  list = field(default_factory=lambda: ["PM2.5"])

    # Rutas de origen
    path_hist:      str = ""
    path_curr:      str = ""

    # Configuración KNN
    k:              int   = 5
    metrica:        str   = "coseno"
    norm:           str   = "zscore"    # "zscore" | "minmax" | "none"
    target_station: str   = ""

    # Historial
    historial_knn:  list  = field(default_factory=list)
    historial_hip:  list  = field(default_factory=list)
    hipotesis:      list  = field(default_factory=list)

    # ── propiedades derivadas ─────────────────────────────────────
    @property
    def hist_cargado(self) -> bool:
        return self.df_hist is not None and not self.df_hist.empty

    @property
    def curr_cargado(self) -> bool:
        return self.df_curr is not None and not self.df_curr.empty

    @property
    def n_estaciones_h(self) -> int:
        return len(self.station_vecs_h)

    @property
    def n_estaciones_c(self) -> int:
        return len(self.station_vecs_c)

    @property
    def n_records_h(self) -> int:
        return len(self.df_hist) if self.hist_cargado else 0

    @property
    def n_records_c(self) -> int:
        return len(self.df_curr) if self.curr_cargado else 0

    @property
    def pm25_mean_h(self) -> float:
        if self.hist_cargado and "PM2.5" in self.df_hist.columns:
            return round(float(self.df_hist["PM2.5"].mean()), 2)
        return 0.0

    @property
    def pm25_mean_c(self) -> float:
        if self.curr_cargado and "PM2.5" in self.df_curr.columns:
            return round(float(self.df_curr["PM2.5"].mean()), 2)
        return 0.0

    @property
    def mejora_pm25_pct(self) -> float:
        if self.pm25_mean_h and self.pm25_mean_c:
            return round((self.pm25_mean_h - self.pm25_mean_c) / self.pm25_mean_h * 100, 1)
        return 0.0


SES = Sesion()

# ══════════════════════════════════════════════════════════════════
#  CARGA DE DATOS HISTÓRICOS 2013-2017 (UCI)
# ══════════════════════════════════════════════════════════════════

def load_historical_data(base_path: str = "2013-2017/PRSA_Data_20130301-20170228",
                         stations:  Optional[list] = None) -> pd.DataFrame:
    """
    Carga los CSV individuales de cada estación (formato UCI PRSA).
    Devuelve un DataFrame unificado con columna 'region' y coordenadas.

    Estructura esperada de cada CSV:
      No, year, month, day, hour, PM2.5, PM10, SO2, NO2, CO, O3,
      TEMP, PRES, DEW, RAIN, wd, WSPM, station
    """
    stations = stations or STATIONS_LIST
    dfs = []

    for station in stations:
        path = Path(base_path) / f"PRSA_Data_{station}_20130301-20170228.csv"
        if not path.exists():
            print(f"  [WARN] No encontrado: {path}")
            continue

        df = pd.read_csv(path, low_memory=False)

        # Crear datetime
        df["datetime"] = pd.to_datetime(
            df[["year", "month", "day", "hour"]],
            errors="coerce"
        )
        df["date"]  = df["datetime"].dt.date
        df["month"] = df["datetime"].dt.month

        # Renombrar columna estación si existe
        if "station" in df.columns:
            df = df.rename(columns={"station": "region"})
        else:
            df["region"] = station

        # Coordenadas
        lat, lon = STATION_COORDS.get(station, (39.9075, 116.3972))
        df["lat"] = lat
        df["lon"] = lon
        df["period"] = "2013-2017"

        # Limpiar PM2.5 negativo o nulo
        if "PM2.5" in df.columns:
            df["PM2.5"] = pd.to_numeric(df["PM2.5"], errors="coerce")
            df.loc[df["PM2.5"] < 0, "PM2.5"] = np.nan

        # Convertir features numéricas
        for col in FEATURES_UCI:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        dfs.append(df)

    if not dfs:
        raise FileNotFoundError(
            f"No se encontró ningún CSV en '{base_path}'.\n"
            f"Verifica que la carpeta y los archivos existan."
        )

    combined = pd.concat(dfs, ignore_index=True)
    combined = combined.sort_values("datetime").reset_index(drop=True)
    print(f"  [OK] Histórico: {len(combined):,} registros | "
          f"{combined['region'].nunique()} estaciones | "
          f"{combined['datetime'].min().date()} → {combined['datetime'].max().date()}")
    return combined


# ══════════════════════════════════════════════════════════════════
#  CARGA DE DATOS ACTUALES 2022-2026 (Open-Meteo / API satelital)
# ══════════════════════════════════════════════════════════════════

def load_current_data(path: str = "2022-2026/air_quality_historical.csv") -> pd.DataFrame:
    """
    Carga el CSV del período actual.
    Columnas mínimas esperadas: date, pm2_5
    Columnas opcionales:        pm10, so2, no2, co, o3, temperature_2m,
                                surface_pressure, dewpoint_2m,
                                windspeed_10m, precipitation, winddirection_10m

    El CSV puede tener datos de una sola zona (Beijing ciudad) o varias
    si tiene columna 'region'.
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"No encontrado: {path}")

    df = pd.read_csv(path, low_memory=False)

    # ── Renombrar columnas Open-Meteo → nombres internos ──────────
    rename_map = {
        "pm2_5":             "PM2.5",
        "pm10":              "PM10",
        "so2":               "SO2",
        "no2":               "NO2",
        "co":                "CO",
        "o3":                "O3",
        "ozone":             "O3",
        "temperature_2m":    "TEMP",
        "surface_pressure":  "PRES",
        "dewpoint_2m":       "DEW",
        "windspeed_10m":     "WSPM",
        "precipitation":     "RAIN",
        "winddirection_10m": "wd",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # ── Datetime ───────────────────────────────────────────────────
    date_col = next((c for c in ["datetime","date","time","timestamp"] if c in df.columns), None)
    if date_col is None:
        raise ValueError("No se encontró columna de fecha en el CSV actual.")
    df["datetime"] = pd.to_datetime(df[date_col], errors="coerce")
    df["date"]     = df["datetime"].dt.date
    df["month"]    = df["datetime"].dt.month

    # ── Región ────────────────────────────────────────────────────
    if "region" not in df.columns:
        df["region"] = "Beijing"
    if "lat"    not in df.columns:
        df["lat"]   = 39.9075
    if "lon"    not in df.columns:
        df["lon"]   = 116.3972

    df["period"] = "2022-2026"

    # ── Limpiar PM2.5 ─────────────────────────────────────────────
    if "PM2.5" in df.columns:
        df["PM2.5"] = pd.to_numeric(df["PM2.5"], errors="coerce")
        df.loc[df["PM2.5"] < 0, "PM2.5"] = np.nan

    for col in ["PM10","SO2","NO2","CO","O3","TEMP","PRES","DEW","WSPM"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["datetime", "PM2.5"]).reset_index(drop=True)
    df = df.sort_values("datetime").reset_index(drop=True)

    print(f"  [OK] Actual: {len(df):,} registros | "
          f"{df['region'].nunique()} zona(s) | "
          f"{df['datetime'].min().date()} → {df['datetime'].max().date()}")
    return df


# ══════════════════════════════════════════════════════════════════
#  ETL UNIFICADO
# ══════════════════════════════════════════════════════════════════

def _cols_comunes(df_h: pd.DataFrame, df_c: pd.DataFrame) -> list:
    """Features que existen en ambos DataFrames."""
    from core import FEATURES_UCI
    return [f for f in FEATURES_UCI if f in df_h.columns and f in df_c.columns]


def unificar_datasets(df_hist: pd.DataFrame, df_curr: pd.DataFrame) -> pd.DataFrame:
    """
    Combina histórico y actual en un único DataFrame alineado.
    Mantiene solo columnas comunes + metadatos de identificación.
    """
    base_cols = ["datetime", "date", "month", "region", "lat", "lon", "period", "PM2.5"]
    comunes   = _cols_comunes(df_hist, df_curr)
    extra     = [c for c in comunes if c not in base_cols]

    keep_h = [c for c in base_cols + extra if c in df_hist.columns]
    keep_c = [c for c in base_cols + extra if c in df_curr.columns]

    unified = pd.concat([df_hist[keep_h], df_curr[keep_c]], ignore_index=True)
    unified = unified.sort_values(["region", "datetime"]).reset_index(drop=True)
    print(f"  [OK] Unificado: {len(unified):,} registros | "
          f"features compartidas: {extra if extra else ['solo PM2.5']}")
    return unified


def calcular_estadisticas(df: pd.DataFrame, period_label: str = "") -> dict:
    """Estadísticas descriptivas del DataFrame."""
    if df.empty or "PM2.5" not in df.columns:
        return {}
    pm = df["PM2.5"].dropna()
    return {
        "periodo":    period_label,
        "n_registros":len(df),
        "n_regiones": df["region"].nunique(),
        "pm25_mean":  round(float(pm.mean()), 2),
        "pm25_std":   round(float(pm.std()),  2),
        "pm25_min":   round(float(pm.min()),  2),
        "pm25_p25":   round(float(pm.quantile(0.25)), 2),
        "pm25_p50":   round(float(pm.quantile(0.50)), 2),
        "pm25_p75":   round(float(pm.quantile(0.75)), 2),
        "pm25_p95":   round(float(pm.quantile(0.95)), 2),
        "pm25_max":   round(float(pm.max()),  2),
        "crit_pct":   round(float((pm > 150).mean() * 100), 2),
        "dias_rango": str(df["datetime"].max().date() - df["datetime"].min().date())
                      if "datetime" in df.columns else "?",
    }

# ══════════════════════════════════════════════════════════════════
#  CACHÉ  (Parquet comprimido + JSON de metadatos)
# ══════════════════════════════════════════════════════════════════

def _cache_key(path: str, period: str) -> str:
    s = f"{Path(path).resolve()}|{period}"
    return hashlib.md5(s.encode()).hexdigest()[:12]


def guardar_cache(df: pd.DataFrame, path_origen: str, period: str):
    """Guarda DataFrame como Parquet comprimido en .aq_cache/."""
    CACHE_DIR.mkdir(exist_ok=True)
    key = _cache_key(path_origen, period)
    pq  = CACHE_DIR / f"{key}.parquet"
    meta= CACHE_DIR / f"{key}_meta.json"
    df.to_parquet(pq, index=False, compression="snappy")
    with open(meta, "w") as f:
        json.dump({
            "key":    key,
            "path":   str(path_origen),
            "period": period,
            "rows":   len(df),
            "cols":   list(df.columns),
            "size_mb":round(pq.stat().st_size / 1024**2, 2),
        }, f, indent=2)
    print(f"  [CACHE] Guardado: {pq.name}  ({pq.stat().st_size/1024**2:.2f} MB)")


def cargar_cache(path_origen: str, period: str) -> Optional[pd.DataFrame]:
    key  = _cache_key(path_origen, period)
    pq   = CACHE_DIR / f"{key}.parquet"
    if not pq.exists():
        return None
    df = pd.read_parquet(pq)
    # Restaurar tipos de fecha
    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"])
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"]).dt.date
    print(f"  [CACHE] Cargado: {pq.name}  ({len(df):,} registros)")
    return df


def listar_caches() -> list:
    if not CACHE_DIR.exists():
        return []
    caches = []
    for f in CACHE_DIR.glob("*_meta.json"):
        try:
            with open(f) as fp:
                caches.append(json.load(fp))
        except Exception:
            pass
    return caches


def borrar_cache(key: str):
    for ext in [".parquet", "_meta.json"]:
        p = CACHE_DIR / f"{key}{ext}"
        if p.exists():
            p.unlink()

# ══════════════════════════════════════════════════════════════════
#  PERSISTENCIA PKL — estado completo de sesión
# ══════════════════════════════════════════════════════════════════

def guardar_estado(ruta: str = "sesion_aq.pkl"):
    """Serializa el estado completo de la sesión."""
    with open(ruta, "wb") as f:
        pickle.dump(SES, f, protocol=pickle.HIGHEST_PROTOCOL)
    size = Path(ruta).stat().st_size / 1024**2
    print(f"  [OK] Estado guardado: {ruta}  ({size:.2f} MB)")


def cargar_estado(ruta: str = "sesion_aq.pkl") -> bool:
    global SES
    if not Path(ruta).exists():
        return False
    try:
        with open(ruta, "rb") as f:
            loaded = pickle.load(f)
        # Copiar campos al SES global
        for attr in vars(loaded):
            setattr(SES, attr, getattr(loaded, attr))
        print(f"  [OK] Estado restaurado: {SES.n_records_h:,} hist + {SES.n_records_c:,} curr")
        return True
    except Exception as e:
        print(f"  [ERROR] No se pudo restaurar: {e}")
        return False

# ══════════════════════════════════════════════════════════════════
#  SETTERS — actualizar SES tras carga o ETL
# ══════════════════════════════════════════════════════════════════

def set_historico(df: pd.DataFrame, path: str = ""):
    """Actualiza SES con el DataFrame histórico y recalcula vectores."""
    from core import build_station_vectors, FEATURES_UCI
    SES.df_hist    = df
    SES.path_hist  = path
    feats = [f for f in FEATURES_UCI if f in df.columns]
    SES.features_hist   = feats
    SES.station_vecs_h  = build_station_vectors(df, feats)
    if not SES.target_station and SES.station_vecs_h:
        SES.target_station = next(iter(SES.station_vecs_h))
    print(f"  [SES] Histórico listo: {len(SES.station_vecs_h)} estaciones | features: {feats}")


def set_actual(df: pd.DataFrame, path: str = ""):
    """Actualiza SES con el DataFrame actual y recalcula vectores."""
    from core import build_station_vectors
    SES.df_curr   = df
    SES.path_curr = path
    feats = [f for f in df.columns if f in ["PM2.5","PM10","SO2","NO2","CO","O3",
                                              "TEMP","PRES","DEW","WSPM"]]
    SES.features_curr  = feats if feats else ["PM2.5"]
    SES.station_vecs_c = build_station_vectors(df, SES.features_curr)
    print(f"  [SES] Actual listo: {len(SES.station_vecs_c)} zona(s) | features: {SES.features_curr}")


def set_unificado():
    """Unifica hist + curr y recalcula vectores del dataset combinado."""
    from core import build_station_vectors, FEATURES_UCI
    if not SES.hist_cargado or not SES.curr_cargado:
        print("  [WARN] Se necesitan ambos períodos para unificar.")
        return
    SES.df_unified = unificar_datasets(SES.df_hist, SES.df_curr)
    feats = [f for f in FEATURES_UCI if f in SES.df_unified.columns]
    SES.station_vecs_u = build_station_vectors(SES.df_unified, feats)

# ══════════════════════════════════════════════════════════════════
#  EXPORTACIÓN
# ══════════════════════════════════════════════════════════════════

def exportar_csv(df: pd.DataFrame, ruta: str):
    df.to_csv(ruta, index=False)
    print(f"  [OK] Exportado: {ruta}  ({len(df):,} filas)")


def exportar_resumen_estaciones(station_vecs: dict, ruta: str = "resumen_estaciones.csv"):
    """Exporta un CSV con el perfil promedio de cada estación."""
    filas = []
    for st, sv in station_vecs.items():
        row = {"station": st}
        for i, feat in enumerate(sv.get("features", [])):
            row[feat] = round(sv["vec"][i], 3)
        row["crit_pct"] = round(sv.get("crit_pct", 0), 2)
        row["mod_pct"]  = round(sv.get("mod_pct",  0), 2)
        row["pm25_p95"] = round(sv.get("pm25_p95", 0), 2)
        filas.append(row)
    pd.DataFrame(filas).to_csv(ruta, index=False)
    print(f"  [OK] Resumen estaciones: {ruta}")


def exportar_hipotesis(hipotesis: list, ruta: str = "hipotesis.json"):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(hipotesis, f, indent=2, ensure_ascii=False)
    print(f"  [OK] Hipótesis exportadas: {ruta}")
