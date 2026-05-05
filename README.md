# Beijing Air Quality - Sistema KNN

Sistema de análisis de calidad del aire de Beijing usando KNN para encontrar similitudes entre estaciones de monitoreo.

## Descripción

Este proyecto implementa un sistema de similitud entre estaciones de calidad del aire usando el algoritmo KNN (K-Nearest Neighbors). Compara perfiles de contaminantes entre las 12 estaciones de monitoreo de Beijing en dos períodos:

- **2013-2017**: Datos históricos UCI (estaciones terrestres)
- **2022-2026**: Datos satelitales (Open-Meteo)

### Características

- Algoritmos KNN con múltiples métricas (coseno, Pearson, euclidiana)
- Comparación de períodos históricos vs actuales
- Análisis de patrones temporales mensuales
- Generación de hipótesis científicas vía IA (Claude API)
- Visualizaciones: radar multicontaminante, barras de similitud

## Estructura de Datos

```
2013-2017/
  PRSA_Data_Aotizhongxin_20130301-20170228.csv
  PRSA_Data_Changping_20130301-20170228.csv
  ... (12 estaciones)

2022-2026/
  air_quality_historical.csv
  city_info.csv
  data_dictionary.csv
  dataset-metadata.json
```

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

## Ejecución

```bash
npm run dev
```

El servidor se iniciado en http://localhost:3000

## Construir para producción

```bash
npm run build
```

## Dependencias

- React 18
- Vite 5
- TypeScript