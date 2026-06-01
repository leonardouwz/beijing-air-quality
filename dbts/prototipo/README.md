# Diabetes · Mapa de Riesgo (Prototipo de Visual Analytics)

Prototipo interactivo para explorar el **espacio latente de salud** del dataset
BRFSS-2015 (indicadores de diabetes), con *linking & brushing* entre el mapa PCA,
las distribuciones de IMC y edad, y un panel de **prevalencia de diabetes**.

> El diseño es deliberadamente distinto de los otros prototipos del repo
> (tema claro/clínico, barra lateral vertical, scatter en SVG, módulos reordenados).

---

## Cómo abrirlo
Doble clic en `index.html` (D3 vendorizado + datos como `<script>`, funciona offline),
o con servidor: `python -m http.server 8125` y abrir `http://127.0.0.1:8125/index.html`.

---

## Datos (la limpieza y el PCA ya estaban hechos)

El notebook `../correccion.ipynb` ya realizó **todo el preprocesamiento**:
- Eliminación de duplicados (253 680 → 229 474), imputación (sin nulos), conversión a enteros.
- Traducción de variables al español.
- **Vector de características**: 8 variables seleccionadas por correlación con diabetes,
  estandarizadas (StandardScaler).
- **PCA en Python** → coordenadas `x, y` (47.3 % de varianza explicada), exportando una
  muestra de 2 000 registros a `datos_dashboard (3).json`.

`build_data.py` consume ese JSON y lo serializa a `data/db_data.js` (formato columnar
que el navegador carga directo). Como el PCA ya viene calculado, el prototipo lo
**consume** (no lo recalcula).

```bash
cd dbts/prototipo
python build_data.py            # usa el JSON automáticamente
```
Fallback: si no encuentra el JSON, reproduce su pipeline desde el CSV crudo
(dedup → traducción → 8 variables → StandardScaler → PCA 2D) y muestrea.

### Verificación de la limpieza
La limpieza de la compañera es correcta. Una observación menor: en la celda de
conversión a entero, el guard `col != 'IMC'` se aplica **antes** de renombrar las
columnas (cuando aún se llama `BMI`), por lo que el IMC sí se convierte a entero y
pierde decimales. En BRFSS el IMC es casi siempre entero, así que el impacto es
despreciable, pero conviene saberlo. `build_data.py` no depende de eso.

---

## Los 4 módulos (orden propio)

| | Módulo | Contenido |
|---|---|---|
| **1** | Espacio latente (PCA) | Scatter `x×y` (SVG, 2 000 puntos). Color por **diabetes / IMC / salud general / edad**. Brushing + tooltip por punto. |
| **2** | IMC | Histograma. Gris = población, violeta = selección. |
| **3** | Edad (rangos) | Histograma por categorías de edad (18-24 … 80+). |
| **4** | Riesgo de diabetes | KPI de prevalencia en la selección, barra comparativa **selección vs población** y medias (IMC, edad, presión alta, colesterol, enf. cardiaca, dif. caminar). |

La barra lateral izquierda concentra el control de color, la leyenda, los KPIs de
población y el resumen de la selección.

### Hallazgo de ejemplo
Al seleccionar la región derecha del mapa latente, la prevalencia de diabetes sube
de **15.9 % a ~46 %**, con IMC medio ~32 (obesidad), mayor edad y comorbilidades
altas (presión 82 %, colesterol 74 %) — el PCA separa con claridad el perfil de riesgo.

---

## Estructura
```
dbts/prototipo/
├── index.html          # App D3 (tema claro, sidebar, SVG) — autocontenida
├── build_data.py       # JSON del dashboard -> data/db_data.js (fallback: CSV)
├── data/db_data.js     # Datos serializados (generado)
├── vendor/d3.v7.min.js # D3 v7 vendorizado (offline)
└── README.md
```
