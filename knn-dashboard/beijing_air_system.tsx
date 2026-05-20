import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  CONSTANTES Y DATOS
// ═══════════════════════════════════════════════════════════
const STATIONS = ["Aotizhongxin","Changping","Dingling","Dongsi","Guanyuan",
  "Gucheng","Huairou","Nongzhanguan","Shunyi","Tiantan","Wanliu","Wanshouxigong"];

const HIST_STATIONS_CSV = {
  "Aotizhongxin":  "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Aotizhongxin_20130301-20170228.csv",
  "Changping":     "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Changping_20130301-20170228.csv",
  "Dingling":      "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Dingling_20130301-20170228.csv",
  "Dongsi":        "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Dongsi_20130301-20170228.csv",
  "Guanyuan":      "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Guanyuan_20130301-20170228.csv",
  "Gucheng":       "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Gucheng_20130301-20170228.csv",
  "Huairou":       "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Huairou_20130301-20170228.csv",
  "Nongzhanguan":  "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Nongzhanguan_20130301-20170228.csv",
  "Shunyi":        "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Shunyi_20130301-20170228.csv",
  "Tiantan":       "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Tiantan_20130301-20170228.csv",
  "Wanliu":        "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Wanliu_20130301-20170228.csv",
  "Wanshouxigong": "/datasets/2013-2017/PRSA_Data_20130301-20170228/PRSA_Data_Wanshouxigong_20130301-20170228.csv",
};
const CURR_CSV = "/datasets/2022-2026/air_quality_historical.csv";

const FEATURES    = ["PM2.5","PM10","SO₂","NO₂","CO","O₃","TEMP","PRES","DEW","WSPM"];
const FEAT_LABELS = ["PM2.5","PM10","SO₂","NO₂","CO","O₃","Temp","Pres","Rocío","Viento"];
const MONTHS      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ── Datos estáticos del análisis (informe técnico + python) ──
const STATION_META = {
  Aotizhongxin:  { region:"Centro",    pm25:82.8, critPct:14.2, lat:39.98, lon:116.40, knnBest:"Guanyuan",   knnSim:98.6 },
  Changping:     { region:"Norte",     pm25:71.3, critPct:11.2, lat:40.22, lon:116.23, knnBest:"Huairou",    knnSim:87.4 },
  Dingling:      { region:"Norte",     pm25:55.2, critPct: 8.1, lat:40.29, lon:116.22, knnBest:"Huairou",    knnSim:91.2 },
  Dongsi:        { region:"Sur",       pm25:84.7, critPct:17.1, lat:39.93, lon:116.42, knnBest:"Wanshouxig.", knnSim:85.8 },
  Guanyuan:      { region:"Centro",    pm25:83.1, critPct:14.8, lat:39.93, lon:116.34, knnBest:"Aotizhong.", knnSim:98.6 },
  Gucheng:       { region:"Oeste",     pm25:83.9, critPct:15.1, lat:39.91, lon:116.18, knnBest:"Wanliu",     knnSim:65.6 },
  Huairou:       { region:"Norte",     pm25:53.7, critPct: 7.8, lat:40.33, lon:116.63, knnBest:"Dingling",   knnSim:91.2 },
  Nongzhanguan:  { region:"Centro",    pm25:82.5, critPct:13.7, lat:39.93, lon:116.47, knnBest:"Guanyuan",   knnSim:95.1 },
  Shunyi:        { region:"Norte-Este",pm25:78.4, critPct:13.9, lat:40.12, lon:116.65, knnBest:"Changping",  knnSim:82.3 },
  Tiantan:       { region:"Centro-Sur",pm25:84.1, critPct:15.3, lat:39.88, lon:116.41, knnBest:"Dongsi",     knnSim:93.7 },
  Wanliu:        { region:"Oeste",     pm25:83.2, critPct:14.5, lat:39.99, lon:116.29, knnBest:"Gucheng",    knnSim:65.6 },
  Wanshouxigong: { region:"Sur",       pm25:85.0, critPct:16.7, lat:39.88, lon:116.36, knnBest:"Dongsi",     knnSim:85.8 },
};

const SEASONAL_DATA = [
  { season:"Invierno", hist:96.4,  curr:104.9, months:"Dic-Feb", icon:"❄️", changeDir:"↑", changePct: 8.8 },
  { season:"Primavera",hist:81.2,  curr:56.6,  months:"Mar-May", icon:"🌸", changeDir:"↓", changePct:30.3 },
  { season:"Verano",   hist:67.6,  curr:62.1,  months:"Jun-Ago", icon:"☀️", changeDir:"↓", changePct: 8.1 },
  { season:"Otoño",    hist:86.6,  curr:84.8,  months:"Sep-Nov", icon:"🍂", changeDir:"↓", changePct: 2.1 },
];

// Correlaciones con PM2.5 (período histórico)
const CORR_VARS = ["DEW","CO","NO2","SO2","PM10","RAIN","PRES","TEMP","WSPM"];
const CORR_VALS = [0.42, 0.38, 0.35, 0.31, 0.88, -0.12, -0.22, -0.18, -0.30];

// Métricas KNN
const METRIC_BENCH = [
  { name:"Manhattan",  alias:"L1",         time_ms:0.22, robustness:82, use:"Alertas tiempo real",    icon:"⚡", best:true  },
  { name:"Coseno",     alias:"Angular",    time_ms:0.31, robustness:95, use:"Similitud angular",      icon:"🎯", best:false },
  { name:"Euclidiana", alias:"L2",         time_ms:0.28, robustness:78, use:"Magnitud de diferencias",icon:"📐", best:false },
  { name:"Pearson",    alias:"Correlación",time_ms:0.58, robustness:90, use:"Tendencias lineales",    icon:"📈", best:false },
];

// Datos dataset resumen
const DATASET_SUMMARY = {
  hist: { records:420768, stations:12, pm25_mean:79.79, pm25_std:80.82, pm25_max:999, pm25_p50:55, pm25_p95:242, critPct:15.21, period:"Mar 2013 – Feb 2017" },
  curr: { records:1294,   stations:1,  pm25_mean:78.88, pm25_std:47.12, pm25_max:295.98, pm25_p50:68.63, pm25_p95:175.94, critPct:9.12, period:"Ene 2022 – Dic 2025" },
};

// ── Datos estáticos H4-H8 (análisis Python) ───────────────
const H4_ZONES = [
  { zone:"Norte", winter:[{x:"0-20",v:18},{x:"20-40",v:38},{x:"40-60",v:12},{x:"60-90",v:8},{x:"90-130",v:5},{x:"130-180",v:19}],
    summer:[{x:"0-20",v:8},{x:"20-40",v:45},{x:"40-60",v:30},{x:"60-90",v:12},{x:"90-130",v:4},{x:"130-180",v:1}] },
  { zone:"Sur",   winter:[{x:"0-20",v:5},{x:"20-40",v:12},{x:"40-60",v:16},{x:"60-90",v:22},{x:"90-130",v:25},{x:"130-180",v:20}],
    summer:[{x:"0-20",v:5},{x:"20-40",v:30},{x:"40-60",v:38},{x:"60-90",v:18},{x:"90-130",v:7},{x:"130-180",v:2}] },
];
const H5_WIND_CORR = [
  { group:"Vientos del Norte", r:0.28, color:"#38bdf8", desc:"Trae aire limpio, debilita la relación DEWP→PM2.5" },
  { group:"Calma / Lateral",   r:0.43, color:"#a78bfa", desc:"Correlación base sin transporte regional activo" },
  { group:"Vientos del Sur",   r:0.55, color:"#f87171", desc:"Canaliza emisiones de Hebei, amplifica la relación" },
];
const H6_PCA = [
  { pc:"PC1", var:38.7, load:[{v:"PM2.5",w:0.89},{v:"PM10",w:0.85},{v:"CO",w:0.82},{v:"NO₂",w:0.74}], label:"Contaminación general" },
  { pc:"PC2", var:24.1, load:[{v:"TEMP",w:0.78},{v:"DEWP",w:0.72},{v:"PRES",w:-0.65},{v:"O₃",w:0.58}], label:"Régimen meteorológico" },
  { pc:"PC3", var:12.4, load:[{v:"WSPM",w:0.81},{v:"SO₂",w:0.62}], label:"Dispersión eólica" },
];
const H7_MARKOV = {
  states:["Limpio","Moderado","Crítico"],
  matrix:[[62.6,31.2,6.2],[22.4,58.1,19.5],[8.3,39.2,52.5]],
  stateDist:[{s:"Limpio",pct:38.4,color:"#4ade80"},{s:"Moderado",pct:46.4,color:"#facc15"},{s:"Crítico",pct:15.2,color:"#f87171"}],
};
const H8_AQI_DIST = [
  { zone:"Norte — Invierno", cats:[{l:"Bueno",p:22.1,c:"#4ade80"},{l:"Moderado",p:31.4,c:"#a3e635"},{l:"Insal.S",p:24.2,c:"#facc15"},{l:"Insalubre",p:14.6,c:"#f97316"},{l:"Crítico",p:7.7,c:"#f87171"}] },
  { zone:"Norte — Verano",   cats:[{l:"Bueno",p:58.7,c:"#4ade80"},{l:"Moderado",p:28.3,c:"#a3e635"},{l:"Insal.S",p:9.6,c:"#facc15"},{l:"Insalubre",p:2.8,c:"#f97316"},{l:"Crítico",p:0.6,c:"#f87171"}] },
  { zone:"Sur — Invierno",   cats:[{l:"Bueno",p:8.2,c:"#4ade80"},{l:"Moderado",p:21.4,c:"#a3e635"},{l:"Insal.S",p:27.3,c:"#facc15"},{l:"Insalubre",p:24.1,c:"#f97316"},{l:"Crítico",p:19.0,c:"#f87171"}] },
  { zone:"Sur — Verano",     cats:[{l:"Bueno",p:31.2,c:"#4ade80"},{l:"Moderado",p:38.4,c:"#a3e635"},{l:"Insal.S",p:19.8,c:"#facc15"},{l:"Insalubre",p:7.9,c:"#f97316"},{l:"Crítico",p:2.7,c:"#f87171"}] },
];

// ═══════════════════════════════════════════════════════════
//  PARSING Y CARGA DE CSV
// ═══════════════════════════════════════════════════════════
// Tokens que se tratan como valores nulos/faltantes (igual que pandas errors="coerce")
const NULL_TOKENS = new Set(["NA","na","NaN","nan","NaT","null","NULL","","undefined"]);

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, j) => {
        let v = values[j].replace(/"/g, "").trim();
        if (NULL_TOKENS.has(v)) { row[h] = null; return; }  // → null, no string "NA"
        const num = parseFloat(v);
        row[h] = isNaN(num) ? v : num;  // string para categoricas (wd, station)
      });
      rows.push(row);
    }
  }
  return rows;
}

function processHistStation(rows, stationName, stIdx) {
  // pd.to_numeric(errors="coerce"): null/NA/NaN → null, número válido → número
  const toNum = (v, fallback=null) => (v===null||v===undefined) ? fallback : (isNaN(+v) ? fallback : +v);

  return rows.map(r => {
    const m = toNum(r.month, 1);
    const d = toNum(r.day, 1);
    const dayOfYear = Math.floor((m - 1) * 30.4 + d);
    const pm25 = toNum(r["PM2.5"]) ?? toNum(r["pm2_5"]);
    const pm10 = toNum(r["PM10"],  0);
    const so2  = toNum(r["SO2"],   0);
    const no2  = toNum(r["NO2"],   0);
    const co   = toNum(r["CO"],    0);
    const o3   = toNum(r["O3"],    0);
    const temp = toNum(r["TEMP"],  null);  // null = ausente — toVec lo filtra automáticamente
    const pres = toNum(r["PRES"],  null);
    const dew  = toNum(r["DEWP"] ?? r["DEW"], null);
    const wspm = toNum(r["WSPM"],  null);
    const rain = toNum(r["RAIN"],  0);
    const wd   = r["wd"] ?? "N";
    return {
      station:stationName, stIdx, period:"hist", month:m-1, day:dayOfYear, rain,
      "PM2.5":pm25, "PM10":pm10, "SO2":so2, "NO2":no2, "CO":co, "O3":o3,
      TEMP:temp, PRES:pres, DEW:dew, WSPM:wspm, RAIN:rain, wd,
      critical:(pm25||0)>150, moderate:(pm25||0)>75&&(pm25||0)<=150
    };
  }).filter(r => r["PM2.5"] !== null && !isNaN(r["PM2.5"]));
}

function processCurrData(rows) {
  return rows.map((r, idx) => {
    const dateStr = r.date || r.time || "";
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    const month = dateMatch ? parseInt(dateMatch[2]) - 1 : 0;
    const pm25 = r["pm2_5"] ?? r["PM2.5"] ?? r["pm25"] ?? 0;
    const pm10 = r["pm10"]  ?? r["PM10"]  ?? 0;
    const co   = r["carbon_monoxide"]   ?? r["CO"]  ?? 0;
    const no2  = r["nitrogen_dioxide"]  ?? r["NO2"] ?? 0;
    const so2  = r["sulphur_dioxide"]   ?? r["SO2"] ?? 0;
    const o3   = r["ozone"] ?? r["O3"]  ?? 0;
    // Map meteorological fields from Open-Meteo column names
    const temp = r["temperature_2m"] ?? r["temperature"] ?? r["TEMP"] ?? 0;
    const pres = r["surface_pressure"] ?? r["pressure_msl"] ?? r["PRES"] ?? 0;
    const dew  = r["dewpoint_2m"] ?? r["dew_point_2m"] ?? r["DEWP"] ?? r["DEW"] ?? 0;
    const wspm = r["windspeed_10m"] ?? r["wind_speed_10m"] ?? r["WSPM"] ?? 0;
    const rain = r["precipitation"] ?? r["rain"] ?? r["RAIN"] ?? 0;
    return {
      station:"Beijing", stIdx:0, period:"curr", month, day:idx, rain,
      "PM2.5":pm25, "PM10":pm10, "SO2":so2, "NO2":no2, "CO":co, "O3":o3,
      TEMP:temp, PRES:pres, DEW:dew, WSPM:wspm, RAIN:rain, wd:"N",
      critical:pm25>150, moderate:pm25>75&&pm25<=150
    };
  }).filter(r => r["PM2.5"]!=null && !isNaN(r["PM2.5"]) && r["PM2.5"]>0);
}

async function loadAllData(onProgress?: (pct:number)=>void) {
  const hist = [];
  const curr = [];
  const totalSources = Object.keys(HIST_STATIONS_CSV).length + 1;
  let done = 0;
  const tick = () => { done++; onProgress?.(Math.round(done/totalSources*100)); };

  const loadPromises = Object.entries(HIST_STATIONS_CSV).map(async ([station, path], stIdx) => {
    try {
      const res = await fetch(path);
      if (!res.ok) { tick(); return []; }
      const text = await res.text();
      const rows = parseCSV(text);
      const result = processHistStation(rows, station, stIdx);
      tick();
      return result;
    } catch (e) { tick(); return []; }
  });
  const histResults = await Promise.all(loadPromises);
  histResults.forEach(arr => hist.push(...arr));

  try {
    const res = await fetch(CURR_CSV);
    if (res.ok) {
      const text = await res.text();
      const rows = parseCSV(text);
      curr.push(...processCurrData(rows));
    }
  } catch (e) {}
  tick(); // count curr CSV

  // Keep original curr data (un-duplicated) for TabCompare
  const currRaw = [...curr];

  let currWithStations = curr;
  if (curr.length > 0) {
    const currAvgs = {
      "PM2.5": curr.reduce((a,r) => a + r["PM2.5"], 0) / curr.length,
    };
    const histAvg = hist.length ? hist.reduce((a,r) => a + r["PM2.5"], 0) / hist.length : 1;
    currWithStations = [];
    STATIONS.forEach((st, si) => {
      const ratio = histAvg > 0 ? currAvgs["PM2.5"] / histAvg : 1;
      curr.forEach(r => {
        const newR = { ...r, station:st, stIdx:si };
        newR["PM2.5"] = (r["PM2.5"] * ratio) || 0;
        newR["PM10"]  = (r["PM10"]  * ratio) || 0;
        newR["SO2"]   = (r["SO2"]   * ratio) || 0;
        newR["NO2"]   = (r["NO2"]   * ratio) || 0;
        newR["CO"]    = (r["CO"]    * ratio) || 0;
        newR["O3"]    = (r["O3"]    * ratio) || 0;
        newR.critical = newR["PM2.5"] > 150;
        newR.moderate = newR["PM2.5"] > 75 && newR["PM2.5"] <= 150;
        currWithStations.push(newR);
      });
    });
  }
  return { hist, curr: currWithStations, currRaw };
}

// ═══════════════════════════════════════════════════════════
//  ALGORITMOS KNN
// ═══════════════════════════════════════════════════════════
function toVec(records) {
  return FEATURES.map(f => {
    const a = records.map(r => r[f]).filter(v => v != null && !isNaN(v));
    return a.length ? a.reduce((x,y) => x+y, 0) / a.length : 0;
  });
}
function stationProfile(records) {
  return STATIONS.map((st, si) => {
    const rr = records.filter(r => r.station === st);
    return { id:st, si, vec:toVec(rr), count:rr.length, critPct:rr.filter(r=>r.critical).length/Math.max(rr.length,1)*100 };
  });
}
function monthProfile(records, station) {
  return MONTHS.map((lb, mi) => {
    const rr = records.filter(r => r.station === station && r.month === mi);
    return { label:lb, month:mi, vec:toVec(rr), critPct:rr.filter(r=>r.critical).length/Math.max(rr.length,1)*100 };
  });
}
function zscore(matrix) {
  const n = matrix[0]?.length || 0;
  const mu = Array(n).fill(0), sd = Array(n).fill(0);
  matrix.forEach(r => r.forEach((v,i) => mu[i]+=v));
  mu.forEach((_,i) => mu[i]/=matrix.length);
  matrix.forEach(r => r.forEach((v,i) => sd[i]+=(v-mu[i])**2));
  sd.forEach((_,i) => { sd[i]=Math.sqrt(sd[i]/matrix.length)||1; });
  return matrix.map(r => r.map((v,i) => (v-mu[i])/sd[i]));
}
const cosine   = (u,v)=>{ let d=0,nu=0,nv=0; u.forEach((_,i)=>{d+=u[i]*v[i];nu+=u[i]**2;nv+=v[i]**2;}); return nu<1e-12||nv<1e-12?1:1-d/(Math.sqrt(nu)*Math.sqrt(nv)); };
const pearson  = (u,v)=>{ const n=u.length,mx=u.reduce((a,b)=>a+b)/n,my=v.reduce((a,b)=>a+b)/n; let num=0,dx=0,dy=0; u.forEach((_,i)=>{num+=(u[i]-mx)*(v[i]-my);dx+=(u[i]-mx)**2;dy+=(v[i]-my)**2;}); return dx<1e-10||dy<1e-10?1:1-Math.max(-1,Math.min(1,num/(Math.sqrt(dx)*Math.sqrt(dy)))); };
const euclid   = (u,v) => Math.sqrt(u.reduce((s,_,i)=>s+(u[i]-v[i])**2,0));
const manhattan= (u,v) => u.reduce((s,_,i)=>s+Math.abs(u[i]-v[i]),0);
const METRICS  = { coseno:cosine, pearson, euclidiana:euclid, manhattan };

function knn(targetIdx, profiles, k, metricKey, featureMask) {
  const fn   = METRICS[metricKey] || cosine;
  const mask = featureMask || FEATURES.map(()=>true);
  const norm = zscore(profiles.map(p=>p.vec));
  const applyMask = v => v.filter((_,i)=>mask[i]);
  const tv = applyMask(norm[targetIdx]);
  return profiles
    .map((p,i) => ({...p, dist:i===targetIdx?Infinity:fn(tv,applyMask(norm[i]))}))
    .sort((a,b)=>a.dist-b.dist)
    .slice(0,k);
}

// ═══════════════════════════════════════════════════════════
//  GENERACIÓN DE HIPÓTESIS VÍA CLAUDE API
// ═══════════════════════════════════════════════════════════
async function callClaudeHypotheses(ctx) {
  const sys = `Eres un experto en análisis de calidad del aire, salud pública y política ambiental urbana.
Tu tarea es generar hipótesis de valor científicamente sólidas a partir de resultados KNN sobre datos de Beijing.
Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto extra.`;
  const prompt = `RESULTADOS DEL ANÁLISIS KNN:\n${ctx}\n
Genera exactamente 4 hipótesis de valor. Cada hipótesis debe cubrir uno de estos enfoques (sin repetir):
1. PREDICCIÓN: Predecir niveles críticos de PM2.5 usando patrones de estaciones similares
2. CLIMA: Influencia del viento/temperatura/lluvia en la contaminación detectada por KNN
3. ALERTA: Condición de riesgo para hospitales o restricción de tráfico
4. COMPARACIÓN: Cambio estructural entre período 2013-2017 vs 2022-2026
Formato JSON (array de 4 objetos):
[{"id":1,"tipo":"prediccion","titulo":"...","hipotesis":"Si [condición] entonces [consecuencia] porque [mecanismo]","evidencia_knn":"Qué patrón KNN la respalda","accion":"Decisión concreta (quién, qué, cuándo)","impacto":"Alto/Medio/Bajo","confianza":0.0}]`;
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY || "";
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,system:sys,messages:[{role:"user",content:prompt}]})
  });
  const d = await r.json();
  const txt = d.content?.map(b=>b.text||"").join("") || "";
  return JSON.parse(txt.replace(/```json|```/g,"").trim());
}

// ═══════════════════════════════════════════════════════════
//  PALETA Y HELPERS UI
// ═══════════════════════════════════════════════════════════
const C = {
  pred:"#6366f1",clima:"#0ea5e9",alerta:"#ef4444",comp:"#f59e0b",
  good:"#10b981",warn:"#f59e0b",bad:"#ef4444",crit:"#7c3aed",
  bg:"#0d1117",card:"#161b22",border:"#21262d",text:"#e6edf3",muted:"#8b949e",dim:"#30363d",
  north:"#06b6d4",center:"#6366f1",west:"#a855f7",south:"#f97316",
  dew:"#34d399",wspm:"#60a5fa",corr_pos:"#10b981",corr_neg:"#ef4444",
};
const TIPO_META = {
  prediccion:{color:C.pred,    icon:"🔮",label:"Predicción PM2.5"},
  clima:     {color:C.clima,   icon:"🌬️",label:"Influencia Climática"},
  alerta:    {color:C.alerta,  icon:"🚨",label:"Alerta Riesgo"},
  comparacion:{color:C.comp,   icon:"📊",label:"Comparativa Períodos"},
};
const REGION_COLOR = { "Norte":C.north, "Norte-Este":C.clima, "Centro":C.pred, "Centro-Sur":C.west, "Oeste":C.warn, "Sur":C.south };
function pm25Cat(v) {
  if(v<=35)  return{c:C.good,  l:"Bueno"};
  if(v<=75)  return{c:"#a3e635",l:"Moderado"};
  if(v<=115) return{c:C.warn,  l:"Insalubre sens."};
  if(v<=150) return{c:"#f97316",l:"Insalubre"};
  return     {c:C.crit,  l:"Muy insalubre"};
}

function Spinner(){
  return <div style={{width:16,height:16,border:"2px solid #ffffff44",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>;
}

function Bar({value,max,color,height=8}) {
  const pct = Math.min(100,(value/(max||1))*100);
  return (
    <div style={{background:C.dim,borderRadius:4,height,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4,transition:"width .5s"}}/>
    </div>);
}

function Badge({children,color}:{children:any;color:string}) {
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:color+"22",color,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
}

function Card({children,style,accent}:{children:any;style?:any;accent?:string}) {
  return <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${accent||C.border}`,...style}}>{children}</div>;
}

function SectionTitle({children,sub}:{children:any;sub?:string}) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,color:C.text}}>{children}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>);
}

// Barra vertical con tooltip y animación de entrada
function VBar({data,color="#6366f1",h=140,valueKey="value",labelKey="label"}) {
  const [tip,setTip]       = useState(null);
  const [mounted,setMounted] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setMounted(true),60); return ()=>clearTimeout(t); },[]);
  const max = Math.max(...data.map(d=>d[valueKey]||0),1);
  return (
    <div style={{position:"relative"}} data-chart>
      {tip&&<div style={{position:"absolute",top:-30,left:tip.x,transform:"translateX(-50%)",background:"#0d1117",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:C.text,pointerEvents:"none",whiteSpace:"nowrap",zIndex:10}}>
        {tip.label}: <b>{tip.val}</b>
      </div>}
      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:h}}>
        {data.map((d,i)=>{
          const bh = mounted ? Math.max(4,((d[valueKey]||0)/max)*(h-20)) : 0;
          const bc = d.color||color;
          return (
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}
              onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect(),pr=e.currentTarget.closest("[data-chart]").getBoundingClientRect();setTip({label:d[labelKey],val:(d[valueKey]||0).toFixed(1),x:r.left-pr.left+r.width/2});}}
              onMouseLeave={()=>setTip(null)}>
              <div style={{width:"100%",height:bh,background:bc,borderRadius:"3px 3px 0 0",minWidth:4,transition:"height .6s cubic-bezier(.34,1.56,.64,1)",opacity:.88}}/>
              <span style={{fontSize:9,color:C.muted,writingMode:"vertical-rl",transform:"rotate(180deg)",maxHeight:36,overflow:"hidden"}}>{d[labelKey]}</span>
            </div>);
        })}
      </div>
    </div>);
}

// Radar SVG
function Radar({vecs,labels,colors,size=160}) {
  const n = labels.length; if(!n) return null;
  const cx=size/2,cy=size/2,r=(size/2)-22;
  const allVals = vecs.flatMap(v=>v);
  const mx = Math.max(...allVals,1);
  const pt = (val,i)=>{ const a=2*Math.PI*i/n-Math.PI/2,d=(val/mx)*r; return [cx+d*Math.cos(a),cy+d*Math.sin(a)]; };
  const axes = labels.map((_,i)=>{ const a=2*Math.PI*i/n-Math.PI/2; return {x:cx+(r+14)*Math.cos(a),y:cy+(r+14)*Math.sin(a),ax:cx+r*Math.cos(a),ay:cy+r*Math.sin(a)}; });
  return (
    <svg width={size} height={size} style={{overflow:"visible"}}>
      {[0.25,0.5,0.75,1].map(s=>(
        <polygon key={s} points={labels.map((_,i)=>{ const a=2*Math.PI*i/n-Math.PI/2,d=s*r; return `${cx+d*Math.cos(a)},${cy+d*Math.sin(a)}`; }).join(" ")} fill="none" stroke={C.dim} strokeWidth={1}/>
      ))}
      {axes.map((ax,i)=><line key={i} x1={cx} y1={cy} x2={ax.ax} y2={ax.ay} stroke={C.dim} strokeWidth={1}/>)}
      {vecs.map((vec,vi)=>(
        <polygon key={vi} points={vec.map((v,i)=>pt(v,i).join(",")).join(" ")} fill={colors[vi]+"33"} stroke={colors[vi]} strokeWidth={1.8} opacity={0.9}/>
      ))}
      {axes.map((ax,i)=><text key={i} x={ax.x} y={ax.y} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={C.muted}>{labels[i]}</text>)}
    </svg>);
}

// Vecino card
function NeighborCard({p,rank,targetVec,metric}) {
  const sim = (1/(1+p.dist))*100;
  const cat = pm25Cat(p.vec[0]);
  const delta = targetVec?((p.vec[0]-targetVec[0])/Math.max(targetVec[0],1)*100):0;
  return (
    <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"flex-start"}}>
      <div style={{width:30,height:30,borderRadius:"50%",background:`${C.pred}22`,border:`2px solid ${C.pred}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:C.pred,flexShrink:0}}>{rank}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>{p.id}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <Badge color={cat.c}>{p.vec[0].toFixed(1)} µg/m³</Badge>
          <Badge color={C.muted}>Críticos {p.critPct.toFixed(1)}%</Badge>
          <Badge color={delta<0?C.good:C.bad}>{delta>0?"+":""}{delta.toFixed(1)}% PM2.5</Badge>
        </div>
        <Bar value={sim} max={100} color={C.pred} height={6}/>
        <div style={{fontSize:10,color:C.muted,marginTop:3}}>{sim.toFixed(1)}% similitud ({metric})</div>
      </div>
    </div>);
}

// Tarjeta de hipótesis
function HypCard({h}) {
  const [open,setOpen] = useState(false);
  const meta = TIPO_META[h.tipo]||{color:C.pred,icon:"💡",label:h.tipo};
  const conf = Math.round((h.confianza||0)*100);
  const impColor = {Alto:C.bad,Medio:C.warn,Bajo:C.good}[h.impacto]||C.muted;
  return (
    <div style={{background:C.card,borderRadius:12,border:`1px solid ${meta.color}44`,overflow:"hidden",cursor:"pointer"}} onClick={()=>setOpen(!open)}>
      <div style={{padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{width:40,height:40,borderRadius:10,background:meta.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{meta.icon}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
            <Badge color={meta.color}>{meta.label}</Badge>
            <Badge color={impColor}>Impacto {h.impacto}</Badge>
            <span style={{fontSize:10,color:C.muted}}>conf. {conf}%</span>
          </div>
          <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.4}}>{h.titulo}</div>
          <div style={{marginTop:8,height:4,background:C.dim,borderRadius:3}}>
            <div style={{height:"100%",width:`${conf}%`,background:meta.color,borderRadius:3,transition:"width 1s"}}/>
          </div>
        </div>
        <span style={{color:C.muted,fontSize:16,flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 16px 16px",display:"flex",flexDirection:"column",gap:8}}>
          {[["HIPÓTESIS",h.hipotesis,C.pred],["EVIDENCIA KNN",h.evidencia_knn,C.clima],["ACCIÓN CONCRETA",h.accion,C.good]].map(([tit,txt,c])=>(
            <div key={tit} style={{background:C.bg,borderRadius:8,padding:"10px 13px",borderLeft:`3px solid ${c}`}}>
              <div style={{fontSize:10,color:c,fontWeight:700,letterSpacing:1,marginBottom:4}}>{tit}</div>
              <div style={{fontSize:13,color:"#c9d1d9",lineHeight:1.6}}>{txt}</div>
            </div>))}
        </div>)}
    </div>);
}

// ═══════════════════════════════════════════════════════════
//  TABS SECCIONES
// ═══════════════════════════════════════════════════════════

// ── Tab 0: EDA Overview ──────────────────────────────────────
function TabEDA() {
  const attrs = [
    ["PM2.5","Partículas finas ≤ 2.5 µm","2 – 999","µg/m³","Numérica continua"],
    ["PM10","Partículas gruesas ≤ 10 µm","2 – 999","µg/m³","Numérica continua"],
    ["CO","Monóxido de Carbono","0.1 – 10","mg/m³","Numérica continua"],
    ["TEMP","Temperatura ambiente","−20 – 42","°C","Numérica continua"],
    ["PRES","Presión atmosférica","982 – 1045","hPa","Numérica continua"],
    ["DEW (DEWP)","Punto de rocío","−43 – 30","°C","Numérica continua"],
    ["RAIN","Precipitación acumulada","0 – 73","mm","Numérica continua"],
    ["wd","Dirección del viento","16 dir.","—","Categórica"],
    ["WSPM","Velocidad del viento","0 – 14","m/s","Numérica continua"],
  ];
  const steps = [
    ["0","Contexto","Problema de enmascaramiento meteorológico (Zhang et al.). Integración UCI PRSA + Open-Meteo + AOD Sentinel-2 30m."],
    ["1","Estructura","420,768 registros históricos (12 estaciones × 4 años) + 1,294 actuales. Granularidad horaria → diaria agrupada. 9 features numéricas + 1 categórica."],
    ["2","Calidad de Datos","Imputación lineal para NaN. IQR para diferenciar picos reales de errores instrumentales. Z-score para normalización KNN."],
    ["3","Distribuciones","Histogramas y boxplots por estación. PM2.5 histérico: media 79.79, mediana 55 (sesgo derecho pronunciado)."],
    ["4","Outliers","PM2.5 máx: 999 µg/m³ (histórico). Conservados como eventos extremos reales. Dic 2015: pico 567 µg/m³."],
    ["5","Relaciones bivariadas","Heatmap de correlaciones. DEW: r=+0.42 (predictor dominante). WSPM: r=−0.30 (dispersor). Ver H1."],
    ["6","Relaciones multivariadas","KNN coseno entre estaciones. Gradiente Norte→Sur confirmado. Similitud Aotizhongxin-Guanyuan: 98.6%. Ver H2 y H3."],
    ["7","Temporalidad","Series mensuales 2013-17 vs 2022-26. Invierno empeora ↑8.8%. Primavera mejora ↓30.3%. Ver pestaña Temporal."],
    ["8","Balance de clases","Días críticos (>150 µg/m³): 15.21% hist → 9.12% actual. Mejora significativa en eventos extremos."],
    ["9","Preguntas emergentes","¿Es el DEW el clasificador de primera capa? ¿La disparidad Norte-Sur es estructural? ¿Qué métrica es óptima para alertas?"],
    ["10","Conclusiones","Mejora estructural en primavera. Persistencia crítica en invierno. Políticas asimétricas por cuadrante y estación."],
    ["11","Comunicación","Dashboard interactivo con visualizaciones por hipótesis, KNN interactivo y motor de hipótesis IA."],
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {[
          ["420,768","Registros históricos",C.pred,"UCI PRSA 2013-2017"],
          ["12","Estaciones terrestres",C.clima,"Distribuidas por Beijing"],
          ["1,294","Registros actuales",C.good,"Open-Meteo 2022-2026"],
          ["9","Features del modelo",C.warn,"PM, gases, meteorología"],
          ["15.21%","Días críticos histórico",C.bad,"PM2.5 > 150 µg/m³"],
          ["9.12%","Días críticos actual",C.comp,"Mejora ↓6.09 pp"],
        ].map(([v,l,c,sub])=>(
          <div key={l} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${c}`}}>
            <div style={{fontSize:20,fontWeight:800,color:c,marginBottom:2}}>{v}</div>
            <div style={{fontSize:11,color:C.text,fontWeight:600}}>{l}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>
          </div>))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Comparativa datasets */}
        <Card>
          <SectionTitle>📊 Comparativa de Datasets</SectionTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Métrica","2013-2017","2022-2026"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"6px 8px",color:C.muted,fontWeight:600,fontSize:11}}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Registros","420,768","1,294"],
                  ["Estaciones","12","1 (ciudad)"],
                  ["PM2.5 media",`${DATASET_SUMMARY.hist.pm25_mean} µg/m³`,`${DATASET_SUMMARY.curr.pm25_mean} µg/m³`],
                  ["PM2.5 mediana",`${DATASET_SUMMARY.hist.pm25_p50} µg/m³`,`${DATASET_SUMMARY.curr.pm25_p50.toFixed(1)} µg/m³`],
                  ["PM2.5 p95",`${DATASET_SUMMARY.hist.pm25_p95} µg/m³`,`${DATASET_SUMMARY.curr.pm25_p95.toFixed(1)} µg/m³`],
                  ["PM2.5 máx",`${DATASET_SUMMARY.hist.pm25_max} µg/m³`,`${DATASET_SUMMARY.curr.pm25_max.toFixed(1)} µg/m³`],
                  ["Días críticos",`${DATASET_SUMMARY.hist.critPct}%`,`${DATASET_SUMMARY.curr.critPct}%`],
                  ["Período",DATASET_SUMMARY.hist.period,DATASET_SUMMARY.curr.period],
                ].map(([m,h,c])=>(
                  <tr key={m} style={{borderBottom:`1px solid ${C.dim}`}}>
                    <td style={{padding:"5px 8px",color:C.muted,fontSize:11}}>{m}</td>
                    <td style={{padding:"5px 8px",color:C.pred,fontWeight:600}}>{h}</td>
                    <td style={{padding:"5px 8px",color:C.good,fontWeight:600}}>{c}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Atributos */}
        <Card>
          <SectionTitle sub="Variables del dataset integrado">📋 Tabla de Atributos</SectionTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Atributo","Descripción","Rango","Unidad","Tipo"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"5px 6px",color:C.muted,fontWeight:600,fontSize:10}}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {attrs.map(([at,desc,rng,unit,tipo])=>(
                  <tr key={at} style={{borderBottom:`1px solid ${C.dim}`}}>
                    <td style={{padding:"4px 6px",color:at.startsWith("DEW")?C.dew:at==="WSPM"?C.wspm:C.pred,fontWeight:700,whiteSpace:"nowrap"}}>{at}</td>
                    <td style={{padding:"4px 6px",color:C.text,fontSize:10}}>{desc}</td>
                    <td style={{padding:"4px 6px",color:C.muted,whiteSpace:"nowrap"}}>{rng}</td>
                    <td style={{padding:"4px 6px",color:C.muted}}>{unit}</td>
                    <td style={{padding:"4px 6px"}}><Badge color={tipo.includes("cont")?C.clima:C.warn}>{tipo}</Badge></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Pasos EDA */}
      <Card>
        <SectionTitle sub="Metodología seguida en el análisis exploratorio">🔬 Flujo EDA — 12 Pasos Aplicados</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:8}}>
          {steps.map(([num,title,desc])=>(
            <div key={num} style={{background:C.bg,borderRadius:9,padding:"10px 13px",border:`1px solid ${C.border}`,display:"flex",gap:10}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:C.pred+"22",color:C.pred,fontWeight:800,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{num}</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:3}}>{title}</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
              </div>
            </div>))}
        </div>
      </Card>
    </div>);
}

// ── Tab 1: H1 DEW ─────────────────────────────────────────────
function TabH1() {
  const maxAbs = Math.max(...CORR_VALS.map(Math.abs));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Hipótesis banner */}
      <div style={{background:`linear-gradient(135deg,${C.dew}18,${C.pred}18)`,borderRadius:12,padding:"18px 20px",border:`1px solid ${C.dew}55`}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{fontSize:28,flexShrink:0}}>💧</div>
          <div>
            <div style={{fontSize:11,color:C.dew,fontWeight:700,letterSpacing:1,marginBottom:4}}>HIPÓTESIS 1 — DEW COMO PREDICTOR DOMINANTE</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.5}}>
              "Si el punto de rocío (DEW) es elevado con temperatura moderada,<br/>entonces las concentraciones de PM2.5 aumentan significativamente,<br/>porque este escenario favorece la formación secundaria de aerosoles."
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
              Basada en Zhang et al. — El DEW sintetiza temperatura y humedad, actuando como <i>proxy</i> del origen de la masa de aire (norte seco vs. sur húmedo). En los árboles de decisión, el DEW es el <b style={{color:C.dew}}>clasificador de primera capa</b>, separando condiciones propensas a la acumulación de aerosoles de las que favorecen su dispersión.
            </div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Mapa de correlaciones */}
        <Card>
          <SectionTitle sub="Período histórico 2013-2017 — todas las estaciones">🔥 Correlaciones con PM2.5</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {CORR_VARS.map((v,i)=>{
              const val = CORR_VALS[i];
              const c = val > 0 ? C.corr_pos : C.corr_neg;
              const isMax = v === "DEW";
              return (
                <div key={v} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:8,background:isMax?C.dew+"18":C.bg,border:`1px solid ${isMax?C.dew:C.border}`}}>
                  <div style={{width:70,fontSize:12,fontWeight:isMax?800:500,color:isMax?C.dew:C.text,flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                    {isMax&&<span>⭐</span>}{v}
                  </div>
                  <div style={{flex:1,position:"relative",height:20,display:"flex",alignItems:"center"}}>
                    <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:C.dim}}/>
                    {val>0?(
                      <div style={{position:"absolute",left:"50%",width:`${(val/maxAbs)*45}%`,height:14,background:c,borderRadius:"0 4px 4px 0",transition:"width .5s"}}/>
                    ):(
                      <div style={{position:"absolute",right:"50%",width:`${(Math.abs(val)/maxAbs)*45}%`,height:14,background:c,borderRadius:"4px 0 0 4px",transition:"width .5s"}}/>
                    )}
                  </div>
                  <div style={{width:50,fontSize:12,fontWeight:700,color:c,textAlign:"right",flexShrink:0}}>
                    {val>0?"+":""}{val.toFixed(2)}
                  </div>
                </div>);
            })}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:C.bg,borderRadius:8,fontSize:11,color:C.muted,lineHeight:1.5}}>
            <span style={{color:C.dew,fontWeight:700}}>DEW r=+0.42</span> es el predictor positivo con mayor influencia individual.
            <span style={{color:C.wspm,fontWeight:700}}> WSPM r=−0.30</span> es el principal agente dispersor.
          </div>
        </Card>

        {/* Interpretación y árbol conceptual */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <SectionTitle>🌡️ ¿Por qué el DEW es el clasificador dominante?</SectionTitle>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                [C.dew,"DEW alto (>10°C)","Masa de aire húmeda del sur. Alta humedad relativa → favorece reacciones heterogéneas en la superficie de aerosoles → PM2.5 ↑"],
                [C.wspm,"WSPM bajo (<2 m/s)","Sin dispersión mecánica. Las partículas se acumulan en la capa límite superficial, especialmente en condiciones de inversión térmica invernal."],
                [C.warn,"PRES alta (>1015 hPa)","Asociada a anticiclones (días despejados, sin lluvia). Sin dilución por precipitación → acumulación de contaminantes."],
                [C.bad,"RAIN=0","Ausencia de lavado húmedo. El PM2.5 no se elimina y se acumula progresivamente en horas nocturnas."],
              ].map(([c,tit,desc])=>(
                <div key={tit} style={{display:"flex",gap:10,padding:"8px 10px",background:C.bg,borderRadius:8,border:`1px solid ${c}33`}}>
                  <div style={{width:3,borderRadius:2,background:c,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:c,marginBottom:2}}>{tit}</div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
                  </div>
                </div>))}
            </div>
          </Card>

          <Card accent={C.dew+"55"}>
            <SectionTitle sub="Clasificación DEW-WSPM para riesgo PM2.5">🌫️ Árbol de Decisión — Primera Capa</SectionTitle>
            <div style={{fontFamily:"monospace",fontSize:12,color:C.muted,lineHeight:2}}>
              <div style={{color:C.dew,fontWeight:700}}>DEW ≤ 0°C ?</div>
              <div style={{marginLeft:16}}>
                <span style={{color:C.good}}>SÍ →</span> <span>Masa seca del norte → PM2.5 bajo</span>
              </div>
              <div style={{marginLeft:16}}>
                <span style={{color:C.bad}}>NO →</span> <span style={{color:C.wspm,fontWeight:700}}>WSPM ≤ 2 m/s ?</span>
              </div>
              <div style={{marginLeft:32}}>
                <span style={{color:C.bad}}>SÍ →</span> <span style={{color:C.bad,fontWeight:700}}>⚠ Riesgo ALTO de acumulación</span>
              </div>
              <div style={{marginLeft:32}}>
                <span style={{color:C.good}}>NO →</span> <span>Dispersión parcial → PM2.5 moderado</span>
              </div>
            </div>
            <div style={{marginTop:12,padding:"8px 10px",background:C.dew+"15",borderRadius:8,border:`1px solid ${C.dew}44`}}>
              <div style={{fontSize:11,color:C.dew,fontWeight:700,marginBottom:3}}>VALIDACIÓN</div>
              <div style={{fontSize:11,color:C.muted}}>Random Forest con DEW como feature principal alcanzó precisión <b style={{color:C.text}}>0.46</b> en clasificación de grados de calidad del aire, superando a modelos lineales simples.</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Scatter conceptual DEW vs PM2.5 */}
      <Card>
        <SectionTitle sub="Cada punto representa el promedio mensual de una estación">📈 Patrón DEW vs PM2.5 — Dispersión Conceptual</SectionTitle>
        <div style={{display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div style={{flex:"1 1 300px",minHeight:180,position:"relative",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.bg}}>
            {/* Cuadrantes */}
            <div style={{position:"absolute",top:0,left:0,right:"50%",bottom:"50%",background:C.good+"08"}}/>
            <div style={{position:"absolute",top:"50%",left:"50%",right:0,bottom:0,background:C.bad+"08"}}/>
            {/* Ejes */}
            <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:C.dim}}/>
            <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:C.dim}}/>
            {/* Labels */}
            <div style={{position:"absolute",bottom:4,left:"50%",transform:"translateX(-50%)",fontSize:10,color:C.dew}}>DEW →</div>
            <div style={{position:"absolute",top:"50%",left:4,transform:"translateY(-50%) rotate(-90deg)",fontSize:10,color:C.bad,whiteSpace:"nowrap"}}>PM2.5 ↑</div>
            {/* Puntos conceptuales */}
            {[
              [30,85,C.bad,"Sur - Invierno"],
              [45,75,C.bad,"Sur - Otoño"],
              [20,60,C.warn,"Centro"],
              [55,45,C.warn,"Centro-Norte"],
              [70,25,C.good,"Norte - Verano"],
              [80,20,C.good,"Dingling"],
              [38,70,C.bad,"Gucheng"],
              [60,40,C.good,"Huairou"],
            ].map(([x,y,c,label])=>(
              <div key={String(label)} title={String(label)} style={{position:"absolute",left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)",width:10,height:10,borderRadius:"50%",background:String(c),opacity:.85,cursor:"help"}}/>
            ))}
            {/* Línea de tendencia */}
            <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}} preserveAspectRatio="none">
              <line x1="10%" y1="85%" x2="90%" y2="15%" stroke={C.dew} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}/>
            </svg>
            <div style={{position:"absolute",top:8,right:8,fontSize:9,color:C.dew}}>r=+0.42</div>
          </div>
          <div style={{flex:"1 1 200px",display:"flex",flexDirection:"column",gap:8}}>
            {[
              [C.bad,"DEW alto + WSPM bajo","PM2.5 muy alto — escenario de riesgo máximo"],
              [C.warn,"DEW moderado","PM2.5 moderado — situación habitual"],
              [C.good,"DEW bajo (masa seca Norte)","PM2.5 reducido — dispersión favorable"],
            ].map(([c,tit,desc])=>(
              <div key={tit} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c,marginTop:2,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:C.text}}>{tit}</div>
                  <div style={{fontSize:10,color:C.muted}}>{desc}</div>
                </div>
              </div>))}
          </div>
        </div>
      </Card>
    </div>);
}

// ── Tab 2: H2 Norte-Sur ──────────────────────────────────────
function TabH2() {
  const regions = {
    "Norte":       ["Dingling","Huairou","Changping"],
    "Norte-Este":  ["Shunyi"],
    "Centro":      ["Aotizhongxin","Guanyuan","Nongzhanguan"],
    "Centro-Sur":  ["Tiantan"],
    "Oeste":       ["Gucheng","Wanliu"],
    "Sur":         ["Dongsi","Wanshouxigong"],
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Banner hipótesis */}
      <div style={{background:`linear-gradient(135deg,${C.north}18,${C.south}18)`,borderRadius:12,padding:"18px 20px",border:`1px solid ${C.south}44`}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{fontSize:28,flexShrink:0}}>🗺️</div>
          <div>
            <div style={{fontSize:11,color:C.south,fontWeight:700,letterSpacing:1,marginBottom:4}}>HIPÓTESIS 2 — DISPARIDAD ESPACIAL NORTE-SUR</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.5}}>
              "El cuadrante sur de Beijing mantiene su condición de zona receptora de emisiones industriales de la provincia de Hebei, manifestándose en medianas de PM2.5 y porcentaje de días críticos sistemáticamente superiores al cuadrante norte."
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
              Validado por boxplots geográficos y perfiles de densidad (violin plots). Las estaciones sur muestran "colas largas" hacia valores altos, reflejando transporte regional desde industrias pesadas de Hebei.
            </div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Gradiente visual */}
        <Card>
          <SectionTitle sub="Gradiente geográfico Norte→Sur (2013-2017)">🏙️ Mapa de Calor Espacial — PM2.5 Promedio</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {Object.entries(regions).map(([region,stations])=>{
              const avgPM = stations.reduce((a,s)=>a+(STATION_META[s]?.pm25||0),0)/stations.length;
              const avgCrit= stations.reduce((a,s)=>a+(STATION_META[s]?.critPct||0),0)/stations.length;
              const rc = REGION_COLOR[region]||C.pred;
              return (
                <div key={region} style={{background:C.bg,borderRadius:9,padding:"10px 14px",border:`1px solid ${rc}44`,borderLeft:`4px solid ${rc}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Badge color={rc}>{region}</Badge>
                      <span style={{fontSize:11,color:C.muted}}>{stations.join(" · ")}</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:pm25Cat(avgPM).c}}>{avgPM.toFixed(1)} µg/m³</span>
                      <span style={{fontSize:11,color:C.muted}}>⚠ {avgCrit.toFixed(1)}%</span>
                    </div>
                  </div>
                  <Bar value={avgCrit} max={25} color={rc} height={5}/>
                </div>);
            })}
          </div>
          <div style={{marginTop:12,padding:"8px 10px",background:C.south+"15",borderRadius:8,border:`1px solid ${C.south}44`,fontSize:11,color:C.muted}}>
            <b style={{color:C.south}}>Sur (Dongsi 17.1%, Wanshouxigong 16.7%)</b> registra casi el doble de días críticos que el <b style={{color:C.north}}>Norte (Dingling 8.1%, Huairou 7.8%)</b>.
          </div>
        </Card>

        {/* Perfil por estación */}
        <Card>
          <SectionTitle>📊 PM2.5 y Días Críticos por Estación</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {Object.entries(STATION_META).sort((a,b)=>b[1].pm25-a[1].pm25).map(([st,m])=>{
              const rc = REGION_COLOR[m.region]||C.pred;
              const cat = pm25Cat(m.pm25);
              return (
                <div key={st} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:rc,flexShrink:0}}/>
                  <div style={{width:90,fontSize:10,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{st}</div>
                  <div style={{flex:1}}><Bar value={m.pm25} max={100} color={cat.c} height={7}/></div>
                  <div style={{width:36,fontSize:11,fontWeight:700,color:cat.c,textAlign:"right",flexShrink:0}}>{m.pm25}</div>
                  <div style={{width:38,fontSize:10,color:m.critPct>15?C.bad:m.critPct>10?C.warn:C.good,textAlign:"right",flexShrink:0}}>{m.critPct.toFixed(1)}%</div>
                </div>);
            })}
          </div>
          <div style={{marginTop:8,display:"flex",gap:12,flexWrap:"wrap"}}>
            {Object.entries(REGION_COLOR).map(([r,c])=>(
              <div key={r} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                <span style={{fontSize:9,color:C.muted}}>{r}</span>
              </div>))}
          </div>
        </Card>
      </div>

      {/* KNN similitud */}
      <Card>
        <SectionTitle sub="Distancia coseno: vecino más cercano de cada estación">🔍 Similitud KNN — Validación Espacial</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:8}}>
          {Object.entries(STATION_META).map(([st,m])=>{
            const rc = REGION_COLOR[m.region]||C.pred;
            const sameRegion = (STATION_META[m.knnBest]?.region||m.region)===m.region;
            return (
              <div key={st} style={{background:C.bg,borderRadius:9,padding:"10px 12px",border:`1px solid ${sameRegion?rc:C.border}`}}>
                <Badge color={rc}>{m.region}</Badge>
                <div style={{fontSize:13,fontWeight:700,color:C.text,margin:"5px 0 2px"}}>{st}</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>PM2.5: {m.pm25} µg/m³</div>
                <div style={{height:1,background:C.dim,marginBottom:5}}/>
                <div style={{fontSize:10,color:C.muted}}>vecino más similar</div>
                <div style={{fontSize:12,fontWeight:700,color:sameRegion?rc:C.warn}}>{m.knnBest}</div>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{m.knnSim}% similitud</div>
                <Bar value={m.knnSim} max={100} color={sameRegion?rc:C.warn} height={4}/>
                {!sameRegion&&<div style={{fontSize:9,color:C.warn,marginTop:3}}>Cruce de regiones</div>}
              </div>);
          })}
        </div>
        <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[[C.good,"Anillo central","Aotizhongxin-Guanyuan: 98.6%. Alta redundancia para triangulación."],[C.bad,"Gucheng Oeste","65.6% con Wanliu. Microclima por montañas occidentales."],[C.south,"Sur receptor","Dongsi-Wanshouxigong: 85.8%. Zona de acumulación de Hebei."]].map(([c,tit,desc])=>(
            <div key={tit} style={{background:c+"12",borderRadius:8,padding:"10px 12px",border:`1px solid ${c}33`}}>
              <div style={{fontSize:12,fontWeight:700,color:c,marginBottom:4}}>{tit}</div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
            </div>))}
        </div>
      </Card>

      {/* Violin */}
      <Card>
        <SectionTitle sub="Distribución Norte vs Sur">Perfil de Distribución por Región</SectionTitle>
        <div style={{display:"flex",gap:14,alignItems:"flex-end",justifyContent:"center",flexWrap:"wrap",padding:"10px 0"}}>
          {[{region:"Norte",pm25:54,p25:20,p75:75,max:180,color:C.north},{region:"Norte-Este",pm25:78,p25:30,p75:110,max:250,color:C.clima},{region:"Centro",pm25:83,p25:35,p75:120,max:300,color:C.pred},{region:"Oeste",pm25:84,p25:38,p75:125,max:320,color:C.warn},{region:"Sur",pm25:85,p25:42,p75:135,max:400,color:C.south}].map(d=>{
            const maxH=180,sc=maxH/450;
            const mY=maxH-d.pm25*sc,p2Y=maxH-d.p25*sc,p7Y=maxH-d.p75*sc,mxY=maxH-d.max*sc,vW=70,bW=40;
            return (
              <div key={d.region} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <svg width={vW} height={maxH+10} style={{overflow:"visible"}}>
                  <path d={`M${vW/2-14},${p2Y} Q${vW/2-26},${(p2Y+mY)/2} ${vW/2-20},${mY} Q${vW/2-28},${(mY+mxY)/2} ${vW/2-10},${mxY} L${vW/2},${mxY-4} L${vW/2+10},${mxY} Q${vW/2+28},${(mY+mxY)/2} ${vW/2+20},${mY} Q${vW/2+26},${(p2Y+mY)/2} ${vW/2+14},${p2Y} Q${vW/2+18},${(p2Y+maxH)/2} ${vW/2+9},${maxH} L${vW/2-9},${maxH} Q${vW/2-18},${(p2Y+maxH)/2} ${vW/2-14},${p2Y} Z`} fill={d.color+"33"} stroke={d.color} strokeWidth={1.5}/>
                  <rect x={vW/2-bW/4} y={p7Y} width={bW/2} height={p2Y-p7Y} fill={d.color+"55"} stroke={d.color} strokeWidth={1}/>
                  <line x1={vW/2-bW/4} y1={mY} x2={vW/2+bW/4} y2={mY} stroke={d.color} strokeWidth={2.5}/>
                </svg>
                <div style={{fontSize:10,color:d.color,fontWeight:700,textAlign:"center"}}>{d.region}</div>
                <div style={{fontSize:9,color:C.muted}}>{d.pm25} µg/m³</div>
              </div>);
          })}
        </div>
        <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:4}}>
          Las colas largas en el sur confirman episodios extremos más frecuentes. Mediana = línea gruesa, IQR = caja.
        </div>
      </Card>
    </div>);
}

// ── Tab H3: Métricas ─────────────────────────────────────────
function TabH3() {
  const [selected,setSelected] = useState("manhattan");
  const selMet = METRIC_BENCH.find(m=>m.name.toLowerCase()===selected)||METRIC_BENCH[0];
  const maxTime = Math.max(...METRIC_BENCH.map(m=>m.time_ms));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`linear-gradient(135deg,${C.pred}18,${C.comp}18)`,borderRadius:12,padding:"18px 20px",border:`1px solid ${C.comp}44`}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{fontSize:28}}>📏</div>
          <div>
            <div style={{fontSize:11,color:C.comp,fontWeight:700,letterSpacing:1,marginBottom:4}}>HIPÓTESIS 3 — MÉTRICA DE DISTANCIA ÓPTIMA PARA ALERTAS</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.5}}>
              La distancia Manhattan (L1) es la métrica óptima para sistemas de alerta en tiempo real: 0.22 ms de respuesta sin sacrificar la sensibilidad para detectar episodios críticos.
            </div>
            <div style={{fontSize:12,color:C.muted}}>Comparativa de 4 métricas: velocidad, robustez ante outliers, y caso de uso en monitoreo de calidad del aire.</div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {METRIC_BENCH.map(m=>{
            const isSel = m.name.toLowerCase()===selected;
            return (
              <div key={m.name} onClick={()=>setSelected(m.name.toLowerCase())}
                style={{background:C.card,borderRadius:12,padding:"14px 16px",border:`2px solid ${isSel?(m.best?C.good:C.pred):C.border}`,cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <span style={{fontSize:22}}>{m.icon}</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:C.text}}>{m.name} <span style={{fontSize:10,color:C.muted}}>({m.alias})</span></div>
                      <div style={{fontSize:11,color:C.muted}}>{m.use}</div>
                    </div>
                  </div>
                  {m.best&&<Badge color={C.good}>Más rápida</Badge>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Tiempo (ms)</div>
                    <Bar value={m.time_ms} max={maxTime} color={m.best?C.good:C.pred} height={7}/>
                    <div style={{fontSize:12,fontWeight:700,color:m.best?C.good:C.text,marginTop:2}}>{m.time_ms} ms</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Robustez</div>
                    <Bar value={m.robustness} max={100} color={C.clima} height={7}/>
                    <div style={{fontSize:12,fontWeight:700,color:C.clima,marginTop:2}}>{m.robustness}%</div>
                  </div>
                </div>
              </div>);
          })}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card accent={C.good+"55"}>
            <div style={{fontSize:11,color:C.good,fontWeight:700,marginBottom:8}}>MÉTRICA SELECCIONADA</div>
            <div style={{fontSize:22,fontWeight:800,color:C.text,marginBottom:4}}>{selMet.icon} {selMet.name}</div>
            <div style={{fontFamily:"monospace",fontSize:13,padding:"10px 14px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`,color:C.dew,marginBottom:12}}>
              {selMet.name==="Manhattan"  && "d(u,v) = Sigma |ui - vi|"}
              {selMet.name==="Coseno"     && "d(u,v) = 1 - (u·v) / (|u|·|v|)"}
              {selMet.name==="Euclidiana" && "d(u,v) = sqrt( Sigma (ui-vi)^2 )"}
              {selMet.name==="Pearson"    && "d(u,v) = 1 - corr(u, v)"}
            </div>
            {[["Tiempo",`${selMet.time_ms} ms`,selMet.best?C.good:C.pred],["Robustez",`${selMet.robustness}%`,C.clima],["Uso",selMet.use,C.muted]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.dim}`}}>
                <span style={{color:C.muted}}>{l}</span><span style={{color:c,fontWeight:600}}>{v}</span>
              </div>))}
          </Card>

          <Card>
            <SectionTitle>Benchmark de Velocidad</SectionTitle>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...METRIC_BENCH].sort((a,b)=>a.time_ms-b.time_ms).map(m=>(
                <div key={m.name} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:80,fontSize:11,color:m.best?C.good:C.text,fontWeight:m.best?700:400,textAlign:"right",flexShrink:0}}>{m.name}</div>
                  <div style={{flex:1}}><Bar value={m.time_ms} max={maxTime} color={m.best?C.good:C.pred} height={14}/></div>
                  <div style={{width:48,fontSize:11,color:m.best?C.good:C.text,fontWeight:700,flexShrink:0}}>{m.time_ms} ms</div>
                </div>))}
            </div>
            <div style={{marginTop:10,padding:"8px 10px",background:C.good+"12",borderRadius:8,fontSize:11,color:C.muted}}>
              Manhattan es 2.6x más rápida que Pearson. En 12 estaciones con datos cada minuto: 42 ms menos de latencia por ciclo.
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle sub="Guía de selección para monitoreo de calidad del aire">Cuándo usar cada métrica</SectionTitle>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["Métrica","Fórmula","Ideal para...","Limitaciones","Uso"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"8px 10px",color:C.muted,fontWeight:600,fontSize:11}}>{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {[["Manhattan","L1","Alertas tiempo real. Robusto outliers.","No captura similitud angular.","Alertas"],["Coseno","Angular","Mismo patrón de comportamiento.","Ignora magnitud absoluta.","Similitud"],["Euclidiana","L2","Diferencia real de concentraciones.","Sensible a outliers y escala.","Predicción"],["Pearson","Correlación","Tendencias lineales entre sensores.","Más lenta. Solo lineal.","Validación"]].map(([m,f,pro,con,rec])=>(
              <tr key={m} style={{borderBottom:`1px solid ${C.dim}`}}>
                <td style={{padding:"8px 10px",fontWeight:700,color:m==="Manhattan"?C.good:m==="Coseno"?C.pred:C.text}}>{m}</td>
                <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11,color:C.dew}}>{f}</td>
                <td style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{pro}</td>
                <td style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{con}</td>
                <td style={{padding:"8px 10px"}}><Badge color={m==="Manhattan"||m==="Coseno"?C.good:C.muted}>{rec}</Badge></td>
              </tr>))}
          </tbody>
        </table>
      </Card>
    </div>);
}

// ── Tab KNN Interactivo ───────────────────────────────────────
function TabKNN({data,profiles,results,target,setTarget,period,setPeriod,metric,setMetric,k,setK,featMask,setFeatMask,runKNN}) {
  if (!data) return null;
  const tgtProfile = profiles[target]||{vec:FEATURES.map(()=>0),id:"",critPct:0};
  const tgtCat     = pm25Cat(tgtProfile.vec[0]);
  const radarVecs  = [tgtProfile,...results.slice(0,2)].map(p=>(p.vec||FEATURES.map(()=>0)).slice(0,6));
  const radarColors= [C.pred,C.clima,C.good];

  // El período actual (2022-26) proviene de UN ÚNICO punto de monitoreo (ciudad completa).
  // Python usa FEATURES_CURR=["PM2.5"] y solo procesa 1 "estación" (Beijing).
  // En el dashboard redistribuimos los datos x12 estaciones sintéticas con el MISMO valor →
  // todos los perfiles son idénticos → KNN entre estaciones es inválido para curr.
  const currDisabled = period === "curr";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Nota metodológica crítica cuando se selecciona curr */}
      {currDisabled && (
        <div style={{background:"#7c3aed22",border:"1px solid #7c3aed66",borderRadius:10,padding:"12px 16px",fontSize:12,color:"#c4b5fd",lineHeight:1.7}}>
          <b>⚠️ Limitación del período 2022-26:</b> El dataset Open-Meteo proporciona un único punto
          de monitoreo para toda la ciudad de Beijing (sin datos por estación individual). El análisis
          Python original usa <code style={{background:"#ffffff15",padding:"1px 5px",borderRadius:3}}>FEATURES_CURR = ["PM2.5"]</code> con
          una sola región. <br/>Al distribuir los mismos datos en 12 estaciones sintéticas, todos los
          perfiles son idénticos → el KNN entre estaciones <b>no tiene validez estadística</b>.<br/>
          <b>Recomendación:</b> Usa el período <span style={{color:C.pred}}>2013-2017</span> para análisis KNN por estación. El período actual es válido solo para <i>comparativa temporal</i> (tab "Comparativa Períodos").
        </div>
      )}
      <Card style={{opacity: currDisabled ? 0.6 : 1}}>
        <SectionTitle>Configuracion KNN</SectionTitle>
        <div style={{display:"flex",flexWrap:"wrap",gap:14,alignItems:"flex-end"}}>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Periodo</div>
            <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="hist">2013-2017 Historico ✓</option><option value="curr">2022-2026 Actual ⚠️</option></select></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Estacion Target</div>
            <select value={target} onChange={e=>setTarget(+e.target.value)}>{STATIONS.map((s,i)=><option key={i} value={i}>{s}</option>)}</select></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Metrica</div>
            <select value={metric} onChange={e=>setMetric(e.target.value)}><option value="coseno">Coseno</option><option value="pearson">Pearson</option><option value="euclidiana">Euclidiana</option><option value="manhattan">Manhattan</option></select></div>
          <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>K vecinos</div>
            <input type="number" min={1} max={11} value={k} onChange={e=>setK(Math.max(1,Math.min(11,+e.target.value)))} style={{width:60}}/></div>
          <button onClick={runKNN} style={{background:`linear-gradient(135deg,${C.pred},#8b5cf6)`,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700}}>Calcular KNN</button>
        </div>
        <div style={{marginTop:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Variables activas:</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {FEATURES.map((f,i)=>(
              <button key={f} onClick={()=>setFeatMask(prev=>{const n=[...prev];n[i]=!n[i];return n;})}
                style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${featMask[i]?C.pred:C.border}`,background:featMask[i]?C.pred+"22":C.bg,color:featMask[i]?C.pred:C.muted,fontSize:11,fontWeight:featMask[i]?700:400}}>
                {FEAT_LABELS[i]}
              </button>))}
          </div>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
        <Card accent={C.pred+"66"}>
          <div style={{fontSize:11,color:C.pred,fontWeight:700,marginBottom:8,letterSpacing:1}}>ESTACION TARGET</div>
          <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:4}}>{tgtProfile.id}</div>
          <div style={{fontSize:24,fontWeight:700,color:tgtCat.c,marginBottom:4}}>{tgtProfile.vec[0].toFixed(1)} <span style={{fontSize:12}}>µg/m3</span></div>
          <Badge color={tgtCat.c}>{tgtCat.l}</Badge>
          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
            {[["NO2",3,C.bad,200],["SO2",2,"#f97316",50],["Viento",9,C.clima,14],["Rocio",8,C.dew,35]].map(([lb,fi,c,mx])=>(
              <div key={lb}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:2}}>
                  <span>{lb}</span><span>{(tgtProfile.vec[fi]||0).toFixed(1)}</span>
                </div>
                <Bar value={Math.max(0,tgtProfile.vec[fi]||0)} max={mx} color={c} height={5}/>
              </div>))}
            <div style={{fontSize:11,color:tgtProfile.critPct>20?C.bad:tgtProfile.critPct>10?C.warn:C.good,marginTop:4}}>
              {tgtProfile.critPct.toFixed(1)}% dias criticos
            </div>
          </div>
        </Card>
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>
            Top-{k} vecinos de <span style={{color:C.pred}}>{tgtProfile.id}</span>
          </div>
          {results.length===0
            ?<div style={{color:C.muted,textAlign:"center",padding:32}}>Ejecuta KNN para ver vecinos</div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>{results.slice(0,k).map((p,i)=><NeighborCard key={p.id} p={p} rank={i+1} targetVec={tgtProfile.vec} metric={metric}/>)}</div>}
        </Card>
      </div>

      {results.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:16}}>
          <Card>
            <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8,textAlign:"center"}}>Radar Multicontaminante</div>
            <div style={{display:"flex",justifyContent:"center"}}>
              <Radar vecs={radarVecs} labels={FEAT_LABELS.slice(0,6)} colors={radarColors} size={170}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:8}}>
              {[tgtProfile,...results.slice(0,2)].map((p,i)=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:radarColors[i],flexShrink:0}}/>
                  <span style={{fontSize:10,color:C.muted}}>{p.id?.slice(0,12)}</span>
                </div>))}
            </div>
          </Card>
          <Card>
            <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12}}>
              Similitud con <span style={{color:C.pred}}>{tgtProfile.id}</span>
            </div>
            <VBar data={profiles.map((p,i)=>({label:p.id.slice(0,7),value:i===target?100:(1/(1+(knn(target,profiles,11,metric,featMask).find(r=>r.si===i)?.dist||Infinity)))*100,color:i===target?C.pred:undefined}))} color={C.pred+"88"} h={150}/>
            <div style={{fontSize:10,color:C.muted,marginTop:4,textAlign:"center"}}>% similitud por estacion</div>
          </Card>
        </div>)}
    </div>);
}

// Agrupación de barras Hist vs Curr por mes (sin superposición)
function GroupedMonthBars({mH,mC,fi,colorH,colorC,maxVal,h=110}) {
  const [mounted,setMounted] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setMounted(true),80); return ()=>clearTimeout(t); },[]);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:h+24}}>
      {mH.map((m,idx)=>{
        const vH = m.vec[fi] || 0;
        const vC = (mC[idx]?.vec[fi]) || 0;
        const bH = mounted ? Math.max(2,(vH/maxVal)*(h-4)) : 0;
        const bC = mounted ? Math.max(2,(vC/maxVal)*(h-4)) : 0;
        return (
          <div key={idx} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{display:"flex",gap:1,alignItems:"flex-end",height:h-4}}>
              <div title={`2013-17: ${vH.toFixed(1)}`}
                style={{flex:1,height:bH,background:colorH,borderRadius:"2px 2px 0 0",minWidth:3,transition:"height .6s cubic-bezier(.34,1.56,.64,1)"}}/>
              <div title={`2022-26: ${vC.toFixed(1)}`}
                style={{flex:1,height:bC,background:colorC,borderRadius:"2px 2px 0 0",minWidth:3,transition:"height .6s cubic-bezier(.34,1.56,.64,1)"}}/>
            </div>
            <span style={{fontSize:8,color:C.muted,marginTop:2}}>{m.label}</span>
          </div>);
      })}
    </div>);
}

// ── Tab Temporal ─────────────────────────────────────────────
function TabTemporal({data}) {
  const [tempSt,setTempSt] = useState(0);
  if (!data) return null;
  const tempStation = STATIONS[tempSt];
  const mH = monthProfile(data.hist,tempStation);
  const mC = monthProfile(data.curr,tempStation);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:700}}>Patrones temporales</span>
          <select value={tempSt} onChange={e=>setTempSt(+e.target.value)}>
            {STATIONS.map((s,i)=><option key={i} value={i}>{s}</option>)}
          </select>
          <span style={{fontSize:11,color:C.muted}}><span style={{color:C.pred}}>■</span> 2013-17 <span style={{color:C.good}}>■</span> 2022-26</span>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {SEASONAL_DATA.map(s=>{
          const c=s.changeDir==="↑"?C.bad:C.good;
          return (
            <div key={s.season} style={{background:C.card,borderRadius:12,padding:"14px 16px",border:`1px solid ${c}44`,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:6}}>{s.icon}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>{s.season}</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:10}}>{s.months}</div>
              <div style={{display:"flex",justifyContent:"space-around",marginBottom:10}}>
                <div><div style={{fontSize:10,color:C.muted}}>2013-17</div><div style={{fontSize:14,fontWeight:700,color:C.pred}}>{s.hist}</div></div>
                <div><div style={{fontSize:10,color:C.muted}}>2022-26</div><div style={{fontSize:14,fontWeight:700,color:C.good}}>{s.curr}</div></div>
              </div>
              <div style={{padding:"5px 10px",background:c+"15",borderRadius:8}}>
                <span style={{fontSize:13,fontWeight:800,color:c}}>{s.changeDir}{s.changePct}%</span>
              </div>
            </div>);})}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* PM2.5 y PM10: ambas features están en hist Y curr (Open-Meteo tiene pm10) */}
        {([["PM2.5",0,C.bad],["PM10",1,C.clima]] as [string,number,string][]).map(([lb,fi,c])=>{
          const maxVal = Math.max(...mH.map(x=>x.vec[fi]),...mC.map(x=>x.vec[fi]),1);
          return (
            <Card key={lb}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>{lb} mensual — {tempStation}</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:6,display:"flex",gap:12}}>
                <span><span style={{color:C.pred}}>■</span> 2013-17 (hist)</span>
                <span><span style={{color:c}}>■</span> 2022-26 (aprox. ciudad)</span>
              </div>
              <GroupedMonthBars mH={mH} mC={mC} fi={fi} colorH={C.pred+"bb"} colorC={c} maxVal={maxVal} h={110}/>
            </Card>);
        })}
      </div>

      <Card>
        <SectionTitle sub={"¿A qué mes histórico se parece cada mes de 2022-26? (PM2.5 · " + tempStation + ")"}>KNN temporal entre períodos</SectionTitle>
        <div style={{fontSize:10,color:C.muted,marginBottom:10,background:C.bg,borderRadius:6,padding:"6px 10px"}}>
          ℹ️ El período actual proviene de un único sensor de ciudad — los valores por estación son aproximados. La similitud refleja el <b>patrón estacional</b>, no diferencias por zona.
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {mH.map((mh,mi)=>{
            if(!mh.vec.some(v=>v>0)) return null;
            const normH=zscore(mH.map(m=>m.vec));
            const normC=zscore(mC.map(m=>m.vec));
            const dists=normC.map((vc,ci)=>({label:mC[ci].label,d:cosine(normH[mi],vc)}));
            dists.sort((a,b)=>a.d-b.d);
            const best=dists[0];
            const sim=(1/(1+best.d)*100).toFixed(0);
            return (
              <div key={mi} style={{background:C.bg,borderRadius:9,padding:"10px 12px",border:`1px solid ${C.border}`,minWidth:90,flex:"1 1 90px"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.pred,marginBottom:3}}>Hist. {mh.label}</div>
                <div style={{fontSize:12,color:C.text}}>aprox. <b>{best.label}</b></div>
                <div style={{fontSize:10,color:C.muted}}>{sim}%</div>
                <Bar value={+sim} max={100} color={C.pred} height={4}/>
              </div>);})}
        </div>
      </Card>
    </div>);
}

// ── Tab Comparativa ──────────────────────────────────────────
function TabCompare({data}) {
  if (!data) return null;

  // Usar datos curr originales (sin duplicación x12 estaciones) para comparativa correcta
  const currRaw = (data as any).currRaw || data.curr.filter(r => r.stIdx === 0);
  const histAll = data.hist;

  const avg=(arr,p)=>arr.length?arr.reduce((a,r)=>a+(r[p]||0),0)/arr.length:0;
  const avgH=avg(histAll,"PM2.5"), avgC=avg(currRaw,"PM2.5");
  const imp=((avgH-avgC)/Math.max(avgH,1)*100).toFixed(1);
  const critH=histAll.filter(r=>r.critical).length;
  const critC=currRaw.filter(r=>r.critical).length;
  const critRedPct=((critH/Math.max(histAll.length,1)-critC/Math.max(currRaw.length,1))*100).toFixed(1);

  // Promedios mensuales
  const monthlyH = MONTHS.map((_,m)=>{
    const recs=histAll.filter(r=>r.month===m&&(r["PM2.5"]||0)>0);
    return recs.length?recs.reduce((a,r)=>a+r["PM2.5"],0)/recs.length:0;
  });
  const monthlyC = MONTHS.map((_,m)=>{
    const recs=currRaw.filter(r=>r.month===m&&(r["PM2.5"]||0)>0);
    return recs.length?recs.reduce((a,r)=>a+r["PM2.5"],0)/recs.length:0;
  });
  const maxMon = Math.max(...monthlyH,...monthlyC,1);

  // Distribución AQI
  const aqiBucket=(v)=>v<=35?"Bueno":v<=75?"Moderado":v<=115?"Insal.S":v<=150?"Insalubre":"Crítico";
  const aqiColors:Record<string,string>={Bueno:"#4ade80",Moderado:"#a3e635","Insal.S":"#facc15",Insalubre:"#f97316","Crítico":"#f87171"};
  const aqiLabels=["Bueno","Moderado","Insal.S","Insalubre","Crítico"];
  const aqiDist=(recs)=>aqiLabels.map(l=>({l,pct:recs.filter(r=>aqiBucket(r["PM2.5"]||0)===l).length/Math.max(recs.length,1)*100}));
  const distH=aqiDist(histAll), distC=aqiDist(currRaw);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Nota contextual */}
      <div style={{background:"#1e3a5f22",border:"1px solid #38bdf844",borderRadius:10,padding:"10px 16px",fontSize:12,color:"#93c5fd",lineHeight:1.6}}>
        <b>ℹ️ Nota metodológica:</b> El período 2022-26 proviene de Open-Meteo API, un único punto de monitoreo
        agregado para Beijing. La comparación por estación individual no es posible sin datos por ubicación.
        Este panel compara los dos períodos a nivel de <b>tendencia mensual</b> y <b>distribución de categorías AQI</b>.
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:12}}>
        {[
          ["PM2.5 Histórico", avgH.toFixed(1)+" µg/m³", pm25Cat(avgH).c],
          ["PM2.5 Actual",    avgC.toFixed(1)+" µg/m³", pm25Cat(avgC).c],
          ["Mejora neta",     "↓ "+imp+"%",              C.good],
          ["Días críticos hist.", ((critH/Math.max(histAll.length,1))*100).toFixed(1)+"%", C.bad],
          ["Días críticos act.",  ((critC/Math.max(currRaw.length,1))*100).toFixed(1)+"%", C.warn],
          ["Reducción críticos",  "↓ "+critRedPct+" pp", C.good],
        ].map(([l,v,c])=>(
          <div key={String(l)} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${String(c)}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:String(c)}}>{v}</div>
          </div>))}
      </div>

      {/* Tendencia mensual comparativa */}
      <Card>
        <SectionTitle sub="Promedio PM2.5 por mes — todos los registros disponibles">Tendencia Mensual: 2013-17 vs 2022-26</SectionTitle>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:160,marginBottom:4}}>
          {MONTHS.map((lbl,m)=>{
            const vh=monthlyH[m], vc=monthlyC[m];
            const bh=(v:number)=>Math.max(6,(v/maxMon)*140);
            return (
              <div key={lbl} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{display:"flex",gap:2,alignItems:"flex-end",height:140}}>
                  <div style={{width:"45%",height:bh(vh),background:C.pred+"bb",borderRadius:"3px 3px 0 0"}} title={`Hist: ${vh.toFixed(1)}`}/>
                  <div style={{width:"45%",height:bh(vc),background:C.good,borderRadius:"3px 3px 0 0"}} title={`Act: ${vc.toFixed(1)}`}/>
                </div>
                <span style={{fontSize:9,color:C.muted}}>{lbl}</span>
              </div>);
          })}
        </div>
        <div style={{fontSize:10,color:C.muted,textAlign:"center",marginTop:4}}>
          <span style={{color:C.pred}}>■</span> 2013-17 (horario·12 est.)&nbsp;&nbsp;
          <span style={{color:C.good}}>■</span> 2022-26 (diario·Open-Meteo)
        </div>
      </Card>

      {/* Comparación estacional */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {SEASONAL_DATA.map(s=>{
          const c=s.changeDir==="↑"?C.bad:C.good;
          return (
            <div key={s.season} style={{background:C.card,borderRadius:12,padding:"14px 16px",border:`1px solid ${c}44`,textAlign:"center"}}>
              <div style={{fontSize:26,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{s.season}</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>{s.months}</div>
              <div style={{display:"flex",justifyContent:"space-around",marginBottom:8}}>
                <div><div style={{fontSize:9,color:C.muted}}>2013-17</div><div style={{fontSize:14,fontWeight:700,color:C.pred}}>{s.hist}</div></div>
                <div><div style={{fontSize:9,color:C.muted}}>2022-26</div><div style={{fontSize:14,fontWeight:700,color:C.good}}>{s.curr}</div></div>
              </div>
              <div style={{padding:"5px 10px",background:c+"18",borderRadius:8}}>
                <span style={{fontSize:14,fontWeight:800,color:c}}>{s.changeDir}{s.changePct}%</span>
              </div>
            </div>);
        })}
      </div>

      {/* Distribución AQI lado a lado */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {[["2013-17 (histórico)",distH,C.pred],["2022-26 (actual)",distC,C.good]].map(([title,dist,accent])=>(
          <Card key={String(title)}>
            <div style={{fontSize:13,fontWeight:700,color:String(accent),marginBottom:14}}>{String(title)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(dist as any[]).map(({l,pct})=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:60,fontSize:10,color:C.muted,textAlign:"right",flexShrink:0}}>{l}</div>
                  <div style={{flex:1}}><Bar value={pct} max={100} color={aqiColors[l]} height={8}/></div>
                  <div style={{width:38,fontSize:11,fontWeight:700,color:aqiColors[l],textAlign:"right"}}>{pct.toFixed(1)}%</div>
                </div>))}
            </div>
          </Card>))}
      </div>
    </div>);
}

// ── Tab H4: Bimodalidad ────────────────────────────────────
function TabH4() {
  const [zone, setZone] = useState(0);
  const [season, setSeason] = useState<"winter"|"summer">("winter");
  const z = H4_ZONES[zone];
  const buckets = season==="winter" ? z.winter : z.summer;
  const maxV = Math.max(...buckets.map(b=>b.v));
  const verdict = zone===0&&season==="winter";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`${C.pred}18`,borderRadius:12,padding:"14px 18px",borderLeft:`4px solid ${C.pred}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.pred,marginBottom:4}}>H4 — Bimodalidad en distribución PM2.5</div>
        <div style={{fontSize:12,color:"#c9d1d9",lineHeight:1.7}}>
          La distribución diaria de PM2.5 exhibe una estructura bimodal diferenciada por zona y estación:
          una moda en niveles limpios (~30 µg/m³) y una segunda en niveles insalubres (~140 µg/m³).
        </div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        {H4_ZONES.map((z,i)=>(
          <button key={z.zone} onClick={()=>setZone(i)}
            style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${i===zone?C.pred:C.border}`,
              background:i===zone?`${C.pred}22`:"none",color:i===zone?C.pred:C.muted,fontWeight:i===zone?700:400,fontSize:12}}>
            {z.zone}
          </button>))}
        <div style={{height:20,width:1,background:C.border}}/>
        {(["winter","summer"] as const).map(s=>(
          <button key={s} onClick={()=>setSeason(s)}
            style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${s===season?C.clima:C.border}`,
              background:s===season?`${C.clima}22`:"none",color:s===season?C.clima:C.muted,fontWeight:s===season?700:400,fontSize:12}}>
            {s==="winter"?"❄️ Invierno":"☀️ Verano"}
          </button>))}
      </div>
      <Card>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12}}>
          Densidad PM2.5 — Zona {z.zone} · {season==="winter"?"Invierno":"Verano"}
          {verdict && <span style={{marginLeft:10,fontSize:11,color:C.good}}>← bimodalidad más pronunciada aquí</span>}
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:150,marginBottom:8}}>
          {buckets.map((b,i)=>{
            const bh=Math.max(8,(b.v/maxV)*130);
            const isSecondMode = i===5&&season==="winter"&&zone===0;
            return (
              <div key={b.x} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",height:bh,background:isSecondMode?C.bad:C.pred,borderRadius:"3px 3px 0 0",opacity:.85,
                  boxShadow:isSecondMode?`0 0 8px ${C.bad}88`:"none"}}/>
                <span style={{fontSize:9,color:C.muted,textAlign:"center"}}>{b.x}</span>
              </div>);
          })}
        </div>
        <div style={{fontSize:10,color:C.muted,textAlign:"center"}}>Concentración PM2.5 µg/m³ (frecuencia relativa)</div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${C.good}`}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Moda "Limpia" (Norte-Invierno)</div>
          <div style={{fontSize:22,fontWeight:800,color:C.good}}>~30 µg/m³</div>
        </div>
        <div style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${C.bad}`}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Moda "Crítica" (Norte-Invierno)</div>
          <div style={{fontSize:22,fontWeight:800,color:C.bad}}>~140 µg/m³</div>
        </div>
      </div>
      <div style={{background:`${C.warn}18`,border:`1px solid ${C.warn}44`,borderRadius:10,padding:"12px 16px",fontSize:12,color:"#fde68a"}}>
        <b>◑ Veredicto: Parcialmente Confirmada.</b> La bimodalidad es clara en zona norte-invierno.
        En zona sur, el modo "crítico" domina tanto que aplana al limpio. En verano, todas las zonas son unimodales.
        La bimodalidad es estacional, no estructural permanente.
      </div>
    </div>);
}

// ── Tab H5: Moderación del Viento ─────────────────────────
function TabH5() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`${C.good}18`,borderRadius:12,padding:"14px 18px",borderLeft:`4px solid ${C.good}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.good,marginBottom:4}}>H5 — Dirección del Viento como Moderador</div>
        <div style={{fontSize:12,color:"#c9d1d9",lineHeight:1.7}}>
          La correlación entre el punto de rocío (DEWP) y PM2.5 varía según la dirección del viento:
          los vientos del sur amplifican la relación transportando emisiones de Hebei.
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Correlación Pearson DEWP → PM2.5 por grupo de viento</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {H5_WIND_CORR.map(w=>(
              <div key={w.group}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,color:C.text}}>{w.group}</span>
                  <span style={{fontSize:14,fontWeight:800,color:w.color}}>r = {w.r.toFixed(2)}</span>
                </div>
                <Bar value={w.r} max={0.7} color={w.color} height={10}/>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>{w.desc}</div>
              </div>))}
          </div>
        </Card>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Interpretación del Efecto Moderador</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {H5_WIND_CORR.map((w,i)=>(
              <div key={w.group} style={{background:C.bg,borderRadius:9,padding:"12px 14px",borderLeft:`3px solid ${w.color}`}}>
                <div style={{fontSize:11,fontWeight:700,color:w.color,marginBottom:2}}>
                  {i===0?"🧊":i===1?"🌀":"🔥"} {w.group}
                </div>
                <div style={{fontSize:12,color:C.text}}>r = <b>{w.r}</b></div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{w.desc}</div>
              </div>))}
          </div>
        </Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[["Diferencia total entre extremos","0.27",C.pred,"Norte vs Sur en coeficiente de correlación"],
          ["Amplificación viento sur","+97%",C.bad,"Respecto al viento del norte (0.28→0.55)"],
          ["Paso EDA","5 — Relaciones Bivariadas",C.good,"Moderación confirmada estadísticamente"]
        ].map(([l,v,c,d])=>(
          <div key={String(l)} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${String(c)}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:String(c)}}>{v}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{d}</div>
          </div>))}
      </div>
      <div style={{background:`${C.good}18`,border:`1px solid ${C.good}44`,borderRadius:10,padding:"12px 16px",fontSize:12,color:"#bbf7d0"}}>
        <b>✔ Confirmada.</b> El viento del sur produce r = 0.55 vs r = 0.28 del norte — una diferencia de 0.27 en el
        coeficiente de Pearson. La dirección del viento actúa como moderador significativo de la relación DEWP→PM2.5.
      </div>
    </div>);
}

// ── Tab H6: PCA ───────────────────────────────────────────
function TabH6() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`${C.bad}18`,borderRadius:12,padding:"14px 18px",borderLeft:`4px solid ${C.bad}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.bad,marginBottom:4}}>H6 — Estructura Latente vía PCA</div>
        <div style={{fontSize:12,color:"#c9d1d9",lineHeight:1.7}}>
          Dos componentes principales capturan ≥60% de la varianza de las 10 variables ambientales,
          separando un eje de "carga contaminante" de un eje "meteorológico".
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Varianza Explicada por Componente</div>
          {/* Chart height=180 with overflow:hidden so bars never escape the card */}
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:180,overflow:"hidden",marginBottom:8}}>
            {H6_PCA.map((pc,i)=>{
              const bh=Math.max(8,Math.min(150,(pc.var/80)*150));
              const colors=[C.bad,C.pred,"#a78bfa"];
              return (
                <div key={pc.pc} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:12,fontWeight:700,color:colors[i]}}>{pc.var}%</div>
                  <div style={{width:"100%",height:bh,background:colors[i],borderRadius:"4px 4px 0 0",opacity:.85}}/>
                  <span style={{fontSize:10,color:C.muted}}>{pc.pc}</span>
                  <span style={{fontSize:9,color:C.muted,textAlign:"center"}}>{pc.label}</span>
                </div>);
            })}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:12,fontWeight:700,color:C.good}}>{(38.7+24.1+12.4).toFixed(1)}%</div>
              <div style={{width:"100%",height:Math.min(150,Math.round((75.2/80)*150)),background:`linear-gradient(180deg,${C.bad},${C.pred},#a78bfa)`,borderRadius:"4px 4px 0 0",opacity:.6}}/>
              <span style={{fontSize:10,color:C.muted}}>Total</span>
              <span style={{fontSize:9,color:C.muted,textAlign:"center"}}>3 componentes</span>
            </div>
          </div>
          <div style={{height:1,background:C.border,marginBottom:8}}/>
          <div style={{fontSize:11,color:C.good,fontWeight:700}}>PC1+PC2 = 62.8% ✔ supera umbral del 60%</div>
        </Card>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12}}>Variables Dominantes por Componente</div>
          {H6_PCA.map((pc,i)=>{
            const colors=[C.bad,C.pred,"#a78bfa"];
            return (
              <div key={pc.pc} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:colors[i],marginBottom:6}}>{pc.pc} — {pc.label} ({pc.var}%)</div>
                {pc.load.map(l=>(
                  <div key={l.v} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{width:36,fontSize:10,color:C.muted,textAlign:"right"}}>{l.v}</span>
                    <div style={{flex:1}}><Bar value={Math.abs(l.w)} max={1} color={colors[i]} height={6}/></div>
                    <span style={{fontSize:10,fontWeight:700,color:colors[i],width:32,textAlign:"right"}}>{l.w>0?"+":""}{l.w.toFixed(2)}</span>
                  </div>))}
              </div>);
          })}
        </Card>
      </div>
      <div style={{background:`${C.good}18`,border:`1px solid ${C.good}44`,borderRadius:10,padding:"12px 16px",fontSize:12,color:"#bbf7d0"}}>
        <b>✔ Confirmada.</b> PC1 (38.7%) captura la carga contaminante general; PC2 (24.1%) el régimen meteorológico.
        Juntos explican el 62.8% de la varianza — el sistema ambiental de Beijing opera principalmente bajo 2 regímenes latentes.
      </div>
    </div>);
}

// ── Tab H7: Markov ────────────────────────────────────────
function TabH7() {
  const colors={Limpio:C.good,Moderado:"#facc15",Crítico:C.bad};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`${C.pred}18`,borderRadius:12,padding:"14px 18px",borderLeft:`4px solid ${C.pred}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.pred,marginBottom:4}}>H7 — Persistencia Temporal (Cadenas de Markov)</div>
        <div style={{fontSize:12,color:"#c9d1d9",lineHeight:1.7}}>
          Los estados de calidad del aire (Limpio ≤50, Moderado 51-150, Crítico &gt;150 µg/m³) exhiben alta
          autocorrelación temporal: un episodio crítico tiene 52.5% de probabilidad de continuar al día siguiente.
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Matriz de Transición de Markov (1er orden)</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr>
                  <th style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontSize:10}}>Desde ↓ · Hacia →</th>
                  {H7_MARKOV.states.map(s=>(
                    <th key={s} style={{padding:"6px 10px",textAlign:"center",color:colors[s],fontSize:11}}>{s}</th>))}
                </tr>
              </thead>
              <tbody>
                {H7_MARKOV.matrix.map((row,ri)=>(
                  <tr key={ri} style={{borderTop:`1px solid ${C.border}`}}>
                    <td style={{padding:"8px 10px",color:colors[H7_MARKOV.states[ri]],fontWeight:700,fontSize:11}}>{H7_MARKOV.states[ri]}</td>
                    {row.map((val,ci)=>{
                      const isDiag = ri===ci;
                      return (
                        <td key={ci} style={{padding:"8px 10px",textAlign:"center",
                          background:isDiag?`${colors[H7_MARKOV.states[ri]]}22`:"transparent",
                          fontWeight:isDiag?800:400,
                          color:isDiag?colors[H7_MARKOV.states[ri]]:C.muted,fontSize:13}}>
                          {val}%
                        </td>);
                    })}
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Distribución de Estados (% días)</div>
          {H7_MARKOV.stateDist.map(s=>(
            <div key={s.s} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:s.color,fontWeight:700}}>{s.s}</span>
                <span style={{fontSize:14,fontWeight:800,color:s.color}}>{s.pct}%</span>
              </div>
              <Bar value={s.pct} max={55} color={s.color} height={10}/>
            </div>))}
          <div style={{height:1,background:C.border,margin:"12px 0"}}/>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
            Los episodios <span style={{color:C.bad,fontWeight:700}}>Críticos</span> persisten en promedio <b style={{color:C.text}}>2+ días consecutivos</b>.
            El estado <span style={{color:"#facc15",fontWeight:700}}>Moderado</span> tiene 19.5% de transitar a Crítico — la ventana de alerta preventiva.
          </div>
        </Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[["Limpio→Limpio","62.6%",C.good,"Alta persistencia de días limpios"],
          ["Crítico→Crítico","52.5%",C.bad,"Episodios críticos duran 2+ días"],
          ["Moderado→Crítico","19.5%",C.warn,"Ventana de alerta preventiva crítica"],
        ].map(([l,v,c,d])=>(
          <div key={String(l)} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${String(c)}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:24,fontWeight:800,color:String(c)}}>{v}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{d}</div>
          </div>))}
      </div>
      <div style={{background:`${C.good}18`,border:`1px solid ${C.good}44`,borderRadius:10,padding:"12px 16px",fontSize:12,color:"#bbf7d0"}}>
        <b>✔ Confirmada.</b> La diagonal principal (62.6%, 58.1%, 52.5%) confirma alta autocorrelación temporal.
        Implicación de política: las restricciones deben activarse al detectar estado Moderado, no al llegar a Crítico.
      </div>
    </div>);
}

// ── Tab H8: Desbalance AQI ────────────────────────────────
function TabH8() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:`${C.clima}18`,borderRadius:12,padding:"14px 18px",borderLeft:`4px solid ${C.clima}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.clima,marginBottom:4}}>H8 — Desbalance Severo de Clases AQI</div>
        <div style={{fontSize:12,color:"#c9d1d9",lineHeight:1.7}}>
          La zona sur en invierno presenta solo 8.2% de días en categoría "Bueno" vs 58.7% en zona norte en verano.
          Entrenar modelos ML sin estratificación zona×estación produce clasificadores sesgados.
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {H8_AQI_DIST.map(z=>(
          <Card key={z.zone}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:12}}>{z.zone}</div>
            {z.cats.map(cat=>(
              <div key={cat.l} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:C.muted}}>{cat.l}</span>
                  <span style={{fontSize:12,fontWeight:700,color:cat.c}}>{cat.p.toFixed(1)}%</span>
                </div>
                <Bar value={cat.p} max={70} color={cat.c} height={8}/>
              </div>))}
          </Card>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[["Clase 'Bueno' Sur-Invierno","8.2%",C.bad,"Solo 8 de cada 100 días son limpios"],
          ["Clase 'Bueno' Norte-Verano","58.7%",C.good,"Alta proporción de días limpios"],
          ["Clases críticas Sur-Invierno","43.1%",C.warn,"Insal.+Muy Insal.+Peligrosa combinadas"],
        ].map(([l,v,c,d])=>(
          <div key={String(l)} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${String(c)}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:24,fontWeight:800,color:String(c)}}>{v}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{d}</div>
          </div>))}
      </div>
      <div style={{background:`${C.good}18`,border:`1px solid ${C.good}44`,borderRadius:10,padding:"12px 16px",fontSize:12,color:"#bbf7d0"}}>
        <b>✔ Confirmada.</b> El desbalance es extremo: factor 7× entre Norte-Verano (58.7% "Bueno") y Sur-Invierno (8.2% "Bueno").
        Cualquier modelo ML debe aplicar SMOTE o stratified sampling por zona×estación o reproducirá este sesgo sistemático.
      </div>
    </div>);
}

// ── Tab Hipotesis IA ─────────────────────────────────────────
function TabHipotesis({knnCtx}) {
  const [hyps,setHyps]       = useState([]);
  const [hypLoad,setHypLoad] = useState(false);
  const [hypErr,setHypErr]   = useState("");
  const getHyps = async () => {
    if(!knnCtx){setHypErr("Ejecuta primero un analisis KNN.");return;}
    setHypLoad(true);setHypErr("");
    try{ const h=await callClaudeHypotheses(knnCtx); setHyps(h); }
    catch(e){ setHypErr("Error de API."); }
    setHypLoad(false);
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card accent={C.pred+"44"}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>Motor de Hipotesis con IA</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:14}}>
          Analiza los resultados KNN y genera hipotesis sobre prediccion de PM2.5, influencia climatica, alertas y comparacion de periodos.
        </div>
        {knnCtx
          ?<div style={{background:C.bg,borderRadius:8,padding:12,fontSize:11,color:C.muted,marginBottom:14,maxHeight:120,overflow:"auto",fontFamily:"monospace"}}>{knnCtx}</div>
          :<div style={{background:C.bg,borderRadius:8,padding:10,fontSize:12,color:C.bad,marginBottom:14}}>Sin contexto KNN. Ve a KNN Interactivo primero.</div>}
        <button onClick={getHyps} disabled={hypLoad||!knnCtx}
          style={{background:knnCtx?`linear-gradient(135deg,${C.pred},#8b5cf6)`:"#1e293b",color:knnCtx?"#fff":C.muted,border:"none",borderRadius:9,padding:"11px 26px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:10}}>
          {hypLoad&&<Spinner/>}{hypLoad?"Generando...":"Generar Hipotesis con IA"}
        </button>
        {hypErr&&<div style={{marginTop:10,fontSize:12,color:C.bad}}>{hypErr}</div>}
      </Card>
      {hyps.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {hyps.map((h:any)=><HypCard key={h.id} h={h}/>)}
        </div>)}
      {!hyps.length&&!hypLoad&&(
        <div style={{textAlign:"center",padding:60}}>
          <div style={{fontSize:48,marginBottom:12}}>🔬</div>
          <div style={{fontSize:14,color:C.muted}}>Las hipotesis apareceran aqui.</div>
        </div>)}
    </div>);
}

// ═══════════════════════════════════════════════════════════
//  APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [tab,setTab]               = useState("eda");
  const [data,setData]             = useState(null);
  const [loadProgress,setLoadProgress] = useState(0);
  const [period,setPeriod]         = useState("hist");
  const [metric,setMetric]         = useState("coseno");
  const [target,setTarget]         = useState(0);
  const [k,setK]                   = useState(5);
  const [featMask,setFeatMask]     = useState(FEATURES.map(()=>true));
  const [profiles,setProfiles]     = useState([]);
  const [results,setResults]       = useState([]);
  const [knnCtx,setKnnCtx]         = useState("");

  useEffect(()=>{
    loadAllData((pct)=>setLoadProgress(pct)).then(d=>{ setData(d); setProfiles(stationProfile(d.hist)); });
  },[]);

  useEffect(()=>{ if(!data) return; setProfiles(stationProfile(period==="hist"?data.hist:data.curr)); },[period,data]);

  const runKNN = useCallback(()=>{
    if(!profiles.length) return;
    const res=knn(target,profiles,k,metric,featMask);
    setResults(res.filter(r=>r.si!==target));
    const top=res.filter(r=>r.si!==target).slice(0,3);
    const tgt=profiles[target];
    if(!tgt) return;
    setKnnCtx(`Dataset: Beijing | Periodo: ${period==="hist"?"2013-17":"2022-26"} | Target: ${tgt.id} | PM2.5: ${tgt.vec[0].toFixed(1)} | Metrica: ${metric} | K: ${k} | Vecinos: ${top.map(p=>`${p.id}(${((1/(1+p.dist))*100).toFixed(0)}%)`).join(", ")}`);
  },[profiles,target,k,metric,featMask,data,period]);

  useEffect(()=>{ runKNN(); },[runKNN]);

  if (!data) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:20}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
      <div style={{width:64,height:64,borderRadius:14,background:`linear-gradient(135deg,${C.pred},#8b5cf6)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,animation:"pulse 2s ease infinite"}}>🌫</div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:6}}>Beijing Air Quality · EDA Dashboard</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:2}}>Leonardo Raphael Pachari Gomez</div>
        <div style={{fontSize:12,color:C.muted}}>8 Hipótesis · 12 Estaciones · UCI 2013-17 + Open-Meteo 2022-26</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,width:280}}>
        <div style={{width:44,height:44,border:`3px solid ${C.pred}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
        <span style={{color:C.muted,fontSize:12}}>Cargando {loadProgress}% — 420,768 registros históricos...</span>
        {/* Barra de progreso */}
        <div style={{width:"100%",height:6,background:C.dim,borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${loadProgress}%`,background:`linear-gradient(90deg,${C.pred},#8b5cf6)`,borderRadius:4,transition:"width .4s ease"}}/>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
          {[
            {label:"12 estaciones",done:loadProgress>=85},
            {label:"Open-Meteo",done:loadProgress>=92},
            {label:"8 hipótesis",done:loadProgress>=100},
          ].map(({label,done})=>(
            <div key={label} style={{padding:"3px 10px",background:done?`${C.good}22`:`${C.pred}18`,border:`1px solid ${done?C.good:C.border}`,borderRadius:12,fontSize:10,color:done?C.good:C.muted,transition:"all .3s"}}>
              {done?"✓ ":""}{label}
            </div>))}
        </div>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center",marginTop:4}}>
        {["12 estaciones UCI","1,294 días Open-Meteo","8 hipótesis EDA","Análisis H1-H8"].map(t=>(
          <div key={t} style={{padding:"5px 14px",background:`${C.pred}18`,borderRadius:20,fontSize:11,color:C.pred}}>{t}</div>))}
      </div>
    </div>);

  const avgH=data.hist.reduce((a,r)=>a+r["PM2.5"],0)/Math.max(data.hist.length,1);
  const avgC=data.curr.reduce((a,r)=>a+r["PM2.5"],0)/Math.max(data.curr.length,1);
  const imp=((avgH-avgC)/Math.max(avgH,1)*100).toFixed(1);
  const critH=data.hist.filter(r=>r.critical).length;
  const critC=data.curr.filter(r=>r.critical).length;

  const TABS=[
    {id:"eda",      l:"📊 EDA Overview"},
    {id:"h1",       l:"H1: DEWP Predictor"},
    {id:"h2",       l:"H2: Norte vs Sur"},
    {id:"h3",       l:"H3: Métricas KNN"},
    {id:"h4",       l:"H4: Bimodalidad"},
    {id:"h5",       l:"H5: Viento"},
    {id:"h6",       l:"H6: PCA"},
    {id:"h7",       l:"H7: Markov"},
    {id:"h8",       l:"H8: Balance AQI"},
    {id:"knn",      l:"⚙️ KNN Interactivo"},
    {id:"temporal", l:"📈 Evolución Temporal"},
    {id:"compare",  l:"🔄 Comparativa Períodos"},
    {id:"hipotesis",l:"🤖 Hipótesis IA"},
  ];

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text,fontSize:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} .fade{animation:fadeIn .3s ease} .slide-up{animation:slideUp .4s ease} select,input[type=number]{background:${C.card};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:5px 9px;font-size:13px;outline:none} select option{background:${C.card}} button{cursor:pointer;transition:all .15s} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:3px}`}</style>

      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 24px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",position:"relative",overflow:"hidden"}}>
        <div style={{width:38,height:38,borderRadius:9,background:`linear-gradient(135deg,${C.pred},#8b5cf6)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🌫</div>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>Beijing Air Quality — Dashboard EDA y KNN</div>
          <div style={{fontSize:11,color:C.muted}}>8 Hipótesis H1-H8 · 12 estaciones · UCI 2013-17 + Open-Meteo 2022-26 · Motor IA · Leonardo Pachari</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["↓ "+imp+"%","Mejora PM2.5",C.good],[critH.toLocaleString(),"días críticos hist.",C.bad],[critC.toLocaleString(),"días críticos act.",C.warn],["0.22 ms","Manhattan L1",C.pred]].map(([v,l,c])=>(
            <div key={String(l)} style={{padding:"5px 12px",background:String(c)+"15",borderRadius:7,textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:String(c)}}>{v}</div>
              <div style={{fontSize:9,color:C.muted}}>{l}</div>
            </div>))}
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:C.dim}}>
          <div style={{height:"100%",width:`${loadProgress}%`,background:`linear-gradient(90deg,${C.pred},#8b5cf6)`,transition:"width .4s"}}/>
        </div>
      </div>

      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"0 16px"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"11px 16px",background:"none",border:"none",color:tab===t.id?C.pred:C.muted,fontWeight:tab===t.id?700:400,fontSize:12,borderBottom:tab===t.id?`2px solid ${C.pred}`:"2px solid transparent",whiteSpace:"nowrap"}}>
            {t.l}
          </button>))}
      </div>

      <div style={{padding:20,maxWidth:1120,margin:"0 auto"}} className="fade" key={tab}>
        {tab==="eda"       && <TabEDA/>}
        {tab==="h1"        && <TabH1/>}
        {tab==="h2"        && <TabH2/>}
        {tab==="h3"        && <TabH3/>}
        {tab==="h4"        && <TabH4/>}
        {tab==="h5"        && <TabH5/>}
        {tab==="h6"        && <TabH6/>}
        {tab==="h7"        && <TabH7/>}
        {tab==="h8"        && <TabH8/>}
        {tab==="knn"       && <TabKNN data={data} profiles={profiles} results={results} target={target} setTarget={setTarget} period={period} setPeriod={setPeriod} metric={metric} setMetric={setMetric} k={k} setK={setK} featMask={featMask} setFeatMask={setFeatMask} runKNN={runKNN}/>}
        {tab==="temporal"  && <TabTemporal data={data}/>}
        {tab==="compare"   && <TabCompare data={data}/>}
        {tab==="hipotesis" && <TabHipotesis knnCtx={knnCtx}/>}
      </div>
    </div>);
}
