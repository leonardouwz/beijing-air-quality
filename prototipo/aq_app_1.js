/* aq_app_1.js — Motor de AIR::MONITOR (prototipo/index.html).
   Scatter [A] PCA/UMAP + KNN interactivo (L1) + K-means con contornos, todo enlazado
   a la selección; cuadrantes B/C (histogramas con toolbox) y D (serie temporal).
   CARGAS (lollipop) reactivas a la selección, con TOGGLE de modo (botón #pcaMode):
     - "global": cargas del PCA fijo + ◆ desviación de la selección por variable.
     - "rePCA": recalcula el PCA SOLO con el subconjunto seleccionado (≥ MIN_REPCA),
        ejes propios con signo alineado al global. El scatter A siempre usa ejes globales. */
"use strict";
(function () {
  const errEl = document.getElementById("err");
  if (!window.d3) { if (errEl) errEl.textContent = "No se pudo cargar D3 (vendor/d3.v7.min.js)."; return; }

  const TH = window.AQ_THEME || {};
  const SEASON_COL = TH.season || ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
  const PERIOD_COL = TH.period || ["#38bdf8", "#fb7185"];
  const ZONA_COL   = TH.zona   || ["#60a5fa", "#34d399", "#fbbf24", "#f472b6"];
  const DIM = TH.dim || "#5b6b7d";
  const SELC = TH.sel || "#f43f5e";
  const DOT = TH.dot || 2.2, DOTSEL = TH.dotSel || 3.2;
  const LOAD1 = "#5bb0ff";
  const MIN_REPCA = 30;                 // mínimo de puntos para un re-PCA fiable
  // Paleta para "todas las variables" (una línea por variable en el polígono).
  const VAR_COLORS = ["#5bb0ff", "#36e08a", "#ffb454", "#c792ea", "#ff6e6e", "#f5d76e", "#7ee787", "#ff9ff3", "#79c0ff", "#b0b0b0"];

  const FEAT_LABELS = {
    "PM2.5": "PM2.5 (µg/m³)", "PM10": "PM10 (µg/m³)", "SO2": "SO2 (µg/m³)",
    "NO2": "NO2 (µg/m³)", "CO": "CO (µg/m³)", "O3": "O3 (µg/m³)",
    "TEMP": "TEMP (°C)", "PRES": "PRES (hPa)", "DEW": "DEWP — punto de rocío (°C)", "WSPM": "WSPM (m/s)",
  };
  const FEAT_SHORT = { "DEW": "DEWP" };
  const flabel = f => FEAT_LABELS[f] || f;
  const fshort = f => FEAT_SHORT[f] || f;
  const fmtNum = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

  // ── AQI (US EPA) ──
  const AQI_BP = {
    "PM2.5": [[0.0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
              [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]],
    "PM10":  [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
              [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]],
  };
  const AQI_BANDS = [
    { hi: 50,  name: "Buena",                 color: "#36e08a" },
    { hi: 100, name: "Moderada",              color: "#e6d152" },
    { hi: 150, name: "Dañina (g. sensibles)", color: "#ff9f45" },
    { hi: 200, name: "Dañina",                color: "#ff5d5d" },
    { hi: 300, name: "Muy dañina",            color: "#b07be0" },
    { hi: 500, name: "Peligrosa",             color: "#d1495b" },
  ];
  function aqiCat(aqi) { for (const b of AQI_BANDS) if (aqi <= b.hi) return b; return AQI_BANDS[AQI_BANDS.length - 1]; }
  function aqiSub(conc, table) {
    if (!(conc >= 0)) return null;
    const lastHi = table[table.length - 1][1];
    if (conc >= lastHi) return 500;
    for (const [cl, ch, il, ih] of table) {
      if (conc <= ch) { const c = Math.max(conc, cl); return Math.round((ih - il) / (ch - cl) * (c - cl) + il); }
    }
    return 500;
  }
  function aqiOf(i) {
    let mx = 0;
    const s25 = aqiSub(orig(I_PM, i), AQI_BP["PM2.5"]); if (s25 != null && s25 > mx) mx = s25;
    if (I_PM10 >= 0) { const s10 = aqiSub(orig(I_PM10, i), AQI_BP["PM10"]); if (s10 != null && s10 > mx) mx = s10; }
    return mx;
  }

  const DATASETS = { treated: window.AQ_DATA, raw: window.AQ_DATA_RAW };
  if (!DATASETS.treated || !DATASETS.treated.X) {
    if (errEl) errEl.textContent = "No se pudo cargar data/aq_data.js. Ejecuta:  python build_data.py";
    return;
  }
  let D = DATASETS.treated;

  let FEAT, FMIN, FMAX, N, IDX, I_PM, I_PM10, I_DEW, I_TEMP, I_WSPM, I_PRES, pc1, pc2, pcs;
  let AQIv, cityAqiAvg = 0, featMeanAll;
  let pcsAll, pcaMean;                      // autovectores globales + medias (para re-PCA de cargas)
  let pcaMode = "global";                  // "global" | "rePCA"
  let layoutMode = "pca";                   // scatter A: "pca" (cliente) | "umap" (precalculado)
  // KNN interactivo (Clase 3): clic en un punto → sus k vecinos L1 en el espacio 10-D original.
  let knnK = 8, knnAnchor = null, knnNbrs = null;
  // K-means sobre las 10 variables normalizadas → regímenes con color fijo + contorno.
  let nClusters = 4, clusterOf = null, clusterMeta = null, clusterStats = null;
  const CLUSTER_COL = ["#ff6e6e", "#ffb454", "#5bb0ff", "#36e08a", "#c792ea", "#f5d76e"];
  let currentKey = "treated";               // dataset activo (para buscar su embedding UMAP)
  function deriveDataset() {
    FEAT = D.meta.features; FMIN = D.meta.feat_min; FMAX = D.meta.feat_max; N = D.meta.n;
    IDX = {}; FEAT.forEach((f, i) => IDX[f] = i);
    I_PM = IDX["PM2.5"]; I_PM10 = (IDX["PM10"] != null ? IDX["PM10"] : -1);
    I_DEW = IDX["DEW"]; I_TEMP = IDX["TEMP"]; I_WSPM = IDX["WSPM"]; I_PRES = IDX["PRES"];
    B.feat = I_PM; C.feat = I_DEW;
    const r = computePCA(); pc1 = r.pc1; pc2 = r.pc2; pcs = r.pcs;
    pcsAll = r.allVec; pcaMean = r.mean;
    buildDerived();
  }
  function orig(j, i) { return FMIN[j] + D.X[j][i] * (FMAX[j] - FMIN[j]); }

  function buildDerived() {
    AQIv = new Float64Array(N); let s = 0;
    for (let i = 0; i < N; i++) { const a = aqiOf(i); AQIv[i] = a; s += a; }
    cityAqiAvg = N ? s / N : 0;
    featMeanAll = new Array(FEAT.length);
    for (let j = 0; j < FEAT.length; j++) { let sj = 0; const col = D.X[j]; for (let i = 0; i < N; i++) sj += col[i]; featMeanAll[j] = sj / N; }
  }

  // ── PCA (covarianza + Jacobi) — ahora expone TODOS los autovectores/ratios ──
  function computePCA() {
    const p = FEAT.length, mean = new Float64Array(p);
    for (let j = 0; j < p; j++) { let s = 0; const c = D.X[j]; for (let i = 0; i < N; i++) s += c[i]; mean[j] = s / N; }
    const C = Array.from({ length: p }, () => new Float64Array(p));
    for (let j = 0; j < p; j++) for (let k = j; k < p; k++) {
      let s = 0; const cj = D.X[j], ck = D.X[k], mj = mean[j], mk = mean[k];
      for (let i = 0; i < N; i++) s += (cj[i] - mj) * (ck[i] - mk);
      const v = s / (N - 1); C[j][k] = v; C[k][j] = v;
    }
    const { values, vectors } = jacobi(C);
    const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
    const total = values.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
    const pcsL = order.slice(0, 2).map(o => ({ vec: vectors.map(r => r[o]), ratio: Math.max(values[o], 0) / total }));
    const allVec = order.map(o => vectors.map(r => r[o]));            // 10 autovectores (desc)
    const allRat = order.map(o => Math.max(values[o], 0) / total);   // 10 ratios (desc)
    const a1 = new Float64Array(N), a2 = new Float64Array(N);
    for (let i = 0; i < N; i++) { let a = 0, b = 0; for (let j = 0; j < p; j++) { const cx = D.X[j][i] - mean[j]; a += cx * pcsL[0].vec[j]; b += cx * pcsL[1].vec[j]; } a1[i] = a; a2[i] = b; }
    return { pc1: a1, pc2: a2, pcs: pcsL, allVec, allRatios: allRat, mean };
  }
  function jacobi(Ain) {
    const n = Ain.length, A = Ain.map(r => Float64Array.from(r));
    const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-12) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let i = 0; i < n; i++) { const aip = A[i][p], aiq = A[i][q]; A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq; }
        for (let i = 0; i < n; i++) { const api = A[p][i], aqi = A[q][i]; A[p][i] = c * api - s * aqi; A[q][i] = s * api + c * aqi; }
        for (let i = 0; i < n; i++) { const vip = V[i][p], viq = V[i][q]; V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq; }
      }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
  }

  // PCA SOLO del subconjunto: autovectores top-2 (signo alineado al global) + ratios.
  function subsetPCA(arr) {
    const p = FEAT.length, nn = arr.length, mean = new Float64Array(p);
    for (let j = 0; j < p; j++) { let s = 0; const c = D.X[j]; for (const i of arr) s += c[i]; mean[j] = s / nn; }
    const C = Array.from({ length: p }, () => new Float64Array(p));
    for (let j = 0; j < p; j++) for (let k = j; k < p; k++) {
      let s = 0; const cj = D.X[j], ck = D.X[k], mj = mean[j], mk = mean[k];
      for (const i of arr) s += (cj[i] - mj) * (ck[i] - mk);
      const val = s / Math.max(nn - 1, 1); C[j][k] = val; C[k][j] = val;
    }
    const { values, vectors } = jacobi(C);
    const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
    const total = values.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
    const align = (vec, g) => { let d = 0; for (let j = 0; j < vec.length; j++) d += vec[j] * g[j]; return d < 0 ? vec.map(x => -x) : vec; };
    const v0 = align(vectors.map(r => r[order[0]]), pcsAll[0]);
    const v1 = align(vectors.map(r => r[order[1]]), pcsAll[1]);
    return { v0, v1, ratios: order.map(o => Math.max(values[o], 0) / total) };
  }

  let selected = null, colorMode = "season";
  const colorOf = (i) => colorMode === "season" ? SEASON_COL[D.season[i]]
    : colorMode === "period" ? PERIOD_COL[D.period[i]]
    : colorMode === "zona" ? ZONA_COL[D.zona[i]]
    : colorMode === "cluster" ? (clusterOf ? clusterMeta[clusterOf[i]].color : DIM)
    : aqiCat(AQIv[i]).color;               // colorMode === "aqi": color por banda de AQI del registro

  function renderLegend() {
    const el = document.getElementById("legend"); if (!el) return;
    let items;
    if (colorMode === "season") items = D.meta.seasons.map((s, i) => [s, SEASON_COL[i]]);
    else if (colorMode === "period") items = D.meta.periods.map((s, i) => [s, PERIOD_COL[i]]);
    else if (colorMode === "zona") items = D.meta.zonas.map((s, i) => [s, ZONA_COL[i]]);
    else if (colorMode === "cluster") items = (clusterMeta || []).map(c => [`${c.name} · PM2.5 ${c.pm.toFixed(0)}`, c.color]);  // régimen K-means, nombrado por PM2.5
    else items = AQI_BANDS.map((b, i) => [`${b.name} ${i ? AQI_BANDS[i - 1].hi + 1 : 0}–${b.hi}`, b.color]);  // AQI: nombre + rango
    el.innerHTML = items.map(([n, c], i) => `<span class="lg" data-i="${i}" title="Clic: seleccionar todos estos días"><i class="dot" style="background:${c}"></i>${n}</span>`).join("");
    el.querySelectorAll(".lg").forEach(sp => sp.addEventListener("click", () => selectCategory(+sp.dataset.i)));
  }
  // Clic en una entrada de la leyenda → selecciona todos los días de esa categoría (según el color activo).
  // Hace que "comparar zonas / estaciones / regímenes" sea un clic: los paneles B/C/D describen ese grupo.
  function selectCategory(idx) {
    const match = colorMode === "season" ? (i => D.season[i] === idx)
      : colorMode === "period" ? (i => D.period[i] === idx)
      : colorMode === "zona" ? (i => D.zona[i] === idx)
      : colorMode === "cluster" ? (i => clusterOf && clusterOf[i] === idx)
      : (i => AQI_BANDS.indexOf(aqiCat(AQIv[i])) === idx);
    const s = new Set(); for (let i = 0; i < N; i++) if (match(i)) s.add(i);
    if (!s.size) return;
    knnAnchor = null; knnNbrs = null; selected = s;   // nota: no llamar A.brush.move(null) — dispara brushEnded y borra la selección
    scheduleRedraw(); updateAux();
  }

  // ═══ K-means (Lloyd) sobre las 10 variables Min-Max → regímenes de aire ═══
  // Se etiquetan por PM2.5 medio descendente: clúster 0 = "Crisis", … = "Limpio".
  function computeKMeans(kk) {
    const p = FEAT.length;
    let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const cent = []; const used = new Set();
    while (cent.length < kk) { const r = Math.floor(rnd() * N); if (used.has(r)) continue; used.add(r); cent.push(FEAT.map((_, j) => D.X[j][r])); }
    const assign = new Int16Array(N);
    for (let it = 0; it < 12; it++) {                 // ponytail: 12 iter fijas; suficiente y acotado para ~10^5 puntos
      for (let i = 0; i < N; i++) { let best = 0, bd = Infinity; for (let c = 0; c < kk; c++) { let s = 0; for (let j = 0; j < p; j++) { const dd = D.X[j][i] - cent[c][j]; s += dd * dd; } if (s < bd) { bd = s; best = c; } } assign[i] = best; }
      const sum = Array.from({ length: kk }, () => new Float64Array(p)), cnt = new Int32Array(kk);
      for (let i = 0; i < N; i++) { const c = assign[i]; cnt[c]++; for (let j = 0; j < p; j++) sum[c][j] += D.X[j][i]; }
      for (let c = 0; c < kk; c++) if (cnt[c]) for (let j = 0; j < p; j++) cent[c][j] = sum[c][j] / cnt[c];
    }
    // Métricas de calidad (validación cuantitativa) en una pasada, sobre los centroides finales:
    //  · Silueta SIMPLIFICADA: a=dist. euclídea al centroide propio, b=al centroide ajeno más cercano.
    //    ponytail: la silueta clásica es O(N²); la variante por centroides es O(N·k) y suficiente aquí.
    //  · Davies-Bouldin: (dispersión_c + dispersión_c') / dist(centroides).
    const pmSum = new Float64Array(kk), cc = new Int32Array(kk), scatter = new Float64Array(kk);
    const dc = new Float64Array(kk); let silSum = 0;
    for (let i = 0; i < N; i++) {
      const c = assign[i]; cc[c]++; pmSum[c] += orig(I_PM, i);
      for (let cn = 0; cn < kk; cn++) { let s = 0; for (let j = 0; j < p; j++) { const dd = D.X[j][i] - cent[cn][j]; s += dd * dd; } dc[cn] = Math.sqrt(s); }
      const a = dc[c]; let b = Infinity; for (let cn = 0; cn < kk; cn++) if (cn !== c && dc[cn] < b) b = dc[cn];
      silSum += (b - a) / (Math.max(a, b) || 1); scatter[c] += a;
    }
    for (let c = 0; c < kk; c++) scatter[c] /= (cc[c] || 1);
    let dbSum = 0;
    for (let c = 0; c < kk; c++) { let mx = 0; for (let c2 = 0; c2 < kk; c2++) { if (c2 === c) continue; let s = 0; for (let j = 0; j < p; j++) { const dd = cent[c][j] - cent[c2][j]; s += dd * dd; } const M = Math.sqrt(s) || 1e-9; const R = (scatter[c] + scatter[c2]) / M; if (R > mx) mx = R; } dbSum += mx; }
    clusterStats = { silhouette: silSum / N, daviesBouldin: kk > 1 ? dbSum / kk : 0 };
    const pmMean = Array.from(pmSum, (s, c) => s / (cc[c] || 1));
    const order = d3.range(kk).sort((a, b) => pmMean[b] - pmMean[a]);   // 0 = PM2.5 más alto
    const rank = new Int16Array(kk); order.forEach((c, r) => rank[c] = r);
    clusterOf = new Int16Array(N); for (let i = 0; i < N; i++) clusterOf[i] = rank[assign[i]];
    const NAMES = { 2: ["Crisis", "Limpio"], 3: ["Crisis", "Moderado", "Limpio"], 4: ["Crisis", "Alto", "Moderado", "Limpio"] }[kk];
    clusterMeta = d3.range(kk).map(r => ({ name: NAMES ? NAMES[r] : "Clúster " + (r + 1), color: CLUSTER_COL[r % CLUSTER_COL.length], pm: pmMean[order[r]], n: cc[order[r]] }));
    updateClusterQual();
  }
  function updateClusterQual() {
    const el = document.getElementById("clusterQual"); if (!el) return;
    if (!clusterStats) { el.innerHTML = "—"; return; }
    const sil = clusterStats.silhouette, q = sil > 0.5 ? "var(--green)" : sil > 0.25 ? "var(--sel)" : "#ff6e6e";
    el.innerHTML = `Silueta <b style="color:${q}">${sil.toFixed(3)}</b> · DB <b>${clusterStats.daviesBouldin.toFixed(2)}</b>`;
  }
  function ensureClusters() { if (!clusterOf || clusterMeta.length !== nClusters) computeKMeans(nClusters); }

  // Contornos por clúster: envolvente convexa (ponytail: convex hull; alphashape cóncavo si los
  // regímenes se entrelazan). Dibujados en SVG bajo el overlay del brush, sin capturar el ratón.
  function drawHulls() {
    const svg = d3.select("#svgA"); svg.selectAll("g.hulls").remove();
    if (colorMode !== "cluster" || !clusterOf || !A.px) return;
    const g = svg.insert("g", ":first-child").attr("class", "hulls").attr("pointer-events", "none");
    for (let c = 0; c < clusterMeta.length; c++) {
      const pts = []; for (let i = 0; i < N; i++) if (clusterOf[i] === c) pts.push([A.px[i], A.py[i]]);
      if (pts.length < 3) continue;
      const hull = d3.polygonHull(pts); if (!hull) continue;
      g.append("path").attr("d", "M" + hull.join("L") + "Z").attr("fill", clusterMeta[c].color)
        .attr("fill-opacity", 0.07).attr("stroke", clusterMeta[c].color).attr("stroke-opacity", 0.55).attr("stroke-width", 1.2);
    }
  }

  // Top-k por distancia ascendente vía max-heap acotado a tamaño k: O(N log k) en vez de
  // O(N log N). En el dataset crudo (N=383K) el sort completo dominaba el costo del clic
  // (~256 de ~350 ms); con k~8-40 esto lo recorta a decenas de ms.
  function topKByDist(d, n, k) {
    const heap = [];
    const siftUp = (i) => { while (i > 0) { const par = (i - 1) >> 1; if (d[heap[par]] >= d[heap[i]]) break; [heap[par], heap[i]] = [heap[i], heap[par]]; i = par; } };
    const siftDown = (i) => { for (;;) { let top = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < heap.length && d[heap[l]] > d[heap[top]]) top = l; if (r < heap.length && d[heap[r]] > d[heap[top]]) top = r; if (top === i) break; [heap[i], heap[top]] = [heap[top], heap[i]]; i = top; } };
    for (let q = 0; q < n; q++) {
      if (heap.length < k) { heap.push(q); siftUp(heap.length - 1); }
      else if (d[q] < d[heap[0]]) { heap[0] = q; siftDown(0); }
    }
    return heap.sort((a, b) => d[a] - d[b]);   // heap.length <= k, ordenar esto es negligible
  }
  // KNN interactivo: k vecinos más cercanos del ancla por distancia Manhattan (L1) en el espacio
  // 10-D original normalizado. La vecindad pasa a ser la "selección" → enlaza B/C/D/cargas/scree.
  function pickKNN(anchor) {
    const p = FEAT.length, d = new Float64Array(N);
    for (let q = 0; q < N; q++) { let s = 0; for (let j = 0; j < p; j++) s += Math.abs(D.X[j][anchor] - D.X[j][q]); d[q] = s; }
    const idx = topKByDist(d, N, knnK + 1);
    knnAnchor = anchor; knnNbrs = idx; selected = new Set(idx);
    scheduleRedraw(); updateAux();
  }

  const DPR = Math.max(1, window.devicePixelRatio || 1);
  function sizeCanvas(canvas, w, h) {
    canvas.width = w * DPR; canvas.height = h * DPR; canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d"); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); return ctx;
  }

  // Layout del scatter A: PCA (cliente) o UMAP (precalculado, alineado por índice).
  function umapFor(key) {
    const U = window.AQ_UMAP;
    return (U && U[key] && Array.isArray(U[key].u1) && U[key].u1.length === N && Array.isArray(U[key].u2)) ? U[key] : null;
  }
  function layoutXY() {
    if (layoutMode === "umap") { const u = umapFor(currentKey); if (u) return { x: u.u1, y: u.u2, kind: "umap" }; }
    return { x: pc1, y: pc2, kind: "pca" };
  }

  const A = { m: { t: 10, r: 14, b: 34, l: 44 } };
  function setupA() {
    const plot = document.getElementById("plotA"); A.W = plot.clientWidth; A.H = plot.clientHeight;
    A.iw = A.W - A.m.l - A.m.r; A.ih = A.H - A.m.t - A.m.b;
    A.ctx = sizeCanvas(document.getElementById("canvasA"), A.W, A.H);
    const L = layoutXY();
    A.x = d3.scaleLinear().domain(d3.extent(L.x)).nice().range([A.m.l, A.m.l + A.iw]);
    A.y = d3.scaleLinear().domain(d3.extent(L.y)).nice().range([A.m.t + A.ih, A.m.t]);
    A.px = new Float64Array(N); A.py = new Float64Array(N);
    for (let i = 0; i < N; i++) { A.px[i] = A.x(L.x[i]); A.py[i] = A.y(L.y[i]); }
    A.quad = d3.quadtree().x(i => A.px[i]).y(i => A.py[i]).addAll(d3.range(N));
    renderBaseA();
    const svg = d3.select("#svgA").attr("width", A.W).attr("height", A.H); svg.selectAll("*").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${A.m.t + A.ih})`).call(d3.axisBottom(A.x).ticks(6));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${A.m.l},0)`).call(d3.axisLeft(A.y).ticks(6));
    const isU = L.kind === "umap";
    svg.append("text").attr("x", A.m.l + A.iw / 2).attr("y", A.H - 4).attr("text-anchor", "middle")
      .attr("fill", "var(--ink-dim)").attr("font-size", 11).text(isU ? "UMAP-1 (no lineal)" : `PC1 (${(pcs[0].ratio * 100).toFixed(1)}% var.)`);
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -(A.m.t + A.ih / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 11).text(isU ? "UMAP-2" : `PC2 (${(pcs[1].ratio * 100).toFixed(1)}% var.)`);
    A.brush = d3.brush().extent([[A.m.l, A.m.t], [A.m.l + A.iw, A.m.t + A.ih]]).on("brush", brushed).on("end", brushEnded);
    A.brushG = svg.append("g").attr("class", "brush").call(A.brush);
    const ov = A.brushG.select(".overlay");
    ov.on("mousemove.tip", hoverMove).on("mouseleave.tip", hideTip);
    // Clic (sin arrastrar) sobre un punto → KNN. Se distingue del brush por la distancia recorrida.
    let down = null;
    ov.on("mousedown.knn", (e) => { down = d3.pointer(e, document.getElementById("svgA")); });
    ov.on("click.knn", (e) => {
      const up = d3.pointer(e, document.getElementById("svgA"));
      if (down && Math.hypot(up[0] - down[0], up[1] - down[1]) > 4) { down = null; return; }  // fue un brush
      down = null; const i = A.quad.find(up[0], up[1], 12);
      if (i !== undefined) pickKNN(i);
    });
    drawHulls();
    const ps = document.getElementById("pcaSub");
    if (ps) ps.textContent = (L.kind === "umap")
      ? `UMAP · ${N.toLocaleString("es")} registros · vecindarios locales (ejes sin escala interpretable)`
      : `PC1 × PC2 · ${N.toLocaleString("es")} registros · var. acumulada ${((pcs[0].ratio + pcs[1].ratio) * 100).toFixed(1)}%`;
  }

  // ═══ CARGAS (loadings) reactivas a la selección ═══
  function renderLoadings() {
    if (!pcsAll) return;
    const hasSel = selected && selected.size > 0;
    let v1 = pcsAll[0], v2 = pcsAll[1], dev = null, srcLabel = "global";
    if (pcaMode === "rePCA" && hasSel && selected.size >= MIN_REPCA) {
      const sp = subsetPCA([...selected]); v1 = sp.v0; v2 = sp.v1; srcLabel = `clúster n=${selected.size.toLocaleString("es")} (ejes propios)`;
    } else {
      if (hasSel) {
        const arr = [...selected]; dev = new Array(FEAT.length);
        for (let j = 0; j < FEAT.length; j++) { let s = 0; const c = D.X[j]; for (const i of arr) s += c[i]; dev[j] = s / arr.length - featMeanAll[j]; }
      }
      srcLabel = (pcaMode === "rePCA" && hasSel) ? `global (selección < ${MIN_REPCA})` : (hasSel ? "global + desv. selección" : "global");
    }
    let mx = 0;
    for (let j = 0; j < FEAT.length; j++) { mx = Math.max(mx, Math.abs(v1[j]), Math.abs(v2[j])); if (dev) mx = Math.max(mx, Math.abs(dev[j])); }
    mx = mx || 1;
    const src = document.getElementById("loadSrc"); if (src) src.textContent = srcLabel;

    // Lollipop (svgLoad1)
    (function () {
      const host = document.getElementById("svgLoad1"); if (!host) return;
      const par = host.parentNode, W = par.clientWidth, H = par.clientHeight;
      const svg = d3.select(host).attr("width", W).attr("height", H); svg.selectAll("*").remove();
      if (W < 12 || H < 12) return;
      const m = { t: 4, r: 10, b: 4, l: 46 };
      const x = d3.scaleLinear().domain([-mx, mx]).range([m.l, W - m.r]);
      const yb = d3.scaleBand().domain(FEAT).range([m.t, H - m.b]).padding(0.32);
      const zero = x(0);
      svg.append("line").attr("x1", zero).attr("x2", zero).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--grid)");
      svg.selectAll("text.v").data(FEAT).enter().append("text").attr("class", "v")
        .attr("x", m.l - 4).attr("y", f => yb(f) + yb.bandwidth() / 2).attr("dy", "0.32em")
        .attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", 9).text(f => fshort(f));
      const off = yb.bandwidth() * 0.22;
      FEAT.forEach((f, j) => {
        const yc = yb(f) + yb.bandwidth() / 2;
        [[v1[j], LOAD1, -off], [v2[j], SELC, off]].forEach(([val, col, dy]) => {
          const yy = yc + dy;
          svg.append("line").attr("x1", zero).attr("x2", x(val)).attr("y1", yy).attr("y2", yy)
            .attr("stroke", col).attr("stroke-width", 1.4).attr("opacity", 0.85);
          svg.append("circle").attr("cx", x(val)).attr("cy", yy).attr("r", 2.4).attr("fill", col);
        });
      });
      // Interactivo: ◆ = desviación de la selección por variable (media sel − media global),
      // en la misma escala de cargas. Aparece al hacer brushing (modo global).
      if (dev) FEAT.forEach((f, j) => {
        const yc = yb(f) + yb.bandwidth() / 2, dx = x(dev[j]);
        svg.append("line").attr("x1", zero).attr("x2", dx).attr("y1", yc).attr("y2", yc)
          .attr("stroke", "#9be7ff").attr("stroke-width", 1).attr("stroke-dasharray", "2 2").attr("opacity", 0.7);
        svg.append("rect").attr("x", dx - 3).attr("y", yc - 3).attr("width", 6).attr("height", 6)
          .attr("transform", `rotate(45 ${dx} ${yc})`).attr("fill", "#9be7ff").attr("opacity", 0.95);
      });
    })();
  }

  function updateAux() { renderLoadings(); }


  // ── Heatmap de correlación Pearson 10×10 ──
  function drawCorr() {
    const host = document.getElementById("svgCorr"); if (!host) return;
    const par = host.parentNode, W = par.clientWidth, H = par.clientHeight;
    const svg = d3.select(host).attr("width", W).attr("height", H); svg.selectAll("*").remove();
    if (W < 40 || H < 30) return;
    const p = FEAT.length;
    // Reactivo a la selección: con selección → correlaciones del subconjunto (revela estructura
    // condicional, p. ej. DEWP↔PM2.5 ≈+0.6 en invierno vs ≈0 global). Sin selección → ciudad.
    const hasSel = selected && selected.size > 1;
    const rows = hasSel ? [...selected] : null, n = hasSel ? rows.length : N;
    const means = new Float64Array(p);
    for (let j = 0; j < p; j++) { let s = 0; const col = D.X[j]; if (rows) { for (const i of rows) s += col[i]; } else { for (let i = 0; i < N; i++) s += col[i]; } means[j] = s / n; }
    const R = Array.from({ length: p }, () => new Float64Array(p));
    for (let j = 0; j < p; j++) {
      R[j][j] = 1;
      for (let k = j + 1; k < p; k++) {
        let sxy = 0, sx2 = 0, sy2 = 0;
        const cj = D.X[j], ck = D.X[k], mj = means[j], mk = means[k];
        if (rows) { for (const i of rows) { const dj = cj[i] - mj, dk = ck[i] - mk; sxy += dj * dk; sx2 += dj * dj; sy2 += dk * dk; } }
        else { for (let i = 0; i < N; i++) { const dj = cj[i] - mj, dk = ck[i] - mk; sxy += dj * dk; sx2 += dj * dj; sy2 += dk * dk; } }
        const r = sxy / Math.sqrt(sx2 * sy2 || 1);
        R[j][k] = r; R[k][j] = r;
      }
    }
    const cScale = d3.scaleLinear().domain([-1, 0, 1]).range(["#3b82f6", "#0e1a14", "#f43f5e"]);
    const m = { t: 10, r: 10, b: 52, l: 48 };
    const usableW = W - m.l - m.r, usableH = H - m.t - m.b;
    const cell = Math.min(usableW / p, usableH / p);
    const gx = m.l + (usableW - cell * p) / 2, gy = m.t;
    for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) {
      svg.append("rect").attr("x", gx + k * cell).attr("y", gy + j * cell)
        .attr("width", cell - 1).attr("height", cell - 1).attr("fill", cScale(R[j][k]));
      if (cell >= 24) svg.append("text")
        .attr("x", gx + k * cell + cell / 2).attr("y", gy + j * cell + cell / 2 + 3.5)
        .attr("text-anchor", "middle").attr("fill", Math.abs(R[j][k]) > 0.45 ? "#fff" : "var(--ink)")
        .attr("font-size", Math.min(cell * 0.26, 9)).text(R[j][k].toFixed(2));
    }
    FEAT.forEach((f, j) => svg.append("text").attr("x", gx - 4).attr("y", gy + j * cell + cell / 2 + 3.5)
      .attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", Math.min(cell * 0.4, 9.5)).text(fshort(f)));
    FEAT.forEach((f, k) => svg.append("text")
      .attr("transform", "translate(" + (gx + k * cell + cell / 2) + "," + (gy + p * cell + 6) + ") rotate(40)")
      .attr("text-anchor", "start").attr("fill", "var(--ink-dim)").attr("font-size", Math.min(cell * 0.4, 9.5)).text(fshort(f)));
    const bx = gx, by = H - 11, bw = cell * p, bh = 5;
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "corrGrad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#3b82f6");
    grad.append("stop").attr("offset", "50%").attr("stop-color", "#0e1a14");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#f43f5e");
    svg.append("rect").attr("x", bx).attr("y", by).attr("width", bw).attr("height", bh).attr("fill", "url(#corrGrad)");
    svg.append("text").attr("x", bx).attr("y", by - 2).attr("fill", "var(--ink-dim)").attr("font-size", 7).text("-1");
    svg.append("text").attr("x", bx + bw / 2).attr("y", by - 2).attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 7).text("r Pearson");
    svg.append("text").attr("x", bx + bw).attr("y", by - 2).attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", 7).text("+1");
    svg.append("text").attr("x", gx).attr("y", gy - 2).attr("fill", hasSel ? "var(--sel)" : "var(--ink-dim)").attr("font-size", 8)
      .text(hasSel ? `selección · n=${n.toLocaleString("es")}` : "ciudad (global)");
  }

  // ── Coordenadas Paralelas (PCP) enlazadas al brushing ──
  function drawPCP() {
    const host = document.getElementById("svgPCP"); if (!host) return;
    const par = host.parentNode, W = par.clientWidth, H = par.clientHeight;
    const svg = d3.select(host).attr("width", W).attr("height", H); svg.selectAll("*").remove();
    if (W < 40 || H < 20) return;
    const p = FEAT.length;
    const m = { t: 20, r: 10, b: 18, l: 6 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xScale = d3.scalePoint().domain(FEAT).range([m.l, m.l + iw]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, 1]).range([m.t + ih, m.t]);
    FEAT.forEach(f => {
      const x = xScale(f);
      svg.append("line").attr("x1", x).attr("x2", x).attr("y1", m.t).attr("y2", m.t + ih).attr("stroke", "var(--edge)").attr("stroke-width", 1);
      svg.append("text").attr("x", x).attr("y", m.t - 4).attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 7.5).text(fshort(f));
    });
    const hasSel = selected && selected.size > 0;
    let indices;
    if (hasSel) {
      indices = [...selected];
    } else {
      const step = Math.max(1, Math.ceil(N / 800));
      indices = []; for (let i = 0; i < N; i += step) indices.push(i);
    }
    const lineGen = d3.line();
    const gLines = svg.append("g").attr("opacity", hasSel ? 0.75 : 0.18);
    const maxLines = hasSel ? Math.min(indices.length, 1500) : indices.length;
    for (let li = 0; li < maxLines; li++) {
      const i = indices[li];
      const pts = FEAT.map((f, j) => [xScale(f), yScale(D.X[j][i])]);
      gLines.append("path").attr("d", lineGen(pts)).attr("fill", "none").attr("stroke", colorOf(i)).attr("stroke-width", hasSel ? 1.0 : 0.5);
    }
    const sub = document.getElementById("pcpSub");
    if (sub) sub.textContent = hasSel
      ? (selected.size.toLocaleString("es") + " registros sel. · cada linea = 1 dia")
      : ("muestra " + maxLines.toLocaleString("es") + " de " + N.toLocaleString("es") + " · arrastra en [A] para filtrar");
  }

  // ── Control de pestanas del panel inferior ──
  let bottomMode = "load";
  function drawBottom() { if (bottomMode === "corr") drawCorr(); else if (bottomMode === "pcp") drawPCP(); }
  function switchBottom(mode) {
    bottomMode = mode;
    document.querySelectorAll(".btab").forEach(b => b.classList.toggle("active", b.dataset.tab === mode));
    const tl = document.getElementById("tab-load"); if (tl) tl.style.display = mode === "load" ? "grid" : "none";
    const tc = document.getElementById("tab-corr"); if (tc) tc.style.display = mode === "corr" ? "block" : "none";
    const tp = document.getElementById("tab-pcp"); if (tp) tp.style.display = mode === "pcp" ? "flex" : "none";
    const right = document.querySelector(".right");
    if (right) right.classList.toggle("bottom-expanded", mode !== "load");
    drawBottom();
  }

  function renderBaseA() {
    A.base = A.base || document.createElement("canvas"); A.base.width = A.W * DPR; A.base.height = A.H * DPR;
    const b = A.base.getContext("2d"); b.setTransform(DPR, 0, 0, DPR, 0, 0); b.clearRect(0, 0, A.W, A.H);
    b.globalAlpha = TH.baseAlpha || 0.6; const sz = N > 120000 ? 1.6 : DOT, off = sz / 2;
    for (let i = 0; i < N; i++) { b.fillStyle = colorOf(i); b.fillRect(A.px[i] - off, A.py[i] - off, sz, sz); }
    b.globalAlpha = 1;
  }
  function drawA() {
    const ctx = A.ctx; ctx.clearRect(0, 0, A.W, A.H);
    const hasSel = selected && selected.size > 0;
    if (!hasSel) { ctx.drawImage(A.base, 0, 0, A.W, A.H); return; }
    ctx.globalAlpha = TH.dimAlpha || 0.28; ctx.drawImage(A.base, 0, 0, A.W, A.H); ctx.globalAlpha = 1;
    for (const i of selected) { ctx.fillStyle = colorOf(i); ctx.fillRect(A.px[i] - DOTSEL / 2, A.py[i] - DOTSEL / 2, DOTSEL, DOTSEL); }
    // Radios KNN: ancla → cada vecino (los cruces largos en UMAP son reales: vecinos en 10-D, no en 2-D).
    if (knnAnchor != null && knnNbrs) {
      const ax = A.px[knnAnchor], ay = A.py[knnAnchor];
      ctx.strokeStyle = SELC; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.8; ctx.beginPath();
      for (const q of knnNbrs) { if (q === knnAnchor) continue; ctx.moveTo(ax, ay); ctx.lineTo(A.px[q], A.py[q]); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ax, ay, 4, 0, 2 * Math.PI); ctx.stroke();
    }
  }
  function brushed({ selection }) { if (selection) applyBrush(selection); }
  function brushEnded({ selection }) { if (!selection) { selected = null; scheduleRedraw(); updateAux(); return; } applyBrush(selection); updateAux(); }
  function applyBrush(sel) {
    const [[x0, y0], [x1, y1]] = sel, s = new Set();
    A.quad.visit((node, qx0, qy0, qx1, qy1) => {
      if (!node.length) { do { const i = node.data; if (A.px[i] >= x0 && A.px[i] <= x1 && A.py[i] >= y0 && A.py[i] <= y1) s.add(i); } while ((node = node.next)); }
      return qx0 > x1 || qy0 > y1 || qx1 < x0 || qy1 < y0;
    });
    selected = s; knnAnchor = null; knnNbrs = null; scheduleRedraw();
  }
  let raf = null;
  function scheduleRedraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); drawBottom(); }); }
  function clearSelection() { selected = null; knnAnchor = null; knnNbrs = null; if (A.brushG) A.brushG.call(A.brush.move, null); scheduleRedraw(); updateAux(); }

  // ── % composición por variable ──
  const PCT = {};
  function setupPct() {
    const host = document.getElementById("svgPct"); if (!host) return;
    const par = host.parentNode; PCT.W = par.clientWidth; PCT.H = par.clientHeight;
    PCT.svg = d3.select(host).attr("width", PCT.W).attr("height", PCT.H); PCT.svg.selectAll("*").remove();
    if (PCT.W < 12 || PCT.H < 12) { PCT.svg = null; return; }
    PCT.m = { t: 4, r: 30, b: 4, l: 44 };
    PCT.y = d3.scaleBand().domain(FEAT).range([PCT.m.t, PCT.H - PCT.m.b]).padding(0.28);
    PCT.gBars = PCT.svg.append("g");
    PCT.svg.append("g").selectAll("text").data(FEAT).enter().append("text")
      .attr("x", PCT.m.l - 4).attr("y", f => PCT.y(f) + PCT.y.bandwidth() / 2).attr("dy", "0.32em")
      .attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", 9).text(f => fshort(f));
  }
  function drawPct() {
    if (!PCT.svg) return;
    const hasSel = selected && selected.size > 0;
    const means = new Array(FEAT.length);
    if (hasSel) {
      const arr = [...selected];
      for (let j = 0; j < FEAT.length; j++) { let s = 0; const col = D.X[j]; for (const i of arr) s += col[i]; means[j] = s / arr.length; }
    } else { for (let j = 0; j < FEAT.length; j++) means[j] = featMeanAll[j]; }
    const tot = means.reduce((p, c) => p + c, 0) || 1;
    const data = FEAT.map((f, j) => ({ f, p: 100 * means[j] / tot }));
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.p) || 1]).range([PCT.m.l, PCT.W - PCT.m.r]);
    const col = hasSel ? SELC : "var(--green)";
    const bars = PCT.gBars.selectAll("rect").data(data);
    bars.enter().append("rect").merge(bars)
      .attr("x", PCT.m.l).attr("y", d => PCT.y(d.f)).attr("height", PCT.y.bandwidth())
      .attr("width", d => Math.max(0, x(d.p) - PCT.m.l)).attr("fill", col).attr("opacity", 0.85);
    bars.exit().remove();
    const labs = PCT.gBars.selectAll("text.pv").data(data);
    labs.enter().append("text").attr("class", "pv").merge(labs)
      .attr("x", d => Math.min(PCT.W - 2, x(d.p) + 3)).attr("y", d => PCT.y(d.f) + PCT.y.bandwidth() / 2).attr("dy", "0.32em")
      .attr("fill", "var(--ink-dim)").attr("font-size", 8.5).attr("text-anchor", "start").text(d => d.p.toFixed(0) + "%");
    labs.exit().remove();
    const sub = document.getElementById("pctSub");
    if (sub) sub.textContent = `intensidad norm. Min-Max · ${hasSel ? selected.size.toLocaleString("es") + " sel." : "ciudad"}`;
  }

  function updateAqiBadge() {
    const el = document.getElementById("aqiBadge"); if (!el || !AQIv) return;
    let avg;
    if (selected && selected.size > 0) { let s = 0; for (const i of selected) s += AQIv[i]; avg = s / selected.size; }
    else avg = cityAqiAvg;
    const b = aqiCat(avg);
    el.style.background = b.color;
    el.textContent = `AQI ${Math.round(avg)} · ${b.name}`;
    el.title = `AQI medio EPA (máx subíndice PM2.5/PM10) · ${(selected && selected.size) ? "selección" : "ciudad"}`;
  }

  function populateVarSelect(id, selIdx) {
    const el = document.getElementById(id); if (!el) return;
    if (el.options.length !== FEAT.length) el.innerHTML = FEAT.map((f, j) => `<option value="${j}">${flabel(f)}</option>`).join("");
    el.value = String(selIdx);
  }
  function computeUnivar(cfg) {
    const el = document.getElementById(cfg.stat_id); if (!el) return;
    const sorted = Float64Array.from(cfg.vals).sort();
    const n = sorted.length;
    const mean = d3.mean(sorted), med = d3.quantileSorted(sorted, 0.5), sd = d3.deviation(sorted) || 0;
    const q1 = d3.quantileSorted(sorted, 0.25), q3 = d3.quantileSorted(sorted, 0.75);
    cfg.statBase = `μ <b>${fmtNum(mean)}</b> · med ${fmtNum(med)} · σ ${fmtNum(sd)} · IQR ${fmtNum(q1)}–${fmtNum(q3)} · rango ${fmtNum(sorted[0])}–${fmtNum(sorted[n - 1])}`;
    el.innerHTML = cfg.statBase;
  }

  function setupHist(cfg) {
    if (cfg.sel_id) populateVarSelect(cfg.sel_id, cfg.feat);
    cfg.label = flabel(FEAT[cfg.feat]);
    const plot = document.getElementById(cfg.plot); cfg.m = { t: 12, r: 14, b: 30, l: 46 };
    cfg.W = plot.clientWidth; cfg.H = plot.clientHeight; cfg.iw = cfg.W - cfg.m.l - cfg.m.r; cfg.ih = cfg.H - cfg.m.t - cfg.m.b;
    cfg.svg = d3.select("#" + cfg.svg_id).attr("width", cfg.W).attr("height", cfg.H); cfg.svg.selectAll("*").remove();
    cfg.vals = new Float64Array(N); for (let i = 0; i < N; i++) cfg.vals[i] = orig(cfg.feat, i);
    computeUnivar(cfg);
    cfg.x = d3.scaleLinear().domain(d3.extent(cfg.vals)).nice().range([cfg.m.l, cfg.m.l + cfg.iw]);
    cfg.bin = d3.bin().domain(cfg.x.domain()).thresholds(34);
    cfg.popBins = cfg.bin(cfg.vals); cfg.popProp = cfg.popBins.map(b => b.length / N);
    cfg.gBody = cfg.svg.append("g");
    cfg.svg.append("g").attr("class", "axis").attr("transform", `translate(0,${cfg.m.t + cfg.ih})`).call(d3.axisBottom(cfg.x).ticks(6));
    cfg.yAxisG = cfg.svg.append("g").attr("class", "axis").attr("transform", `translate(${cfg.m.l},0)`);
    cfg.svg.append("text").attr("x", cfg.m.l + cfg.iw / 2).attr("y", cfg.H - 2).attr("text-anchor", "middle")
      .attr("fill", "var(--ink-dim)").attr("font-size", 10).text(cfg.label);
  }
  function drawHist(cfg) {
    const hasSel = selected && selected.size > 0; let selProp = null;
    if (hasSel) { const sv = []; for (const i of selected) sv.push(cfg.vals[i]); selProp = cfg.bin(sv).map(b => b.length / Math.max(sv.length, 1)); }
    const maxY = d3.max(cfg.popProp.concat(selProp || [])) || 0.01;
    const y = d3.scaleLinear().domain([0, maxY]).range([cfg.m.t + cfg.ih, cfg.m.t]);
    cfg.yAxisG.call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
    const bw = b => Math.max(1, cfg.x(b.x1) - cfg.x(b.x0) - 1);
    const pop = cfg.gBody.selectAll("rect.pop").data(cfg.popBins);
    pop.enter().append("rect").attr("class", "pop").merge(pop)
      .attr("x", b => cfg.x(b.x0) + 0.5).attr("width", bw)
      .attr("y", (b, i) => y(cfg.popProp[i])).attr("height", (b, i) => y(0) - y(cfg.popProp[i]))
      .attr("fill", "var(--hist-pop)").attr("opacity", 0.9).attr("rx", TH.barRadius || 0);
    pop.exit().remove();
    const selData = hasSel ? cfg.popBins.map((b, i) => ({ b, p: selProp[i] || 0 })) : [];
    const sel = cfg.gBody.selectAll("rect.sel").data(selData);
    sel.enter().append("rect").attr("class", "sel").merge(sel)
      .attr("x", d => cfg.x(d.b.x0) + 0.5).attr("width", d => bw(d.b))
      .attr("y", d => y(d.p)).attr("height", d => y(0) - y(d.p)).attr("fill", "var(--sel)").attr("opacity", 0.82).attr("rx", TH.barRadius || 0);
    sel.exit().remove();
    const sEl = cfg.stat_id ? document.getElementById(cfg.stat_id) : null;
    if (sEl && cfg.statBase != null) {
      if (hasSel) { let s = 0, n = 0; for (const i of selected) { s += cfg.vals[i]; n++; } sEl.innerHTML = cfg.statBase + ` · <span style="color:var(--sel)">sel μ ${fmtNum(s / Math.max(n, 1))}</span>`; }
      else sEl.innerHTML = cfg.statBase;
    }
  }

  const D2 = {};
  function makeBrokenTime(times, x0, x1, gapPx) {
    const uniq = Array.from(new Set(times)).sort((a, b) => a - b);
    const THRESH = 200 * 864e5;
    const segs = []; let s = uniq[0], prev = uniq[0];
    for (let k = 1; k < uniq.length; k++) { if (uniq[k] - prev > THRESH) { segs.push([s, prev]); s = uniq[k]; } prev = uniq[k]; }
    segs.push([s, prev]);
    const spans = segs.map(([a, b]) => Math.max(b - a, 1));
    const total = spans.reduce((p, c) => p + c, 0);
    const usable = (x1 - x0) - (segs.length - 1) * gapPx;
    const bands = []; let cx = x0;
    segs.forEach(([a, b], k) => { const w = usable * spans[k] / total; bands.push([cx, cx + w, a, b]); cx += w + gapPx; });
    const f = (t) => { for (const [p0, p1, a, b] of bands) if (t >= a && t <= b) return p0 + (p1 - p0) * (t - a) / Math.max(b - a, 1);
      return t < bands[0][2] ? bands[0][0] : bands[bands.length - 1][1]; };
    f.bands = bands; return f;
  }
  function setupD() {
    const plot = document.getElementById("plotD"); D2.m = { t: 12, r: 14, b: 26, l: 46 };
    D2.W = plot.clientWidth; D2.H = plot.clientHeight; D2.iw = D2.W - D2.m.l - D2.m.r; D2.ih = D2.H - D2.m.t - D2.m.b;
    D2.ctx = sizeCanvas(document.getElementById("canvasD"), D2.W, D2.H);
    D2.pm = new Float64Array(N); for (let i = 0; i < N; i++) D2.pm[i] = orig(I_PM, i);
    D2.x = makeBrokenTime(D.t, D2.m.l, D2.m.l + D2.iw, 18);
    D2.y = d3.scaleLinear().domain([0, d3.max(D2.pm) * 1.02]).range([D2.m.t + D2.ih, D2.m.t]);
    D2.tx = new Float64Array(N); D2.ty = new Float64Array(N);
    for (let i = 0; i < N; i++) { D2.tx[i] = D2.x(D.t[i]); D2.ty[i] = D2.y(D2.pm[i]); }
    renderBaseD();
    const svg = d3.select("#svgD").attr("width", D2.W).attr("height", D2.H); svg.selectAll("*").remove();
    const baseY = D2.m.t + D2.ih, ax = svg.append("g").attr("class", "axis");
    ax.append("line").attr("x1", D2.m.l).attr("x2", D2.m.l + D2.iw).attr("y1", baseY).attr("y2", baseY).attr("stroke", "var(--grid)");
    D2.x.bands.forEach(([p0, p1, a, b]) => {
      const y0 = new Date(a).getUTCFullYear(), y1 = new Date(b).getUTCFullYear();
      for (let yr = y0; yr <= y1; yr++) {
        const ms = Date.UTC(yr, 0, 1); if (ms < a || ms > b) continue; const px = D2.x(ms);
        ax.append("line").attr("x1", px).attr("x2", px).attr("y1", baseY).attr("y2", baseY + 5).attr("stroke", "var(--grid)");
        ax.append("text").attr("x", px).attr("y", baseY + 16).attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 10).text(yr);
      }
    });
    for (let k = 0; k < D2.x.bands.length - 1; k++) {
      const xb = (D2.x.bands[k][1] + D2.x.bands[k + 1][0]) / 2;
      svg.append("line").attr("x1", xb).attr("x2", xb).attr("y1", D2.m.t).attr("y2", baseY)
        .attr("stroke", "var(--ink-dim)").attr("stroke-dasharray", "2 4").attr("opacity", .45);
      svg.append("text").attr("x", xb).attr("y", baseY + 16).attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 11).text("//");
    }
    svg.append("g").attr("class", "axis").attr("transform", `translate(${D2.m.l},0)`).call(d3.axisLeft(D2.y).ticks(5));
    svg.append("line").attr("x1", D2.m.l).attr("x2", D2.m.l + D2.iw).attr("y1", D2.y(150)).attr("y2", D2.y(150))
      .attr("stroke", "var(--sel)").attr("stroke-dasharray", "4 4").attr("opacity", .5);
    svg.append("text").attr("x", D2.m.l + D2.iw - 4).attr("y", D2.y(150) - 4).attr("text-anchor", "end")
      .attr("fill", "var(--sel)").attr("font-size", 9).text("150 (smog)");
  }
  function renderBaseD() {
    D2.base = D2.base || document.createElement("canvas"); D2.base.width = D2.W * DPR; D2.base.height = D2.H * DPR;
    const b = D2.base.getContext("2d"); b.setTransform(DPR, 0, 0, DPR, 0, 0); b.clearRect(0, 0, D2.W, D2.H);
    b.globalAlpha = 0.30; b.fillStyle = DIM;
    for (let i = 0; i < N; i++) b.fillRect(D2.tx[i] - 0.8, D2.ty[i] - 0.8, 1.6, 1.6); b.globalAlpha = 1;
  }
  function drawD() {
    const ctx = D2.ctx; ctx.clearRect(0, 0, D2.W, D2.H);
    const hasSel = selected && selected.size > 0;
    ctx.globalAlpha = hasSel ? 0.33 : 1; ctx.drawImage(D2.base, 0, 0, D2.W, D2.H); ctx.globalAlpha = 1;
    if (hasSel) { ctx.fillStyle = SELC; for (const i of selected) ctx.fillRect(D2.tx[i] - 1.6, D2.ty[i] - 1.6, 3.2, 3.2); }
  }

  const tip = document.getElementById("tooltip");
  function hoverMove(event) { const [mx, my] = d3.pointer(event, document.getElementById("svgA")); const i = A.quad.find(mx, my, 8); if (i === undefined) { hideTip(); return; } showTip(event, i); }
  function showTip(event, i) {
    const cat = aqiCat(AQIv[i]);
    tip.innerHTML = `<b>${D.meta.stations[D.station[i]]}</b> · ${D.meta.seasons[D.season[i]]} · ${D.meta.periods[D.period[i]]}
      <br><span style="color:var(--ink-dim)">${new Date(D.t[i]).toISOString().slice(0, 10)}</span>
      <div style="margin-top:4px;font-weight:700;color:${cat.color}">AQI ${Math.round(AQIv[i])} · ${cat.name}</div>
      <table>
        <tr><td class="k">PM2.5</td><td class="v">${orig(I_PM, i).toFixed(1)} µg/m³</td></tr>
        <tr><td class="k">DEWP</td><td class="v">${orig(I_DEW, i).toFixed(1)} °C</td></tr>
        <tr><td class="k">TEMP</td><td class="v">${orig(I_TEMP, i).toFixed(1)} °C</td></tr>
        <tr><td class="k">WSPM</td><td class="v">${orig(I_WSPM, i).toFixed(1)} m/s</td></tr>
        <tr><td class="k">PRES</td><td class="v">${orig(I_PRES, i).toFixed(0)} hPa</td></tr>
        <tr><td class="k">wd</td><td class="v">${D.meta.wd[D.wd[i]]}</td></tr>
      </table>`;
    tip.style.display = "block";
    const pad = 14; let x = event.clientX + pad, yv = event.clientY + pad; const r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth) x = event.clientX - r.width - pad;
    if (yv + r.height > innerHeight) yv = event.clientY - r.height - pad;
    tip.style.left = x + "px"; tip.style.top = yv + "px";
  }
  function hideTip() { tip.style.display = "none"; }

  function updateSelbar() {
    const el = document.getElementById("selbar"); if (!el) return;
    if (!selected || selected.size === 0) {
      el.innerHTML = `<div class="row"><span>Sin selección</span></div><div class="hint">Arrastra un recuadro sobre el mapa para enlazar los paneles.</div>`; return;
    }
    const arr = [...selected];
    if (arr.length === 1) { const i = arr[0];
      el.innerHTML = `<div class="row"><span>Punto único</span><span><b>1</b></span></div>
        <div class="hint">${D.meta.stations[D.station[i]]} · ${new Date(D.t[i]).toISOString().slice(0,10)}<br>PM2.5 ${orig(I_PM,i).toFixed(1)} · DEWP ${orig(I_DEW,i).toFixed(1)}°C</div>`; return; }
    let sPM = 0, sDEW = 0; const seasonCnt = [0,0,0,0], periodCnt = [0,0];
    for (const i of arr) { sPM += orig(I_PM, i); sDEW += orig(I_DEW, i); seasonCnt[D.season[i]]++; periodCnt[D.period[i]]++; }
    const domS = seasonCnt.indexOf(Math.max(...seasonCnt));
    el.innerHTML = `<div class="row"><span>Seleccionados</span><span><b>${arr.length.toLocaleString("es")}</b></span></div>
      <div class="row"><span>PM2.5 medio</span><span>${(sPM/arr.length).toFixed(1)} µg/m³</span></div>
      <div class="row"><span>DEWP medio</span><span>${(sDEW/arr.length).toFixed(1)} °C</span></div>
      <div class="row"><span>Estación dom.</span><span>${D.meta.seasons[domS]}</span></div>
      <div class="row"><span>2013-17 / 22-26</span><span>${periodCnt[0]} / ${periodCnt[1]}</span></div>`;
  }
  function renderGlobal() {
    const el = document.getElementById("globalStat"); if (!el) return;
    let sPM = 0, crit = 0; for (let i = 0; i < N; i++) { const v = orig(I_PM, i); sPM += v; if (v > 150) crit++; }
    el.innerHTML = `<b>${N.toLocaleString("es")}</b> registros · PM2.5 medio <b>${(sPM/N).toFixed(1)}</b> µg/m³ · días críticos <b>${(crit/N*100).toFixed(1)}%</b>`;
  }

  const B = { plot: "plotB", svg_id: "svgB", sel_id: "selB", stat_id: "statB", feat: 0, label: "PM2.5 (µg/m³)" };
  const C = { plot: "plotC", svg_id: "svgC", sel_id: "selC", stat_id: "statC", feat: 0, label: "DEWP — punto de rocío (°C)" };

  function buildAll() { setupA(); setupHist(B); setupHist(C); setupD(); setupPct(); drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); updateAux(); drawBottom(); }
  function rebuild() { setupA(); setupHist(B); setupHist(C); setupD(); setupPct(); if (A.brushG) A.brushG.call(A.brush); drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); updateAux(); drawBottom(); }

  function loadDataset(key) {
    const next = DATASETS[key]; if (!next || !next.X) { console.warn("Dataset no disponible:", key); return; }
    D = next; selected = null; knnAnchor = null; knnNbrs = null; clusterOf = null; currentKey = key; deriveDataset();
    if (colorMode === "cluster") ensureClusters();
    if (layoutMode === "umap" && !umapFor(currentKey)) {   // este dataset no tiene embedding UMAP
      layoutMode = "pca";
      const lb = document.getElementById("layoutMode"); if (lb) { lb.textContent = "layout: PCA"; lb.classList.remove("on"); }
    }
    const sub = document.getElementById("subtitle"); if (sub) sub.textContent = `${D.meta.label} · ${D.meta.note}`;
    renderLegend(); renderGlobal(); buildAll();
    console.log(`[Beijing Air] "${D.meta.label}" N=${N} var=${((pcs[0].ratio + pcs[1].ratio) * 100).toFixed(1)}%`);
  }

  const dsEl = document.getElementById("dataset");
  if (dsEl) dsEl.addEventListener("change", (e) => { const key = e.target.value; const sub = document.getElementById("subtitle"); if (sub) sub.textContent = "⏳ Recalculando PCA…"; setTimeout(() => loadDataset(key), 20); });
  const cbEl = document.getElementById("colorBy");
  if (cbEl) cbEl.addEventListener("change", (e) => { colorMode = e.target.value; if (colorMode === "cluster") ensureClusters(); renderLegend(); renderBaseA(); drawA(); drawHulls(); });
  const rsEl = document.getElementById("reset");
  if (rsEl) rsEl.addEventListener("click", clearSelection);
  const selBEl = document.getElementById("selB");
  if (selBEl) selBEl.addEventListener("change", (e) => { B.feat = +e.target.value; setupHist(B); drawHist(B); });
  const selCEl = document.getElementById("selC");
  if (selCEl) selCEl.addEventListener("change", (e) => { C.feat = +e.target.value; setupHist(C); drawHist(C); });
  // Toggle de modo PCA (variante): global  ↔  re-PCA del clúster.
  const pmEl = document.getElementById("pcaMode");
  if (pmEl) pmEl.addEventListener("click", () => {
    pcaMode = pcaMode === "global" ? "rePCA" : "global";
    pmEl.textContent = pcaMode === "global" ? "modo: GLOBAL" : "modo: CLÚSTER";
    pmEl.classList.toggle("on", pcaMode === "rePCA");
    updateAux();
  });
  // Panel de parámetros ocultable (drawer): k del KNN + nº de clústeres K-means.
  const pBtn = document.getElementById("paramsBtn"), pPanel = document.getElementById("paramsPanel");
  if (pBtn && pPanel) pBtn.addEventListener("click", () => { const open = pPanel.hasAttribute("hidden"); if (open) pPanel.removeAttribute("hidden"); else pPanel.setAttribute("hidden", ""); pBtn.classList.toggle("on", open); });
  const kEl = document.getElementById("knnK"), kVal = document.getElementById("knnKval");
  if (kEl) kEl.addEventListener("input", (e) => { knnK = +e.target.value; if (kVal) kVal.textContent = knnK; if (knnAnchor != null) pickKNN(knnAnchor); });
  const ncEl = document.getElementById("nClusters");
  if (ncEl) ncEl.addEventListener("change", (e) => {
    nClusters = Math.max(2, Math.min(6, +e.target.value || 4)); e.target.value = nClusters;
    if (colorMode === "cluster") { computeKMeans(nClusters); renderLegend(); renderBaseA(); drawA(); drawHulls(); }
  });
  // Toggle de layout del scatter A: PCA (cliente) ↔ UMAP (precalculado por umap_embed.py).
  const lmEl = document.getElementById("layoutMode");
  if (lmEl) lmEl.addEventListener("click", () => {
    if (layoutMode === "pca") {
      if (!umapFor(currentKey)) {
        const ps = document.getElementById("pcaSub");
        if (ps) ps.textContent = "UMAP no disponible · ejecuta  python umap_embed.py  para generar data/aq_umap.js";
        return;
      }
      layoutMode = "umap";
    } else layoutMode = "pca";
    lmEl.textContent = layoutMode === "pca" ? "layout: PCA" : "layout: UMAP";
    lmEl.classList.toggle("on", layoutMode === "umap");
    setupA(); clearSelection();
  });
  let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(rebuild, 180); });

  // Pestanas del panel inferior
  document.querySelectorAll(".btab").forEach(btn => btn.addEventListener("click", () => switchBottom(btn.dataset.tab)));

  // Mapeo de tareas: cada preset reutiliza los controles existentes (color + selects B/C) para
  // dejar la vista lista y que el patrón se lea en ≥2 cuadrantes a la vez.
  const PRESETS = {
    zonal:   { color: "zona",   b: "PM2.5", c: "SO2", hint: "DISPARIDAD ZONAL → Ya está coloreado por zona. En la leyenda de arriba haz clic en «Sur» y mira el «PM2.5 medio» del recuadro (~83); luego clic en «Norte» (~71). CONCLUSIÓN: el Norte es más limpio." },
    meteo:   { color: "season", b: "DEW",  c: "WSPM", hint: "METEOROLOGÍA → Clic en «Invierno» en la leyenda ↑ y abre la pestaña CORRELACIONES: DEWP↔PM2.5 salta a ≈+0.62 (en verano se invierte, por eso el global ≈0) y el viento (WSPM) es −0.5. CONCLUSIÓN: en invierno, aire húmedo y sin viento atrapa el PM2.5." },
    persist: { color: "aqi",    b: "PM2.5", c: "O3",  hint: "PERSISTENCIA → Haz clic en un punto naranja o rojo del mapa [A]. Se iluminan sus días parecidos; míralos en la línea de tiempo D (abajo). CONCLUSIÓN: se agrupan en inviernos → el smog persiste, no es un día aislado." },
  };
  function applyPreset(key) {
    const p = PRESETS[key]; if (!p) return;
    const cb = document.getElementById("colorBy"); if (cb) { cb.value = p.color; cb.dispatchEvent(new Event("change")); }
    const sb = document.getElementById("selB"); if (sb && IDX[p.b] != null) { sb.value = String(IDX[p.b]); sb.dispatchEvent(new Event("change")); }
    const sc = document.getElementById("selC"); if (sc && IDX[p.c] != null) { sc.value = String(IDX[p.c]); sc.dispatchEvent(new Event("change")); }
    const th = document.getElementById("taskHint"); if (th) th.textContent = p.hint;
  }
  document.querySelectorAll(".taskbtn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".taskbtn").forEach(b => b.classList.toggle("on", b === btn));
    applyPreset(btn.dataset.task);
  }));

    loadDataset("treated");
  const ld = document.getElementById("loader"); if (ld) ld.style.display = "none";
})();
