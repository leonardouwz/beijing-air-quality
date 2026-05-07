#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
interface.py — Beijing Air Quality KNN v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI de consola: banners, menús, tablas, spinners.
Importa de core.py y data_manager.py; no contiene lógica de negocio.
"""

import os
import sys
import time
import json
import threading
import platform
from pathlib import Path

import numpy as np
import pandas as pd

from data_manager import (
    VERSION, CACHE_DIR, SES, STATIONS_LIST, FEATURES_UCI,
    STATION_COORDS,
    load_historical_data, load_current_data,
    set_historico, set_actual, set_unificado,
    guardar_cache, cargar_cache, listar_caches, borrar_cache,
    guardar_estado, cargar_estado,
    calcular_estadisticas, exportar_csv,
    exportar_resumen_estaciones, exportar_hipotesis,
)
from core import (
    METRICAS, FORMULAS, FEATURES_HIST, PM25_THRESHOLDS,
    build_station_vectors, build_month_vectors,
    knn_estaciones, knn_todas_metricas,
    detectar_eventos_criticos, knn_eventos_criticos,
    correlacion_viento_pm25, perfil_estacional,
    generar_alertas, predecir_pm25_knn,
    construir_contexto_knn, generar_hipotesis,
    benchmark_metricas, pm25_categoria,
)

# ══════════════════════════════════════════════════════════════════
#  COLORES Y UTILIDADES DE CONSOLA
# ══════════════════════════════════════════════════════════════════

if sys.platform == "win32":
    os.system("color")

C = {
    "RESET":  "\033[0m",  "BOLD":   "\033[1m",  "DIM":    "\033[2m",
    "PURPLE": "\033[95m", "BLUE":   "\033[94m", "CYAN":   "\033[96m",
    "GREEN":  "\033[92m", "YELLOW": "\033[93m", "RED":    "\033[91m",
    "WHITE":  "\033[97m", "GRAY":   "\033[90m",
}

def col(text, *codes):
    return "".join(C.get(c, "") for c in codes) + str(text) + C["RESET"]

def limpiar():
    os.system("cls" if sys.platform == "win32" else "clear")

def linea(char="─", ancho=76, color="GRAY"):
    print(col(char * ancho, color))

def doble_linea(ancho=76):
    print(col("═" * ancho, "PURPLE"))

def subtitulo(texto):
    linea()
    print(col(f"  {texto}", "CYAN", "BOLD"))
    linea()

def ok(msg):    print(col(f"  ✓  {msg}", "GREEN"))
def warn(msg):  print(col(f"  ⚠  {msg}", "YELLOW"))
def error(msg): print(col(f"  ✗  {msg}", "RED"))
def info(msg):  print(col(f"  ►  {msg}", "CYAN"))

def pausar():
    print()
    input(col("  Presiona Enter para continuar...", "DIM"))

def pedir_int(prompt, min_v=None, max_v=None, default=None) -> int:
    while True:
        suf = f" [{default}]" if default is not None else ""
        try:
            r = input(col(f"  {prompt}{suf}: ", "YELLOW")).strip()
            if r == "" and default is not None:
                return default
            v = int(r)
            if min_v is not None and v < min_v:
                warn(f"Mínimo: {min_v}"); continue
            if max_v is not None and v > max_v:
                warn(f"Máximo: {max_v}"); continue
            return v
        except ValueError:
            error("Ingresa un número entero válido.")

def pedir_float(prompt, min_v=None, max_v=None, default=None) -> float:
    while True:
        suf = f" [{default}]" if default is not None else ""
        try:
            r = input(col(f"  {prompt}{suf}: ", "YELLOW")).strip()
            if r == "" and default is not None:
                return default
            v = float(r)
            if min_v is not None and v < min_v:
                warn(f"Mínimo: {min_v}"); continue
            if max_v is not None and v > max_v:
                warn(f"Máximo: {max_v}"); continue
            return v
        except ValueError:
            error("Ingresa un número decimal válido.")

def pedir_opcion(prompt, opciones: list, default=None) -> str:
    while True:
        suf = f" [{default}]" if default else ""
        r = input(col(f"  {prompt}{suf}: ", "YELLOW")).strip().lower()
        if r == "" and default:
            return default
        if r in opciones:
            return r
        error(f"Opciones válidas: {', '.join(opciones)}")

def spinner(msg, fn, *args, **kwargs):
    frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
    result = [None]; exc = [None]
    def run():
        try:
            result[0] = fn(*args, **kwargs)
        except Exception as e:
            exc[0] = e
    t = threading.Thread(target=run, daemon=True)
    t.start()
    i = 0
    while t.is_alive():
        sys.stdout.write(f"\r  {col(frames[i % len(frames)], 'CYAN')}  {msg}   ")
        sys.stdout.flush(); time.sleep(0.08); i += 1
    sys.stdout.write(f"\r  {col('✓', 'GREEN')}  {msg}  {'':30}\n")
    sys.stdout.flush()
    if exc[0]:
        raise exc[0]
    return result[0]

def tabla(headers, rows, colores_col=None, max_col=55):
    import re
    def visible(s):
        return len(re.sub(r"\x1b\[[0-9;]*m", "", str(s)))
    anchos   = [visible(h) for h in headers]
    str_rows = [[str(c) for c in row] for row in rows]
    for row in str_rows:
        for i, cell in enumerate(row):
            if len(cell) > max_col:
                cell = cell[:max_col - 1] + "…"; row[i] = cell
            anchos[i] = max(anchos[i], visible(cell))
    sep = "  " + "─" * (sum(anchos) + len(headers) * 3 + 1)
    hdr = "  │ " + " │ ".join(
        col(h.ljust(anchos[i]), "CYAN") for i, h in enumerate(headers)) + " │"
    print(sep); print(hdr); print(sep)
    for row in str_rows:
        cells = []
        for i, cell in enumerate(row):
            pad    = anchos[i] - visible(cell)
            c_code = colores_col[i] if colores_col and i < len(colores_col) else "WHITE"
            cells.append(col(cell, c_code) + " " * pad)
        print("  │ " + " │ ".join(cells) + " │")
    print(sep)

def barra_progreso(actual, total, ancho=36, label=""):
    pct   = actual / max(total, 1)
    lleno = int(pct * ancho)
    barra = col("█" * lleno, "PURPLE") + col("░" * (ancho - lleno), "GRAY")
    sys.stdout.write(f"\r  [{barra}] {pct*100:5.1f}%  {label[:28]:<28}")
    sys.stdout.flush()

def _pm25_tag(val: float) -> str:
    if val <= 35:   return col(f"{val:.1f}", "GREEN")
    if val <= 75:   return col(f"{val:.1f}", "YELLOW")
    if val <= 150:  return col(f"{val:.1f}", "YELLOW")
    return col(f"{val:.1f}", "RED")

# ══════════════════════════════════════════════════════════════════
#  BANNER Y ESTADO
# ══════════════════════════════════════════════════════════════════

def banner():
    limpiar(); print()
    doble_linea()
    titulo = f"   🌫️  Beijing Air Quality — KNN entre Estaciones  v{VERSION}   "
    print(col("║", "PURPLE") + col(titulo, "BOLD", "WHITE") + col("║", "PURPLE"))
    doble_linea()
    print(col("  Dominio: ", "GRAY") +
          col("Inteligencia de Negocios · Salud Pública · Sostenibilidad Ambiental", "CYAN"))
    print(col("  Dataset: ", "GRAY") +
          col("UCI 2013-2017  +  Open-Meteo/Satelital 2022-2026  ·  12 estaciones", "CYAN"))
    linea()

def estado_sesion():
    def tag(ok_bool, yes="✓", no="✗"):
        return col(yes, "GREEN") if ok_bool else col(no, "RED")

    print(f"  Histórico {tag(SES.hist_cargado)}  "
          f"Actual {tag(SES.curr_cargado)}  "
          f"  K={col(str(SES.k),'YELLOW')}  "
          f"Métrica={col(SES.metrica.upper(),'PURPLE')}  "
          f"Norm={col(SES.norm,'GRAY')}")

    if SES.hist_cargado:
        print(f"  2013-17: {col(f'{SES.n_records_h:,}','CYAN')} registros  "
              f"PM2.5 prom={_pm25_tag(SES.pm25_mean_h)} µg/m³  "
              f"Target={col(SES.target_station,'YELLOW')}")
    if SES.curr_cargado:
        print(f"  2022-26: {col(f'{SES.n_records_c:,}','CYAN')} registros  "
              f"PM2.5 prom={_pm25_tag(SES.pm25_mean_c)} µg/m³  "
              f"Mejora={col(f'↓{SES.mejora_pm25_pct}%','GREEN')}")
    print()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 1 — DATOS
# ══════════════════════════════════════════════════════════════════

def menu_datos():
    while True:
        banner(); subtitulo("1. Gestión de Datos"); estado_sesion()
        print(col("  [1]","YELLOW"), "Cargar histórico 2013-2017  (CSVs UCI por estación)")
        print(col("  [2]","YELLOW"), "Cargar actual 2022-2026     (CSV Open-Meteo/API)")
        print(col("  [3]","YELLOW"), "Unificar ambos períodos")
        print(col("  [4]","YELLOW"), "Estadísticas del dataset")
        print(col("  [5]","YELLOW"), "Administrar caché  (Parquet)")
        print(col("  [6]","YELLOW"), "Guardar estado  (.pkl)")
        print(col("  [7]","YELLOW"), "Cargar estado   (.pkl)")
        print(col("  [8]","YELLOW"), "Exportar CSV")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _cargar_historico()
        elif op == "2": _cargar_actual()
        elif op == "3": _unificar()
        elif op == "4": _estadisticas()
        elif op == "5": _admin_cache()
        elif op == "6": guardar_estado(); pausar()
        elif op == "7": cargar_estado(); pausar()
        elif op == "8": _exportar_menu()
        elif op == "0": break
        else: warn("Opción inválida.")

def _cargar_historico():
    subtitulo("Cargar Datos Históricos 2013-2017")
    print(col("  Estructura esperada:", "GRAY"))
    print(col("  2013-2017/PRSA_Data_20130301-20170228/", "DIM"))
    print(col("    PRSA_Data_{Estacion}_20130301-20170228.csv", "DIM"))
    print()

    # Intentar caché
    caches = [c for c in listar_caches() if c.get("period") == "2013-2017"]
    if caches:
        print(col("  Caché disponible:", "CYAN"))
        for i, c in enumerate(caches, 1):
            print(f"  [{i}] {c['path'][:55]}  ({c['rows']:,} filas  {c['size_mb']} MB)")
        print("  [N] Cargar nueva ruta")
        op = input(col("  Opción [N]: ", "YELLOW")).strip()
        if op.isdigit() and 1 <= int(op) <= len(caches):
            df = cargar_cache(caches[int(op)-1]["path"], "2013-2017")
            if df is not None:
                set_historico(df, caches[int(op)-1]["path"])
                ok("Histórico cargado desde caché."); pausar(); return

    base = input(col("  Ruta base [2013-2017/PRSA_Data_20130301-20170228]: ", "YELLOW")).strip() \
           or "2013-2017/PRSA_Data_20130301-20170228"

    try:
        df = spinner("Leyendo CSVs...", load_historical_data, base)
        spinner("Indexando vectores por estación...", set_historico, df, base)
        spinner("Guardando caché...", guardar_cache, df, base, "2013-2017")
        ok(f"Histórico listo: {SES.n_records_h:,} registros | {SES.n_estaciones_h} estaciones")
    except Exception as e:
        error(str(e))
    pausar()

def _cargar_actual():
    subtitulo("Cargar Datos Actuales 2022-2026")
    print(col("  Columnas mínimas: date, pm2_5", "GRAY"))
    print(col("  Columnas opcionales: pm10, temperature_2m, windspeed_10m, ...", "DIM"))
    print()

    caches = [c for c in listar_caches() if c.get("period") == "2022-2026"]
    if caches:
        print(col("  Caché disponible:", "CYAN"))
        for i, c in enumerate(caches, 1):
            print(f"  [{i}] {c['path'][:55]}  ({c['rows']:,} filas  {c['size_mb']} MB)")
        print("  [N] Cargar nueva ruta")
        op = input(col("  Opción [N]: ", "YELLOW")).strip()
        if op.isdigit() and 1 <= int(op) <= len(caches):
            df = cargar_cache(caches[int(op)-1]["path"], "2022-2026")
            if df is not None:
                set_actual(df, caches[int(op)-1]["path"])
                ok("Actual cargado desde caché."); pausar(); return

    path = input(col("  Ruta [2022-2026/air_quality_historical.csv]: ", "YELLOW")).strip() \
           or "2022-2026/air_quality_historical.csv"
    try:
        df = spinner("Leyendo CSV actual...", load_current_data, path)
        spinner("Indexando...", set_actual, df, path)
        spinner("Guardando caché...", guardar_cache, df, path, "2022-2026")
        ok(f"Actual listo: {SES.n_records_c:,} registros")
    except Exception as e:
        error(str(e))
    pausar()

def _unificar():
    if not SES.hist_cargado or not SES.curr_cargado:
        warn("Carga ambos períodos primero."); pausar(); return
    spinner("Unificando datasets...", set_unificado)
    ok("Dataset unificado listo.")
    pausar()

def _estadisticas():
    if not SES.hist_cargado and not SES.curr_cargado:
        error("Sin datos."); pausar(); return
    subtitulo("Estadísticas del Dataset")
    for df, label in [(SES.df_hist, "2013-2017"), (SES.df_curr, "2022-2026")]:
        if df is None or df.empty:
            continue
        st = calcular_estadisticas(df, label)
        print(col(f"\n  ── Período {label} ──", "CYAN", "BOLD"))
        tabla(["Métrica","Valor"], [
            ["Registros",   f"{st['n_registros']:,}"],
            ["Regiones",    str(st["n_regiones"])],
            ["PM2.5 media", f"{st['pm25_mean']} µg/m³"],
            ["PM2.5 std",   f"{st['pm25_std']} µg/m³"],
            ["PM2.5 p25",   f"{st['pm25_p25']} µg/m³"],
            ["PM2.5 p50",   f"{st['pm25_p50']} µg/m³"],
            ["PM2.5 p95",   f"{st['pm25_p95']} µg/m³"],
            ["PM2.5 max",   f"{st['pm25_max']} µg/m³"],
            ["Días críticos (>150)", f"{st['crit_pct']}%"],
            ["Rango temporal", st["dias_rango"]],
        ], ["CYAN","WHITE"])
    pausar()

def _admin_cache():
    caches = listar_caches()
    if not caches:
        info("No hay cachés."); pausar(); return
    tabla(["#","Período","Ruta","Filas","MB"],
          [[str(i+1), c.get("period","?"), c.get("path","?")[:40],
            f"{c.get('rows',0):,}", str(c.get("size_mb","?"))]
           for i, c in enumerate(caches)],
          ["GRAY","PURPLE","CYAN","WHITE","YELLOW"])
    print(col("  [B] Borrar uno  [T] Borrar todos  [0] Volver", "GRAY"))
    op = input(col("  Opción: ", "YELLOW")).strip().upper()
    if op == "B":
        idx = pedir_int("Número", 1, len(caches)) - 1
        borrar_cache(caches[idx]["key"]); ok("Eliminado.")
    elif op == "T":
        for c in caches: borrar_cache(c["key"])
        ok("Todos eliminados.")
    pausar()

def _exportar_menu():
    print()
    print(col("  [1]","YELLOW"), "CSV histórico limpio")
    print(col("  [2]","YELLOW"), "CSV actual limpio")
    print(col("  [3]","YELLOW"), "Resumen por estación (vectores KNN)")
    print(col("  [4]","YELLOW"), "Hipótesis generadas (JSON)")
    op = input(col("  Opción: ", "BOLD")).strip()
    if op == "1" and SES.hist_cargado:
        exportar_csv(SES.df_hist, "historico_clean.csv")
    elif op == "2" and SES.curr_cargado:
        exportar_csv(SES.df_curr, "actual_clean.csv")
    elif op == "3" and SES.station_vecs_h:
        exportar_resumen_estaciones(SES.station_vecs_h, "resumen_estaciones_hist.csv")
    elif op == "4" and SES.hipotesis:
        exportar_hipotesis(SES.hipotesis)
    else:
        warn("Sin datos o hipótesis disponibles.")
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 2 — CONFIGURACIÓN
# ══════════════════════════════════════════════════════════════════

def menu_config():
    while True:
        banner(); subtitulo("2. Configuración KNN"); estado_sesion()
        tabla(["Parámetro","Valor","Descripción"],[
            ["K",             str(SES.k),           "Vecinos más cercanos"],
            ["Métrica",       SES.metrica,           FORMULAS.get(SES.metrica,"")],
            ["Normalización", SES.norm,              "zscore | minmax | none"],
            ["Target",        SES.target_station,    "Estación objetivo"],
        ],["YELLOW","GREEN","GRAY"])
        print()
        print(col("  [1]","YELLOW"), "Cambiar K")
        print(col("  [2]","YELLOW"), "Cambiar métrica")
        print(col("  [3]","YELLOW"), "Cambiar normalización")
        print(col("  [4]","YELLOW"), "Cambiar estación target")
        print(col("  [5]","YELLOW"), "Restaurar defectos")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if op == "1":
            SES.k = pedir_int("K", 1, 11, SES.k); ok(f"K={SES.k}")
        elif op == "2":
            _elegir_metrica()
        elif op == "3":
            SES.norm = pedir_opcion("Normalización", ["zscore","minmax","none"], SES.norm)
            ok(f"Norm={SES.norm}")
        elif op == "4":
            _elegir_target()
        elif op == "5":
            SES.k = 5; SES.metrica = "coseno"; SES.norm = "zscore"
            ok("Defectos restaurados.")
        elif op == "0": break
        else: warn("Inválido.")
        if op != "0": pausar()

def _elegir_metrica():
    mets = list(METRICAS.keys())
    for i, m in enumerate(mets, 1):
        marca = col(" ◄", "GREEN") if m == SES.metrica else ""
        print(f"  [{i}] {col(m.upper(),'YELLOW')}  {col(FORMULAS[m],'GRAY')}{marca}")
    idx = pedir_int("Métrica", 1, len(mets), mets.index(SES.metrica)+1)
    SES.metrica = mets[idx - 1]; ok(f"Métrica: {SES.metrica.upper()}")

def _elegir_target():
    sv = SES.station_vecs_h or SES.station_vecs_c
    if not sv:
        warn("Carga datos primero."); return
    stations = list(sv.keys())
    for i, s in enumerate(stations, 1):
        print(f"  [{i}] {s}")
    idx = pedir_int("Estación", 1, len(stations))
    SES.target_station = stations[idx - 1]
    ok(f"Target: {SES.target_station}")

# ══════════════════════════════════════════════════════════════════
#  MENÚ 3 — KNN ENTRE ESTACIONES
# ══════════════════════════════════════════════════════════════════

def menu_knn():
    if not SES.hist_cargado and not SES.curr_cargado:
        error("Carga datos primero."); pausar(); return
    while True:
        banner(); subtitulo("3. KNN entre Estaciones"); estado_sesion()
        print(col("  [1]","YELLOW"), "KNN — período histórico 2013-2017")
        print(col("  [2]","YELLOW"), "KNN — período actual 2022-2026")
        print(col("  [3]","YELLOW"), "Comparar todas las métricas")
        print(col("  [4]","YELLOW"), "KNN cruzado (hist ↔ actual)")
        print(col("  [5]","YELLOW"), "Seleccionar features activos")
        print(col("  [6]","YELLOW"), "Historial de consultas KNN")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _knn_periodo(SES.station_vecs_h, "2013-2017")
        elif op == "2": _knn_periodo(SES.station_vecs_c, "2022-2026")
        elif op == "3": _knn_todas_metricas()
        elif op == "4": _knn_cruzado()
        elif op == "5": _elegir_features()
        elif op == "6": _historial_knn()
        elif op == "0": break
        else: warn("Inválido.")

def _knn_periodo(station_vecs: dict, period_label: str):
    if not station_vecs:
        warn(f"Sin datos para {period_label}."); pausar(); return
    subtitulo(f"KNN — {period_label}")
    _elegir_target_inline(station_vecs)
    k = pedir_int("K vecinos", 1, len(station_vecs)-1, SES.k)
    SES.k = k

    t0      = time.perf_counter()
    vecinos = knn_estaciones(SES.target_station, station_vecs, k,
                             SES.metrica, norm=SES.norm)
    t1      = time.perf_counter()

    _mostrar_vecinos(SES.target_station, vecinos, station_vecs, period_label, (t1-t0)*1000)
    SES.historial_knn.append({
        "target": SES.target_station, "period": period_label,
        "metrica": SES.metrica, "k": k,
        "top1": vecinos[0]["station"] if vecinos else "—",
        "top1_sim": vecinos[0]["similitud"] if vecinos else 0,
    })
    pausar()

def _elegir_target_inline(station_vecs: dict):
    stations = list(station_vecs.keys())
    cur_idx  = stations.index(SES.target_station) + 1 \
               if SES.target_station in stations else 1
    print(col(f"  Target actual: {SES.target_station}", "GRAY"))
    print(col("  " + "  ".join(f"[{i+1}]{s[:5]}" for i,s in enumerate(stations)), "DIM"))
    r = input(col(f"  Cambiar target? [Enter={SES.target_station}]: ", "YELLOW")).strip()
    if r.isdigit() and 1 <= int(r) <= len(stations):
        SES.target_station = stations[int(r)-1]
        ok(f"Target: {SES.target_station}")

def _mostrar_vecinos(target, vecinos, station_vecs, period, tiempo_ms):
    print()
    sv_t = station_vecs.get(target, {})
    print(col(f"  TARGET: {target}", "CYAN", "BOLD") +
          col(f"  PM2.5={sv_t.get('pm25_mean',0):.1f} µg/m³  "
              f"críticos={sv_t.get('crit_pct',0):.1f}%  "
              f"p95={sv_t.get('pm25_p95',0):.1f}", "GRAY"))
    print(col(f"  {SES.metrica.upper()}  |  {FORMULAS[SES.metrica]}  |  {tiempo_ms:.2f} ms", "GRAY"))
    print()
    filas = []
    for i, v in enumerate(vecinos):
        pm   = v.get("pm25_mean", 0)
        cat  = pm25_categoria(pm)
        bar_w= int(v["similitud"] / 100 * 16)
        bar  = col("█"*bar_w,"PURPLE") + col("░"*(16-bar_w),"GRAY")
        filas.append([
            str(i+1),
            v["station"],
            f"{v['dist']:.5f}",
            f"{v['similitud']:.1f}%",
            bar,
            f"{pm:.1f} µg/m³",
            cat,
            f"{v.get('crit_pct',0):.1f}%",
        ])
    tabla(["#","Estación","Distancia","Similitud","[Barra]",
           "PM2.5 med","Categoría","% Críticos"],
          filas, ["GRAY","CYAN","WHITE","GREEN","WHITE","YELLOW","PURPLE","RED"])

def _knn_todas_metricas():
    sv = SES.station_vecs_h or SES.station_vecs_c
    if not sv:
        warn("Sin datos."); pausar(); return
    subtitulo("Comparación de Métricas KNN")
    _elegir_target_inline(sv)
    k = pedir_int("K", 1, len(sv)-1, SES.k)
    print()
    resultado = spinner("Calculando todas las métricas...",
                        knn_todas_metricas, SES.target_station, sv, k)
    filas = []
    for met, data in resultado.items():
        top = data["vecinos"][:3]
        top_str = ", ".join(f"{v['station']}({v['similitud']:.0f}%)" for v in top)
        filas.append([
            met.upper(), FORMULAS[met],
            top[0]["station"] if top else "—",
            f"{top[0]['similitud']:.1f}%" if top else "—",
            top_str[:45],
            f"{data['tiempo_ms']} ms",
        ])
    tabla(["Métrica","Fórmula","Vecino #1","Sim #1","Top-3","Tiempo"],
          filas, ["PURPLE","GRAY","CYAN","GREEN","WHITE","YELLOW"])
    pausar()

def _knn_cruzado():
    if not SES.hist_cargado or not SES.curr_cargado:
        warn("Necesitas ambos períodos cargados."); pausar(); return
    subtitulo("KNN Cruzado Histórico ↔ Actual")
    info("Para cada estación histórica busca su análogo más similar en el período actual.")
    print()
    from core import zscore_matrix, METRICAS as MET
    svh = SES.station_vecs_h
    svc = SES.station_vecs_c

    # Feature común: PM2.5
    feat = "PM2.5"
    filas = []
    for st_h, sv_h in svh.items():
        pm_h = sv_h.get("pm25_mean", 0)
        best_st, best_sim = "—", 0.0
        for st_c, sv_c in svc.items():
            pm_c  = sv_c.get("pm25_mean", 0)
            # Similitud simple por PM2.5 (euclidiana 1D)
            d     = abs(pm_h - pm_c)
            sim   = 1 / (1 + d) * 100
            if sim > best_sim:
                best_sim, best_st = sim, st_c
        delta = ((svh[st_h]["pm25_mean"] - svc.get(best_st,{}).get("pm25_mean", svh[st_h]["pm25_mean"]))
                 / max(svh[st_h]["pm25_mean"], 1) * 100)
        filas.append([
            st_h,
            f"{pm_h:.1f}",
            best_st,
            f"{svc.get(best_st,{}).get('pm25_mean',0):.1f}",
            f"{best_sim:.1f}%",
            col(f"↓{delta:.1f}%","GREEN") if delta > 0 else col(f"↑{abs(delta):.1f}%","RED"),
        ])
    tabla(["Estación Hist.","PM2.5 hist","Análogo Actual","PM2.5 actual","Similitud","Δ"],
          filas, ["CYAN","YELLOW","GREEN","YELLOW","WHITE","GREEN"])
    pausar()

def _elegir_features():
    feats = SES.features_hist or FEATURES_UCI
    print()
    print(col("  Features disponibles:", "CYAN"))
    for i, f in enumerate(feats, 1):
        print(f"  [{i}] {f}")
    r = input(col("  Índices activos (ej: 1 2 3) [Enter=todos]: ", "YELLOW")).strip()
    if r:
        idxs = [int(x)-1 for x in r.split() if x.isdigit() and 1<=int(x)<=len(feats)]
        SES.features_hist = [feats[i] for i in idxs] if idxs else feats
    ok(f"Features activos: {SES.features_hist}")
    pausar()

def _historial_knn():
    if not SES.historial_knn:
        info("Sin historial."); pausar(); return
    subtitulo("Historial KNN (últimas 10 consultas)")
    filas = [[str(i+1), h["target"], h["period"], h["metrica"].upper(),
              str(h["k"]), h["top1"], f"{h['top1_sim']:.1f}%"]
             for i, h in enumerate(SES.historial_knn[-10:])]
    tabla(["#","Target","Período","Métrica","K","Vecino #1","Sim"],
          filas, ["GRAY","CYAN","PURPLE","YELLOW","WHITE","GREEN","GREEN"])
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 4 — ANÁLISIS CLIMÁTICO
# ══════════════════════════════════════════════════════════════════

def menu_clima():
    if not SES.hist_cargado:
        error("Carga datos históricos primero."); pausar(); return
    while True:
        banner(); subtitulo("4. Influencia Climática"); estado_sesion()
        print(col("  [1]","YELLOW"), "Correlación viento ↔ PM2.5 por estación")
        print(col("  [2]","YELLOW"), "Perfil estacional (invierno/verano/etc.)")
        print(col("  [3]","YELLOW"), "Eventos críticos y similitud KNN entre días")
        print(col("  [4]","YELLOW"), "Comparativa estacional hist. vs actual")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _correlacion_viento()
        elif op == "2": _perfil_estacional()
        elif op == "3": _eventos_criticos()
        elif op == "4": _comparativa_estacional()
        elif op == "0": break
        else: warn("Inválido.")

def _correlacion_viento():
    subtitulo("Correlación Viento ↔ PM2.5")
    corr = spinner("Calculando correlaciones...", correlacion_viento_pm25, SES.df_hist)
    if not corr:
        warn("No hay columna WSPM en el dataset."); pausar(); return
    filas = []
    for st, data in sorted(corr.items(), key=lambda x: x[1]["wspm_corr"]):
        r    = data["wspm_corr"]
        sign = col("↓ dispersa", "GREEN") if r < -0.2 else (
               col("↑ acumula", "RED") if r > 0.2 else col("— neutro","GRAY"))
        filas.append([st, f"{r:+.4f}", sign, data["interpretacion"][:45]])
    tabla(["Estación","Corr. Pearson","Efecto","Interpretación"],
          filas, ["CYAN","YELLOW","WHITE","GRAY"])
    pausar()

def _perfil_estacional():
    sv = SES.station_vecs_h
    if not sv: warn("Sin datos."); pausar(); return
    subtitulo("Perfil Estacional por Estación")
    _elegir_target_inline(sv)
    perfil = perfil_estacional(SES.df_hist, SES.target_station)
    if not perfil:
        warn("Sin datos estacionales."); pausar(); return
    print()
    print(col(f"  PM2.5 promedio por estación del año — {SES.target_station}", "CYAN","BOLD"))
    max_val = max(perfil.values())
    for season, val in sorted(perfil.items(), key=lambda x: x[1], reverse=True):
        bar_w = int(val / max_val * 30)
        bar   = col("█"*bar_w,"PURPLE") + col("░"*(30-bar_w),"GRAY")
        cat   = pm25_categoria(val)
        print(f"  {season:<10} [{bar}] {_pm25_tag(val)} µg/m³  ({cat})")
    pausar()

def _eventos_criticos():
    subtitulo("Eventos Críticos — PM2.5 > 150 µg/m³")
    umbral = pedir_float("Umbral PM2.5", 50, 500, 150)
    criticos = spinner("Detectando eventos...", detectar_eventos_criticos, SES.df_hist, umbral)
    if not criticos:
        info(f"Sin eventos con PM2.5 > {umbral}."); pausar(); return
    info(f"Encontrados {len(criticos)} eventos críticos.")
    filas = [[str(i+1), e["station"], e["date"], f"{e['pm25']:.1f}", e["cat"]]
             for i, e in enumerate(criticos[:15])]
    tabla(["#","Estación","Fecha","PM2.5","Categoría"],
          filas, ["GRAY","CYAN","WHITE","RED","PURPLE"])
    print()
    idx = pedir_int(f"Analizar evento # (1-{min(15,len(criticos))})", 1, min(15,len(criticos)), 1) - 1
    k_ev = pedir_int("K eventos similares", 1, min(10,len(criticos)-1), 3)
    vecinos_ev = knn_eventos_criticos(idx, criticos, k_ev, SES.metrica)
    print()
    print(col(f"  Eventos similares al #{idx+1} ({criticos[idx]['station']} {criticos[idx]['date']}):", "CYAN","BOLD"))
    filas2 = [[str(i+1), v["station"], v["date"], f"{v['pm25']:.1f}", f"{v['similitud']:.1f}%"]
              for i, v in enumerate(vecinos_ev)]
    tabla(["#","Estación","Fecha","PM2.5","Similitud"],
          filas2, ["GRAY","CYAN","WHITE","RED","GREEN"])
    pausar()

def _comparativa_estacional():
    if not SES.hist_cargado or not SES.curr_cargado:
        warn("Necesitas ambos períodos."); pausar(); return
    subtitulo("Comparativa Estacional Hist. vs Actual")
    sv = SES.station_vecs_h
    _elegir_target_inline(sv)
    ph = perfil_estacional(SES.df_hist, SES.target_station)
    pc = perfil_estacional(SES.df_curr,
                           SES.df_curr["region"].iloc[0] if not SES.df_curr.empty else "Beijing")
    seasons = ["Invierno","Primavera","Verano","Otoño"]
    print()
    print(col(f"  {SES.target_station} — PM2.5 por estación del año", "CYAN","BOLD"))
    filas = []
    for s in seasons:
        vh = ph.get(s, 0)
        vc = pc.get(s, 0)
        delta = ((vh - vc) / max(vh, 1) * 100) if vh else 0
        filas.append([s, f"{vh:.1f}", f"{vc:.1f}",
                      col(f"↓{delta:.1f}%","GREEN") if delta > 0 else col(f"↑{abs(delta):.1f}%","RED")])
    tabla(["Estación","PM2.5 2013-17","PM2.5 2022-26","Δ mejora"],
          filas, ["PURPLE","YELLOW","GREEN","WHITE"])
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 5 — ALERTAS
# ══════════════════════════════════════════════════════════════════

def menu_alertas():
    if not SES.hist_cargado:
        error("Carga datos históricos primero."); pausar(); return
    while True:
        banner(); subtitulo("5. Alertas de Riesgo"); estado_sesion()
        print(col("  [1]","YELLOW"), "Generar alertas por estación")
        print(col("  [2]","YELLOW"), "Predicción PM2.5 con KNN (condiciones actuales)")
        print(col("  [3]","YELLOW"), "Comparativa períodos — ranking de criticidad")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _alertas_estaciones()
        elif op == "2": _prediccion_pm25()
        elif op == "3": _ranking_criticidad()
        elif op == "0": break
        else: warn("Inválido.")

def _alertas_estaciones():
    subtitulo("Alertas por Estación")
    umbral_c = pedir_float("% días críticos para CRÍTICO", 5, 100, 20)
    alertas  = generar_alertas(SES.station_vecs_h, umbral_c)
    if not alertas:
        ok("Ninguna estación supera el umbral de alerta."); pausar(); return
    filas = [[a["station"], a["nivel"],
              f"{a['crit_pct']}%", f"{a['mod_pct']}%",
              f"{a['pm25_p95']} µg/m³", a["accion"][:45]]
             for a in alertas]
    tabla(["Estación","Nivel","% Críticos","% Moderados","PM2.5 p95","Acción recomendada"],
          filas, ["CYAN","RED","RED","YELLOW","YELLOW","GRAY"])
    pausar()

def _prediccion_pm25():
    subtitulo("Predicción KNN de PM2.5")
    info("Ingresa condiciones meteorológicas actuales para predecir PM2.5.")
    print()
    TEMP  = pedir_float("TEMP (°C)", -30, 50, 15)
    PRES  = pedir_float("PRES (hPa)", 950, 1060, 1010)
    DEW   = pedir_float("DEW — Punto de rocío (°C)", -40, 35, 5)
    WSPM  = pedir_float("WSPM — Velocidad viento (m/s)", 0, 20, 2)
    target_vec = np.array([TEMP, PRES, DEW, WSPM])
    result = predecir_pm25_knn(target_vec, SES.station_vecs_h, SES.k, SES.metrica)
    print()
    if result["pm25_pred"] is None:
        warn("No hay suficientes features para predecir."); pausar(); return
    cat = pm25_categoria(result["pm25_pred"])
    print(col(f"  PM2.5 PREDICHO: {result['pm25_pred']} µg/m³", "BOLD","WHITE"))
    print(col(f"  Categoría: {cat}", "YELLOW"))
    print()
    print(col("  Basado en estaciones similares:", "GRAY"))
    for v in result["vecinos"]:
        print(f"    {col(v['station'],'CYAN')}  PM2.5 histórico={v['pm25_mean']:.1f}  dist={v['dist']:.4f}")
    pausar()

def _ranking_criticidad():
    subtitulo("Ranking de Criticidad — Histórico vs Actual")
    filas = []
    for st, sv in sorted(SES.station_vecs_h.items(),
                         key=lambda x: x[1]["crit_pct"], reverse=True):
        curr_pm = SES.station_vecs_c.get(
            next(iter(SES.station_vecs_c), ""), {}).get("pm25_mean", None)
        delta_s = (f"↓{((sv['pm25_mean']-curr_pm)/sv['pm25_mean']*100):.0f}%"
                   if curr_pm else "—")
        filas.append([
            st,
            f"{sv['pm25_mean']:.1f}",
            f"{sv['crit_pct']:.1f}%",
            f"{sv['mod_pct']:.1f}%",
            f"{sv['pm25_p95']:.1f}",
            col(delta_s,"GREEN") if "↓" in delta_s else col(delta_s,"GRAY"),
        ])
    tabla(["Estación","PM2.5 med","% Críticos","% Mod.","p95","Δ actual"],
          filas, ["CYAN","YELLOW","RED","YELLOW","PURPLE","GREEN"])
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 6 — HIPÓTESIS IA
# ══════════════════════════════════════════════════════════════════

def menu_hipotesis():
    while True:
        banner(); subtitulo("6. Hipótesis de Valor con IA"); estado_sesion()
        print(col("  [1]","YELLOW"), "Generar hipótesis (requiere ANTHROPIC_API_KEY)")
        print(col("  [2]","YELLOW"), "Ver hipótesis generadas")
        print(col("  [3]","YELLOW"), "Exportar hipótesis a JSON")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _generar_hipotesis()
        elif op == "2": _ver_hipotesis()
        elif op == "3": exportar_hipotesis(SES.hipotesis); pausar()
        elif op == "0": break
        else: warn("Inválido.")

def _generar_hipotesis():
    if not SES.hist_cargado:
        error("Necesitas datos históricos cargados."); pausar(); return
    if not SES.station_vecs_h:
        error("Ejecuta primero un KNN."); pausar(); return
    subtitulo("Generación de Hipótesis con Claude AI")

    import os
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        api_key = input(col("  ANTHROPIC_API_KEY: ", "YELLOW")).strip()
    if not api_key:
        error("Se requiere API key."); pausar(); return

    _elegir_target_inline(SES.station_vecs_h)
    k  = pedir_int("K vecinos para el contexto", 1, 5, SES.k)
    vecinos = knn_estaciones(SES.target_station, SES.station_vecs_h, k, SES.metrica)

    ctx = construir_contexto_knn(
        SES.target_station, vecinos, SES.station_vecs_h,
        SES.df_hist, SES.df_curr if SES.curr_cargado else pd.DataFrame(),
        SES.metrica, k,
    )
    print()
    print(col("  Contexto enviado a Claude:", "GRAY"))
    print(col("  " + "\n  ".join(ctx.split("\n")[:10]) + "\n  ...", "DIM"))
    print()

    try:
        hipotesis = spinner("Generando hipótesis con Claude API...",
                            generar_hipotesis, ctx, api_key)
        SES.hipotesis = hipotesis
        SES.historial_hip.append({"target": SES.target_station, "n": len(hipotesis)})
        ok(f"{len(hipotesis)} hipótesis generadas.")
        _ver_hipotesis()
    except Exception as e:
        error(f"Error API: {e}")
    pausar()

def _ver_hipotesis():
    if not SES.hipotesis:
        warn("Sin hipótesis. Genera primero (opción 1)."); pausar(); return
    TIPO_COLOR = {
        "prediccion":"PURPLE", "clima":"BLUE", "alerta":"RED", "comparacion":"YELLOW"
    }
    TIPO_ICON = {
        "prediccion":"🔮", "clima":"🌬️", "alerta":"🚨", "comparacion":"📊"
    }
    for h in SES.hipotesis:
        tipo_c = TIPO_COLOR.get(h.get("tipo",""), "WHITE")
        icon   = TIPO_ICON.get(h.get("tipo",""), "💡")
        conf   = int(h.get("confianza", 0) * 100)
        imp    = h.get("impacto","?")
        print()
        linea("─", 76, tipo_c)
        print(col(f"  {icon} [{h.get('tipo','').upper()}]  {h.get('titulo','')}",
                  tipo_c, "BOLD"))
        print(col(f"     Confianza: {conf}%  |  Impacto: {imp}", "GRAY"))
        linea("─", 76, tipo_c)
        print(col("  HIPÓTESIS:", "CYAN"))
        print(f"    {h.get('hipotesis','')}")
        print(col("\n  EVIDENCIA KNN:", "CYAN"))
        print(f"    {h.get('evidencia_knn','')}")
        print(col("\n  ACCIÓN:", "GREEN"))
        print(f"    {h.get('accion','')}")
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ 7 — BENCHMARK
# ══════════════════════════════════════════════════════════════════

def menu_benchmark():
    if not SES.hist_cargado:
        error("Carga datos primero."); pausar(); return
    while True:
        banner(); subtitulo("7. Benchmark de Métricas"); estado_sesion()
        print(col("  [1]","YELLOW"), "Benchmark de velocidad  (todas las métricas)")
        print(col("  [2]","YELLOW"), "Tabla de complejidad teórica")
        print(col("  [3]","YELLOW"), "Info de hardware")
        print(col("  [0]","GRAY"),   "Volver")
        linea()
        op = input(col("  Opción: ", "BOLD")).strip()
        if   op == "1": _benchmark()
        elif op == "2": _complejidad()
        elif op == "3": _hardware()
        elif op == "0": break
        else: warn("Inválido.")

def _benchmark():
    subtitulo("Benchmark de Velocidad")
    _elegir_target_inline(SES.station_vecs_h)
    reps = pedir_int("Repeticiones", 1, 20, 5)
    resultados = spinner("Ejecutando benchmark...",
                         benchmark_metricas, SES.target_station,
                         SES.station_vecs_h, SES.k, reps)
    filas = [[r["metrica"].upper(), r["formula"], f"{r['tiempo_ms']:.3f} ms",
              r["top1_station"], f"{r['top1_sim']:.1f}%"] for r in resultados]
    tabla(["Métrica","Fórmula","Tiempo promedio","Vecino #1","Sim #1"],
          filas, ["PURPLE","GRAY","YELLOW","CYAN","GREEN"])
    pausar()

def _complejidad():
    subtitulo("Complejidad Teórica")
    N = len(SES.station_vecs_h)
    M = len(SES.features_hist)
    filas = [
        ["Coseno",    "O(N×M)", "O(N²×M)", f"{N*M:,}",   "Producto punto + normas"],
        ["Pearson",   "O(N×M)", "O(N²×M)", f"{N*M:,}",   "Media y varianza por par"],
        ["Manhattan", "O(N×M)", "O(N²×M)", f"{N*M:,}",   "Suma diferencias absolutas"],
        ["Euclidiana","O(N×M)", "O(N²×M)", f"{N*M:,}",   "Raíz suma cuadrados"],
    ]
    tabla(["Métrica","1 estación","Todas vs todas","Ops (1 vs N)","Notas"],
          filas, ["PURPLE","GREEN","RED","YELLOW","GRAY"])
    info(f"Dataset actual: {N} estaciones × {M} features → {N*M:,} ops por consulta")
    pausar()

def _hardware():
    import psutil
    ram = psutil.virtual_memory()
    subtitulo("Hardware del Sistema")
    tabla(["Componente","Detalle"],[
        ["CPU",     platform.processor()[:60] or platform.machine()],
        ["Cores",   str(os.cpu_count())],
        ["RAM total", f"{ram.total/1024**3:.1f} GB"],
        ["RAM usada", f"{ram.used/1024**3:.1f} GB ({ram.percent}%)"],
        ["OS",      f"{platform.system()} {platform.release()[:20]}"],
        ["Python",  sys.version[:40]],
        ["NumPy",   np.__version__],
        ["Pandas",  pd.__version__],
    ],["CYAN","WHITE"])
    pausar()

# ══════════════════════════════════════════════════════════════════
#  MENÚ PRINCIPAL
# ══════════════════════════════════════════════════════════════════

def menu_principal():
    while True:
        banner(); estado_sesion()
        print(col("  ─── DATOS ──────────────────────────────────────────","GRAY"))
        print(col("  [1]","YELLOW"), "Gestión de Datos     ",
              col("(carga CSV, caché, ETL, exportar)","GRAY"))
        print(col("  [2]","YELLOW"), "Configuración KNN    ",
              col("(K, métrica, normalización, target)","GRAY"))
        print()
        print(col("  ─── ANÁLISIS ────────────────────────────────────────","GRAY"))
        print(col("  [3]","YELLOW"), "KNN entre Estaciones ",
              col("(similitud, cruzado, features)","GRAY"))
        print(col("  [4]","YELLOW"), "Influencia Climática ",
              col("(viento, estacionalidad, eventos)","GRAY"))
        print(col("  [5]","YELLOW"), "Alertas de Riesgo    ",
              col("(hospitales, tráfico, predicción)","GRAY"))
        print()
        print(col("  ─── IA ──────────────────────────────────────────────","GRAY"))
        print(col("  [6]","YELLOW"), "Hipótesis de Valor   ",
              col("(Claude API · predicción · alerta · comparación)","GRAY"))
        print(col("  [7]","YELLOW"), "Benchmark Métricas   ",
              col("(velocidad, complejidad, hardware)","GRAY"))
        print()
        print(col("  [0]","RED"),    "Salir")
        linea()
        op = input(col("  Opción: ", "BOLD","WHITE")).strip()
        if   op == "1": menu_datos()
        elif op == "2": menu_config()
        elif op == "3": menu_knn()
        elif op == "4": menu_clima()
        elif op == "5": menu_alertas()
        elif op == "6": menu_hipotesis()
        elif op == "7": menu_benchmark()
        elif op == "0":
            print(); print(col("  ¡Hasta luego!","CYAN","BOLD"))
            print(col("  Universidad La Salle Arequipa — Ciencia de Datos","GRAY"))
            print(); break
        else: warn("Elige entre 0 y 7.")

# ══════════════════════════════════════════════════════════════════
#  ARRANQUE
# ══════════════════════════════════════════════════════════════════

def arrancar():
    try:
        print()
        print(col(f"  Beijing Air Quality KNN v{VERSION} — iniciando...","CYAN"))

        # 1. Intentar restaurar estado pkl
        if Path("sesion_aq.pkl").exists():
            print(col("  Estado previo encontrado (sesion_aq.pkl)","GRAY"))
            r = input(col("  ¿Restaurar? [S/n]: ","YELLOW")).strip().lower()
            if r in ("","s","si","sí","y","yes"):
                if cargar_estado("sesion_aq.pkl"):
                    print(col(f"  ✓ Sesión restaurada.","GREEN"))
                    time.sleep(0.3)
                    menu_principal()
                    return

        # 2. Intentar cargar caché automáticamente
        caches = listar_caches()
        if caches:
            hist_c = [c for c in caches if c.get("period") == "2013-2017"]
            curr_c = [c for c in caches if c.get("period") == "2022-2026"]
            if hist_c:
                print(col(f"  Caché histórico encontrado ({hist_c[0]['rows']:,} filas)","GRAY"))
                r = input(col("  ¿Cargar automáticamente? [S/n]: ","YELLOW")).strip().lower()
                if r in ("","s","si","sí","y","yes"):
                    df = cargar_cache(hist_c[0]["path"], "2013-2017")
                    if df is not None:
                        set_historico(df, hist_c[0]["path"])
            if curr_c:
                df = cargar_cache(curr_c[0]["path"], "2022-2026")
                if df is not None:
                    set_actual(df, curr_c[0]["path"])

        time.sleep(0.3)
        menu_principal()

    except KeyboardInterrupt:
        print()
        print(col("\n  Sesión terminada (Ctrl+C).","YELLOW"))
        sys.exit(0)


if __name__ == "__main__":
    arrancar()