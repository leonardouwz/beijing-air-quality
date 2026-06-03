/* aq_app.js — Motor compartido del prototipo "Beijing Air Latent Space".
   Misma lógica probada (PCA en cliente, brushing, linking, 4 módulos, toggle
   tratado/crudo) pero TEMATIZABLE: los colores de canvas se leen de
   window.AQ_THEME y los de SVG de variables CSS (--sel, --hist-pop, --ink-dim,
   --grid). Cada index*.html define su tema y su disposición; los IDs de los
   elementos son los mismos. */
"use strict";
(function () {
  const errEl = document.getElementById("err");
  if (!window.d3) { if (errEl) errEl.textContent = "No se pudo cargar D3 (vendor/d3.v7.min.js)."; return; }

  const TH = window.AQ_THEME || {};
  const SEASON_COL = TH.season || ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
  const PERIOD_COL = TH.period || ["#38bdf8", "#fb7185"];
  const ZONA_COL   = TH.zona   || ["#60a5fa", "#34d399", "#fbbf24", "#f472b6"];
  const DIM = TH.dim || "#5b6b7d";        // gris de no-seleccionados (canvas)
  const SELC = TH.sel || "#f43f5e";       // resaltado de selección (canvas)
  const DOT = TH.dot || 2.2, DOTSEL = TH.dotSel || 3.2;

  const DATASETS = { treated: window.AQ_DATA, raw: window.AQ_DATA_RAW };
  if (!DATASETS.treated || !DATASETS.treated.X) {
    if (errEl) errEl.textContent = "No se pudo cargar data/aq_data.js. Ejecuta:  python build_data.py";
    return;
  }
  let D = DATASETS.treated;

  let FEAT, FMIN, FMAX, N, IDX, I_PM, I_DEW, I_TEMP, I_WSPM, I_PRES, pc1, pc2, pcs;
  function deriveDataset() {
    FEAT = D.meta.features; FMIN = D.meta.feat_min; FMAX = D.meta.feat_max; N = D.meta.n;
    IDX = {}; FEAT.forEach((f, i) => IDX[f] = i);
    I_PM = IDX["PM2.5"]; I_DEW = IDX["DEW"]; I_TEMP = IDX["TEMP"]; I_WSPM = IDX["WSPM"]; I_PRES = IDX["PRES"];
    B.feat = I_PM; C.feat = I_DEW;
    const r = computePCA(); pc1 = r.pc1; pc2 = r.pc2; pcs = r.pcs;
  }
  function orig(j, i) { return FMIN[j] + D.X[j][i] * (FMAX[j] - FMIN[j]); }

  // ── PCA (covarianza + Jacobi) ──
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
    const a1 = new Float64Array(N), a2 = new Float64Array(N);
    for (let i = 0; i < N; i++) { let a = 0, b = 0; for (let j = 0; j < p; j++) { const cx = D.X[j][i] - mean[j]; a += cx * pcsL[0].vec[j]; b += cx * pcsL[1].vec[j]; } a1[i] = a; a2[i] = b; }
    return { pc1: a1, pc2: a2, pcs: pcsL };
  }
  function jacobi(Ain) {
    const n = Ain.length, A = Ain.map(r => Float64Array.from(r));
    const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-12) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let i = 0; i < n; i++) { const aip = A[i][p], aiq = A[i][q]; A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq; }
        for (let i = 0; i < n; i++) { const api = A[p][i], aqi = A[q][i]; A[p][i] = c * api - s * aqi; A[q][i] = s * api + c * aqi; }
        for (let i = 0; i < n; i++) { const vip = V[i][p], viq = V[i][q]; V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq; }
      }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
  }

  let selected = null, colorMode = "season";
  const colorOf = (i) => colorMode === "season" ? SEASON_COL[D.season[i]]
    : colorMode === "period" ? PERIOD_COL[D.period[i]] : ZONA_COL[D.zona[i]];

  function renderLegend() {
    const el = document.getElementById("legend"); if (!el) return;
    let items;
    if (colorMode === "season") items = D.meta.seasons.map((s, i) => [s, SEASON_COL[i]]);
    else if (colorMode === "period") items = D.meta.periods.map((s, i) => [s, PERIOD_COL[i]]);
    else items = D.meta.zonas.map((s, i) => [s, ZONA_COL[i]]);
    el.innerHTML = items.map(([n, c]) => `<span class="lg"><i class="dot" style="background:${c}"></i>${n}</span>`).join("");
  }

  const DPR = Math.max(1, window.devicePixelRatio || 1);
  function sizeCanvas(canvas, w, h) {
    canvas.width = w * DPR; canvas.height = h * DPR; canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d"); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); return ctx;
  }

  // ── A: scatter PCA (canvas) + brush (svg) ──
  const A = { m: { t: 10, r: 14, b: 34, l: 44 } };
  function setupA() {
    const plot = document.getElementById("plotA"); A.W = plot.clientWidth; A.H = plot.clientHeight;
    A.iw = A.W - A.m.l - A.m.r; A.ih = A.H - A.m.t - A.m.b;
    A.ctx = sizeCanvas(document.getElementById("canvasA"), A.W, A.H);
    A.x = d3.scaleLinear().domain(d3.extent(pc1)).nice().range([A.m.l, A.m.l + A.iw]);
    A.y = d3.scaleLinear().domain(d3.extent(pc2)).nice().range([A.m.t + A.ih, A.m.t]);
    A.px = new Float64Array(N); A.py = new Float64Array(N);
    for (let i = 0; i < N; i++) { A.px[i] = A.x(pc1[i]); A.py[i] = A.y(pc2[i]); }
    A.quad = d3.quadtree().x(i => A.px[i]).y(i => A.py[i]).addAll(d3.range(N));
    renderBaseA();
    const svg = d3.select("#svgA").attr("width", A.W).attr("height", A.H); svg.selectAll("*").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${A.m.t + A.ih})`).call(d3.axisBottom(A.x).ticks(6));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${A.m.l},0)`).call(d3.axisLeft(A.y).ticks(6));
    svg.append("text").attr("x", A.m.l + A.iw / 2).attr("y", A.H - 4).attr("text-anchor", "middle")
      .attr("fill", "var(--ink-dim)").attr("font-size", 11).text(`PC1 (${(pcs[0].ratio * 100).toFixed(1)}% var.)`);
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -(A.m.t + A.ih / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("fill", "var(--ink-dim)").attr("font-size", 11).text(`PC2 (${(pcs[1].ratio * 100).toFixed(1)}% var.)`);
    A.brush = d3.brush().extent([[A.m.l, A.m.t], [A.m.l + A.iw, A.m.t + A.ih]]).on("brush", brushed).on("end", brushEnded);
    A.brushG = svg.append("g").attr("class", "brush").call(A.brush);
    A.brushG.select(".overlay").on("mousemove.tip", hoverMove).on("mouseleave.tip", hideTip);
    const ps = document.getElementById("pcaSub");
    if (ps) ps.textContent = `PC1 × PC2 · ${N.toLocaleString("es")} registros · var. acumulada ${((pcs[0].ratio + pcs[1].ratio) * 100).toFixed(1)}%`;
    renderLoadings();
  }
  function renderLoadings() {
    const el = document.getElementById("loadings"); if (!el) return;
    const fmt = pc => FEAT.map((f, j) => [f, pc.vec[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4)
      .map(([f, v]) => `<code>${f}</code> ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" · ");
    el.innerHTML = `<b>PC1:</b> ${fmt(pcs[0])}<br><b>PC2:</b> ${fmt(pcs[1])}`;
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
  }
  function brushed({ selection }) { if (selection) applyBrush(selection); }
  function brushEnded({ selection }) { if (!selection) { selected = null; scheduleRedraw(); return; } applyBrush(selection); }
  function applyBrush(sel) {
    const [[x0, y0], [x1, y1]] = sel, s = new Set();
    A.quad.visit((node, qx0, qy0, qx1, qy1) => {
      if (!node.length) { do { const i = node.data; if (A.px[i] >= x0 && A.px[i] <= x1 && A.py[i] >= y0 && A.py[i] <= y1) s.add(i); } while ((node = node.next)); }
      return qx0 > x1 || qy0 > y1 || qx1 < x0 || qy1 < y0;
    });
    selected = s; scheduleRedraw();
  }
  let raf = null;
  function scheduleRedraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; drawA(); drawHist(B); drawHist(C); drawD(); updateSelbar(); }); }
  function clearSelection() { selected = null; if (A.brushG) A.brushG.call(A.brush.move, null); scheduleRedraw(); }

  // ── B / C: histogramas ──
  function setupHist(cfg) {
    const plot = document.getElementById(cfg.plot); cfg.m = { t: 12, r: 14, b: 30, l: 46 };
    cfg.W = plot.clientWidth; cfg.H = plot.clientHeight; cfg.iw = cfg.W - cfg.m.l - cfg.m.r; cfg.ih = cfg.H - cfg.m.t - cfg.m.b;
    cfg.svg = d3.select("#" + cfg.svg_id).attr("width", cfg.W).attr("height", cfg.H); cfg.svg.selectAll("*").remove();
    cfg.vals = new Float64Array(N); for (let i = 0; i < N; i++) cfg.vals[i] = orig(cfg.feat, i);
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
  }

  // ── D: serie temporal (canvas) ──
  const D2 = {};
  // Escala de tiempo "partida": omite los huecos largos sin datos (p.ej. 2018-2021
  // en el dataset tratado) para unir el periodo histórico con el actual en el eje X.
  // Reparte el ancho en proporción a la duración de cada tramo con datos.
  function makeBrokenTime(times, x0, x1, gapPx) {
    const uniq = Array.from(new Set(times)).sort((a, b) => a - b);
    const THRESH = 200 * 864e5;  // hueco > 200 días => corte de eje
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
    D2.x = makeBrokenTime(D.t, D2.m.l, D2.m.l + D2.iw, 18);  // eje X partido (omite huecos)
    D2.y = d3.scaleLinear().domain([0, d3.max(D2.pm) * 1.02]).range([D2.m.t + D2.ih, D2.m.t]);  // eje Y completo
    D2.tx = new Float64Array(N); D2.ty = new Float64Array(N);
    for (let i = 0; i < N; i++) { D2.tx[i] = D2.x(D.t[i]); D2.ty[i] = D2.y(D2.pm[i]); }
    renderBaseD();
    const svg = d3.select("#svgD").attr("width", D2.W).attr("height", D2.H); svg.selectAll("*").remove();
    // Eje X partido: marcas de año por tramo con datos + marca de corte en el hueco.
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
    for (let k = 0; k < D2.x.bands.length - 1; k++) {     // marca de corte entre tramos
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

  // ── Tooltip ──
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

  // ── Panel de selección ──
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

  const B = { plot: "plotB", svg_id: "svgB", feat: 0, label: "PM2.5 (µg/m³)" };
  const C = { plot: "plotC", svg_id: "svgC", feat: 0, label: "DEWP — punto de rocío (°C)" };

  function buildAll() { setupA(); setupHist(B); setupHist(C); setupD(); drawA(); drawHist(B); drawHist(C); drawD(); updateSelbar(); }
  function rebuild() { setupA(); setupHist(B); setupHist(C); setupD(); if (A.brushG) A.brushG.call(A.brush); drawA(); drawHist(B); drawHist(C); drawD(); updateSelbar(); }

  function loadDataset(key) {
    const next = DATASETS[key]; if (!next || !next.X) { console.warn("Dataset no disponible:", key); return; }
    D = next; selected = null; deriveDataset();
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
  let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(rebuild, 180); });

  loadDataset("treated");
  const ld = document.getElementById("loader"); if (ld) ld.style.display = "none";
})();
