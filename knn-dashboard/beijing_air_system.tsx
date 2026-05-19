import { useState, useEffect, useCallback, useRef } from "react";

const STATIONS = ["Aotizhongxin","Changping","Dingling","Dongsi","Guanyuan",
  "Gucheng","Huairou","Nongzhanguan","Shunyi","Tiantan","Wanliu","Wanshouxigong"];

const HIST_STATIONS_CSV = {
  "Aotizhongxin": "/2013-2017/PRSA_Data_Aotizhongxin_20130301-20170228.csv",
  "Changping": "/2013-2017/PRSA_Data_Changping_20130301-20170228.csv",
  "Dingling": "/2013-2017/PRSA_Data_Dingling_20130301-20170228.csv",
  "Dongsi": "/2013-2017/PRSA_Data_Dongsi_20130301-20170228.csv",
  "Guanyuan": "/2013-2017/PRSA_Data_Guanyuan_20130301-20170228.csv",
  "Gucheng": "/2013-2017/PRSA_Data_Gucheng_20130301-20170228.csv",
  "Huairou": "/2013-2017/PRSA_Data_Huairou_20130301-20170228.csv",
  "Nongzhanguan": "/2013-2017/PRSA_Data_Nongzhanguan_20130301-20170228.csv",
  "Shunyi": "/2013-2017/PRSA_Data_Shunyi_20130301-20170228.csv",
  "Tiantan": "/2013-2017/PRSA_Data_Tiantan_20130301-20170228.csv",
  "Wanliu": "/2013-2017/PRSA_Data_Wanliu_20130301-20170228.csv",
  "Wanshouxigong": "/2013-2017/PRSA_Data_Wanshouxigong_20130301-20170228.csv",
};

const PM25_KEY = "PM2.5";
const PM10_KEY = "PM10";
const SO2_KEY = "SO2";
const NO2_KEY = "NO2";
const CO_KEY = "CO";
const O3_KEY = "O3";
const CURR_CSV = "/2022-2026/air_quality_historical.csv";

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
        const num = parseFloat(v);
        row[h] = isNaN(num) ? v : num;
      });
      rows.push(row);
    }
  }
  return rows;
}

function processHistStation(rows, stationName, stIdx) {
  return rows.map(r => {
    const m = r.month;
    const d = r.day || 1;
    const dayOfYear = Math.floor((m - 1) * 30.4 + d);
    const pm25 = r[PM25_KEY] ?? r["pm2_5"] ?? 0;
    const pm10 = r["PM10"] ?? r["pm10"] ?? 0;
    const so2 = r["SO2"] ?? r["sulphur_dioxide"] ?? 0;
    const no2 = r["NO2"] ?? r["nitrogen_dioxide"] ?? 0;
    const co = r["CO"] ?? r["carbon_monoxide"] ?? 0;
    const o3 = r["O3"] ?? r["ozone"] ?? 0;
    const temp = r["TEMP"] ?? r["temperature"] ?? 0;
    const pres = r["PRES"] ?? r["pressure"] ?? 0;
    const dew = r["DEWP"] ?? r["dew_point"] ?? r["DEW"] ?? 0;
    const wspm = r["WSPM"] ?? r["wind_speed"] ?? 0;
    const rain = r["RAIN"] ?? r["rain"] ?? 0;
    const wd = r["wd"] ?? r["wind_dir"] ?? "N";
    return {
      station: stationName, stIdx, period: "hist", month: m - 1, day: dayOfYear, rain,
      [PM25_KEY]: pm25, [PM10_KEY]: pm10, [SO2_KEY]: so2, [NO2_KEY]: no2, [CO_KEY]: co, [O3_KEY]: o3,
      TEMP: temp, PRES: pres, DEW: dew, WSPM: wspm, RAIN: rain, wd: wd,
      critical: pm25 > 150, moderate: pm25 > 75 && pm25 <= 150
    };
  }).filter(r => r[PM25_KEY] != null && !isNaN(r[PM25_KEY]));
}

function processCurrData(rows) {
  return rows.map((r, idx) => {
    const dateStr = r.date || "";
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    const month = dateMatch ? parseInt(dateMatch[2]) - 1 : 0;
    const pm25 = r["pm2_5"] ?? r[PM25_KEY] ?? 0;
    const pm10 = r["pm10"] ?? r["PM10"] ?? 0;
    const co = r["carbon_monoxide"] ?? r["CO"] ?? 0;
    const no2 = r["nitrogen_dioxide"] ?? r["NO2"] ?? 0;
    const so2 = r["sulphur_dioxide"] ?? r["SO2"] ?? 0;
    const o3 = r["ozone"] ?? r["O3"] ?? 0;
    return {
      station: "Beijing", stIdx: 0, period: "curr", month, day: idx, rain: 0,
      [PM25_KEY]: pm25, [PM10_KEY]: pm10, [SO2_KEY]: so2, [NO2_KEY]: no2, [CO_KEY]: co, [O3_KEY]: o3,
      TEMP: 0, PRES: 0, DEW: 0, WSPM: 0, RAIN: 0, wd: "N",
      critical: pm25 > 150, moderate: pm25 > 75 && pm25 <= 150
    };
  }).filter(r => r[PM25_KEY] != null && !isNaN(r[PM25_KEY]) && r[PM25_KEY] > 0);
}

async function loadAllData() {
  const hist = [];
  const curr = [];
  const loadPromises = Object.entries(HIST_STATIONS_CSV).map(async ([station, path], stIdx) => {
    try {
      const res = await fetch(path);
      if (!res.ok) return [];
      const text = await res.text();
      const rows = parseCSV(text);
      return processHistStation(rows, station, stIdx);
    } catch (e) {
      console.error(`Error loading ${station}:`, e);
      return [];
    }
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
  } catch (e) {
    console.error("Error loading current data:", e);
  }

  let currWithStations = curr;
  if (curr.length > 0) {
const currAvgs = {
      [PM25_KEY]: curr.reduce((a,r) => a + r[PM25_KEY], 0) / curr.length,
      [PM10_KEY]: curr.reduce((a,r) => a + r[PM10_KEY], 0) / curr.length,
      [SO2_KEY]: curr.reduce((a,r) => a + r[SO2_KEY], 0) / curr.length,
      [NO2_KEY]: curr.reduce((a,r) => a + r[NO2_KEY], 0) / curr.length,
      [CO_KEY]: curr.reduce((a,r) => a + r[CO_KEY], 0) / curr.length,
      [O3_KEY]: curr.reduce((a,r) => a + r[O3_KEY], 0) / curr.length,
    };
    currWithStations = [];
    STATIONS.forEach((st, si) => {
      const histSt = hist.filter(r => r.station === st);
      const histBase = histSt.length > 0 ? {
        [PM25_KEY]: histSt.reduce((a,r) => a + r[PM25_KEY], 0) / histSt.length,
        [PM10_KEY]: histSt.reduce((a,r) => a + r[PM10_KEY], 0) / histSt.length,
      } : { [PM25_KEY]: 50, [PM10_KEY]: 80 };
      const ratio = histBase[PM25_KEY] > 0 ? currAvgs[PM25_KEY] / (hist.reduce((a,r) => a + r[PM25_KEY], 0) / Math.max(hist.length, 1)) : 1;
      
      curr.forEach(r => {
        const newR = { ...r, station: st, stIdx: si };
        newR[PM25_KEY] = (r[PM25_KEY] * ratio) || 0;
        newR[PM10_KEY] = (r[PM10_KEY] * ratio) || 0;
        newR[SO2_KEY] = (r[SO2_KEY] * ratio) || 0;
        newR[NO2_KEY] = (r[NO2_KEY] * ratio) || 0;
        newR[CO_KEY] = (r[CO_KEY] * ratio) || 0;
        newR[O3_KEY] = (r[O3_KEY] * ratio) || 0;
        newR.critical = newR[PM25_KEY] > 150;
        newR.moderate = newR[PM25_KEY] > 75 && newR[PM25_KEY] <= 150;
        currWithStations.push(newR);
      });
    });
  }

  return { hist, curr: currWithStations };
}

const FEATURES    = ["PM2.5","PM10","SO2","NO2","CO","O3","TEMP","PRES","DEW","WSPM"];
const FEAT_LABELS = ["PM2.5","PM10","SO₂","NO₂","CO","O₃","Temp","Pres","Rocío","Viento"];
const MONTHS      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const WD_DIRS     = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

// ─── Agrega un array de records → vector de medias por FEATURE ───
function toVec(records){ return FEATURES.map(f=>{ const a=records.map(r=>r[f]).filter(v=>v!=null); return a.length?a.reduce((x,y)=>x+y,0)/a.length:0; }); }

// ─── Vectores por estación y período ─────────────────────────────
function stationProfile(records){
  return STATIONS.map((st,si)=>{ const rr=records.filter(r=>r.station===st); return {id:st,si,vec:toVec(rr),count:rr.length,critPct:rr.filter(r=>r.critical).length/Math.max(rr.length,1)*100}; });
}

// ─── Vectores por mes (para una estación) ────────────────────────
function monthProfile(records, station){
  return MONTHS.map((lb,mi)=>{ const rr=records.filter(r=>r.station===station&&r.month===mi); return {label:lb,month:mi,vec:toVec(rr),critPct:rr.filter(r=>r.critical).length/Math.max(rr.length,1)*100}; });
}

// ═══════════════════════════════════════════════════════════
//  ALGORITMOS KNN (equivale a core.py)
// ═══════════════════════════════════════════════════════════
function zscore(matrix){
  const n=matrix[0].length;
  const mu=Array(n).fill(0), sd=Array(n).fill(0);
  matrix.forEach(r=>r.forEach((v,i)=>mu[i]+=v));
  mu.forEach((_,i)=>mu[i]/=matrix.length);
  matrix.forEach(r=>r.forEach((v,i)=>sd[i]+=(v-mu[i])**2));
  sd.forEach((_,i)=>{ sd[i]=Math.sqrt(sd[i]/matrix.length)||1; });
  return matrix.map(r=>r.map((v,i)=>(v-mu[i])/sd[i]));
}

const cosine=(u,v)=>{ let d=0,nu=0,nv=0; u.forEach((_,i)=>{d+=u[i]*v[i];nu+=u[i]**2;nv+=v[i]**2;}); return nu<1e-12||nv<1e-12?1:1-d/(Math.sqrt(nu)*Math.sqrt(nv)); };
const pearson=(u,v)=>{ const n=u.length; const mx=u.reduce((a,b)=>a+b)/n,my=v.reduce((a,b)=>a+b)/n; let num=0,dx=0,dy=0; u.forEach((_,i)=>{num+=(u[i]-mx)*(v[i]-my);dx+=(u[i]-mx)**2;dy+=(v[i]-my)**2;}); return dx<1e-10||dy<1e-10?1:1-Math.max(-1,Math.min(1,num/(Math.sqrt(dx)*Math.sqrt(dy)))); };
const euclid=(u,v)=>Math.sqrt(u.reduce((s,_,i)=>s+(u[i]-v[i])**2,0));
const METRICS={coseno:cosine,pearson,euclidiana:euclid};

function knn(targetIdx, profiles, k, metricKey, featureMask){
  const fn=METRICS[metricKey];
  const mask=featureMask||FEATURES.map(()=>true);
  const norm=zscore(profiles.map(p=>p.vec));
  const applyMask=v=>v.filter((_,i)=>mask[i]);
  const tv=applyMask(norm[targetIdx]);
  return profiles
    .map((p,i)=>({...p, dist:i===targetIdx?Infinity:fn(tv,applyMask(norm[i]))}))
    .sort((a,b)=>a.dist-b.dist)
    .slice(0,k);
}

// ═══════════════════════════════════════════════════════════
//  GENERACIÓN DE HIPÓTESIS VÍA CLAUDE API
// ═══════════════════════════════════════════════════════════
async function callClaudeHypotheses(ctx){
  const sys=`Eres un experto en análisis de calidad del aire, salud pública y política ambiental urbana.
Tu tarea es generar hipótesis de valor científicamente sólidas a partir de resultados KNN sobre datos de Beijing.
Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto extra.`;

  const prompt=`RESULTADOS DEL ANÁLISIS KNN:
${ctx}

Genera exactamente 4 hipótesis de valor. Cada hipótesis debe cubrir uno de estos enfoques (sin repetir):
1. PREDICCIÓN: Predecir niveles críticos de PM2.5 usando patrones de estaciones similares
2. CLIMA: Influencia del viento/temperatura/lluvia en la contaminación detectada por KNN
3. ALERTA: Condición de riesgo para hospitales o restricción de tráfico
4. COMPARACIÓN: Cambio estructural entre período 2013-2017 vs 2022-2026

Formato JSON (array de 4 objetos):
[{"id":1,"tipo":"prediccion","titulo":"...","hipotesis":"Si [condición] entonces [consecuencia] porque [mecanismo]","evidencia_knn":"Qué patrón KNN la respalda","accion":"Decisión concreta (quién, qué, cuándo)","impacto":"Alto/Medio/Bajo","confianza":0.0}]`;

  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,
      system:sys,messages:[{role:"user",content:prompt}]})
  });
  const d=await r.json();
  const txt=d.content?.map(b=>b.text||"").join("")||"";
  return JSON.parse(txt.replace(/```json|```/g,"").trim());
}

// ═══════════════════════════════════════════════════════════
//  HELPERS UI
// ═══════════════════════════════════════════════════════════
const C={
  pred:"#6366f1",clima:"#0ea5e9",alerta:"#ef4444",comp:"#f59e0b",
  good:"#10b981",warn:"#f59e0b",bad:"#ef4444",crit:"#7c3aed",
  bg:"#0d1117",card:"#161b22",border:"#21262d",text:"#e6edf3",muted:"#8b949e",dim:"#30363d"
};
const TIPO_META={
  prediccion:{color:C.pred,icon:"🔮",label:"Predicción PM2.5"},
  clima:      {color:C.clima,icon:"🌬️",label:"Influencia Climática"},
  alerta:     {color:C.alerta,icon:"🚨",label:"Alerta Riesgo"},
  comparacion:{color:C.comp,icon:"📊",label:"Comparativa Períodos"},
};
function pm25Cat(v){ if(v<=35)return{c:C.good,l:"Bueno"}; if(v<=75)return{c:"#a3e635",l:"Moderado"}; if(v<=115)return{c:C.warn,l:"Insalubre sens."}; if(v<=150)return{c:"#f97316",l:"Insalubre"}; return{c:C.crit,l:"Muy insalubre"}; }

function Spinner(){return <div style={{width:18,height:18,border:"2px solid #ffffff44",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>;}

// Mini barra horizontal
function Bar({value,max,color,height=8}){
  const pct=Math.min(100,(value/(max||1))*100);
  return <div style={{background:C.dim,borderRadius:4,height,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4,transition:"width .6s"}}/></div>;
}

// Gráfica de barras verticales con tooltip
function VBar({data,color="#6366f1",h=140,valueKey="value",labelKey="label"}){
  const [tip,setTip]=useState(null);
  const max=Math.max(...data.map(d=>d[valueKey]||0),1);
  return(
    <div style={{position:"relative"}}>
      {tip&&<div style={{position:"absolute",top:-32,left:tip.x,transform:"translateX(-50%)",background:"#0d1117",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:C.text,pointerEvents:"none",whiteSpace:"nowrap",zIndex:10}}>
        {tip.label}: <b>{tip.val}</b>
      </div>}
      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:h}}>
        {data.map((d,i)=>{
          const bh=Math.max(4,((d[valueKey]||0)/max)*(h-20));
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}
              onMouseEnter={e=>{const r=e.target.getBoundingClientRect(),pr=e.currentTarget.closest("[data-chart]").getBoundingClientRect();setTip({label:d[labelKey],val:(d[valueKey]||0).toFixed(1),x:r.left-pr.left+r.width/2});}}
              onMouseLeave={()=>setTip(null)}>
              <div style={{width:"100%",height:bh,background:color,borderRadius:"3px 3px 0 0",minWidth:4,transition:"height .5s",opacity:0.9}}
                onMouseEnter={e=>{e.target.style.opacity=1;}} onMouseLeave={e=>{e.target.style.opacity=0.9;}}/>
              <span style={{fontSize:9,color:C.muted,writingMode:"vertical-rl",transform:"rotate(180deg)",maxHeight:32,overflow:"hidden"}}>{d[labelKey]}</span>
            </div>);
        })}
      </div>
    </div>);
}

// Radar SVG
function Radar({vecs,labels,colors,size=160}){
  const n=labels.length; if(!n) return null;
  const cx=size/2,cy=size/2,r=(size/2)-22;
  const allVals=vecs.flatMap(v=>v);
  const mx=Math.max(...allVals,1);
  const pt=(val,i)=>{ const a=2*Math.PI*i/n-Math.PI/2,d=(val/mx)*r; return [cx+d*Math.cos(a),cy+d*Math.sin(a)]; };
  const axes=labels.map((_,i)=>{ const a=2*Math.PI*i/n-Math.PI/2; return {x:cx+(r+14)*Math.cos(a),y:cy+(r+14)*Math.sin(a),ax:cx+r*Math.cos(a),ay:cy+r*Math.sin(a)}; });
  return(
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

// Tarjeta de estación vecina
function NeighborCard({p,rank,targetVec,metric}){
  const sim=((1/(1+p.dist))*100);
  const cat=pm25Cat(p.vec[0]);
  const delta=targetVec?((p.vec[0]-targetVec[0])/Math.max(targetVec[0],1)*100):0;
  return(
    <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"flex-start"}}>
      <div style={{width:30,height:30,borderRadius:"50%",background:`${C.pred}22`,border:`2px solid ${C.pred}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:C.pred,flexShrink:0}}>
        {rank}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>{p.id}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:10,padding:"1px 7px",borderRadius:8,background:cat.c+"22",color:cat.c}}>{p.vec[0].toFixed(1)} µg/m³</span>
          <span style={{fontSize:10,padding:"1px 7px",borderRadius:8,background:C.dim,color:C.muted}}>Críticos {p.critPct.toFixed(1)}%</span>
          <span style={{fontSize:10,padding:"1px 7px",borderRadius:8,background:(delta<0?C.good:C.bad)+"22",color:delta<0?C.good:C.bad}}>{delta>0?"+":""}{delta.toFixed(1)}% PM2.5</span>
        </div>
        <Bar value={sim} max={100} color={C.pred} height={6}/>
        <div style={{fontSize:10,color:C.muted,marginTop:3}}>{sim.toFixed(1)}% similitud ({metric})</div>
      </div>
    </div>);
}

// Tarjeta de hipótesis expandible
function HypCard({h}){
  const [open,setOpen]=useState(false);
  const meta=TIPO_META[h.tipo]||{color:C.pred,icon:"💡",label:h.tipo};
  const conf=Math.round((h.confianza||0)*100);
  const impColor={Alto:C.bad,Medio:C.warn,Bajo:C.good}[h.impacto]||C.muted;
  return(
    <div style={{background:C.card,borderRadius:12,border:`1px solid ${meta.color}44`,overflow:"hidden",transition:"box-shadow .2s",cursor:"pointer"}}
      onClick={()=>setOpen(!open)}>
      <div style={{padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{width:40,height:40,borderRadius:10,background:meta.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{meta.icon}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:meta.color+"33",color:meta.color,fontWeight:700}}>{meta.label}</span>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:impColor+"22",color:impColor}}>Impacto {h.impacto}</span>
            <span style={{fontSize:10,color:C.muted}}>conf. {conf}%</span>
          </div>
          <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.4}}>{h.titulo}</div>
          <div style={{marginTop:8,height:5,background:C.dim,borderRadius:3}}>
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
//  APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function App(){
  const [tab,setTab]   = useState("knn");
  const [data,setData] = useState(null);

  // KNN state
  const [period,setPeriod]   = useState("hist");
  const [metric,setMetric]   = useState("coseno");
  const [target,setTarget]   = useState(0);
  const [k,setK]             = useState(5);
  const [featMask,setFeatMask] = useState(FEATURES.map(()=>true));
  const [profiles,setProfiles] = useState([]);
  const [results,setResults]   = useState([]);
  const [knnCtx,setKnnCtx]     = useState("");

  // Hipótesis state
  const [hyps,setHyps]     = useState([]);
  const [hypLoad,setHypLoad] = useState(false);
  const [hypErr,setHypErr]   = useState("");

  // Temporal state
  const [tempSt,setTempSt]   = useState(0);

  useEffect(()=>{
    loadAllData().then(d=>{
      setData(d);
      setProfiles(stationProfile(d.hist));
    });
  },[]);

  // Actualizar perfiles cuando cambia período
  useEffect(()=>{ if(!data) return; setProfiles(stationProfile(period==="hist"?data.hist:data.curr)); },[period,data]);

  // Ejecutar KNN
  const runKNN=useCallback(()=>{
    if(!profiles.length) return;
    const res=knn(target,profiles,k,metric,featMask);
    setResults(res.filter(r=>r.si!==target));
    const top=res.filter(r=>r.si!==target).slice(0,3);
    const tgt=profiles[target];
    const ctx=`DATASET: Beijing Air Quality
PERÍODO: ${period==="hist"?"2013-2017 (UCI / estaciones terrestres)":"2022-2026 (Satelital / Open-Meteo)"}
ESTACIÓN TARGET: ${tgt.id}
  PM2.5 promedio: ${tgt.vec[0].toFixed(1)} µg/m³
  NO2: ${tgt.vec[3].toFixed(1)} | SO2: ${tgt.vec[2].toFixed(1)} | CO: ${tgt.vec[4].toFixed(0)}
  WSPM (viento): ${tgt.vec[9].toFixed(1)} m/s | TEMP: ${tgt.vec[6].toFixed(1)}°C
  Días críticos (PM2.5>150): ${tgt.critPct.toFixed(1)}%
MÉTRICA: ${metric} | K=${k}
FEATURES ACTIVOS: ${FEATURES.filter((_,i)=>featMask[i]).join(", ")}
VECINOS MÁS SIMILARES:
${top.map((p,i)=>`  #${i+1} ${p.id} — similitud ${(1/(1+p.dist)*100).toFixed(1)}%, PM2.5=${p.vec[0].toFixed(1)}, viento=${p.vec[9].toFixed(1)} m/s, críticos=${p.critPct.toFixed(1)}%`).join("\n")}
COMPARATIVA HISTÓRICO vs ACTUAL:
  PM2.5 hist promedio: ${data?stationProfile(data.hist)[target].vec[0].toFixed(1):"?"}
  PM2.5 actual promedio: ${data?stationProfile(data.curr)[target].vec[0].toFixed(1):"?"}
  Mejora relativa: ${data?(((stationProfile(data.hist)[target].vec[0]-stationProfile(data.curr)[target].vec[0])/stationProfile(data.hist)[target].vec[0])*100).toFixed(1):"?"}%`;
    setKnnCtx(ctx);
  },[profiles,target,k,metric,featMask,data]);

  useEffect(()=>{ runKNN(); },[runKNN]);

  const getHyps=async()=>{
    if(!knnCtx){setHypErr("Ejecuta primero un análisis KNN.");return;}
    setHypLoad(true);setHypErr("");
    try{ const h=await callClaudeHypotheses(knnCtx); setHyps(h); }
    catch(e){ setHypErr("Error de API. Revisa la conexión."); }
    setHypLoad(false);
  };

  // ── Datos derivados ──────────────────────────────────────
  const allHist = data?.hist||[];
  const allCurr = data?.curr||[];
  const avgH=p=>allHist.length?allHist.reduce((a,r)=>a+r[p],0)/allHist.length:0;
  const avgC=p=>allCurr.length?allCurr.reduce((a,r)=>a+r[p],0)/allCurr.length:0;
  const imp=((avgH("PM2.5")-avgC("PM2.5"))/Math.max(avgH("PM2.5"),1)*100).toFixed(1);
  const critH=allHist.filter(r=>r.critical).length;
  const critC=allCurr.filter(r=>r.critical).length;

  const tgtProfile=profiles[target]||{vec:FEATURES.map(()=>0),id:"",critPct:0};
  const tgtCat=pm25Cat(tgtProfile.vec[0]);

  // Datos para radar: target + top 2 vecinos
  const radarVecs=[tgtProfile,...results.slice(0,2)].map(p=>(p.vec||FEATURES.map(()=>0)).slice(0,6));
  const radarColors=[C.pred,C.clima,C.good];

  // Mensual para temporal
  const tempStation=STATIONS[tempSt];
  const mH=data?monthProfile(data.hist,tempStation):[];
  const mC=data?monthProfile(data.curr,tempStation):[];

  const TABS=[{id:"knn",l:"🔍 KNN Estaciones"},{id:"temporal",l:"📅 Patrones Temporales"},{id:"hipotesis",l:"💡 Hipótesis IA"},{id:"compare",l:"📊 Comparativa"}];

  if(!data) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:44,height:44,border:`3px solid ${C.pred}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <span style={{color:C.muted}}>Cargando dataset Beijing (12 estaciones × 2 períodos)...</span>
    </div>);

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text,fontSize:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} .fade{animation:fadeIn .25s ease} select,input[type=number]{background:${C.card};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:5px 9px;font-size:13px;outline:none} select option{background:${C.card}} button{cursor:pointer;transition:all .15s} ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:3px}`}</style>

      {/* HEADER */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"14px 24px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{width:38,height:38,borderRadius:9,background:`linear-gradient(135deg,${C.pred},#8b5cf6)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🌫️</div>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>Beijing Air Quality — KNN entre Estaciones</div>
          <div style={{fontSize:11,color:C.muted}}>12 estaciones · UCI 2013-17 vs Satelital 2022-26 · Motor de hipótesis IA</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["↓"+imp+"%","PM2.5 mejoró",C.good],[critH.toLocaleString(),"días críticos hist",C.bad],[critC.toLocaleString(),"días críticos act",C.warn]].map(([v,l,c])=>(
            <div key={l} style={{padding:"5px 12px",background:c+"15",borderRadius:7,textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
              <div style={{fontSize:9,color:C.muted}}>{l}</div>
            </div>))}
        </div>
      </div>

      {/* TABS */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"0 20px"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"12px 18px",background:"none",border:"none",color:tab===t.id?C.pred:C.muted,fontWeight:tab===t.id?700:400,fontSize:13,borderBottom:tab===t.id?`2px solid ${C.pred}`:"2px solid transparent",whiteSpace:"nowrap"}}>
            {t.l}
          </button>))}
      </div>

      <div style={{padding:20,maxWidth:1080,margin:"0 auto"}} className="fade" key={tab}>

        {/* ══════════ TAB: KNN ══════════ */}
        {tab==="knn"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Controles */}
            <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>⚙️ Configuración KNN</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:14,alignItems:"flex-end"}}>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Período</div>
                  <select value={period} onChange={e=>setPeriod(e.target.value)}>
                    <option value="hist">2013-2017 (Histórico)</option>
                    <option value="curr">2022-2026 (Actual)</option>
                  </select></div>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Estación Target</div>
                  <select value={target} onChange={e=>setTarget(+e.target.value)}>
                    {STATIONS.map((s,i)=><option key={i} value={i}>{s}</option>)}
                  </select></div>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Métrica</div>
                  <select value={metric} onChange={e=>setMetric(e.target.value)}>
                    <option value="coseno">Coseno</option>
                    <option value="pearson">Pearson</option>
                    <option value="euclidiana">Euclidiana</option>
                  </select></div>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>K vecinos</div>
                  <input type="number" min={1} max={11} value={k} onChange={e=>setK(Math.max(1,Math.min(11,+e.target.value)))} style={{width:60}}/></div>
                <button onClick={runKNN} style={{background:`linear-gradient(135deg,${C.pred},#8b5cf6)`,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,fontSize:13}}>▶ Calcular KNN</button>
              </div>

              {/* Feature mask */}
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Variables activas (click para activar/desactivar):</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {FEATURES.map((f,i)=>(
                    <button key={f} onClick={()=>setFeatMask(m=>{const nm=[...m];nm[i]=!nm[i];return nm;})}
                      style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${featMask[i]?C.pred:C.border}`,background:featMask[i]?C.pred+"22":C.bg,color:featMask[i]?C.pred:C.muted,fontSize:11,fontWeight:featMask[i]?700:400}}>
                      {FEAT_LABELS[i]}
                    </button>))}
                </div>
              </div>
            </div>

            {/* Target info + resultados */}
            <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
              {/* Perfil Target */}
              <div style={{background:C.card,borderRadius:12,padding:18,border:`2px solid ${C.pred}66`}}>
                <div style={{fontSize:11,color:C.pred,fontWeight:700,marginBottom:8,letterSpacing:1}}>ESTACIÓN TARGET</div>
                <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:4}}>{tgtProfile.id}</div>
                <div style={{fontSize:24,fontWeight:700,color:tgtCat.c,marginBottom:2}}>{tgtProfile.vec[0].toFixed(1)} <span style={{fontSize:12}}>µg/m³</span></div>
                <div style={{fontSize:11,padding:"2px 8px",borderRadius:6,display:"inline-block",background:tgtCat.c+"22",color:tgtCat.c,marginBottom:14}}>{tgtCat.l}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[["NO₂",tgtProfile.vec[3],C.bad,100],["SO₂",tgtProfile.vec[2],"#f97316",50],["CO",tgtProfile.vec[4]/50,C.warn,20],["Viento",tgtProfile.vec[9],C.clima,14],["Temp",tgtProfile.vec[6]+10,C.muted,50]].map(([lb,v,c,mx])=>(
                    <div key={lb}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:2}}>
                        <span>{lb}</span><span>{typeof tgtProfile.vec[FEATURES.indexOf(lb.replace("₂","2").replace("₃","3"))]!=="undefined"?tgtProfile.vec[FEATURES.indexOf(lb.replace("₂","2").replace("₃","3"))]?.toFixed(1):"–"}</span>
                      </div>
                      <Bar value={Math.max(0,v)} max={mx} color={c} height={5}/>
                    </div>))}
                  <div style={{marginTop:4,fontSize:11,color:tgtProfile.critPct>20?C.bad:tgtProfile.critPct>10?C.warn:C.good}}>
                    ⚠ {tgtProfile.critPct.toFixed(1)}% días críticos (PM2.5&gt;150)
                  </div>
                </div>
              </div>

              {/* Vecinos */}
              <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>
                  Top-{k} Estaciones más similares a <span style={{color:C.pred}}>{tgtProfile.id}</span>
                </div>
                {results.length===0?<div style={{color:C.muted,textAlign:"center",padding:32}}>Ejecuta KNN para ver los vecinos</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {results.slice(0,k).map((p,i)=><NeighborCard key={p.id} p={p} rank={i+1} targetVec={tgtProfile.vec} metric={metric}/>)}
                  </div>)}
              </div>
            </div>

            {/* Radar + barra de similitudes */}
            {results.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:16}}>
                <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted}}>Radar Multicontaminante</div>
                  <Radar vecs={radarVecs} labels={FEAT_LABELS.slice(0,6)} colors={radarColors} size={170}/>
                  <div style={{display:"flex",flexDirection:"column",gap:3,width:"100%"}}>
                    {[tgtProfile,...results.slice(0,2)].map((p,i)=>(
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:radarColors[i],flexShrink:0}}/>
                        <span style={{fontSize:10,color:C.muted}}>{p.id?.slice(0,12)}</span>
                      </div>))}
                  </div>
                </div>
                <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12}}>Similitud de todas las estaciones con <span style={{color:C.pred}}>{tgtProfile.id}</span></div>
                  <div data-chart>
                    <VBar data={profiles.map((p,i)=>({label:p.id.slice(0,7),value:i===target?100:(1/(1+knn(target,profiles,11,metric,featMask).find(r=>r.si===i)?.dist||Infinity))*100}))} color={C.pred} h={150}/>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4,textAlign:"center"}}>% similitud por estación</div>
                </div>
              </div>)}
          </div>
        )}

        {/* ══════════ TAB: TEMPORAL ══════════ */}
        {tab==="temporal"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>📅 Patrones temporales por estación</div>
              <select value={tempSt} onChange={e=>setTempSt(+e.target.value)}>
                {STATIONS.map((s,i)=><option key={i} value={i}>{s}</option>)}
              </select>
              <div style={{fontSize:11,color:C.muted}}>
                <span style={{color:C.pred}}>■</span> 2013-17 &nbsp;<span style={{color:C.good}}>■</span> 2022-26
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {[["PM2.5",0,C.bad],["NO₂",3,C.pred],["O₃",5,C.good],["Viento",9,C.clima]].map(([lb,fi,c])=>(
                <div key={lb} style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>{lb} mensual — {tempStation}</div>
                  <div style={{position:"relative"}} data-chart>
                    <VBar data={mH.map(m=>({label:m.label,value:m.vec[fi]}))} color={C.pred+"88"} h={110}/>
                    <div style={{position:"absolute",top:0,left:0,right:0,opacity:0.85}} data-chart>
                      <VBar data={mC.map(m=>({label:m.label,value:m.vec[fi]}))} color={c} h={110}/>
                    </div>
                  </div>
                </div>))}
            </div>

            {/* KNN temporal: meses similares entre períodos */}
            <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>🔍 KNN temporal: meses similares entre períodos</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:14}}>Para cada mes histórico, identifica el mes actual con perfil meteorológico más similar en <b style={{color:C.pred}}>{tempStation}</b></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {mH.map((mh,mi)=>{
                  if(!mh.vec.some(v=>v>0)) return null;
                  const normH=zscore(mH.map(m=>m.vec));
                  const normC=zscore(mC.map(m=>m.vec));
                  const dists=normC.map((vc,ci)=>({ci,label:mC[ci].label,d:cosine(normH[mi],vc)}));
                  dists.sort((a,b)=>a.d-b.d);
                  const best=dists[0];
                  const sim=(1/(1+best.d)*100).toFixed(0);
                  return(
                    <div key={mi} style={{background:C.bg,borderRadius:9,padding:"10px 13px",border:`1px solid ${C.border}`,minWidth:110,flex:"1 1 110px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.pred,marginBottom:3}}>Hist. {mh.label}</div>
                      <div style={{fontSize:12,color:C.text}}>≈ Act. <b>{best.label}</b></div>
                      <div style={{fontSize:10,color:C.muted}}>{sim}% similar</div>
                      <Bar value={+sim} max={100} color={C.pred} height={4}/>
                    </div>);
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB: HIPÓTESIS ══════════ */}
        {tab==="hipotesis"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:C.card,borderRadius:12,padding:20,border:`1px solid ${C.pred}44`}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>💡 Motor de Hipótesis de Valor con IA</div>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:14}}>
                El motor analiza los resultados KNN de similitud entre estaciones y genera hipótesis científicas accionables sobre <b style={{color:C.text}}>predicción de PM2.5</b>, <b style={{color:C.text}}>influencia climática</b>, <b style={{color:C.text}}>alertas hospitalarias/tráfico</b> y <b style={{color:C.text}}>comparación de períodos</b>.
              </div>
              {knnCtx?(
                <div style={{background:C.bg,borderRadius:8,padding:12,fontSize:11,color:C.muted,marginBottom:14,maxHeight:140,overflow:"auto",fontFamily:"monospace",lineHeight:1.6}}>
                  {knnCtx}
                </div>):(<div style={{background:C.bg,borderRadius:8,padding:10,fontSize:12,color:C.bad,marginBottom:14}}>⚠ Sin contexto KNN. Ve a 🔍 KNN, configura y ejecuta el análisis.</div>)}
              <button onClick={getHyps} disabled={hypLoad||!knnCtx}
                style={{background:knnCtx?`linear-gradient(135deg,${C.pred},#8b5cf6)`:"#1e293b",color:knnCtx?"#fff":C.muted,border:"none",borderRadius:9,padding:"11px 26px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:10,opacity:hypLoad?.75:1}}>
                {hypLoad&&<Spinner/>}
                {hypLoad?"Generando hipótesis...":"🔮 Generar Hipótesis con IA"}
              </button>
              {hypErr&&<div style={{marginTop:10,fontSize:12,color:C.bad}}>{hypErr}</div>}
            </div>

            {hyps.length>0&&(
              <>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {hyps.map(h=>{ const m=TIPO_META[h.tipo]||{color:C.pred,label:h.tipo}; return(
                    <div key={h.id} style={{padding:"4px 12px",borderRadius:8,background:m.color+"22",color:m.color,fontSize:11,fontWeight:700}}>{m.label}</div>);})}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {hyps.map(h=><HypCard key={h.id} h={h}/>)}
                </div>
              </>)}

            {!hyps.length&&!hypLoad&&(
              <div style={{textAlign:"center",padding:60,color:C.dim}}>
                <div style={{fontSize:48,marginBottom:12}}>🔬</div>
                <div style={{fontSize:14,color:C.muted}}>Las hipótesis aparecerán aquí.<br/>Primero ejecuta un KNN y luego genera.</div>
              </div>)}
          </div>
        )}

        {/* ══════════ TAB: COMPARATIVA ══════════ */}
        {tab==="compare"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
              {[["PM2.5 Hist.",avgH("PM2.5").toFixed(1)+" µg/m³",pm25Cat(avgH("PM2.5")).c],
                ["PM2.5 Actual",avgC("PM2.5").toFixed(1)+" µg/m³",pm25Cat(avgC("PM2.5")).c],
                ["Mejora PM2.5","↓ "+imp+"%",C.good],
                ["Días críticos hist",critH.toLocaleString()+" días",C.bad],
                ["Días críticos actual",critC.toLocaleString()+" días",C.warn],
                ["Reducción críticos",((critH-critC)/Math.max(critH,1)*100).toFixed(1)+"%",C.good]
              ].map(([l,v,c])=>(
                <div key={l} style={{background:C.card,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                </div>))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>PM2.5 por estación — histórico vs actual</div>
                <div data-chart>
                  <VBar data={profiles.map((p,i)=>({label:p.id.slice(0,6),value:p.vec[0]}))} color={C.pred+"aa"} h={130}/>
                </div>
                <div style={{marginTop:8}} data-chart>
                  <VBar data={(data?stationProfile(data.curr):[]).map(p=>({label:p.id.slice(0,6),value:p.vec[0]}))} color={C.good} h={130}/>
                </div>
                <div style={{fontSize:10,color:C.muted,marginTop:4,textAlign:"center"}}>
                  <span style={{color:C.pred}}>■</span> 2013-17 &nbsp; <span style={{color:C.good}}>■</span> 2022-26
                </div>
              </div>

              <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14}}>Δ mejora PM2.5 por estación</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {STATIONS.map((st,i)=>{
                    const vh=stationProfile(data.hist)[i].vec[0];
                    const vc=stationProfile(data.curr)[i].vec[0];
                    const d=((vh-vc)/Math.max(vh,1)*100);
                    const c=d>20?C.good:d>10?C.warn:C.bad;
                    return(
                      <div key={st} style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:90,fontSize:10,color:C.muted,textAlign:"right",flexShrink:0}}>{st.slice(0,9)}</div>
                        <div style={{flex:1}}><Bar value={Math.max(0,d)} max={60} color={c} height={7}/></div>
                        <div style={{width:42,fontSize:11,color:c,fontWeight:700,textAlign:"right"}}>↓{d.toFixed(0)}%</div>
                      </div>);
                  })}
                </div>
              </div>
            </div>

            {/* KNN cruzado: similitudes entre períodos */}
            <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>🔍 KNN cruzado: ¿qué estación actual se parece más a cada estación histórica?</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Compara perfiles promedio entre los dos conjuntos de datos para detectar cambios estructurales</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {(data?stationProfile(data.hist):[]).map((ph,hi)=>{
                  const currProf=data?stationProfile(data.curr):[];
                  if(!currProf.length) return null;
                  const normH=zscore([...currProf,ph].map(p=>p.vec));
                  const phNorm=normH[normH.length-1];
                  const dists=currProf.map((pc,ci)=>({id:pc.id,d:cosine(phNorm,normH[ci])}));
                  dists.sort((a,b)=>a.d-b.d);
                  const best=dists[0];
                  const sim=(1/(1+best.d)*100).toFixed(0);
                  const same=best.id===ph.id;
                  return(
                    <div key={ph.id} style={{background:C.bg,borderRadius:9,padding:"10px 13px",border:`1px solid ${same?C.good:C.border}`,flex:"1 1 140px"}}>
                      <div style={{fontSize:10,color:C.muted}}>Hist.</div>
                      <div style={{fontSize:12,fontWeight:700,color:C.pred}}>{ph.id.slice(0,10)}</div>
                      <div style={{fontSize:10,color:C.muted,margin:"3px 0"}}>↓ más similar</div>
                      <div style={{fontSize:12,fontWeight:700,color:same?C.good:C.text}}>{best.id.slice(0,10)}</div>
                      <div style={{fontSize:10,color:C.muted}}>{sim}% {same?"✓ misma":""}</div>
                    </div>);
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>);
}
