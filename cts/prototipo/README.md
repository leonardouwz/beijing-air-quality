# Contrataciones — Espacio de Riesgo (Prototipo de Visual Analytics)

Prototipo interactivo de **una sola pantalla** para explorar las adjudicaciones de
contrataciones públicas del Perú (estándar OCDS / SEACE, 2025), enlazando la
reducción de dimensionalidad (PCA) con las distribuciones de monto y sobrecosto y
la línea temporal. Sigue el mismo patrón que el prototipo de calidad del aire
(`../../prototipo/`): **PCA + 4 cuadrantes + linking & brushing**.

---

## Cómo abrirlo

**Doble clic** en `index.html` (funciona offline: D3 vendorizado en `vendor/`, datos
como `<script src="data/cp_data.js">`), o con servidor local:
```bash
cd contrataciones/prototipo
python -m http.server 8124       # http://127.0.0.1:8124/index.html
```

> El `data/cp_data.js` incluido se generó con **datos de demostración sintéticos**
> (mismo esquema que el real) para que se pueda ver el prototipo funcionando de
> inmediato. Para usar los datos reales, ver abajo.

---

## Generar los datos (pipeline)

`build_data.py` **autodetecta** cuál de las dos salidas del notebook está presente:

| Parquet de entrada | Cols | Modo del prototipo |
|---|---|---|
| `adjudicaciones_procesadas.parquet` | 38 | **Completo**: cuadrante D = serie temporal; tooltip con proveedor, departamento y fecha. |
| `matriz_modelo.parquet` | 20 | **Reducido**: NO trae fecha/proveedor/departamento/alertas. El cuadrante D pasa a ser **histograma de nº de postores**; el riesgo se **recalcula** desde `porc_adjudicado`, `num_licitantes_final` y `dias_plazo`. |

> El dataset actualmente cargado (`data/cp_data.js`) se generó desde
> **`matriz_modelo.parquet`** (64 170 adjudicaciones). Para obtener la serie
> temporal y el proveedor/departamento en el tooltip, regenera con
> `adjudicaciones_procesadas.parquet`.

### Ejecutar
```bash
python build_data.py                       # busca el parquet automáticamente
python build_data.py "C:/ruta/al.parquet"  # o indícalo explícitamente
```

### Demo SIN datos reales
```bash
python make_sample_data.py     # crea un adjudicaciones_procesadas.parquet sintético
python build_data.py
```

---

## Pasos de limpieza que **completa** `build_data.py`

El notebook dejó el vector (`matriz_modelo.parquet`) con problemas que impedían el
PCA. Este script los resuelve sobre `adjudicaciones_procesadas.parquet`:

| Problema en la salida del notebook | Solución aquí |
|---|---|
| Columna cruda sin renombrar `…:Nombre de Moneda` | Se elimina |
| `proveedor_fuera_region` y `alerta_proveedor_lejano` **100% NaN** | Se descartan |
| `monto_adjudicado_pen` NaN (adjudicaciones no-PEN) | Se filtran esas filas |
| `fecha_adjudicacion` NaT | Se filtran (no situables en el tiempo) |
| `monto_contrato`, `duracion_contrato_dias` NaN | Imputado a 0 (contrato no firmado) |
| `num_contratos_previos`, montos acumulados NaN | Imputado a 0 (primer contrato del proveedor) |
| `dias_plazo`, `porc_adjudicado` NaN | Imputado a la mediana |
| `porc_adjudicado` con errores de 10 000 % | Recortado a [0, 300] (se conserva >120% como sobrecosto) |
| Montos sin transformar (1 … 4.8e10) | `log1p` antes de escalar |
| Vector **sin normalizar** | **Min-Max 0-1** de las 12 features |

Además calcula el **score de riesgo** = nº de alertas (`sobrecosto` + `plazo corto`
+ `sin competencia`), de 0 a 3.

### Las 12 features del PCA
`monto_adjudicado_pen`, `monto_referencial_pen`, `monto_contrato`,
`monto_promedio_previo` (log), `num_licitantes_final`, `num_contratos_previos` (log),
`dias_plazo`, `duracion_contrato_dias`, `porc_adjudicado`, `es_consorcio`,
`tiene_contrato`, `metodo_desconocido`.

---

## La interfaz (4 cuadrantes enlazados)

| | Cuadrante | Contenido |
|---|---|---|
| **A** | Espacio Latente | Scatter PCA (PC1×PC2) de cada adjudicación. Color por **Método** / **Riesgo** / **Categoría**. Canvas + **brushing**. Cargas de cada componente. |
| **B** | Monto adjudicado | Histograma en **escala log** (PEN). Gris = total, rojo = selección. |
| **C** | % adjudicado / referencial | Indicador de sobrecosto con línea de referencia en **120%**. |
| **D** | Línea temporal | Monto (eje log) vs fecha de adjudicación (2025). Gris = todo, rojo = selección. |

### Interactividad
- **Brushing en A → linking** de B, C y D en tiempo real.
- **Tooltip**: proveedor, comprador (departamento), método, categoría, monto,
  % del referencial, nº de postores, días de plazo, fecha y **alertas** activas.
- **Colorear por**: Método (open/selective/direct) · Riesgo (0-3 alertas) · Categoría.
- **Panel de selección**: nº, monto total, % con sobrecosto, % sin competencia,
  método dominante.

### PCA en el cliente
Covarianza 12×12 → autovectores por **Jacobi** → proyección a PC1/PC2, todo en el
navegador. El scatter y la serie usan **canvas con capa base offscreen** para que el
brushing sea fluido aunque haya decenas de miles de adjudicaciones.

---

## Estructura
```
contrataciones/prototipo/
├── index.html                       # App D3 (PCA + 4 cuadrantes) — autocontenida
├── build_data.py                    # Limpieza final + PCA-ready -> data/cp_data.js
├── make_sample_data.py              # Genera un parquet sintético para demo/test
├── adjudicaciones_procesadas.parquet# (demo sintético; reemplazar por el real)
├── data/cp_data.js                  # Datos serializados (generado)
├── vendor/d3.v7.min.js              # D3 v7 vendorizado (offline)
└── README.md
```

---

## Extensión futura: el grafo
El notebook también produce `nodos_grafo.parquet` y `aristas_grafo.parquet`
(red comprador → proveedor). Una segunda vista de red (NetworkX/D3 force) permitiría
detectar **proveedores recurrentes, concentración y posibles carteles** — complemento
natural a este explorador de espacio latente.
