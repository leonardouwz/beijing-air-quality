# Beijing Air Latent Space — Prototipo de Visual Analytics

Prototipo interactivo de **una sola pantalla** (sin pestañas) para explorar el
espacio latente de la calidad del aire en Beijing (2013–2026), enlazando la
reducción de dimensionalidad (PCA) con las distribuciones univariadas y la
evolución temporal.

Cumple el enunciado de `../prototipo_visual_interactivo.md`.

---

## Cómo abrirlo

**Opción A — doble clic (sin servidor):**
abre `index.html` directamente en el navegador. Los datos se cargan vía
`<script src="data/aq_data.js">` y D3 está vendorizado en `vendor/`, así que
funciona offline por `file://`.

**Opción B — servidor local (recomendado para desarrollo):**
```bash
cd prototipo
python -m http.server 8123
# abrir http://127.0.0.1:8123/index.html
```

---

## Regenerar los datos

El motor de datos lee los datasets **crudos** y produce el vector de
características que consume el navegador:

```bash
cd prototipo
python build_data.py        # -> data/aq_data.js  +  data/aq_data_raw.js
```

Genera **dos** vectores que el combo box "Dataset" del prototipo intercambia:

| Archivo | Global JS | Contenido |
|---|---|---|
| `data/aq_data.js` | `window.AQ_DATA` | **Tratado** — 2013-2026, 33 060 reg.: imputado, IQR (smog>150 conservado), meteo del periodo actual proyectada, Min-Max. |
| `data/aq_data_raw.js` | `window.AQ_DATA_RAW` | **Crudo (sin tratamiento)** — solo UCI 2013-2017 medido, **383 589 registros HORARIOS originales** (de 420 768; se descartan las horas con algún NaN porque el PCA necesita vector completo de 10D). **Sin** agregar, **sin** limpiar negativos, **sin** imputar, **sin** recortar outliers (PM2.5 llega a ~844) y **sin** proyectar. El periodo 2022-2026 se omite porque sin proyección carece de meteorología medida. Archivo ~34 MB. |

> En ambos se aplica Min-Max (paso matemático para PCA/KNN, no limpieza). Al
> alternar a "Crudo" se aprecia el efecto del preprocesamiento: la cola de
> outliers de PM2.5 que el IQR comprimió y un espacio latente más estirado.

### Qué hace `build_data.py`
1. **ETL histórico (UCI PRSA 2013-2017):** carga los 12 CSV horarios, limpia
   ruido físico (negativos → NaN), interpola y agrega a **promedios diarios**
   por estación.
2. **ETL actual (Open-Meteo 2022-2026):** carga `air_quality_historical.csv`
   (diario). Corrige el mapeo real de columnas
   (`sulphur_dioxide`→SO2, `nitrogen_dioxide`→NO2, `carbon_monoxide`→CO, …).
3. **Estaciones virtuales:** redistribuye el dato único de Beijing en las 12
   estaciones aplicando **ratios históricos** por contaminante.
4. **Proyección meteorológica:** el dataset actual **no trae** TEMP/PRES/DEWP/
   WSPM/wd, así que se **proyectan desde la climatología histórica**
   (media por estación × mes; moda para la dirección de viento). Esto permite
   situar el periodo actual en el mismo espacio latente de 10 dimensiones.
5. **Calidad de datos:** imputación lineal temporal (sin eliminar registros) +
   recorte de outliers por **IQR**, conservando obligatoriamente PM2.5 > 150
   µg/m³ (eventos reales de smog — 3 647 registros).
6. **Vector de características:** las 10 variables ambientales se normalizan con
   **Min-Max (0–1)**. Categóricas (`wd`, `station`, `season`, `period`, `zona`)
   codificadas a índices.
7. **Serialización columnar** a `data/aq_data.js` (~2.9 MB, 33 060 registros).

Los rangos Min-Max se guardan en los metadatos; el navegador **reconstruye los
valores originales** (para tooltip e histogramas) invirtiendo la normalización:
`original = min + norm·(max − min)`.

---

## La interfaz (4 cuadrantes enlazados)

| | Cuadrante | Contenido |
|---|---|---|
| **A** | Espacio Latente | Scatter PCA (PC1 vs PC2) de los 10 atributos, coloreado por estación del año. Canvas de alto rendimiento (33 K puntos). Incluye **brushing** (selección por arrastre) y las cargas de cada componente. |
| **B** | Distribución PM2.5 | Histograma. Gris = ciudad completa; **rojo = selección** superpuesta (frecuencia relativa). |
| **C** | Distribución DEWP | Punto de rocío (predictor raíz). Mismo enlace gris/rojo. |
| **D** | Serie Temporal | PM2.5 de 2013→2026. Gris = todo; rojo = selección, para detectar **persistencia / episodios de Markov**. Línea de referencia de smog (150 µg/m³). |

### Interactividad
- **Dataset (combo box):** alterna entre el vector **Tratado** y el **Crudo
  (sin tratamiento)**; recalcula el PCA y reconstruye los 4 cuadrantes.
- **Brushing en A → linking dinámico** de B, C y D en tiempo real.
- **Tooltip de inspección:** al pasar el cursor sobre un punto se muestran sus
  valores **originales** (estación, fecha, PM2.5, DEWP, TEMP, WSPM, PRES, wd).
- **Colorear por:** estación del año / periodo / zona urbana.
- **Limpiar selección:** restablece los 4 cuadrantes.

### Rendimiento
El scatter (A) y la serie temporal (D) se rinden en **canvas con capa base
offscreen**: todos los puntos se dibujan una sola vez a un canvas fuera de
pantalla y cada actualización de selección hace `drawImage` + dibuja solo los
puntos seleccionados. Así el brushing es O(seleccionados), no O(N), y se mantiene
fluido (~25 ms por actualización) incluso con los 383 K registros horarios del
dataset crudo. Cambiar de dataset recalcula el PCA (~1.5 s en el crudo, una vez).

### PCA en el cliente
La reducción de dimensionalidad se calcula **en el navegador** sobre el vector
cargado: centrado → matriz de covarianza 10×10 → autovectores por el método de
**Jacobi** → proyección a PC1/PC2. PC1+PC2 explican ≈ 71.9 % de la varianza.

---

## Hallazgo de ejemplo
Al seleccionar el clúster de PC1 alto (~7 500 puntos): PM2.5 medio ≈ 148 µg/m³,
DEWP medio ≈ −7 °C, dominado por **Invierno**. En el cuadrante D esos puntos se
concentran en los meses fríos año tras año → el "Modo Crisis" de smog invernal
se vincula con punto de rocío bajo (aire frío y seco, inversión térmica).

---

## Estructura

```
prototipo/
├── index.html          # App completa (HTML + CSS + JS + PCA + D3) — autocontenida
├── build_data.py       # Motor de datos: datasets crudos -> data/*.js (tratado + crudo)
├── data/aq_data.js     # Vector TRATADO serializado (generado)
├── data/aq_data_raw.js # Vector CRUDO sin tratamiento (generado)
├── vendor/d3.v7.min.js # D3 v7 vendorizado (offline)
└── README.md
```

> **Nota sobre los datasets:** el periodo actual (Open-Meteo) solo incluye
> contaminantes, sin meteorología; por eso TEMP/PRES/DEWP/WSPM/wd de 2022-2026
> son **proyecciones climatológicas** (no mediciones directas). El periodo
> 2013-2017 (UCI) sí trae las 10 variables medidas.
