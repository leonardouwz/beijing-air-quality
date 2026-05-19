# Beijing Air Quality

Análisis de calidad del aire en Beijing usando KNN para encontrar similitudes entre estaciones de monitoreo. Compara dos períodos: datos terrestres históricos (2013-2017) y datos satelitales recientes (2022-2026).

## Estructura del repositorio

```
beijing-air-quality/
├── datasets/
│   ├── 2013-2017/PRSA_Data_20130301-20170228/   # 12 CSVs UCI PRSA (horario)
│   └── 2022-2026/                                # CSV Open-Meteo (diario)
├── knn-dashboard/    # Panel web React/Vite
├── python-analysis/  # CLI Python
└── notebook/         # Análisis exploratorio Jupyter/Colab
```

---

## knn-dashboard — Panel web interactivo

Panel React con KNN en el navegador, gráficas SVG y generación de hipótesis vía Claude API.

**Requisitos:** Node.js 18+

```bash
cd knn-dashboard
npm install
npm run dev       # http://localhost:3000
npm run build     # build de producción
```

**Tabs disponibles:**
- 🔍 KNN Estaciones — similitud entre las 12 estaciones, métricas configurables (coseno / Pearson / euclidiana), radar multicontaminante
- 📅 Patrones Temporales — PM2.5 mensual por estación + KNN cruzado entre períodos
- 💡 Hipótesis IA — genera hipótesis científicas accionables usando Claude API
- 📊 Comparativa — 2013-2017 vs 2022-2026 por estación

---

## python-analysis — CLI interactivo

Sistema de consola con menús, caché Parquet y generación de hipótesis vía `ANTHROPIC_API_KEY`.

**Requisitos:** Python 3.10+ · `pip install numpy pandas requests pyarrow`

```bash
cd python-analysis
python interface.py       # menú interactivo completo
python auto_explore.py    # exploración automática → exploration_output.txt
```

**Módulos:**

| Archivo | Rol |
|---|---|
| `core.py` | Algoritmos puros: métricas KNN, detección de eventos críticos, hipótesis vía API |
| `data_manager.py` | Carga de CSVs, ETL, caché Parquet (`.aq_cache/`), estado de sesión |
| `interface.py` | UI de consola: menús, tablas, spinners |
| `auto_explore.py` | Script de exploración automática |

---

## notebook — Análisis exploratorio

`notebook/beijing_air_quality_analisis.ipynb` corre en **Google Colab**. Antes de ejecutarlo, sube la carpeta `datasets/` a Google Drive en `MyDrive/datasets/`.

Genera 7 gráficas: boxplots por estación, series temporales, heatmap hora × mes, violinplots estacionales, matriz de correlación, similitud KNN y comparativa de períodos.

---

## Datasets

| Dataset | Fuente | Cobertura | Columnas clave |
|---|---|---|---|
| `2013-2017/` | UCI PRSA (12 estaciones terrestres) | Mar 2013 – Feb 2017, horario | `PM2.5`, `PM10`, `SO2`, `NO2`, `CO`, `O3`, `TEMP`, `PRES`, `DEWP`, `WSPM` |
| `2022-2026/` | Open-Meteo vía Kaggle (ciudad completa) | Ago 2022 – Feb 2026, diario | `pm2_5`, `pm10`, `ozone`, `nitrogen_dioxide`, `sulphur_dioxide`, `carbon_monoxide` |
