# Resumen técnico: Vector de Características y Prototipo de Visual Analytics

> Documento de cierre que describe **qué se construyó**, **cómo**, **qué implica**
> cada decisión y **qué se puede analizar** sobre los artefactos resultantes.
> Beijing Air Quality (2013–2026).

---

## 0. Mapa de artefactos

| Artefacto | Qué es | Generado por |
|---|---|---|
| `notebook/beijing_air_quality_vector_caracteristicas.ipynb` | Construye **dos** vectores (`vc_historico` horario y `vc_unificado` diario) | Notebook (Colab/local) |
| `datasets/vc_historico.csv` (~170 MB) | Vector horario 2013-2017, ~420 K filas | Notebook |
| `datasets/vc_unificado.csv` (~7.9 MB) | Vector diario 2013-2026, ~33 K filas | Notebook |
| `prototipo/build_data.py` | **Motor de datos del prototipo** (reconstruye el vector unificado, corrigiendo limitaciones) | Script Python |
| `prototipo/data/aq_data.js` (~2.9 MB) | Vector unificado diario, 10 atributos + metadatos, listo para el navegador | `build_data.py` |
| `prototipo/index.html` | Prototipo D3 de 4 cuadrantes con PCA en cliente | — |

Hay, por tanto, **dos linajes** del vector de características: el del **notebook**
(entregable académico, dos granularidades) y el del **prototipo** (optimizado para
visualización y con el set completo de 10 variables). Conviene entenderlos juntos.

---

## 1. El Vector de Características

### 1.1 Punto de partida: dos datasets heterogéneos

| | 2013-2017 (UCI PRSA) | 2022-2026 (Open-Meteo) |
|---|---|---|
| Granularidad | **Horaria** | **Diaria** |
| Cobertura espacial | **12 estaciones** | **1 punto** (Beijing ciudad) |
| Registros | 420 768 | 1 294 |
| Variables ambientales | PM2.5, PM10, SO2, NO2, CO, O3, **TEMP, PRES, DEWP, WSPM, wd** | PM2.5, PM10, SO2, NO2, CO, O3 (**sin meteorología**) |

Las tres asimetrías —granularidad, número de estaciones y variables disponibles—
son el problema central que el preprocesamiento tiene que resolver.

### 1.2 Pipeline ETL + calidad de datos (común a ambos linajes)

1. **Limpieza de ruido físico.** Concentraciones negativas (imposibles) → `NaN`.
2. **Imputación sin eliminar filas.** Interpolación **lineal temporal** por
   estación, con relleno final por mediana. Regla clave: *no se borran registros*;
   se completa el ~5 % de huecos. → preserva la continuidad de las series.
3. **Sincronización de granularidad.** El histórico horario se **agrega a
   promedios diarios** por estación (los 420 K valores se usan todos para los
   promedios, no se descartan).
4. **Estaciones virtuales.** El dato único de Beijing del periodo actual se
   **redistribuye en las 12 estaciones** aplicando **ratios históricos de PM2.5**
   (cada estación recibe `valor_global × ratio_estación`).
5. **Tratamiento de outliers (IQR).** Recorte por rango intercuartílico,
   **conservando obligatoriamente PM2.5 > 150 µg/m³** (eventos reales de smog;
   3 647 registros en el vector del prototipo). Es una decisión de dominio: esos
   "outliers" son justamente el fenómeno a estudiar.
6. **Ingeniería de características.**
   - Codificación de categóricas: `wd` (dirección de viento) y `station` → enteros.
   - **Lags** y **medias móviles** de PM2.5 para capturar la **autocorrelación /
     persistencia** del smog (1 h/24 h y MA 24 h/168 h en el horario; 1 d/7 d y
     MA 7 d/30 d en el diario).
7. **Normalización Min-Max (0–1)** sobre todas las numéricas. Indispensable para
   que variables de gran escala (p. ej. presión ~1000 hPa) no aplasten a las
   pequeñas (WSPM ~2 m/s) en cálculos de **distancia** (KNN) y **varianza** (PCA).

**Salida:** un DataFrame puramente numérico, sin nulos, normalizado — el
"objeto de estudio" listo para reducción de dimensionalidad o modelado.

### 1.3 Los dos vectores del notebook

- **`vc_historico`** (horario, 2013-2017, ~420 K filas): máxima resolución
  temporal. Conserva las 10 variables ambientales + encodings + lags/MAs.
  Ideal para KNN intradiario y PCA con detalle fino.
- **`vc_unificado`** (diario, 2013-2026, ~33 K filas): comparable entre periodos.

> **Limitación detectada en `vc_unificado.csv`:** como Open-Meteo no trae
> meteorología y el mapeo de nombres de columnas no coincidía
> (`sulphur_dioxide`≠`so2`, etc.), la intersección de columnas comunes dejó solo
> **PM2.5, PM10 y O3** como variables ambientales reales en el archivo del
> notebook. SO2/NO2/CO/TEMP/PRES/DEWP/WSPM quedaron fuera del vector unificado.

### 1.4 El vector del prototipo (`build_data.py`) — versión corregida y completa

Para que el prototipo pudiera ejecutar PCA sobre **los 10 atributos** y mostrar
DEWP/TEMP/WSPM/wd, `build_data.py` reconstruye el vector unificado **resolviendo
esas limitaciones**:

- **Corrige el mapeo de columnas** de Open-Meteo (`sulphur_dioxide`→SO2,
  `nitrogen_dioxide`→NO2, `carbon_monoxide`→CO, `ozone`→O3).
- **Proyecta la meteorología ausente** del periodo 2022-2026 desde la
  **climatología histórica**: para cada estación virtual y mes, imputa
  TEMP/PRES/DEWP/WSPM con la media histórica de esa estación×mes y `wd` con la
  moda. Así el periodo actual queda situado en el **mismo espacio de 10
  dimensiones** que el histórico.
- Aplica el mismo tratamiento (imputación, IQR con protección de smog, Min-Max).
- **Guarda los rangos Min-Max** en los metadatos, de modo que el navegador
  **reconstruye los valores originales** sin almacenarlos dos veces:
  `original = mín + norm·(máx − mín)`.

**Resultado:** 33 060 registros diarios, 12 estaciones, 2 periodos, 10 features
normalizadas, **0 nulos**, smog preservado.

| Feature (orden PCA) | PM2.5 · PM10 · SO2 · NO2 · CO · O3 · TEMP · PRES · DEW · WSPM |
|---|---|

---

## 2. El Prototipo (Beijing Air Latent Space)

Aplicación D3.js de **una sola pantalla** que enlaza el espacio latente con las
distribuciones univariadas y la evolución temporal.

### 2.1 PCA en el cliente
Sobre las 10 features normalizadas, **en el navegador**: centrado → matriz de
covarianza 10×10 → autovectores por el **método de Jacobi** → proyección a
PC1/PC2. Las dos primeras componentes explican **≈ 71.9 %** de la varianza.
Las **cargas (loadings)** de cada componente se muestran para interpretar qué
variables "tiran" de cada eje.

### 2.2 Los 4 cuadrantes y su enlace (linking & brushing)
- **A — Espacio Latente:** scatter PC1×PC2, un punto por registro diario,
  coloreado por estación del año (alternable a periodo/zona). Renderizado en
  **canvas** para mover 33 K puntos con fluidez. Herramienta de **brushing**.
- **B — PM2.5** y **C — DEWP:** histogramas. Gris = ciudad completa; **rojo =
  distribución de la selección** superpuesta (en frecuencia relativa, para
  comparar formas independientemente del tamaño de la muestra).
- **D — Serie temporal:** PM2.5 de 2013→2026. Gris = todo, rojo = selección, con
  línea de referencia de smog (150 µg/m³).
- **Tooltip de inspección:** al señalar un punto muestra sus **valores originales**
  (estación, fecha, PM2.5, DEWP, TEMP, WSPM, PRES, wd).

Al hacer brushing en A, B/C/D se actualizan en tiempo real: el usuario **descubre
visualmente por qué** ciertos puntos se agrupan.

### 2.3 Hallazgo de validación
El clúster de PC1 alto (~7 500 puntos) → PM2.5 medio ≈ 148 µg/m³, DEWP ≈ −7 °C,
dominado por **Invierno**, y en el cuadrante D se repite cada invierno año tras
año. Es el **"Modo Crisis"** de smog invernal: aire frío y seco + inversión
térmica + persistencia temporal.

---

## 3. Implicaciones de las decisiones de diseño

| Decisión | Implicación positiva | Riesgo / a tener en cuenta |
|---|---|---|
| **No eliminar filas (imputar)** | Series continuas, sin sesgo por borrado | Valores interpolados no son medidas reales |
| **Conservar PM2.5 > 150** | El fenómeno de interés (smog) sobrevive al IQR | Las distribuciones quedan con cola pesada a la derecha (correcto, pero a recordar) |
| **Min-Max 0–1** | KNN/PCA no dominados por la escala | Sensible a outliers en los extremos (mitigado por IQR) |
| **Estaciones virtuales por ratios** | Da estructura espacial al periodo actual | Las 12 estaciones actuales son **proporcionales**, no independientes (comparten la dinámica temporal de Beijing) |
| **Proyección climatológica de meteo (actual)** | Permite PCA de 10D y DEWP en ambos periodos | **TEMP/PRES/DEWP/WSPM/wd de 2022-2026 son sintéticos**: no usar para concluir tendencias meteorológicas recientes |
| **Hueco 2017–2022** | Refleja honestamente la falta de datos | La serie temporal no es continua entre periodos |
| **PCA 71.9 % en 2D** | Buena compresión visual | El ~28 % restante (estructura fina) no se ve en el plano |

**Conclusión transversal:** el vector es excelente para **estructura y
relaciones** (similitud, regímenes, correlaciones, persistencia). Para
afirmaciones cuantitativas finas sobre la **meteorología 2022-2026** conviene
recurrir al periodo histórico (medido) o a una fuente meteorológica real.

---

## 4. Qué se puede hacer y analizar sobre estos artefactos

### 4.1 Directamente en el prototipo (sin código)
- **Identificar regímenes** ("modos") de calidad del aire por la forma de las
  nubes en el espacio latente.
- **Atribuir causas** vía brushing: seleccionar un clúster y leer en B/C qué
  distribución de PM2.5/DEWP lo caracteriza, y en D **cuándo** ocurre.
- **Detectar persistencia / episodios** (lectura cualitativa de cadenas de
  Markov): ¿la selección se concentra en rachas temporales?
- **Comparar periodos y zonas** recoloreando los puntos.
- **Inspeccionar casos individuales** (tooltip) para auditar registros concretos.

### 4.2 Análisis cuantitativos que el vector habilita
1. **KNN de similitud entre estaciones** y **KNN cruzado entre periodos**
   (¿una zona hoy se comporta como otra más limpia del pasado? → validación de
   políticas). Ya implementado en `knn-dashboard/` y `python-analysis/`.
2. **Clustering no supervisado** (K-Means, **DBSCAN**, jerárquico) para extraer
   automáticamente los regímenes que en el prototipo se ven a ojo.
3. **Cadenas de Markov** sobre estados de AQI (p. ej. Bueno→Moderado→Crisis):
   matrices de transición y **probabilidad de persistencia** del smog. Los lags
   y MAs del vector apoyan directamente este análisis.
4. **Correlación / importancia de variables:** confirmar **DEWP como predictor
   raíz** de PM2.5 (heatmaps ya generados) y cuantificar el **efecto dispersor
   del viento** (correlación negativa WSPM↔PM2.5).
5. **Modelado predictivo de PM2.5:** desde regresión hasta **Random Forest /
   Gradient Boosting**, usando meteo + lags. El vector ya está normalizado y sin
   nulos: entra "tal cual".
6. **Detección de eventos / anomalías** (umbral 150, o métodos estadísticos)
   y caracterización de los peores episodios (p. ej. picos de diciembre 2015).
7. **Análisis estacional y comparativo de políticas:** cuantificar la mejora de
   primaveras vs. el estancamiento/empeoramiento de inviernos entre 2013-17 y
   2022-26.
8. **Análisis espacial por zona** (Norte/Centro/Oeste/Sur): gradientes de
   contaminación y acumulación en el sur.
9. **Generación de hipótesis con IA:** alimentar el resumen del clúster a la
   integración con la **API de Claude** (`core.py` / pestaña "Hipótesis IA" del
   dashboard) para proponer explicaciones y acciones.

### 4.3 Extensiones recomendadas
- Sustituir la meteo proyectada del periodo actual por **datos meteorológicos
  reales 2022-2026** (Open-Meteo *weather* API) → el espacio latente del periodo
  actual pasaría a ser plenamente medido.
- Añadir **t-SNE/UMAP** como alternativa no lineal al PCA para comparar la
  estructura de clústeres.
- Exponer en el prototipo un selector de **métrica de distancia** y un panel de
  **KNN del punto seleccionado** (reaprovechando la lógica del dashboard).
- Persistir las selecciones como "casos de estudio" exportables.

---

## 5. Resumen en una frase
Se construyó un **vector de características unificado, limpio, normalizado y sin
nulos** (33 K registros diarios × 10 atributos ambientales + ingeniería temporal)
que fusiona honestamente dos fuentes heterogéneas, y un **prototipo de Visual
Analytics** que lo vuelve explorable: el espacio latente (PCA) enlazado en vivo
con las distribuciones de PM2.5 y DEWP y con la línea de tiempo, permitiendo
**descubrir, explicar y fechar** los regímenes de contaminación de Beijing —
empezando por el smog invernal persistente.
