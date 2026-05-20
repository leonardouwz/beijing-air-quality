"""
Análisis H4-H8 — Calidad del Aire Beijing
Leonardo Raphael Pachari Gomez
"""
import os, glob, warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
from matplotlib.colors import LinearSegmentedColormap
import seaborn as sns
from scipy import stats
from scipy.signal import find_peaks
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans

warnings.filterwarnings('ignore')

# ── Estilo global ─────────────────────────────────────────────────────────────
plt.rcParams.update({
    'figure.facecolor': '#0F172A',
    'axes.facecolor':   '#1E293B',
    'axes.edgecolor':   '#334155',
    'axes.labelcolor':  '#CBD5E1',
    'xtick.color':      '#94A3B8',
    'ytick.color':      '#94A3B8',
    'text.color':       '#F1F5F9',
    'grid.color':       '#1E293B',
    'grid.alpha':       0.4,
    'font.family':      'DejaVu Sans',
    'font.size':        11,
})

COLORS = {
    'norte': '#38BDF8',
    'centro': '#A78BFA',
    'sur':   '#FB7185',
    'oeste': '#34D399',
    'accent': '#6366F1',
    'amber':  '#F59E0B',
    'teal':   '#14B8A6',
    'red':    '#EF4444',
}

OUT = '/sessions/stoic-lucid-carson/mnt/beijing-air-quality/.claude/memory/evidencia3y4/img'
os.makedirs(OUT, exist_ok=True)

# ── Carga de datos ────────────────────────────────────────────────────────────
HIST_DIR = '/sessions/stoic-lucid-carson/mnt/beijing-air-quality/datasets/2013-2017/PRSA_Data_20130301-20170228'
CURR_CSV = '/sessions/stoic-lucid-carson/mnt/beijing-air-quality/datasets/2022-2026/air_quality_historical.csv'

STATION_ZONE = {
    'Aotizhongxin': 'centro', 'Guanyuan':     'centro',
    'Wanliu':       'oeste',  'Gucheng':      'oeste',
    'Dongsi':       'sur',    'Wanshouxigong':'sur',   'Tiantan':'sur',
    'Nongzhanguan': 'sur',
    'Dingling':     'norte',  'Huairou':      'norte',
    'Changping':    'norte',  'Shunyi':       'norte',
}
ZONE_COLOR = {'norte': COLORS['norte'], 'centro': COLORS['centro'],
              'sur': COLORS['sur'], 'oeste': COLORS['oeste']}

def load_hist():
    frames = []
    for f in sorted(glob.glob(f'{HIST_DIR}/*.csv')):
        name = os.path.basename(f).split('_')[2]
        df = pd.read_csv(f)
        df['station'] = name
        df['zone']    = STATION_ZONE.get(name, 'centro')
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df['datetime'] = pd.to_datetime(df[['year','month','day','hour']])
    df['season'] = df['month'].map({12:'Invierno',1:'Invierno',2:'Invierno',
                                     3:'Primavera',4:'Primavera',5:'Primavera',
                                     6:'Verano',7:'Verano',8:'Verano',
                                     9:'Otoño',10:'Otoño',11:'Otoño'})
    for col in ['PM2.5','PM10','SO2','NO2','CO','O3','TEMP','PRES','DEWP','WSPM']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    df['PM2.5'] = df['PM2.5'].clip(upper=500)
    return df

print("Cargando datos históricos…")
df = load_hist()
print(f"  {len(df):,} registros, {df['station'].nunique()} estaciones")

# Daily means for Markov
daily = df.groupby(['station','zone','season',pd.Grouper(key='datetime',freq='D')])['PM2.5'].mean().reset_index()
daily.columns = ['station','zone','season','date','PM25_day']
daily = daily.dropna(subset=['PM25_day'])

def aqi_label(v):
    if v < 50:   return 'Bueno'
    if v < 100:  return 'Moderado'
    if v < 150:  return 'Insalubre-SG'
    if v < 200:  return 'Insalubre'
    return 'Muy Insalubre'

daily['aqi_class'] = daily['PM25_day'].apply(aqi_label)
daily['state']     = daily['PM25_day'].apply(
    lambda v: 'Limpio' if v<50 else ('Moderado' if v<150 else 'Critico'))

# ══════════════════════════════════════════════════════════════════════════════
# H4 — Bimodalidad de PM2.5
# ══════════════════════════════════════════════════════════════════════════════
print("\nH4: Bimodalidad PM2.5…")

fig, axes = plt.subplots(2, 2, figsize=(14, 9))
fig.patch.set_facecolor('#0F172A')
fig.suptitle('H4 — Distribución KDE de PM2.5 por Zona Geográfica\n'
             'Detección de bimodalidad: modo "normal" vs modo "crisis invernal"',
             fontsize=13, fontweight='bold', color='#F1F5F9', y=0.98)

zones_order = ['norte','centro','oeste','sur']
zone_labels = {'norte':'Norte (Dingling, Huairou, Changping, Shunyi)',
               'centro':'Centro (Aotizhongxin, Guanyuan)',
               'oeste':'Oeste (Wanliu, Gucheng)',
               'sur':'Sur (Dongsi, Wanshouxigong, Tiantan, Nongzhanguan)'}

for ax, zone in zip(axes.flat, zones_order):
    ax.set_facecolor('#1E293B')
    zdata = df[df['zone']==zone]['PM2.5'].dropna()
    c = ZONE_COLOR[zone]

    # KDE global
    kde = stats.gaussian_kde(zdata, bw_method=0.15)
    x = np.linspace(0, 400, 800)
    y = kde(x)
    ax.fill_between(x, y, alpha=0.25, color=c)
    ax.plot(x, y, color=c, lw=2.2, label='KDE global')

    # KDE por estación
    season_colors = {'Invierno':'#FB7185','Verano':'#38BDF8',
                     'Primavera':'#34D399','Otoño':'#F59E0B'}
    for season, sc in season_colors.items():
        sd = df[(df['zone']==zone)&(df['season']==season)]['PM2.5'].dropna()
        if len(sd) > 100:
            kde_s = stats.gaussian_kde(sd, bw_method=0.15)
            ys = kde_s(x)
            ax.plot(x, ys, color=sc, lw=1.2, alpha=0.7, linestyle='--', label=season)

    # Picos
    peaks, props = find_peaks(y, height=np.max(y)*0.15, distance=40)
    for pk in peaks:
        ax.axvline(x[pk], color=c, alpha=0.5, lw=1, linestyle=':')
        ax.text(x[pk]+3, y[pk]*0.92, f'{x[pk]:.0f}', color=c, fontsize=8.5, fontweight='bold')

    n_modes = len(peaks)
    mode_txt = f'{"Bimodal" if n_modes>=2 else "Unimodal"} ({n_modes} pico{"s" if n_modes!=1 else ""})'
    ax.text(0.97, 0.95, mode_txt, transform=ax.transAxes, ha='right', va='top',
            fontsize=9, color='#F1F5F9',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#0F172A', alpha=0.8))

    median = zdata.median()
    ax.axvline(median, color='white', alpha=0.4, lw=1, linestyle='-.')
    ax.text(median+2, ax.get_ylim()[1]*0.5 if ax.get_ylim()[1]>0 else 0.001,
            f'Med={median:.0f}', color='white', fontsize=8, alpha=0.7)

    ax.set_title(zone_labels[zone], fontsize=10, color='#F1F5F9', pad=6)
    ax.set_xlabel('PM2.5 (µg/m³)', fontsize=9)
    ax.set_ylabel('Densidad KDE', fontsize=9)
    ax.set_xlim(0, 350)
    ax.legend(fontsize=7.5, loc='upper right',
              facecolor='#0F172A', edgecolor='#334155', labelcolor='#CBD5E1')
    ax.grid(axis='x', alpha=0.2)
    for sp in ax.spines.values(): sp.set_edgecolor('#334155')

plt.tight_layout(rect=[0,0,1,0.96])
plt.savefig(f'{OUT}/h4_bimodalidad.png', dpi=150, bbox_inches='tight',
            facecolor='#0F172A')
plt.close()
print("  ✓ h4_bimodalidad.png")

# ══════════════════════════════════════════════════════════════════════════════
# H5 — Dirección del viento modera correlación DEW-PM2.5
# ══════════════════════════════════════════════════════════════════════════════
print("H5: Moderación viento…")

wd_map = {
    'N':'Norte','NNE':'Norte','NE':'Norte','ENE':'Este',
    'E':'Este','ESE':'Este','SE':'Sur','SSE':'Sur',
    'S':'Sur','SSW':'Sur','SW':'Sur','WSW':'Oeste',
    'W':'Oeste','WNW':'Noroeste','NW':'Noroeste','NNW':'Noroeste',
}
df5 = df[['PM2.5','DEWP','WSPM','wd']].dropna()
df5['wd_group'] = df5['wd'].map(wd_map).fillna('Otro')

groups = ['Noroeste','Norte','Este','Sur']
group_colors = {'Noroeste':'#38BDF8','Norte':'#A78BFA','Este':'#34D399','Sur':'#FB7185'}

fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.patch.set_facecolor('#0F172A')
fig.suptitle('H5 — Dirección del Viento como Moderador de la Correlación DEW–PM2.5\n'
             'Vientos del Noroeste dispersan contaminantes; vientos del Sur los acumulan',
             fontsize=13, fontweight='bold', color='#F1F5F9', y=1.01)

# Panel izquierdo: scatter DEW vs PM2.5 por grupo de viento
ax = axes[0]
ax.set_facecolor('#1E293B')
corr_results = []
for grp in groups:
    sub = df5[df5['wd_group']==grp].sample(min(2000, len(df5[df5['wd_group']==grp])), random_state=42)
    if len(sub) < 50: continue
    c = group_colors[grp]
    ax.scatter(sub['DEWP'], sub['PM2.5'], color=c, alpha=0.12, s=3)
    # Línea de tendencia
    m,b,r,p,_ = stats.linregress(sub['DEWP'], sub['PM2.5'])
    xr = np.linspace(sub['DEWP'].min(), sub['DEWP'].max(), 100)
    ax.plot(xr, m*xr+b, color=c, lw=2.2, label=f'{grp}  r={r:.2f}')
    corr_results.append((grp, r, len(sub)))

ax.set_xlabel('Punto de Rocío DEWP (°C)', fontsize=10)
ax.set_ylabel('PM2.5 (µg/m³)', fontsize=10)
ax.set_title('Scatter DEW vs PM2.5 por cuadrante de viento', fontsize=10, color='#F1F5F9')
ax.set_ylim(0, 350)
ax.legend(fontsize=9, facecolor='#0F172A', edgecolor='#334155', labelcolor='#CBD5E1')
ax.grid(alpha=0.15)
for sp in ax.spines.values(): sp.set_edgecolor('#334155')

# Panel derecho: correlación por grupo (barras)
ax2 = axes[1]
ax2.set_facecolor('#1E293B')
if corr_results:
    grp_names = [x[0] for x in corr_results]
    corr_vals  = [x[1] for x in corr_results]
    colors_bar = [group_colors.get(g,'#6366F1') for g in grp_names]
    bars = ax2.barh(grp_names, corr_vals, color=colors_bar, alpha=0.85, edgecolor='#1E293B')
    ax2.axvline(0, color='white', alpha=0.3, lw=1)
    # Correlación global
    r_global,_ = stats.pearsonr(df5['DEWP'], df5['PM2.5'])
    ax2.axvline(r_global, color=COLORS['amber'], lw=2, linestyle='--', alpha=0.8,
                label=f'Global r={r_global:.2f}')
    for bar, val in zip(bars, corr_vals):
        ax2.text(val + 0.01*np.sign(val), bar.get_y()+bar.get_height()/2,
                 f'{val:.2f}', va='center', fontsize=10, fontweight='bold',
                 color='#F1F5F9')
ax2.set_xlabel('Correlación de Pearson (DEW ~ PM2.5)', fontsize=10)
ax2.set_title('Correlación DEW-PM2.5 por cuadrante de viento', fontsize=10, color='#F1F5F9')
ax2.legend(fontsize=9, facecolor='#0F172A', edgecolor='#334155', labelcolor='#CBD5E1')
ax2.grid(axis='x', alpha=0.15)
for sp in ax2.spines.values(): sp.set_edgecolor('#334155')

plt.tight_layout()
plt.savefig(f'{OUT}/h5_moderacion_viento.png', dpi=150, bbox_inches='tight',
            facecolor='#0F172A')
plt.close()
print("  ✓ h5_moderacion_viento.png")

# ══════════════════════════════════════════════════════════════════════════════
# H6 — PCA 3D de estaciones
# ══════════════════════════════════════════════════════════════════════════════
print("H6: PCA de estaciones…")

FEATURES = ['PM2.5','PM10','SO2','NO2','CO','TEMP','PRES','DEWP','WSPM']
feat_cols = [c for c in FEATURES if c in df.columns]
station_means = df.groupby(['station','zone'])[feat_cols].mean().reset_index().dropna()

X = station_means[feat_cols].values
scaler = StandardScaler()
X_sc = scaler.fit_transform(X)
pca = PCA(n_components=min(3, X_sc.shape[1]))
X_pca = pca.fit_transform(X_sc)
var_exp = pca.explained_variance_ratio_ * 100

fig = plt.figure(figsize=(14, 7))
fig.patch.set_facecolor('#0F172A')
fig.suptitle(f'H6 — PCA de Perfiles Meteorológicos por Estación\n'
             f'PC1={var_exp[0]:.1f}%  PC2={var_exp[1]:.1f}%  PC3={var_exp[2]:.1f}%  '
             f'(Total={sum(var_exp):.1f}% varianza explicada)',
             fontsize=12, fontweight='bold', color='#F1F5F9', y=0.99)

# Panel 3D
ax3d = fig.add_subplot(121, projection='3d')
ax3d.set_facecolor('#1E293B')

for i, row in station_means.iterrows():
    c = ZONE_COLOR[row['zone']]
    pc = X_pca[i]
    ax3d.scatter(pc[0], pc[1], pc[2], color=c, s=120, edgecolors='white',
                 linewidths=0.8, zorder=5, alpha=0.9)
    ax3d.text(pc[0], pc[1], pc[2]+0.08, row['station'][:7], fontsize=7,
              color=c, ha='center', fontweight='bold')

ax3d.set_xlabel(f'PC1 ({var_exp[0]:.1f}%)', fontsize=8, labelpad=5)
ax3d.set_ylabel(f'PC2 ({var_exp[1]:.1f}%)', fontsize=8, labelpad=5)
ax3d.set_zlabel(f'PC3 ({var_exp[2]:.1f}%)', fontsize=8, labelpad=5)
ax3d.set_title('Proyección 3D', fontsize=10, color='#F1F5F9', pad=8)
ax3d.xaxis.pane.fill = False; ax3d.yaxis.pane.fill = False; ax3d.zaxis.pane.fill = False
ax3d.grid(True, alpha=0.15)

legend_els = [mpatches.Patch(color=ZONE_COLOR[z], label=z.capitalize()) for z in ['norte','centro','sur','oeste']]
ax3d.legend(handles=legend_els, fontsize=8, loc='upper left',
            facecolor='#0F172A', edgecolor='#334155', labelcolor='#CBD5E1')

# Panel derecho: loadings PC1 vs PC2
ax2 = fig.add_subplot(122)
ax2.set_facecolor('#1E293B')
loadings = pca.components_.T
for j, feat in enumerate(feat_cols):
    ax2.annotate('', xy=(loadings[j,0], loadings[j,1]), xytext=(0,0),
                 arrowprops=dict(arrowstyle='->', color=COLORS['accent'], lw=1.8))
    offset = 0.04
    ax2.text(loadings[j,0]+offset*np.sign(loadings[j,0]),
             loadings[j,1]+offset*np.sign(loadings[j,1]),
             feat, fontsize=9, color='#F1F5F9', fontweight='bold', ha='center')

circle = plt.Circle((0,0), 1, color='#334155', fill=False, lw=1, linestyle='--')
ax2.add_patch(circle)
ax2.axhline(0, color='#334155', lw=0.8); ax2.axvline(0, color='#334155', lw=0.8)
ax2.set_xlim(-1.3, 1.3); ax2.set_ylim(-1.3, 1.3)
ax2.set_xlabel(f'PC1 ({var_exp[0]:.1f}%)', fontsize=10)
ax2.set_ylabel(f'PC2 ({var_exp[1]:.1f}%)', fontsize=10)
ax2.set_title('Biplot de Loadings (PC1 vs PC2)', fontsize=10, color='#F1F5F9')
ax2.set_aspect('equal')
for sp in ax2.spines.values(): sp.set_edgecolor('#334155')
ax2.grid(alpha=0.12)

plt.tight_layout(rect=[0,0,1,0.95])
plt.savefig(f'{OUT}/h6_pca_estaciones.png', dpi=150, bbox_inches='tight',
            facecolor='#0F172A')
plt.close()
print("  ✓ h6_pca_estaciones.png")

# ══════════════════════════════════════════════════════════════════════════════
# H7 — Matriz de Markov
# ══════════════════════════════════════════════════════════════════════════════
print("H7: Cadena de Markov…")

def markov_matrix(series):
    states = ['Limpio','Moderado','Critico']
    mat = pd.DataFrame(0, index=states, columns=states, dtype=float)
    for i in range(len(series)-1):
        s_now  = series.iloc[i]
        s_next = series.iloc[i+1]
        if s_now in states and s_next in states:
            mat.loc[s_now, s_next] += 1
    row_sums = mat.sum(axis=1)
    mat = mat.div(row_sums.where(row_sums>0, 1), axis=0)
    return mat

# Markov sobre todas las estaciones, ordenadas por fecha
all_daily = df.groupby(pd.Grouper(key='datetime', freq='D'))['PM2.5'].mean().reset_index()
all_daily['state'] = all_daily['PM2.5'].apply(
    lambda v: 'Limpio' if v<50 else ('Moderado' if v<150 else 'Critico') if pd.notna(v) else np.nan)
all_daily = all_daily.dropna(subset=['state'])
M = markov_matrix(all_daily['state'].reset_index(drop=True))

fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.patch.set_facecolor('#0F172A')
fig.suptitle('H7 — Cadena de Markov: Persistencia Temporal de Estados de Contaminación\n'
             'Probabilidad de transición entre estados consecutivos diarios (2013-2017)',
             fontsize=13, fontweight='bold', color='#F1F5F9', y=1.01)

# Heatmap matriz de transición
ax = axes[0]
ax.set_facecolor('#1E293B')
cmap = LinearSegmentedColormap.from_list('markov',['#1E293B','#6366F1','#A78BFA'])
im = ax.imshow(M.values, cmap=cmap, aspect='auto', vmin=0, vmax=1)
states = ['Limpio','Moderado','Critico']
for i in range(3):
    for j in range(3):
        val = M.values[i,j]
        ax.text(j, i, f'{val:.2f}', ha='center', va='center',
                fontsize=14, fontweight='bold',
                color='white' if val > 0.4 else '#94A3B8')
ax.set_xticks(range(3)); ax.set_yticks(range(3))
ax.set_xticklabels(['→ Limpio','→ Moderado','→ Crítico'], fontsize=10)
ax.set_yticklabels(['Limpio','Moderado','Crítico'], fontsize=10)
ax.set_xlabel('Estado día t+1', fontsize=10)
ax.set_ylabel('Estado día t', fontsize=10)
ax.set_title('Matriz de Transición de Markov\n(probabilidades de 1 día a siguiente)', fontsize=10, color='#F1F5F9')
plt.colorbar(im, ax=ax, fraction=0.04, label='Probabilidad')
for sp in ax.spines.values(): sp.set_edgecolor('#334155')

# Panel derecho: frecuencia de estados
ax2 = axes[1]
ax2.set_facecolor('#1E293B')
state_counts = all_daily['state'].value_counts()
state_pcts   = (state_counts / state_counts.sum() * 100).reindex(['Limpio','Moderado','Critico'])
bar_colors   = [COLORS['teal'], COLORS['amber'], COLORS['red']]
bars = ax2.bar(state_pcts.index, state_pcts.values, color=bar_colors, alpha=0.85,
               edgecolor='#0F172A', linewidth=1.2, width=0.55)
for bar, val in zip(bars, state_pcts.values):
    ax2.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5,
             f'{val:.1f}%', ha='center', fontsize=12, fontweight='bold', color='#F1F5F9')

# Persistencia diagonal
persist_limpio   = M.loc['Limpio','Limpio']
persist_critico  = M.loc['Critico','Critico']
ax2.text(0.97, 0.97,
         f'Persistencia:\nLimpio→Limpio: {persist_limpio:.0%}\nCrítico→Crítico: {persist_critico:.0%}',
         transform=ax2.transAxes, ha='right', va='top', fontsize=10,
         color='#F1F5F9', bbox=dict(boxstyle='round,pad=0.5', facecolor='#0F172A', alpha=0.85))
ax2.set_ylabel('% de días (2013-2017)', fontsize=10)
ax2.set_title('Distribución de estados y persistencia', fontsize=10, color='#F1F5F9')
ax2.grid(axis='y', alpha=0.15)
for sp in ax2.spines.values(): sp.set_edgecolor('#334155')

plt.tight_layout()
plt.savefig(f'{OUT}/h7_markov.png', dpi=150, bbox_inches='tight', facecolor='#0F172A')
plt.close()
print("  ✓ h7_markov.png")

# ══════════════════════════════════════════════════════════════════════════════
# H8 — Desbalance AQI por zona × estación del año
# ══════════════════════════════════════════════════════════════════════════════
print("H8: Desbalance AQI…")

AQI_ORDER  = ['Bueno','Moderado','Insalubre-SG','Insalubre','Muy Insalubre']
AQI_COLORS = ['#22C55E','#EAB308','#F97316','#EF4444','#9333EA']
aqi_cmap   = dict(zip(AQI_ORDER, AQI_COLORS))

daily['aqi_class'] = daily['PM25_day'].apply(aqi_label)

fig, axes = plt.subplots(2, 4, figsize=(16, 8), sharey=False)
fig.patch.set_facecolor('#0F172A')
fig.suptitle('H8 — Desbalance de Clases AQI por Zona Geográfica y Estación del Año\n'
             'Distribución proporcional del Índice de Calidad del Aire (2013-2017)',
             fontsize=13, fontweight='bold', color='#F1F5F9', y=1.01)

seasons = ['Invierno','Primavera','Verano','Otoño']
zones   = ['norte','sur']
zone_label_map = {'norte':'Zona Norte','sur':'Zona Sur'}

for row_i, zone in enumerate(zones):
    for col_i, season in enumerate(seasons):
        ax = axes[row_i][col_i]
        ax.set_facecolor('#1E293B')
        sub = daily[(daily['zone']==zone)&(daily['season']==season)]
        if len(sub) == 0:
            ax.set_visible(False); continue
        counts = sub['aqi_class'].value_counts().reindex(AQI_ORDER, fill_value=0)
        pcts   = counts / counts.sum() * 100
        bars = ax.bar(range(len(AQI_ORDER)), pcts.values,
                      color=AQI_COLORS, alpha=0.85, edgecolor='#0F172A', lw=0.8)
        for bar, val in zip(bars, pcts.values):
            if val > 4:
                ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5,
                        f'{val:.0f}%', ha='center', fontsize=7.5, color='#F1F5F9', fontweight='bold')
        ax.set_xticks(range(len(AQI_ORDER)))
        ax.set_xticklabels(['Bueno','Mod.','I-SG','Insalb.','M.Ins.'], fontsize=7, rotation=20)
        ax.set_ylim(0, 70)
        ax.set_ylabel('%' if col_i==0 else '', fontsize=9)
        title_color = ZONE_COLOR[zone]
        ax.set_title(f'{zone_label_map[zone]} — {season}', fontsize=9,
                     color=title_color, fontweight='bold')
        ax.grid(axis='y', alpha=0.12)
        n = len(sub)
        ax.text(0.97, 0.97, f'n={n}', transform=ax.transAxes,
                ha='right', va='top', fontsize=7.5, color='#94A3B8')
        for sp in ax.spines.values(): sp.set_edgecolor('#334155')

# Leyenda global
legend_patches = [mpatches.Patch(color=aqi_cmap[a], label=a) for a in AQI_ORDER]
fig.legend(handles=legend_patches, loc='lower center', ncol=5,
           fontsize=9, facecolor='#0F172A', edgecolor='#334155',
           labelcolor='#CBD5E1', bbox_to_anchor=(0.5, -0.03))

plt.tight_layout(rect=[0,0,1,0.97])
plt.savefig(f'{OUT}/h8_desbalance_aqi.png', dpi=150, bbox_inches='tight',
            facecolor='#0F172A')
plt.close()
print("  ✓ h8_desbalance_aqi.png")

# ══════════════════════════════════════════════════════════════════════════════
# Métricas de resumen
# ══════════════════════════════════════════════════════════════════════════════
print("\n─── Métricas clave ───")
# H4
for zone in zones_order:
    med = df[df['zone']==zone]['PM2.5'].median()
    skw = df[df['zone']==zone]['PM2.5'].skew()
    print(f"  H4 {zone:8s}: mediana={med:.1f}  skew={skw:.2f}")
# H5
print(f"  H5 correlación global DEW-PM2.5: r={stats.pearsonr(df5['DEWP'],df5['PM2.5'])[0]:.3f}")
for grp, r, n in corr_results:
    print(f"     {grp:10s}: r={r:.3f}  (n={n:,})")
# H6
print(f"  H6 varianza explicada: PC1={var_exp[0]:.1f}%  PC2={var_exp[1]:.1f}%  PC3={var_exp[2]:.1f}%  Acum={sum(var_exp):.1f}%")
# H7
print(f"  H7 Limpio→Limpio:  {persist_limpio:.1%}")
print(f"  H7 Crítico→Crítico:{persist_critico:.1%}")
# H8
for zone in ['norte','sur']:
    for season in ['Invierno','Verano']:
        sub = daily[(daily['zone']==zone)&(daily['season']==season)]
        if len(sub):
            bad_pct = (sub['aqi_class'].isin(['Insalubre','Muy Insalubre'])).mean()*100
            print(f"  H8 {zone:6s} {season:10s}: {bad_pct:.1f}% días insalubres")

print("\n✅  Todos los gráficos generados en:", OUT)
