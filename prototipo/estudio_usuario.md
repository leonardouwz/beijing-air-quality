# Validación cualitativa — Estudio con usuario (Req. 5)

Kit operativo para la prueba con un usuario objetivo. El **protocolo** (objetivo,
perfil, montaje, tareas, métricas) está en el [README](README.md#validación-cualitativa--guion-de-prueba-con-usuario);
este documento añade el **pilotaje de experto** (ejemplo resuelto) y las **hojas
en blanco** para registrar la sesión real.

> Estado: herramienta y guion listos. **Falta ejecutar la sesión con un
> participante real** (analista de salud pública / calidad del aire). El
> pilotaje de abajo es un *cognitive walkthrough* del autor, no sustituye la
> prueba con el usuario objetivo.

---

## Pilotaje de experto (ejemplo resuelto)

Recorrido de las 3 tareas con la herramienta, con las cifras reales del dataset
tratado (33 060 registros, 2013–2026). Sirve de patrón esperado contra el que
comparar lo que descubra el usuario.

### T1 · Disparidad zonal — `TAREAS → 1 · Disparidad zonal`
Preset: color = zona, B = PM2.5, C = SO₂.

| Zona | PM2.5 medio (µg/m³) | % días críticos (>150) |
|------|--------------------:|-----------------------:|
| **Norte** | **71.3** | **8.7 %** |
| Centro | 83.6 | 12.3 % |
| Oeste | 83.6 | 12.0 % |
| **Sur** | **83.1** | **12.1 %** |

**Patrón a descubrir:** el **Norte es la zona más limpia** (−15 % de PM2.5 y casi
la mitad de días críticos frente al resto). Norte vs Sur: 71.3 vs 83.1 µg/m³ y
8.7 % vs 12.1 % de días críticos → **disparidad zonal confirmada**.

### T2 · Meteorología — `TAREAS → 2 · Meteorología`
Preset: color = estación, B = DEWP, C = WSPM.

| Relación con PM2.5 | Pearson (ciudad) |
|---|---:|
| **Viento (WSPM)** | **−0.431** |
| DEWP (punto de rocío) | +0.022 |

**Patrón a descubrir:** el **viento es el moderador meteorológico dominante** —
a más viento, menos PM2.5 (dispersión). La correlación **lineal** de DEWP es
casi nula: su efecto es **no lineal y condicionado por el viento** (ver pestaña
COORD. PARALELAS y el eje meteorológico del PCA). Insight clave: los picos de
PM2.5 coinciden con **viento débil**.

### T3 · Persistencia — `TAREAS → 3 · Persistencia`
Preset: color = AQI, B = PM2.5, C = O₃. Seleccionar un episodio crítico y mirar
la serie D.

De los **3 647 episodios críticos** (PM2.5 > 150):

| Estación | % de episodios críticos |
|----------|------------------------:|
| **Invierno** | **51.9 %** |
| Otoño | 28.4 % |
| Primavera | 14.5 % |
| Verano | 5.2 % |

**Patrón a descubrir:** ~**80 % de los episodios críticos ocurren en otoño-
invierno** y se agrupan año tras año en la serie D → **persistencia / inercia
del smog** en los meses fríos (coherente con la alta autocorrelación de Markov).

---

## Hoja de registro (rellenar en la sesión real)

Una fila por participante × tarea. Éxito: **S** = solo / **P** = con pista /
**N** = no logrado.

| Participante | Tarea | Éxito (S/P/N) | t hasta insight | Nº pistas | Cita (think-aloud) | Fricción observada |
|---|---|---|---|---|---|---|
|  | T1 |  |  |  |  |  |
|  | T2 |  |  |  |  |  |
|  | T3 |  |  |  |  |  |

**Criterio global:** éxito en ≥ 2/3 tareas sin pistas ⇒ la herramienta comunica
los patrones. Cada fricción se anota como *issue* de rediseño.

---

## Cuestionario SUS (0 = muy en desacuerdo … 4 = muy de acuerdo)

1. Usaría esta herramienta con frecuencia. ▢
2. La encontré innecesariamente compleja. ▢
3. Fue fácil de usar. ▢
4. Necesitaría apoyo técnico para usarla. ▢
5. Las funciones están bien integradas. ▢
6. Hay demasiada inconsistencia. ▢
7. La mayoría la aprendería muy rápido. ▢
8. Es muy engorrosa de usar. ▢
9. Me sentí seguro usándola. ▢
10. Tuve que aprender mucho antes de arrancar. ▢

*Puntuación SUS: impares → (resp − 1); pares → (5 − resp); suma × 2.5 (0–100).*

**Preguntas abiertas:** ¿qué te sobró/faltó? · ¿confiarías en estos clústeres
para priorizar zonas/temporadas? · ¿el clic-KNN fue descubrible?

---

## Informe (rellenar tras la sesión)

- **Participantes:** _n_, perfil.
- **Resultados:** tasa de éxito por tarea, tiempos, nº de pistas.
- **SUS medio:** __/100.
- **Descubrimientos espontáneos vs esperados** (T1 disparidad / T2 viento /
  T3 persistencia): ¿coinciden con el pilotaje?
- **Issues de usabilidad priorizados** (fricciones → rediseño).
- **Conclusión:** ¿permite la herramienta redescubrir los patrones de forma
  autónoma?
