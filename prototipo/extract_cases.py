"""
extract_cases.py  --  Datos para Evidencia 3, Seccion 5
Lee aq_data.js, corre PCA y extrae Casos 1, 2, 3.
Uso:  python extract_cases.py
"""
import json, numpy as np
from datetime import datetime
from pathlib import Path

# ── cargar ─────────────────────────────────────────────────────────────────────
DATA = Path(__file__).parent / "data" / "aq_data.js"
raw = DATA.read_text(encoding="utf-8")
data = json.loads(raw[len("window.AQ_DATA = "):].rstrip().rstrip(";"))

meta = data["meta"]
features = meta["features"]
feat_min, feat_max = meta["feat_min"], meta["feat_max"]
stations, seasons = meta["stations"], meta["seasons"]
periods, zonas, wd_cats = meta["periods"], meta["zonas"], meta["wd"]
aqi_names = [b["name"] for b in meta["aqi_bands"]]

X       = np.array(data["X"]).T          # (33060, 10)
t_ms    = data["t"]
st_idx  = data["station"]
se_idx  = data["season"]
pe_idx  = data["period"]
zo_idx  = data["zona"]
wd_idx  = data["wd"]
aqi_v   = data["aqi"]
aqi_c   = data["aqi_cat"]

# ── PCA ────────────────────────────────────────────────────────────────────────
Xc = X - X.mean(axis=0)
eigvals, eigvecs = np.linalg.eigh(np.cov(Xc, rowvar=False))
order = np.argsort(eigvals)[::-1]
eigvals, eigvecs = eigvals[order], eigvecs[:, order]
var_pct = eigvals / eigvals.sum() * 100

PC = Xc @ eigvecs
PC1, PC2 = PC[:, 0].copy(), PC[:, 1].copy()

# flip: smog = PC1 positivo
if eigvecs[features.index("SO2"), 0] < 0:
    PC1 = -PC1
    eigvecs[:, 0] = -eigvecs[:, 0]

L1, L2 = eigvecs[:, 0], eigvecs[:, 1]   # loadings

# ── utilidades ─────────────────────────────────────────────────────────────────
def orig(fi, nv): return feat_min[fi] + nv*(feat_max[fi]-feat_min[fi])

def info(i):
    return dict(
        idx=i, date=datetime.utcfromtimestamp(t_ms[i]/1000).strftime("%Y-%m-%d"),
        station=stations[st_idx[i]], season=seasons[se_idx[i]],
        period=periods[pe_idx[i]], zona=zonas[zo_idx[i]], wd=wd_cats[wd_idx[i]],
        aqi=aqi_v[i], aqi_cat=aqi_names[aqi_c[i]],
        pc1=float(PC1[i]), pc2=float(PC2[i]),
        norm=X[i].tolist(),
        orig_={features[fi]: orig(fi, X[i, fi]) for fi in range(10)},
    )

# ── Caso 2: extremos de PC1 ────────────────────────────────────────────────────
pA = info(int(np.argmin(PC1)))   # dia limpio
pB = info(int(np.argmax(PC1)))   # smog extremo
d2 = float(np.linalg.norm(X[int(np.argmin(PC1))] - X[int(np.argmax(PC1))]))

# ── Caso 1: par mas cercano en zona de crisis (PC1 top-10% + Invierno) ─────────
thr = float(np.percentile(PC1, 90))
mask = (PC1 > thr) & (np.array(se_idx) == 0)
cidx = np.where(mask)[0]
print(f"[debug] registros zona crisis: {len(cidx)}")
rng = np.random.default_rng(42)
samp = cidx if len(cidx) <= 400 else rng.choice(cidx, 400, replace=False)
Xs = X[samp]
diff = Xs[:, None, :] - Xs[None, :, :]
dmat = np.sqrt((diff**2).sum(axis=2))
np.fill_diagonal(dmat, np.inf)
fi_flat = int(np.argmin(dmat))
ii, jj = divmod(fi_flat, len(samp))
d1 = float(dmat[ii, jj])
pC = info(int(samp[ii]))
pE = info(int(samp[jj]))

# ── reporte ────────────────────────────────────────────────────────────────────
W = 72
lines = []
def hdr(t): lines.extend(["", "="*W, f"  {t}", "="*W])
def sep(): lines.append("  "+"-"*68)
def frow(lbl, a, b, d=""): lines.append(f"  {lbl:<26} {str(a):<22} {str(b):<22} {d}")

hdr("VARIANZA EXPLICADA POR COMPONENTE")
lines.append(f"  {'Comp':<8} {'Varianza%':>12} {'Acumulada%':>12}")
acc=0
for i in range(10):
    acc += var_pct[i]
    lines.append(f"  PC{i+1:<6} {var_pct[i]:>11.2f}% {acc:>11.2f}%")

hdr("CARGAS (LOADINGS) PC1 y PC2")
lines.append(f"  {'Variable':<10} {'PC1':>10} {'PC2':>10}")
for fi in range(10):
    lines.append(f"  {features[fi]:<10} {L1[fi]:>10.4f} {L2[fi]:>10.4f}")

hdr("CASO 1 -- DOS PUNTOS CERCANOS (smog invernal, zona de crisis)")
lines.append(f"  Distancia euclidiana 10D (normalizado): {d1:.4f}")
lines.append("")
frow("Campo", "Punto C", "Punto E", "|Dif|")
sep()
frow("Estacion", pC["station"], pE["station"])
frow("Fecha", pC["date"], pE["date"])
frow("Temporada", pC["season"], pE["season"])
frow("Periodo", pC["period"], pE["period"])
frow("PC1", f"{pC['pc1']:>.4f}", f"{pE['pc1']:>.4f}")
frow("PC2", f"{pC['pc2']:>.4f}", f"{pE['pc2']:>.4f}")
frow("AQI", pC["aqi"], pE["aqi"])
frow("Categoria AQI", pC["aqi_cat"], pE["aqi_cat"])
sep()
for fi in range(10):
    nm = features[fi]
    oc, oe = pC["orig_"][nm], pE["orig_"][nm]
    nc, ne = pC["norm"][fi], pE["norm"][fi]
    frow(nm+" (orig)", f"{oc:.2f}", f"{oe:.2f}", f"{abs(oc-oe):.2f}")
    frow(nm+" (norm)", f"{nc:.4f}", f"{ne:.4f}", f"{abs(nc-ne):.4f}")

hdr("CASO 2 -- DOS PUNTOS LEJANOS (extremos absolutos PC1)")
lines.append(f"  Distancia euclidiana 10D (normalizado): {d2:.4f}")
lines.append("")
frow("Campo", "Punto A (limpio)", "Punto B (smog)", "|Dif|")
sep()
frow("Estacion", pA["station"], pB["station"])
frow("Fecha", pA["date"], pB["date"])
frow("Temporada", pA["season"], pB["season"])
frow("Periodo", pA["period"], pB["period"])
frow("PC1", f"{pA['pc1']:>.4f}", f"{pB['pc1']:>.4f}")
frow("PC2", f"{pA['pc2']:>.4f}", f"{pB['pc2']:>.4f}")
frow("AQI", pA["aqi"], pB["aqi"])
frow("Categoria AQI", pA["aqi_cat"], pB["aqi_cat"])
sep()
for fi in range(10):
    nm = features[fi]
    oa, ob = pA["orig_"][nm], pB["orig_"][nm]
    na, nb = pA["norm"][fi], pB["norm"][fi]
    frow(nm+" (orig)", f"{oa:.2f}", f"{ob:.2f}", f"{abs(oa-ob):.2f}")
    frow(nm+" (norm)", f"{na:.4f}", f"{nb:.4f}", f"{abs(na-nb):.4f}")

hdr("CASO 3 -- OUTLIER (registro mas extremo en PC1, smog maximo)")
lines.append(f"  Indice en dataset : {pB['idx']}")
lines.append(f"  Fecha             : {pB['date']}")
lines.append(f"  Estacion          : {pB['station']}")
lines.append(f"  Temporada         : {pB['season']}")
lines.append(f"  Zona              : {pB['zona']}")
lines.append(f"  Direccion viento  : {pB['wd']}")
lines.append(f"  PC1               : {pB['pc1']:.4f}  (maximo absoluto)")
lines.append(f"  PC2               : {pB['pc2']:.4f}")
lines.append(f"  AQI               : {pB['aqi']}  --  {pB['aqi_cat']}")
sep()
for fi in range(10):
    nm = features[fi]
    lines.append(f"  {nm:<10}: orig = {pB['orig_'][nm]:>10.2f}   norm = {pB['norm'][fi]:.4f}")

report = "\n".join(lines)
print(report)
out = Path(__file__).parent / "casos_evidencia3.txt"
out.write_text(report, encoding="utf-8")
print(f"\n[OK] Guardado en: {out}")
