/* aq_app_1.js — Motor de la VARIANTE de prueba (index2_1.html).
   Copia de aq_app.js + dos añadidos interactivos enlazados a la selección de A:
     · Panel SCREE (varianza por componente) — #svgScree
     · Gráficos de CARGAS reactivos a la selección
   Con un TOGGLE de modo (botón #pcaMode):
     - "global": PCA fijo del dataset; la selección se SUPERPONE
        (scree: reparto de varianza de la selección sobre los PC globales;
         cargas: línea de desviación de la selección por variable).
     - "rePCA": recalcula un PCA SOLO con los puntos seleccionados (≥ MIN_REPCA);
        scree y cargas pasan a ser los del clúster (ejes propios, signo alineado al
        global). El scatter A SIEMPRE permanece en los ejes globales.
   No modifica aq_app.js ni index2.html — todo vive en esta variante. */
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
  let pcsAll, allRatios, pcaMean;          // todos los autovectores/ratios + medias (variante)
  let pcaMode = "global";                  // "global" | "rePCA"
  let polyMode = "ejes";                    // polígono: "ejes" (PC1/PC2) | "vars" (todas las variables)
  let layoutMode = "pca";                   // scatter A: "pca" (cliente) | "umap" (precalculado)
  let currentKey = "treated";               // dataset activo (para buscar su embedding UMAP)
  function deriveDataset() {
    FEAT = D.meta.features; FMIN = D.meta.feat_min; FMAX = D.meta.feat_max; N = D.meta.n;
    IDX = {}; FEAT.forEach((f, i) => IDX[f] = i);
    I_PM = IDX["PM2.5"]; I_PM10 = (IDX["PM10"] != null ? IDX["PM10"] : -1);
    I_DEW = IDX["DEW"]; I_TEMP = IDX["TEMP"]; I_WSPM = IDX["WSPM"]; I_PRES = IDX["PRES"];
    B.feat = I_PM; C.feat = I_DEW;
    const r = computePCA(); pc1 = r.pc1; pc2 = r.pc2; pcs = r.pcs;
    pcsAll = r.allVec; allRatios = r.allRatios; pcaMean = r.mean;
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

  // Proyección del registro i sobre un autovector (centrado en la media global).
  function projOnVec(i, vec) { let s = 0; for (let j = 0; j < vec.length; j++) s += (D.X[j][i] - pcaMean[j]) * vec[j]; return s; }
  // Reparto de la varianza de la SELECCIÓN a lo largo de los PC GLOBALES (suma 1).
  function selectionShares(arr) {
    const p = FEAT.length, sum = new Float64Array(p), sumsq = new Float64Array(p);
    for (const i of arr) for (let k = 0; k < p; k++) { const pr = projOnVec(i, pcsAll[k]); sum[k] += pr; sumsq[k] += pr * pr; }
    const nn = arr.length; let tot = 0; const v = new Float64Array(p);
    for (let k = 0; k < p; k++) { const m = sum[k] / nn; v[k] = Math.max(sumsq[k] / nn - m * m, 0); tot += v[k]; }
    tot = tot || 1; return Array.from(v, x => x / tot);
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
  const cumOf = (a) => { let acc = 0; return a.map(r => (acc += r)); };

  let selected = null, colorMode = "season";
  const colorOf = (i) => colorMode === "season" ? SEASON_COL[D.season[i]]
    : colorMode === "period" ? PERIOD_COL[D.period[i]]
    : colorMode === "zona" ? ZONA_COL[D.zona[i]]
    : aqiCat(AQIv[i]).color;               // colorMode === "aqi": color por banda de AQI del registro

  function renderLegend() {
    const el = document.getElementById("legend"); if (!el) return;
    let items;
    if (colorMode === "season") items = D.meta.seasons.map((s, i) => [s, SEASON_COL[i]]);
    else if (colorMode === "period") items = D.meta.periods.map((s, i) => [s, PERIOD_COL[i]]);
    else if (colorMode === "zona") items = D.meta.zonas.map((s, i) => [s, ZONA_COL[i]]);
    else items = AQI_BANDS.map((b, i) => [`${b.name} ${i ? AQI_BANDS[i - 1].hi + 1 : 0}–${b.hi}`, b.color]);  // AQI: nombre + rango
    el.innerHTML = items.map(([n, c]) => `<span class="lg"><i class="dot" style="background:${c}"></i>${n}</span>`).join("");
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
    A.brushG.select(".overlay").on("mousemove.tip", hoverMove).on("mouseleave.tip", hideTip);
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

    // Polígono (svgLoad2) — toggle: "ejes" (PC1/PC2) · "vars" (todas las variables)
    (function () {
      const host = document.getElementById("svgLoad2"); if (!host) return;
      const par = host.parentNode, W = par.clientWidth, H = par.clientHeight;
      const svg = d3.select(host).attr("width", W).attr("height", H); svg.selectAll("*").remove();
      if (W < 12 || H < 12) return;
      if (polyMode === "ejes") {
        // PC1 vs PC2 (ejes principales) sobre las 10 variables (+ desv. selección en global).
        const m = { t: 4, r: 8, b: 20, l: 30 };
        const x = d3.scalePoint().domain(FEAT).range([m.l, W - m.r]).padding(0.5);
        const y = d3.scaleLinear().domain([-mx, mx]).range([H - m.b, m.t]);
        svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--grid)");
        svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4));
        svg.selectAll("text.x").data(FEAT).enter().append("text").attr("class", "x")
          .attr("transform", f => `translate(${x(f)},${H - m.b + 9}) rotate(-42)`)
          .attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", 8).text(f => fshort(f));
        const line = d3.line().x((d, j) => x(FEAT[j])).y(d => y(d));
        [[Array.from(v1), LOAD1], [Array.from(v2), SELC]].forEach(([vec, col]) => {
          svg.append("path").attr("d", line(vec)).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.6).attr("opacity", 0.9);
          FEAT.forEach((f, j) => svg.append("circle").attr("cx", x(f)).attr("cy", y(vec[j])).attr("r", 2).attr("fill", col));
        });
        if (dev) {   // desviación de la selección (media norm. selección − media norm. global)
          svg.append("path").attr("d", line(dev)).attr("fill", "none").attr("stroke", "#9be7ff")
            .attr("stroke-width", 1.4).attr("stroke-dasharray", "4 3").attr("opacity", 0.95);
          FEAT.forEach((f, j) => svg.append("circle").attr("cx", x(f)).attr("cy", y(dev[j])).attr("r", 1.8).attr("fill", "#9be7ff"));
        }
      } else {
        // "todas las variables": una línea por VARIABLE a lo largo de TODOS los componentes
        // globales (PC1…PC10). Revela cómo participa cada variable en cada eje, no solo en PC1/PC2.
        const comps = pcsAll, K = comps.length, m = { t: 4, r: 10, b: 18, l: 30 };
        const xc = d3.scalePoint().domain(d3.range(K)).range([m.l, W - m.r]).padding(0.5);
        let mxv = 0; for (let k = 0; k < K; k++) for (let j = 0; j < FEAT.length; j++) mxv = Math.max(mxv, Math.abs(comps[k][j]));
        mxv = mxv || 1;
        const yv = d3.scaleLinear().domain([-mxv, mxv]).range([H - m.b, m.t]);
        svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yv(0)).attr("y2", yv(0)).attr("stroke", "var(--grid)");
        svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yv).ticks(4));
        svg.selectAll("text.xc").data(d3.range(K)).enter().append("text").attr("class", "xc")
          .attr("transform", k => `translate(${xc(k)},${H - m.b + 9}) rotate(-42)`)
          .attr("text-anchor", "end").attr("fill", "var(--ink-dim)").attr("font-size", 7.5).text(k => "PC" + (k + 1));
        const linev = d3.line().x((d, k) => xc(k)).y(d => yv(d));
        FEAT.forEach((f, j) => {
          const series = comps.map(vec => vec[j]);
          const col = VAR_COLORS[j % VAR_COLORS.length];
          svg.append("path").attr("d", linev(series)).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.2).attr("opacity", 0.85);
          let ks = 0; for (let k = 1; k < K; k++) if (Math.abs(series[k]) > Math.abs(series[ks])) ks = k;  // etiqueta en su pico
          svg.append("text").attr("x", xc(ks)).attr("y", yv(series[ks]) - 2).attr("text-anchor", "middle")
            .attr("fill", col).attr("font-size", 7).text(fshort(f));
        });
      }
    })();
  }

  // ═══ SCREE (varianza por componente) reactivo a la selección ═══
  function renderScree() {
    const host = document.getElementById("svgScree"); if (!host || !allRatios) return;
    const par = host.parentNode, W = par.clientWidth, H = par.clientHeight;
    const svg = d3.select(host).attr("width", W).attr("height", H); svg.selectAll("*").remove();
    if (W < 30 || H < 24) return;
    const hasSel = selected && selected.size > 0;
    let bars = allRatios, selShares = null, srcLabel = "global";
    if (pcaMode === "rePCA" && hasSel && selected.size >= MIN_REPCA) {
      bars = subsetPCA([...selected]).ratios; srcLabel = `clúster n=${selected.size.toLocaleString("es")}`;
    } else {
      if (hasSel) selShares = selectionShares([...selected]);
      srcLabel = (pcaMode === "rePCA" && hasSel) ? `global (selección < ${MIN_REPCA})` : "global";
    }
    const m = { t: 8, r: 38, b: 16, l: 36 };
    const labels = bars.map((_, i) => "PC" + (i + 1));
    const x = d3.scaleBand().domain(labels).range([m.l, W - m.r]).padding(0.25);
    const yMax = Math.max(d3.max(bars), selShares ? d3.max(selShares) : 0) || 1;
    const yL = d3.scaleLinear().domain([0, yMax]).nice().range([H - m.b, m.t]);
    const yR = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yL).ticks(3).tickFormat(d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${W - m.r},0)`).call(d3.axisRight(yR).ticks(3).tickFormat(d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSize(0)).selectAll("text").attr("font-size", 8);
    // Barras del PCA mostrado (global o clúster); PC1/PC2 resaltadas.
    svg.selectAll("rect.sc").data(bars).enter().append("rect").attr("class", "sc")
      .attr("x", (d, i) => x(labels[i])).attr("width", x.bandwidth())
      .attr("y", d => yL(d)).attr("height", d => yL(0) - yL(d))
      .attr("fill", (d, i) => i < 2 ? "var(--sel)" : "var(--green)").attr("opacity", 0.85);
    // Línea acumulada del PCA mostrado.
    const cum = cumOf(bars);
    const line = d3.line().x((d, i) => x(labels[i]) + x.bandwidth() / 2).y(d => yR(d));
    svg.append("path").attr("d", line(cum)).attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 1.4).attr("opacity", 0.85);
    svg.selectAll("circle.cum").data(cum).enter().append("circle").attr("class", "cum")
      .attr("cx", (d, i) => x(labels[i]) + x.bandwidth() / 2).attr("cy", d => yR(d)).attr("r", 2.2).attr("fill", "var(--ink)");
    // Superposición de la SELECCIÓN (solo modo global): outline + acumulada ámbar.
    if (selShares) {
      svg.selectAll("rect.selsc").data(selShares).enter().append("rect").attr("class", "selsc")
        .attr("x", (d, i) => x(labels[i])).attr("width", x.bandwidth())
        .attr("y", d => yL(d)).attr("height", d => yL(0) - yL(d))
        .attr("fill", "none").attr("stroke", SELC).attr("stroke-width", 1.2).attr("opacity", 0.95);
      const cs = cumOf(selShares);
      svg.append("path").attr("d", line(cs)).attr("fill", "none").attr("stroke", SELC)
        .attr("stroke-width", 1.3).attr("stroke-dasharray", "4 3").attr("opacity", 0.9);
    }
    // Marca PC1+PC2 del PCA mostrado.
    const c2 = cum[1];
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yR(c2)).attr("y2", yR(c2))
      .attr("stroke", "var(--sel)").attr("stroke-dasharray", "4 4").attr("opacity", 0.55);
    svg.append("text").attr("x", W - m.r).attr("y", yR(c2) - 3).attr("text-anchor", "end")
      .attr("fill", "var(--sel)").attr("font-size", 9).text(`PC1+PC2 = ${(c2 * 100).toFixed(1)}%`);
    const sub = document.getElementById("screeSub");
    if (sub) { const i90 = cum.findIndex(v => v >= 0.9); sub.textContent = `${srcLabel} · ${i90 >= 0 ? (i90 + 1) + " PC para ≥90%" : "≥90% solo con 10 PC"}`; }
  }

  function updateAux() { renderScree(); renderLoadings(); }

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
  }
  function brushed({ selection }) { if (selection) applyBrush(selection); }
  function brushEnded({ selection }) { if (!selection) { selected = null; scheduleRedraw(); updateAux(); return; } applyBrush(selection); updateAux(); }
  function applyBrush(sel) {
    const [[x0, y0], [x1, y1]] = sel, s = new Set();
    A.quad.visit((node, qx0, qy0, qx1, qy1) => {
      if (!node.length) { do { const i = node.data; if (A.px[i] >= x0 && A.px[i] <= x1 && A.py[i] >= y0 && A.py[i] <= y1) s.add(i); } while ((node = node.next)); }
      return qx0 > x1 || qy0 > y1 || qx1 < x0 || qy1 < y0;
    });
    selected = s; scheduleRedraw();
  }
  let raf = null;
  function scheduleRedraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); }); }
  function clearSelection() { selected = null; if (A.brushG) A.brushG.call(A.brush.move, null); scheduleRedraw(); updateAux(); }

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
    tip.innerHTML = `<b>${D.meta.stations[D.station[i]]}</b> · ${D.meta.seasons[D.season[i]]} · ${D.meta.periods[D.period[i]]}
      <br><span style="color:var(--ink-dim)">${new Date(D.t[i]).toISOString().slice(0, 10)}</span>
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

  function buildAll() { setupA(); setupHist(B); setupHist(C); setupD(); setupPct(); drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); updateAux(); }
  function rebuild() { setupA(); setupHist(B); setupHist(C); setupD(); setupPct(); if (A.brushG) A.brushG.call(A.brush); drawA(); drawHist(B); drawHist(C); drawD(); drawPct(); updateSelbar(); updateAqiBadge(); updateAux(); }

  function loadDataset(key) {
    const next = DATASETS[key]; if (!next || !next.X) { console.warn("Dataset no disponible:", key); return; }
    D = next; selected = null; currentKey = key; deriveDataset();
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
  if (cbEl) cbEl.addEventListener("change", (e) => { colorMode = e.target.value; renderLegend(); renderBaseA(); drawA(); });
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
  // Toggle del polígono: ejes principales (PC1/PC2) ↔ todas las variables (todos los PC).
  const polyEl = document.getElementById("polyMode");
  if (polyEl) polyEl.addEventListener("click", () => {
    polyMode = polyMode === "ejes" ? "vars" : "ejes";
    polyEl.textContent = polyMode === "ejes" ? "ejes principales" : "todas las variables";
    polyEl.classList.toggle("on", polyMode === "vars");
    renderLoadings();
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

  loadDataset("treated");
  const ld = document.getElementById("loader"); if (ld) ld.style.display = "none";
})();
