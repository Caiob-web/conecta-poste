// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
//  (Street View via link público do Google — sem API, sem custo)
// =====================================================================

// ------------------------- Estilos do HUD (hora/tempo/mapa) ----------

/* ====================================================================
   Tooltip permanente para poste crítico (>8 empresas)
==================================================================== */
(function injectPosteAlertTooltipStyles() {
  const css = `
    .poste-alert-tooltip{
      background: rgba(255,255,255,0.96);
      color: #b91c1c;
      border-radius: 999px;
      padding: 2px 7px;
      box-shadow: 0 6px 16px rgba(0,0,0,.18);
      font: 800 11px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      white-space: nowrap;
      pointer-events: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .poste-alert-tooltip img.poste-alert-img{
      width: 14px;
      height: 14px;
      object-fit: contain;
      display: inline-block;
    }

    .leaflet-tooltip.poste-alert-tooltip{
      background: rgba(255,255,255,0.96) !important;
      border-radius: 999px !important;
      border: 1px solid rgba(185,28,28,.35) !important;
      box-shadow: 0 6px 16px rgba(0,0,0,.18) !important;
      padding: 2px 7px !important;
    }
    .leaflet-tooltip.poste-alert-tooltip::before{
      display:none !important;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

(function injectHudStyles() {
  const css = `
    #tempo{
      display:flex; flex-direction:column; gap:10px; padding:12px 14px;
      border-radius:14px; background:rgba(255,255,255,0.92);
      box-shadow:0 8px 24px rgba(0,0,0,0.12); backdrop-filter:saturate(1.15) blur(2px);
    }
    #tempo .hora-row{
      display:flex; align-items:center; gap:8px;
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:#0f172a; font-weight:700;
    }
    #tempo .hora-row .dot{
      width:10px; height:10px; border-radius:50%;
      background:linear-gradient(180deg,#1e3a8a,#2563eb);
      box-shadow:0 0 0 2px #e5e7eb inset; display:inline-block;
    }
    #tempo .weather-card{
      display:flex; flex-direction:column; gap:10px; padding:12px 14px;
      border-radius:12px; background:rgba(255,255,255,0.95);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
      min-width:260px;
    }
    #tempo .weather-row{ display:flex; align-items:center; gap:10px; min-height:40px; }
    #tempo .weather-row img{ width:28px; height:28px; object-fit:contain; }
    #tempo .tempo-text{ display:flex; flex-direction:column; gap:2px; font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#1f2937; }
    #tempo .tempo-text b{ font-weight:700; } #tempo .tempo-text small{ color:#6b7280; }
    #tempo .map-row{
      margin-top:6px; padding-top:8px; border-top:1px dashed rgba(0,0,0,.10);
      display:flex; align-items:center; justify-content:space-between; gap:10px;
    }
    #tempo .map-row .lbl{ font: 12px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial; letter-spacing:.2px; color:#475569; font-weight:700; }
    #tempo .select-wrap{
      position:relative; display:inline-flex; align-items:center; gap:8px;
      padding:8px 36px 8px 12px; border:1px solid #e5e7eb; border-radius:999px;
      background:#fff; transition:border-color .15s ease, box-shadow .15s ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
    }
    #tempo .select-wrap:focus-within{ border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.20); }
    #tempo .select-wrap .ico-globe{ width:16px; height:16px; opacity:.75; }
    #tempo .select-wrap .ico-caret{ position:absolute; right:10px; width:14px; height:14px; opacity:.6; pointer-events:none; }
    #tempo select{ appearance:none; border:0; outline:none; background:transparent; padding:0; margin:0; font: 13px/1.2 system-ui,-apple-system, Segoe UI, Roboto, Arial; color:#111827; cursor:pointer; }

    .bi-backdrop{position:fixed; inset:0; display:none; align-items:center; justify-content:center; z-index:4000; background:rgba(0,0,0,.35);}
    .bi-card{width:min(960px,96vw); max-height:90vh; overflow:auto; background:#fff; border-radius:10px; box-shadow:0 12px 32px rgba(0,0,0,.2); font-family:'Segoe UI',system-ui;}
    .bi-head{display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #eee;}
    .bi-head h3{margin:0; font-weight:700; color:#111827; font-size:16px}
    .bi-close{border:0; background:#f3f4f6; color:#111827; border-radius:8px; padding:6px 10px; cursor:pointer}
    .bi-body{padding:12px 16px; display:grid; grid-template-columns:1fr 320px; gap:12px;}
    .bi-side label{font-size:13px; color:#374151}
    .bi-input{padding:8px; border:1px solid #ddd; border-radius:8px; width:100%}
    .bi-chk{display:flex; align-items:center; gap:8px; margin-top:6px; font-size:13px; color:#374151;}
    .bi-resumo{margin-top:8px; font-size:13px; color:#111827;}
    .bi-btn{margin-top:8px; border:1px solid #ddd; background:#fff; border-radius:8px; padding:8px; cursor:pointer}
    .bi-table-wrap{padding:0 16px 16px 16px;}
    .bi-table{width:100%; border-collapse:collapse; font-size:13px; border:1px solid #eee; border-radius:8px; overflow:auto}
    .bi-table thead{background:#f9fafb}
    .bi-table th,.bi-table td{padding:10px; border-bottom:1px solid #eee}
    .bi-table td.num{text-align:right}

    .bi-muni-cell{
      display:flex;
      align-items:center;
      gap:8px;
    }
    .bi-muni-logo{
      width:22px;
      height:22px;
      border-radius:999px;
      object-fit:cover;
      box-shadow:0 1px 3px rgba(0,0,0,.25);
      background:#fff;
    }
    .bi-muni-name{
      white-space:nowrap;
    }
    .bi-ver-empresas{
      border:0;
      background:#e5f0ff;
      border-radius:999px;
      padding:6px 10px;
      font-size:11px;
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      gap:4px;
    }
    .bi-ver-empresas i{
      font-size:11px;
    }

    .bi-detalhes{
      margin-top:10px;
      border-top:1px solid #e5e7eb;
      padding:10px 12px 12px;
      font-size:12px;
      background:#f9fafb;
      border-radius:0 0 10px 10px;
    }
    .bi-detalhes h4{
      margin:0 0 6px 0;
      font-size:13px;
      font-weight:700;
      color:#111827;
    }
    .bi-detalhes-resumo{
      margin-bottom:6px;
      color:#374151;
    }
    .bi-detalhes-cols{
      display:grid;
      grid-template-columns:2fr 1.5fr 1.5fr;
      gap:8px;
    }
    .bi-detalhes-cols strong{
      display:block;
      margin-bottom:4px;
      font-size:11px;
      color:#4b5563;
    }
    .bi-mini-table{
      width:100%;
      border-collapse:collapse;
      font-size:11px;
      background:#ffffff;
      border-radius:8px;
      overflow:hidden;
    }
    .bi-mini-table th,
    .bi-mini-table td{
      padding:4px 6px;
      border-bottom:1px solid #e5e7eb;
    }
    .bi-mini-table th{
      text-align:left;
      background:#f3f4f6;
      color:#4b5563;
    }
    .bi-mini-table td.num{
      text-align:right;
    }

    .leaflet-tooltip-pane{ z-index: 650 !important; pointer-events:auto; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Estilos do popup tipo "card"
==================================================================== */
(function injectPopupCardStyles() {
  const css = `
    .leaflet-popup-content { margin: 0; padding: 0; }
    .mp-card {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.18);
      padding: 10px 12px;
      min-width: 220px;
      max-width: 420px;
    }
    .mp-header { border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 6px; }
    .mp-header-title { font-weight: 600; font-size: 13px; }
    .mp-header-sub { font-size: 11px; color: #777; }
    .mp-local { margin-bottom: 4px; }
    .mp-local-principal { font-weight: 500; font-size: 12px; }
    .mp-local-secundario, .mp-local-coord { font-size: 11px; color: #666; }

    .mp-copy-line{
      display:flex; align-items:center; gap:6px; font-size:11px; margin:2px 0;
    }
    .mp-copy-label{ font-weight:600; min-width:48px; }
    .mp-copy-value{ flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mp-copy-btn{
      border:none; background:#e5f0ff; border-radius:999px; padding:3px 6px;
      cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px;
    }
    .mp-copy-btn i{ font-size:11px; }

    .mp-empresas-lista {
      border-radius: 6px; overflow: hidden; border: 1px solid #e6e6e6; margin-top:6px;
    }
    .mp-empresa-item {
      display: flex; align-items: center; padding: 6px 8px; background: #fdfdfd; cursor:pointer;
    }
    .mp-empresa-item + .mp-empresa-item { border-top: 1px solid #eee; }
    .mp-empresa-status { margin-right: 8px; }
    .mp-status-badge {
      display: inline-block; width: 18px; height: 18px; border-radius: 999px; background: #18c167; position: relative;
    }
    .mp-status-badge::after {
      content: "✔"; position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -57%); font-size: 11px; color: #fff;
    }
    .mp-empresa-textos { flex: 1; }
    .mp-empresa-nome { font-size: 12px; font-weight: 500; }
    .mp-empresa-extra{ display:none; font-size:10px; color:#555; margin-top:2px; }
    .mp-empresa-item.open .mp-empresa-extra{ display:block; }
    .mp-empresa-arrow { font-size: 14px; color: #999; margin-left: 6px; transition: transform .15s ease; }
    .mp-empresa-item.open .mp-empresa-arrow{ transform: rotate(90deg); }
    .mp-empresa-empty{ padding:8px 10px; font-size:11px; color:#6b7280; background:#f9fafb; }

    .mp-btn-street {
      margin-top: 8px; width: 100%; border: none; border-radius: 6px;
      padding: 6px 8px; font-size: 12px; font-weight: 500;
      cursor: pointer; background: #0078ff; color: #fff;
    }
    .mp-btn-street:hover { opacity: 0.9; }
    .mp-street-note { margin-top: 4px; color: #777; font-size: 10px; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Sidebar fixa + botão recolher
==================================================================== */
(function injectDockSidebarStyles() {
  const css = `
    :root{ --dock-w: 340px; }
    .painel-busca{
      position: fixed !important; top: 0; right: 0; height: 100vh; width: var(--dock-w);
      overflow: auto; overflow-x: hidden; border-left: 2px solid var(--ui-border, #19d68f);
      border-radius: 0 !important; padding: 12px 12px 20px;
      transform: translateX(0%); transition: transform .25s ease;
      z-index: 1000; box-sizing: border-box;
    }
    .painel-busca .actions{ display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; margin-top: 6px; }
    .painel-busca.collapsed{ transform: translateX(100%); }
    #togglePainel{
      position: fixed !important; top: 50%; right: calc(var(--dock-w) + 6px); transform: translateY(-50%);
      width: 42px; height: 64px; border-radius: 10px 0 0 10px !important; background: var(--ui-bg, #0f1b2a) !important;
      border: 1px solid var(--ui-border, #19d68f) !important; box-shadow: 0 10px 24px rgba(0,0,0,.28) !important; z-index: 1100;
      display:flex;align-items:center;justify-content:center;
    }
    body.sidebar-collapsed #togglePainel{ right: 6px !important; }
    #togglePainel i{ transition: transform .2s ease; }
    body.sidebar-collapsed #togglePainel i{ transform: scaleX(-1); }
    #localizacaoUsuario, #logoutBtn{ position: fixed !important; right: calc(var(--dock-w) + 16px); z-index: 1100; }
    body.sidebar-collapsed #localizacaoUsuario, body.sidebar-collapsed #logoutBtn{ right: 16px !important; }
    .dock-hud{ margin-top:12px; }
  `;
  const style = document.createElement("style");
  style.id = "dock-sidebar-styles";
  style.textContent = css;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", () => {
    const tgl = document.getElementById("togglePainel");
    if (tgl) tgl.innerHTML = '<i class="fa fa-chevron-right"></i>';
  });
})();

/* ====================================================================
   CLUSTER: mostrar SÓ NÚMEROS (sem bolhas)
==================================================================== */
(function injectClusterNumberStyles() {
  const css = `
    .cluster-num-only{
      background:transparent !important; border:none !important; box-shadow:none !important;
      color:#111827; font: 800 14px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      text-shadow: 0 0 3px #fff, 0 0 6px rgba(255,255,255,.9);
      transform: translate(-50%, -50%); user-select:none; pointer-events:auto;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Estilo do botão de seleção de postes (estado ativo)
==================================================================== */
(function injectSelecaoButtonStyles() {
  const css = `
    .painel-busca .actions button.selecionando{
      box-shadow:0 0 0 2px rgba(59,130,246,.6);
      filter:saturate(1.1);
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Estilos dos ícones de poste
==================================================================== */
(function injectPosteIconStyles() {
  const css = `
    .poste-marker-icon{
      transform-origin:center bottom;
      transition:transform .15s ease, filter .15s ease;
    }
    .poste-marker-selected{
      transform:translateY(-2px) scale(1.06);
      filter:drop-shadow(0 0 4px rgba(59,130,246,.85));
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Estilos da tela de visualização inicial (modo de carregamento)
==================================================================== */
(function injectModoInicialStyles() {
  const css = `
    .modo-backdrop{
      position:fixed;
      inset:0;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(15,23,42,.55);
      z-index:3500;
      padding:16px;
      box-sizing:border-box;
    }
    .modo-card{
      width:min(960px,100%);
      max-height:90vh;
      overflow:auto;
      background:#ffffff;
      border-radius:12px;
      box-shadow:0 18px 40px rgba(15,23,42,.32);
      padding:18px 20px 20px;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
    }
    .modo-head{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
      margin-bottom:12px;
    }
    .modo-head h2{
      margin:0 0 4px;
      font-size:18px;
      font-weight:700;
      color:#111827;
    }
    .modo-head p{
      margin:0;
      font-size:13px;
      color:#4b5563;
    }
    .modo-tag{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:6px 10px;
      border-radius:999px;
      background:#e0f2fe;
      font-size:11px;
      color:#0f172a;
      font-weight:600;
      white-space:nowrap;
    }
    .modo-tag i{
      font-size:11px;
    }
    .modo-footer{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-top:10px;
      flex-wrap:wrap;
    }
    .modo-footer-left{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      align-items:center;
    }
    .modo-footer-right{
      font-size:12px;
      color:#6b7280;
    }
    .modo-btn-primary,
    .modo-btn-secondary{
      border-radius:999px;
      border:1px solid transparent;
      padding:8px 14px;
      font-size:13px;
      font-weight:600;
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      gap:6px;
    }
    .modo-btn-primary{
      background:#111827;
      color:#f9fafb;
    }
    .modo-btn-secondary{
      background:#f9fafb;
      color:#111827;
      border-color:#e5e7eb;
    }
    .modo-btn-primary i,
    .modo-btn-secondary i{
      font-size:13px;
    }
    .modo-counter{
      font-size:12px;
      color:#6b7280;
    }
    .modo-grid{
      margin-top:10px;
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
      gap:8px;
    }
    .modo-card-muni{
      border:1px solid #e5e7eb;
      border-radius:10px;
      padding:8px 10px;
      background:#ffffff;
      display:flex;
      align-items:center;
      gap:8px;
      cursor:pointer;
      text-align:left;
      font-size:13px;
      color:#111827;
      transition:border-color .15s ease, box-shadow .15s ease, transform .08s ease;
    }
    .modo-card-muni img{
      width:28px;
      height:28px;
      border-radius:999px;
      object-fit:cover;
      box-shadow:0 1px 3px rgba(15,23,42,.25);
      flex-shrink:0;
    }
    .modo-card-muni:hover{
      border-color:#38bdf8;
      box-shadow:0 4px 12px rgba(15,23,42,.12);
      transform:translateY(-1px);
    }
    .modo-card-muni.selected{
      border-color:#111827;
      box-shadow:0 0 0 1px #111827;
    }
    @media (max-width:768px){
      .modo-card{
        padding:14px 12px 16px;
      }
      .modo-head{
        flex-direction:column;
        align-items:flex-start;
      }
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

// ------------------------- Mapa & Camadas base -----------------------
const map = L.map("map").setView([-23.2, -45.9], 8);

// =====================================================================
// MODO 3D (MapLibre) + CLUSTER NATIVO + CARGA ÚNICA
// =====================================================================
let map3d = null;
let map3dLoaded = false;
let modoMapaAtual = "2d";

const MAP3D_STYLE = "https://tiles.openfreemap.org/styles/bright";

// cache único do 3D
let postes3DSourceLoaded = false;
let postes3DGeoJSON = null;

// ids das camadas
const MAP3D_SOURCE_ID = "postes-geojson";
const MAP3D_CLUSTER_CIRCLES_ID = "postes-3d-clusters";
const MAP3D_CLUSTER_COUNT_ID = "postes-3d-cluster-count";
const MAP3D_POINTS_ID = "postes-3d-points";
const MAP3D_POINT_LABELS_ID = "postes-3d-point-labels";

// Base layers
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true });
const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, crossOrigin: true });

const labelsPane = map.createPane("labels");
labelsPane.style.zIndex = 640;
labelsPane.style.pointerEvents = "none";
const cartoLabels = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png", {
  pane: "labels", maxZoom: 19, subdomains: "abcd", crossOrigin: true
});
const satComRotulos = L.layerGroup([esriSat, cartoLabels]);
const cartoPositronAll = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19, subdomains: "abcd", crossOrigin: true
});

const postesPane = map.createPane("postes");
postesPane.style.zIndex = 630;

osm.addTo(map);

// ========= ÍCONES SVG DOS POSTES 2D (CONCRETO / MADEIRA) — EXCLUSIVOS DO MODO 2D =========
const SVG_POSTE_CONCRETO = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 128">
  <rect x="28" y="15" width="8" height="105" fill="#9E9E9E" stroke="#555" stroke-width="2" rx="1"/>
  <rect x="16" y="25" width="32" height="4" fill="#757575" stroke="#555" stroke-width="1.5" rx="1"/>
  <rect x="20" y="35" width="24" height="4" fill="#757575" stroke="#555" stroke-width="1.5" rx="1"/>
  <circle cx="18" cy="24" r="2" fill="#DDD"/>
  <circle cx="46" cy="24" r="2" fill="#DDD"/>
  <circle cx="22" cy="34" r="2" fill="#DDD"/>
  <circle cx="42" cy="34" r="2" fill="#DDD"/>
  <line x1="29" y1="55" x2="35" y2="55" stroke="#7a7a7a" stroke-width="1.2" opacity="0.8"/>
  <line x1="29" y1="75" x2="35" y2="75" stroke="#7a7a7a" stroke-width="1.2" opacity="0.8"/>
  <line x1="29" y1="95" x2="35" y2="95" stroke="#7a7a7a" stroke-width="1.2" opacity="0.8"/>
</svg>
`.trim();

const SVG_POSTE_MADEIRA = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 128">
  <rect x="28" y="15" width="8" height="105" fill="#8B5A2B" stroke="#4A3516" stroke-width="2" rx="1"/>
  <rect x="16" y="25" width="32" height="4" fill="#6D4C20" stroke="#4A3516" stroke-width="1.5" rx="1"/>
  <rect x="20" y="35" width="24" height="4" fill="#6D4C20" stroke="#4A3516" stroke-width="1.5" rx="1"/>
  <circle cx="18" cy="24" r="2" fill="#DDD"/>
  <circle cx="46" cy="24" r="2" fill="#DDD"/>
  <circle cx="22" cy="34" r="2" fill="#DDD"/>
  <circle cx="42" cy="34" r="2" fill="#DDD"/>
</svg>
`.trim();

const POSTE_ICON_SIZE = [22, 44];
const POSTE_ICON_ANCHOR = [11, 42];
const POSTE_TOOLTIP_ANCHOR = [0, -38];
const POSTE_POPUP_ANCHOR = [0, -42];

const ICON_POSTE_CONCRETO = L.icon({
  iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG_POSTE_CONCRETO)}`,
  iconSize: POSTE_ICON_SIZE,
  iconAnchor: POSTE_ICON_ANCHOR,
  tooltipAnchor: POSTE_TOOLTIP_ANCHOR,
  popupAnchor: POSTE_POPUP_ANCHOR,
  className: "leaflet-marker-icon poste-marker-icon"
});

const ICON_POSTE_MADEIRA = L.icon({
  iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG_POSTE_MADEIRA)}`,
  iconSize: POSTE_ICON_SIZE,
  iconAnchor: POSTE_ICON_ANCHOR,
  tooltipAnchor: POSTE_TOOLTIP_ANCHOR,
  popupAnchor: POSTE_POPUP_ANCHOR,
  className: "leaflet-marker-icon poste-marker-icon"
});

// ========= SVGs DETALHADOS PARA MODO 3D (com transformador, cruzetas, fios) =========
const SVG_3D_POSTE_CONCRETO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 200" width="80" height="200">\n\n  <!-- FIOS saindo das cruzetas (perspectiva levemente diagonal) -->\n  <line x1="0"  y1="28" x2="80" y2="32" stroke="#222" stroke-width="1.1" opacity="0.75"/>\n  <line x1="0"  y1="35" x2="80" y2="39" stroke="#222" stroke-width="1.1" opacity="0.75"/>\n  <line x1="4"  y1="55" x2="76" y2="58" stroke="#222" stroke-width="1"   opacity="0.65"/>\n  <line x1="4"  y1="61" x2="76" y2="64" stroke="#222" stroke-width="1"   opacity="0.65"/>\n\n  <!-- CRUZETA SUPERIOR (concreto/metal — cinza) -->\n  <rect x="6"  y="22" width="68" height="7" rx="1.5"\n        fill="#b0b0b0" stroke="#777" stroke-width="1"/>\n  <!-- parafusos cruzeta superior -->\n  <circle cx="12" cy="25.5" r="2.2" fill="#888" stroke="#555" stroke-width="0.8"/>\n  <circle cx="40" cy="25.5" r="2.2" fill="#888" stroke="#555" stroke-width="0.8"/>\n  <circle cx="68" cy="25.5" r="2.2" fill="#888" stroke="#555" stroke-width="0.8"/>\n  <!-- isoladores cruzeta superior -->\n  <rect x="10"  y="18" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="38"  y="18" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="66"  y="18" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n\n  <!-- CRUZETA INFERIOR -->\n  <rect x="16" y="48" width="48" height="6" rx="1.5"\n        fill="#b0b0b0" stroke="#777" stroke-width="1"/>\n  <circle cx="21" cy="51" r="2"   fill="#888" stroke="#555" stroke-width="0.7"/>\n  <circle cx="40" cy="51" r="2"   fill="#888" stroke="#555" stroke-width="0.7"/>\n  <circle cx="59" cy="51" r="2"   fill="#888" stroke="#555" stroke-width="0.7"/>\n  <rect x="19"  y="44" width="4" height="6" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="38"  y="44" width="4" height="6" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="57"  y="44" width="4" height="6" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n\n  <!-- FUSTE principal (concreto — cinza levemente cônico) -->\n  <polygon points="37,15 43,15 45,198 35,198"\n           fill="#c8c8c8" stroke="#999" stroke-width="1"/>\n  <!-- reflexo lateral esquerdo do fuste -->\n  <polygon points="37,15 39,15 41,198 35,198"\n           fill="rgba(255,255,255,0.18)"/>\n  <!-- sombra lateral direita do fuste -->\n  <polygon points="41,15 43,15 45,198 43,198"\n           fill="rgba(0,0,0,0.10)"/>\n  <!-- marcações horizontais do fuste (linhas de fôrma) -->\n  <line x1="36" y1="80"  x2="44" y2="81"  stroke="#aaa" stroke-width="0.6" opacity="0.7"/>\n  <line x1="36" y1="110" x2="44" y2="111" stroke="#aaa" stroke-width="0.6" opacity="0.7"/>\n  <line x1="36" y1="140" x2="44" y2="141" stroke="#aaa" stroke-width="0.6" opacity="0.7"/>\n  <line x1="36" y1="170" x2="44" y2="171" stroke="#aaa" stroke-width="0.6" opacity="0.7"/>\n\n  <!-- TRANSFORMADOR CILÍNDRICO -->\n  <ellipse cx="40" cy="70" rx="8" ry="3.5"\n           fill="#8a7a6a" stroke="#5a4a3a" stroke-width="1"/>\n  <rect x="32" y="70" width="16" height="20" rx="2"\n        fill="#8a7a6a" stroke="#5a4a3a" stroke-width="1"/>\n  <ellipse cx="40" cy="90" rx="8" ry="3"\n           fill="#7a6a5a" stroke="#5a4a3a" stroke-width="0.8"/>\n  <!-- frisos do transformador -->\n  <line x1="33" y1="74" x2="47" y2="74" stroke="#6a5a4a" stroke-width="0.8"/>\n  <line x1="33" y1="78" x2="47" y2="78" stroke="#6a5a4a" stroke-width="0.8"/>\n  <line x1="33" y1="82" x2="47" y2="82" stroke="#6a5a4a" stroke-width="0.8"/>\n  <line x1="33" y1="86" x2="47" y2="86" stroke="#6a5a4a" stroke-width="0.8"/>\n  <!-- buchas do transformador -->\n  <rect x="34" y="67" width="3" height="5" rx="1" fill="#ccc" stroke="#888" stroke-width="0.6"/>\n  <rect x="38.5" y="67" width="3" height="5" rx="1" fill="#ccc" stroke="#888" stroke-width="0.6"/>\n  <rect x="43" y="67" width="3" height="5" rx="1" fill="#ccc" stroke="#888" stroke-width="0.6"/>\n\n  <!-- BRAÇO DE LUMINÁRIA -->\n  <path d="M37 105 Q28 103 24 110" fill="none" stroke="#aaa" stroke-width="2.2" stroke-linecap="round"/>\n  <!-- cabeça da luminária -->\n  <ellipse cx="23" cy="111" rx="5.5" ry="2.5" fill="#ddd" stroke="#999" stroke-width="0.8"/>\n  <rect x="18" y="111" width="11" height="3" rx="1.5" fill="#ccc" stroke="#999" stroke-width="0.6"/>\n\n</svg>';

const SVG_3D_POSTE_MADEIRA  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 200" width="80" height="200">\n\n  <!-- FIOS -->\n  <line x1="0"  y1="26" x2="80" y2="30" stroke="#222" stroke-width="1.1" opacity="0.75"/>\n  <line x1="0"  y1="33" x2="80" y2="37" stroke="#222" stroke-width="1.1" opacity="0.75"/>\n  <line x1="4"  y1="52" x2="76" y2="55" stroke="#222" stroke-width="1"   opacity="0.65"/>\n  <line x1="4"  y1="58" x2="76" y2="61" stroke="#222" stroke-width="1"   opacity="0.65"/>\n\n  <!-- CRUZETA SUPERIOR (madeira espessa — tom quente) -->\n  <rect x="5"  y="19" width="70" height="9" rx="2"\n        fill="#c8a064" stroke="#7a5a28" stroke-width="1.2"/>\n  <!-- veios madeira cruzeta superior -->\n  <line x1="6"  y1="22" x2="74" y2="22" stroke="#b08848" stroke-width="0.5" opacity="0.5"/>\n  <line x1="6"  y1="25" x2="74" y2="25" stroke="#b08848" stroke-width="0.5" opacity="0.5"/>\n  <!-- isoladores cruzeta superior -->\n  <rect x="10" y="15" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="38" y="15" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="66" y="15" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <!-- parafusos U -->\n  <line x1="12" y1="19" x2="12" y2="28" stroke="#aaa" stroke-width="1.2"/>\n  <line x1="40" y1="19" x2="40" y2="28" stroke="#aaa" stroke-width="1.2"/>\n  <line x1="68" y1="19" x2="68" y2="28" stroke="#aaa" stroke-width="1.2"/>\n\n  <!-- ESCORAS DIAGONAIS SUPERIORES -->\n  <line x1="40" y1="28" x2="13" y2="46" stroke="#a07840" stroke-width="3.5" stroke-linecap="round" opacity="0.9"/>\n  <line x1="40" y1="28" x2="67" y2="46" stroke="#a07840" stroke-width="3.5" stroke-linecap="round" opacity="0.9"/>\n\n  <!-- CRUZETA INFERIOR -->\n  <rect x="15" y="44" width="50" height="8" rx="2"\n        fill="#c8a064" stroke="#7a5a28" stroke-width="1.2"/>\n  <line x1="16" y1="47" x2="64" y2="47" stroke="#b08848" stroke-width="0.5" opacity="0.5"/>\n  <rect x="19" y="40" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="38" y="40" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <rect x="57" y="40" width="4" height="7" rx="1" fill="#e8e0c8" stroke="#aaa" stroke-width="0.7"/>\n  <line x1="21" y1="44" x2="21" y2="52" stroke="#aaa" stroke-width="1.2"/>\n  <line x1="40" y1="44" x2="40" y2="52" stroke="#aaa" stroke-width="1.2"/>\n  <line x1="59" y1="44" x2="59" y2="52" stroke="#aaa" stroke-width="1.2"/>\n\n  <!-- ESCORAS DIAGONAIS INFERIORES -->\n  <line x1="40" y1="52" x2="20" y2="66" stroke="#a07840" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>\n  <line x1="40" y1="52" x2="60" y2="66" stroke="#a07840" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>\n\n  <!-- FUSTE principal (madeira — marrom escuro cônico) -->\n  <polygon points="37,12 43,12 46,198 34,198"\n           fill="#7a4e1e" stroke="#4a2e0a" stroke-width="1.2"/>\n  <!-- reflexo lateral fuste -->\n  <polygon points="37,12 39,12 42,198 34,198"\n           fill="rgba(255,200,120,0.12)"/>\n  <!-- sombra lateral fuste -->\n  <polygon points="41,12 43,12 46,198 44,198"\n           fill="rgba(0,0,0,0.15)"/>\n  <!-- veios verticais madeira -->\n  <line x1="38.5" y1="55" x2="38" y2="198" stroke="#5a3a0e" stroke-width="0.7" opacity="0.4"/>\n  <line x1="41.5" y1="55" x2="42" y2="198" stroke="#5a3a0e" stroke-width="0.7" opacity="0.4"/>\n\n  <!-- GRAMPOS METÁLICOS no fuste -->\n  <rect x="35" y="72"  width="10" height="4" rx="1" fill="none" stroke="#bbb" stroke-width="1.3"/>\n  <rect x="35" y="100" width="10" height="4" rx="1" fill="none" stroke="#bbb" stroke-width="1.3"/>\n  <rect x="35" y="130" width="10" height="4" rx="1" fill="none" stroke="#bbb" stroke-width="1.3"/>\n\n  <!-- DEGRAUS DE SUBIDA (pregos alternados) -->\n  <line x1="34" y1="148" x2="29" y2="148" stroke="#bbb" stroke-width="2" stroke-linecap="round"/>\n  <line x1="46" y1="158" x2="51" y2="158" stroke="#bbb" stroke-width="2" stroke-linecap="round"/>\n  <line x1="34" y1="168" x2="29" y2="168" stroke="#bbb" stroke-width="2" stroke-linecap="round"/>\n  <line x1="46" y1="178" x2="51" y2="178" stroke="#bbb" stroke-width="2" stroke-linecap="round"/>\n\n</svg>';

// Dados e sets para autocomplete
const todosPostes = [];
const empresasContagem = {};
const municipiosSet = new Set();
const bairrosSet = new Set();
const logradourosSet = new Set();
let censoMode = false, censoIds = null;

// Helpers pra lidar com empresas (nome + id_insercao)
function getEmpresasNomesArray(p) {
  if (!Array.isArray(p.empresas)) return [];
  return p.empresas.map((e) =>
    typeof e === "string" ? e : (e.nome || e.empresa || "")
  );
}
function empresasToString(p) {
  return getEmpresasNomesArray(p).filter(Boolean).join(", ");
}
function hasEmpresaNome(p, buscaLower) {
  if (!buscaLower) return true;
  return getEmpresasNomesArray(p).some((nome) =>
    (nome || "").toLowerCase().includes(buscaLower)
  );
}

function getPosteIcon(poste) {
  const matRaw = (poste.material || poste.tipo || poste.tipo_poste || "").toString().toLowerCase();
  const isMadeira = matRaw.includes("madeira");
  return isMadeira ? ICON_POSTE_MADEIRA : ICON_POSTE_CONCRETO;
}

function dotStyle(qtdEmpresas) {
  return {
    radius: 4,
    color: "#111827",
    weight: 0.5,
    fillColor: (qtdEmpresas >= 5 ? "#d64545" : "#24a148"),
    fillOpacity: 0.9
  };
}

// ====================================================================
// MODO SELECIONAR POSTES (até 300) + linha azul + export
// ====================================================================
let selecaoAtiva = false;
let postesSelecionados = [];
let selecaoPolyline = null;

function atualizarEstadoBotaoSelecao() {
  const btnSel = document.getElementById("btnSelecionarPostes");
  const btnLimpar = document.getElementById("btnLimparSelecao");
  const qtd = postesSelecionados.length;

  if (btnSel) {
    btnSel.classList.toggle("selecionando", selecaoAtiva);
    btnSel.innerHTML = selecaoAtiva
      ? `<i class="fa fa-hand-pointer"></i> Selecionando (${qtd})`
      : `<i class="fa fa-hand-pointer"></i> Selecionar Postes`;
  }
  if (btnLimpar) {
    btnLimpar.disabled = !selecaoAtiva || !qtd;
  }
}

function entrarModoSelecao() {
  if (selecaoAtiva) return;
  selecaoAtiva = true;
  postesSelecionados = [];
  if (selecaoPolyline) {
    map.removeLayer(selecaoPolyline);
    selecaoPolyline = null;
  }
  atualizarEstadoBotaoSelecao();
  alert("Modo SELECIONAR POSTES ativado. Clique nos postes para selecioná-los (máx. 300).");
}

function limparSelecaoESair(opts = {}) {
  const manterMarcadores = !!opts.manterMarcadores;

  if (!manterMarcadores) {
    postesSelecionados.forEach(({ layer, poste }) => {
      if (layer && layer.setStyle && poste) {
        const qtd = Array.isArray(poste.empresas) ? poste.empresas.length : 0;
        try {
          layer.setStyle(dotStyle(qtd));
          if (layer.getRadius) layer.setRadius(4);
        } catch {}
      }
      if (layer && layer.getElement) {
        const el = layer.getElement();
        if (el && el.classList.contains("poste-marker-icon")) {
          el.classList.remove("poste-marker-selected");
        }
      }
    });
  }

  postesSelecionados = [];
  selecaoAtiva = false;

  if (selecaoPolyline) {
    map.removeLayer(selecaoPolyline);
    selecaoPolyline = null;
  }
  atualizarEstadoBotaoSelecao();

  if (typeof atualizarSelecao3DVisual === "function") atualizarSelecao3DVisual();
}

function handleSelecaoClick(poste, layer) {
  if (!selecaoAtiva) return false;

  const idAtual = String(poste.id);
  const idx = postesSelecionados.findIndex((r) => String(r.poste.id) === idAtual);

  if (idx >= 0) {
    const reg = postesSelecionados[idx];
    postesSelecionados.splice(idx, 1);
    if (reg.layer && reg.layer.setStyle) {
      const qtd = Array.isArray(reg.poste.empresas) ? reg.poste.empresas.length : 0;
      try {
        reg.layer.setStyle(dotStyle(qtd));
        if (reg.layer.getRadius) reg.layer.setRadius(4);
      } catch {}
    }
    if (reg.layer && reg.layer.getElement) {
      const el = reg.layer.getElement();
      if (el && el.classList.contains("poste-marker-icon")) {
        el.classList.remove("poste-marker-selected");
      }
    }
  } else {
    if (postesSelecionados.length >= 300) {
      alert("Limite máximo de 300 postes na seleção.");
      return true;
    }
    postesSelecionados.push({ poste, layer });

    if (layer && layer.setStyle) {
      const qtd = Array.isArray(poste.empresas) ? poste.empresas.length : 0;
      try {
        layer.setStyle({
          ...dotStyle(qtd),
          color: "#1d4ed8",
          fillColor: "#3b82f6"
        });
        if (layer.getRadius) {
          const base = layer.getRadius();
          layer.setRadius(base + 2);
          setTimeout(() => {
            try { layer.setRadius(base + 1); } catch {}
          }, 150);
        }
      } catch {}
    }
    if (layer && layer.getElement) {
      const el = layer.getElement();
      if (el && el.classList.contains("poste-marker-icon")) {
        el.classList.add("poste-marker-selected");
      }
    }
  }

  if (selecaoPolyline) {
    map.removeLayer(selecaoPolyline);
    selecaoPolyline = null;
  }
  if (postesSelecionados.length >= 2) {
    const coords = postesSelecionados.map((r) => [r.poste.lat, r.poste.lon]);
    selecaoPolyline = L.polyline(coords, {
      color: "#1d4ed8",
      weight: 3,
      dashArray: "4,6"
    }).addTo(map);
  }

  atualizarEstadoBotaoSelecao();

  if (typeof atualizarSelecao3DVisual === "function") atualizarSelecao3DVisual();

  return true;
}

// --------------------- base layer switcher ---------------------------
let currentBase = osm;
let currentBaseMode = "rua";

function setBase(mode) {
  currentBaseMode = mode || "rua";

  if (map.hasLayer(currentBase)) map.removeLayer(currentBase);

  if (currentBaseMode === "sat") currentBase = esriSat;
  else if (currentBaseMode === "satlabels") currentBase = satComRotulos;
  else currentBase = osm;

  currentBase.addTo(map);

  if (modoMapaAtual === "3d" && map3d) {
    setTimeout(() => {
      try { map3d.resize(); } catch (_) {}
    }, 100);
  }
}

// -------------------- Perfil de performance (auto) ---------------------------
const __DEVICE_MEM_GB = Number(navigator.deviceMemory || 8);
const __CORES = Number(navigator.hardwareConcurrency || 4);
const __PERF_LITE = (
  (__DEVICE_MEM_GB && isFinite(__DEVICE_MEM_GB) ? __DEVICE_MEM_GB <= 8 : false) ||
  (__CORES && isFinite(__CORES) ? __CORES <= 4 : false)
);
try { window.__PERF_LITE = __PERF_LITE; } catch (_) {}

// -------------------- Cluster (só números) ---------------------------
const markers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
  chunkedLoading: true,
  chunkDelay: __PERF_LITE ? 18 : 5,
  chunkInterval: __PERF_LITE ? 180 : 50,
  animateAddingMarkers: false,
  iconCreateFunction: (cluster) =>
    new L.DivIcon({ html: String(cluster.getChildCount()), className: "cluster-num-only", iconSize: null })
});

// Clique no cluster: spiderfy + abre 1º filho
markers.off("clusterclick");
markers.on("clusterclick", (e) => {
  if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
  const childs = e.layer.getAllChildMarkers();
  e.layer.spiderfy();
  requestAnimationFrame(() => {
    const first = childs && childs[0];
    if (first && first.posteData) {
      try { first.openTooltip?.(); } catch {}
      abrirPopup(first.posteData);
      lastTip = { id: keyId(first.posteData.id) };
      tipPinned = true;
    }
  });
});

map.addLayer(markers);

// =======================
// Modo Análise (2D) sem recarregar base
// Mantém os postes já carregados em memória e só alterna camadas
// =======================
const analiseLayer2D = L.layerGroup();
let analiseAtiva2D = false;
const analiseSegmentLayer2D = L.layerGroup();
let analiseDistanciasVisiveis = false; // toggle dos trechos (1-2, 2-3...)
let analisePolygon2D = null; // polígono de destaque da área da análise


function setAnaliseInfo(html, show = true) {
  const box = document.getElementById("analiseInfo");
  if (!box) return;
  box.innerHTML = html || "";
  box.style.display = show ? "block" : "none";
}
function limparAnaliseInfo() {
  try { setAnaliseInfo("", false); } catch (_) {}
}

// Botão "Limpar" (Análise de Projeto): sai da análise sem recarregar a base
window.limparAnaliseProjeto = function () {
  try { if (typeof showOverlay === "function") showOverlay("Limpando análise…"); } catch (_) {}
  try { resetarRapidoBase(); } catch (_) {}
  try { limparAnaliseInfo(); } catch (_) {}
  try { if (typeof hideOverlay === "function") hideOverlay(); } catch (_) {}
};

// Toggle: mostrar/ocultar os rótulos de trechos (1-2, 2-3...) na Análise de Projeto
window.toggleDistanciasAnalise = function () {
  analiseDistanciasVisiveis = !analiseDistanciasVisiveis;
  try {
    if (analiseDistanciasVisiveis) {
      if (!analiseLayer2D.hasLayer(analiseSegmentLayer2D)) analiseLayer2D.addLayer(analiseSegmentLayer2D);
    } else {
      if (analiseLayer2D.hasLayer(analiseSegmentLayer2D)) analiseLayer2D.removeLayer(analiseSegmentLayer2D);
    }
  } catch (_) {}

  // 3D: só controla a layer de labels
  try {
    if (typeof setVisTrechosAnalise3D === "function") setVisTrechosAnalise3D(analiseDistanciasVisiveis);
  } catch (_) {}

  try {
    const btn = document.getElementById("btnToggleDistAnalise");
    if (btn) {
      btn.classList.toggle("active", analiseDistanciasVisiveis);
      btn.innerHTML = (analiseDistanciasVisiveis ? '<i class="fa fa-eye-slash"></i>Ocultar trechos' : '<i class="fa fa-eye"></i>Mostrar trechos');
    }
  } catch (_) {}
};

function __atualizarEstadoBtnTrechosAnalise() {
  try {
    const btn = document.getElementById("btnToggleDistAnalise");
    if (!btn) return;
    const temAnalise = !!(window.analiseDistancias && window.analiseDistancias.totalPostes);
    btn.disabled = !temAnalise;
    btn.style.opacity = temAnalise ? "1" : "0.55";
    btn.style.cursor = temAnalise ? "pointer" : "not-allowed";
    btn.classList.toggle("active", temAnalise && analiseDistanciasVisiveis);
    if (temAnalise) {
      btn.innerHTML = (analiseDistanciasVisiveis ? '<i class="fa fa-eye-slash"></i>Ocultar trechos' : '<i class="fa fa-eye"></i>Mostrar trechos');
    } else {
      btn.innerHTML = '<i class="fa fa-route"></i>Trechos';
    }
  } catch (_) {}
}

function entrarModoAnalise2D() {
  analiseAtiva2D = true;
  try {
    // Esconde a base (sem limpar) — volta instantâneo no reset
    if (map.hasLayer(markers)) map.removeLayer(markers);
  } catch (_) {}
  try {
    if (!map.hasLayer(analiseLayer2D)) analiseLayer2D.addTo(map);
    analiseLayer2D.clearLayers();
    try { analiseSegmentLayer2D.clearLayers(); } catch (_) {}
    // os trechos (1-2, 2-3...) começam ocultos — o usuário liga pelo botão
    analiseDistanciasVisiveis = false;
    try { analisePolygon2D = null; } catch (_) {}
  } catch (_) {}
}

function sairModoAnalise2D() {
  analiseAtiva2D = false;

  // limpa tudo que for da análise (números, intermediários, traçado)
  try { analiseLayer2D.clearLayers(); } catch (_) {}
  try { analiseSegmentLayer2D.clearLayers(); } catch (_) {}
  try { analisePolygon2D = null; } catch (_) {}
  analiseDistanciasVisiveis = false;
  try { if (map.hasLayer(analiseLayer2D)) map.removeLayer(analiseLayer2D); } catch (_) {}

  // volta a base sem reprocessar todo o cluster
  try { if (!map.hasLayer(markers)) map.addLayer(markers); } catch (_) {}

  // housekeeping
  try { window.numeroMarkers = []; } catch (_) {}
  try { window.intermediarios = []; } catch (_) {}
  try { window.intermediariosPostes = []; } catch (_) {}
  try { window.tracadoMassivo = null; } catch (_) {}
  try { limparAnaliseInfo(); } catch (_) {}
  try { __atualizarEstadoBtnTrechosAnalise(); } catch (_) {}
}

// Reset "rápido": volta para o dataset completo sem limpar/recarregar tudo
function resetarRapidoBase() {
  try { sairModoAnalise2D(); } catch (_) {}

  // 3D: sai do modo análise e volta pro dataset completo (sem refetch)
  try { if (typeof setModoAnalise3D === "function") setModoAnalise3D(false); } catch (_) {}
  try { if (typeof limparCamadasMassivas3D === "function") limparCamadasMassivas3D(); } catch (_) {}
  try { if (typeof restaurarDatasetCompleto3D === "function") restaurarDatasetCompleto3D(); } catch (_) {}

  try { atualizar3DSeAtivo(); } catch (_) {}
  try { __atualizarEstadoBtnTrechosAnalise(); } catch (_) {}
  try { if (typeof hideOverlay === "function") hideOverlay(); } catch (_) {}
}

// -------------------- Carregamento GRADATIVO GLOBAL ------------------
const idToMarker = new Map();
let todosCarregados = false;
function keyId(id) { return String(id); }
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
function scheduleIdle(fn) { document.hidden ? setTimeout(fn, 0) : idle(fn); }
function refreshClustersSoon() { requestAnimationFrame(() => markers.refreshClusters()); }

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !todosCarregados && typeof window.__resumeCarregamentoPostes === "function") {
    try { window.__resumeCarregamentoPostes(); } catch (_) {}
  }
});


/* ====================================================================
   Overlay de carregamento (spinner geral)
==================================================================== */
const overlay = document.getElementById("carregando");
const overlayText = overlay ? overlay.querySelector(".texto-loading") : null;

function showOverlay(msg) {
  if (!overlay) return;
  if (overlayText && msg) overlayText.textContent = msg;
  overlay.style.display = "flex";
}
function hideOverlay() {
  if (!overlay) return;
  overlay.style.display = "none";
}

showOverlay("Carregando base de postes…");

/* ====================================================================
   Popup fixo: instância única, sem piscar
==================================================================== */
const mainPopup = L.popup({ closeOnClick: false, autoClose: false, maxWidth: 360 });
let popupPinned = false;
let lastPopup = null;

function reabrirPopupFixo(delay = 0) {
  if (!popupPinned || !lastPopup) return;
  const open = () => {
    mainPopup.setLatLng([lastPopup.lat, lastPopup.lon]).setContent(lastPopup.html);
    if (!map.hasLayer(mainPopup)) mainPopup.addTo(map);
  };
  delay ? setTimeout(open, delay) : open();
}
map.on("popupclose", (e) => {
  if (e.popup === mainPopup) { popupPinned = false; lastPopup = null; }
});

/* ====================================================================
   Tooltip fixo (reabrir após cluster/reset)
==================================================================== */
let tipPinned = false;
let lastTip = null;

function reabrirTooltipFixo(delay = 0) {
  if (!lastTip || !tipPinned) return;
  const open = () => {
    const layer = idToMarker.get(keyId(lastTip.id));
    if (layer && markers.hasLayer(layer)) { try { layer.openTooltip(); } catch {} }
  };
  delay ? setTimeout(open, delay) : open();
}

/* ====================================================================
   Helpers (escape / copiar / toggle empresa)
==================================================================== */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }

function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (_) {}
  document.body.removeChild(ta);
}
function copyBtnHandler(btn) {
  const txt = btn.getAttribute("data-copy") || "";
  if (!txt) return;
  copyToClipboard(txt);
}
function toggleEmpresaExtra(row) { row.classList.toggle("open"); }

/* ====================================================================
   TRANSFORMADORES — camada própria (lazy via checkbox)
==================================================================== */
const TRANSFORMADOR_PNG_URL = "/assets/transformador.png";

const TRANSFORMADOR_FALLBACK_DATAURI = (() => {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="gBody" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#f4f4f4"/>
        <stop offset="1" stop-color="#cfcfcf"/>
      </linearGradient>
      <linearGradient id="gMetal" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#bfc7cf"/>
        <stop offset="0.55" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#9aa3ad"/>
      </linearGradient>
      <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity="0.25"/>
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <rect x="10" y="45" width="44" height="9" rx="3" fill="url(#gMetal)" stroke="#7f8a96" stroke-width="1"/>
      <rect x="14" y="54" width="14" height="5" rx="2.5" fill="#d6dde4" stroke="#7f8a96" stroke-width="1"/>
      <rect x="36" y="54" width="14" height="5" rx="2.5" fill="#d6dde4" stroke="#7f8a96" stroke-width="1"/>
    </g>
    <g filter="url(#shadow)">
      <rect x="14" y="18" width="36" height="26" rx="5" fill="url(#gBody)" stroke="#8b8b8b" stroke-width="1"/>
      <g opacity="0.95">
        <rect x="18" y="20" width="3" height="22" rx="1.2" fill="#eeeeee"/>
        <rect x="22" y="20" width="3" height="22" rx="1.2" fill="#e5e5e5"/>
        <rect x="26" y="20" width="3" height="22" rx="1.2" fill="#eeeeee"/>
        <rect x="30" y="20" width="3" height="22" rx="1.2" fill="#e5e5e5"/>
        <rect x="34" y="20" width="3" height="22" rx="1.2" fill="#eeeeee"/>
        <rect x="38" y="20" width="3" height="22" rx="1.2" fill="#e5e5e5"/>
        <rect x="42" y="20" width="3" height="22" rx="1.2" fill="#eeeeee"/>
      </g>
      <path d="M14 22c-5 2-5 16 0 18" fill="none" stroke="#7f7f7f" stroke-width="2" opacity="0.75"/>
      <path d="M50 22c5 2 5 16 0 18" fill="none" stroke="#7f7f7f" stroke-width="2" opacity="0.75"/>
      <g>
        <g transform="translate(22 6)">
          <rect x="-2" y="10" width="4" height="4" rx="1" fill="#e9e9e9" stroke="#6b6b6b" stroke-width="0.8"/>
          <rect x="-1.6" y="2" width="3.2" height="8" rx="1.2" fill="#6b4a2a"/>
          <circle cx="0" cy="2" r="1.6" fill="#6b4a2a"/>
        </g>
        <g transform="translate(32 6)">
          <rect x="-2" y="10" width="4" height="4" rx="1" fill="#e9e9e9" stroke="#6b6b6b" stroke-width="0.8"/>
          <rect x="-1.6" y="2" width="3.2" height="8" rx="1.2" fill="#6b4a2a"/>
          <circle cx="0" cy="2" r="1.6" fill="#6b4a2a"/>
        </g>
        <g transform="translate(42 6)">
          <rect x="-2" y="10" width="4" height="4" rx="1" fill="#e9e9e9" stroke="#6b6b6b" stroke-width="0.8"/>
          <rect x="-1.6" y="2" width="3.2" height="8" rx="1.2" fill="#6b4a2a"/>
          <circle cx="0" cy="2" r="1.6" fill="#6b4a2a"/>
        </g>
      </g>
    </g>
  </svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

async function resolveTransformadorIconUrl() {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(TRANSFORMADOR_PNG_URL);
    img.onerror = () => resolve(TRANSFORMADOR_FALLBACK_DATAURI);
    img.src = TRANSFORMADOR_PNG_URL;
  });
}

let ICON_TRANSFORMADOR = null;
async function ensureTransformadorIcon() {
  if (ICON_TRANSFORMADOR) return ICON_TRANSFORMADOR;

  const iconUrl = await resolveTransformadorIconUrl();

  ICON_TRANSFORMADOR = L.icon({
    iconUrl,
    iconSize: [56, 56],
    iconAnchor: [28, 40],
    tooltipAnchor: [0, -30],
    popupAnchor: [0, -40],
  });

  document.querySelectorAll('img[data-icon="transformador"]').forEach((el) => {
    el.src = TRANSFORMADOR_PNG_URL;
    el.onerror = () => { el.src = TRANSFORMADOR_FALLBACK_DATAURI; };
  });

  return ICON_TRANSFORMADOR;
}

const transformadoresPane = map.createPane("transformadores");
transformadoresPane.style.zIndex = 635;

const transformadoresMarkers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 18,
  chunkedLoading: true,
  chunkDelay: 5,
  chunkInterval: 50,
  iconCreateFunction: (cluster) =>
    new L.DivIcon({ html: String(cluster.getChildCount()), className: "cluster-num-only", iconSize: null }),
});

const transformadores = [];
const idToTransformadorMarker = new Map();
let transformadoresCarregados = false;

function normKey(k) {
  return String(k || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function buildNormMap(obj) {
  const m = new Map();
  for (const [k, v] of Object.entries(obj || {})) m.set(normKey(k), v);
  return m;
}
function pickAny(obj, candidates = []) {
  const m = buildNormMap(obj);
  for (const c of candidates) {
    const v = m.get(normKey(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}
function extractLatLon(t) {
  const coord = pickAny(t, ["coordenadas", "coord", "coordenada", "latlon", "geo", "geolocalizacao"]);
  if (coord && typeof coord === "string" && coord.includes(",")) {
    const [la, lo] = coord.split(/,\s*/).map(Number);
    if (!isNaN(la) && !isNaN(lo)) return { lat: la, lon: lo };
  }
  const lat = Number(pickAny(t, ["lat", "latitude", "y", "coordy"]));
  const lon = Number(pickAny(t, ["lon", "lng", "long", "longitude", "x", "coordx"]));
  if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  return null;
}
function flattenObject(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenObject(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}
function formatAny(v) {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function popupTransformadorHTML(t) {
  const id = pickAny(t, ["id", "id_transformador", "codigo", "cod_transformador", "num_transformador", "transformador"]) ?? "—";
  const potencia = pickAny(t, ["potencia", "kva", "potencia_kva"]) ?? "—";
  const poste = pickAny(t, ["poste", "id_poste", "poste_id", "numero_poste"]) ?? "—";

  const flat = flattenObject(t);
  const linhas = Object.entries(flat)
    .map(([k, v]) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#334155;white-space:nowrap;"><b>${escapeHtml(k)}</b></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111827;word-break:break-word;">${escapeHtml(formatAny(v))}</td>
      </tr>
    `).join("");

  return `
    <div class="mp-card">
      <div class="mp-header">
        <div class="mp-header-title">Transformador</div>
        <div class="mp-header-sub">ID: ${escapeHtml(id)}</div>
      </div>

      <div class="mp-local">
        <div class="mp-local-secundario">
          Potência: <b>${escapeHtml(potencia)}</b> · Poste: <b>${escapeHtml(poste)}</b>
        </div>
      </div>

      <div style="margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-size:11px;color:#475569;">
          Dados completos (todas as colunas)
        </div>
        <div style="max-height:240px;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <tbody>
              ${linhas || `<tr><td style="padding:8px;color:#6b7280;">Sem dados</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `.trim();
}

async function carregarTransformadores() {
  if (transformadoresCarregados) return;
  transformadoresCarregados = true;

  try {
    const icon = await ensureTransformadorIcon();

    const res = await fetch("/api/transformadores", { credentials: "include" });
    if (res.status === 401) { window.location.href = "/login.html"; return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const arr = await res.json();

    (arr || []).forEach((t, idx) => {
      const pos = extractLatLon(t);
      if (!pos) return;

      const key = String(pickAny(t, ["id", "id_transformador", "codigo", "cod_transformador"]) ?? idx);
      if (idToTransformadorMarker.has(key)) return;

      const mk = L.marker([pos.lat, pos.lon], { icon, pane: "transformadores" });
      mk.bindPopup(popupTransformadorHTML(t), { maxWidth: 440 });
      mk.bindTooltip(`Transformador: ${key}`, { direction: "top", sticky: true });

      transformadoresMarkers.addLayer(mk);
      idToTransformadorMarker.set(key, mk);
      transformadores.push(t);
    });
  } catch (e) {
    console.error("Erro ao carregar transformadores:", e);
  }
}

function syncTransformadoresToggle() {
  const chk = document.getElementById("chkTransformadores");
  if (!chk) return;

  const apply = async () => {
    if (chk.checked) {
      if (!map.hasLayer(transformadoresMarkers)) map.addLayer(transformadoresMarkers);
      await carregarTransformadores();
    } else {
      if (map.hasLayer(transformadoresMarkers)) map.removeLayer(transformadoresMarkers);
    }
  };

  chk.addEventListener("change", apply);
  apply();
}
window.addEventListener("DOMContentLoaded", syncTransformadoresToggle);

// ====================================================================
// Criação dos marcadores de postes + tooltip de alerta
// ====================================================================
const ALERT_ICON_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYx2n2F4RJqJMFPBJwB_S7gp5tXOJBys8EkQ&s";

function criarLayerPoste(p) {
  const key = keyId(p.id);
  if (idToMarker.has(key)) return idToMarker.get(key);

  const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
  const txtQtd = qtd ? `${qtd} ${qtd === 1 ? "empresa" : "empresas"}` : "Disponível";
  const icon = getPosteIcon(p);
  const critico = qtd > 8;

  const tooltipHtml = critico
    ? `<img class="poste-alert-img" src="${ALERT_ICON_URL}" alt="alerta"> ${qtd}`
    : `ID: ${p.id} — ${txtQtd}`;

  const tooltipOpts = critico
    ? {
        permanent: true,
        direction: "center",
        offset: [14, -2],
        opacity: 1,
        className: "poste-alert-tooltip"
      }
    : {
        direction: "top",
        sticky: true
      };

  const layer = L.marker([p.lat, p.lon], {
    icon,
    pane: "postes",
    bubblingMouseEvents: false
  })
    .bindTooltip(tooltipHtml, tooltipOpts)
    .on("mouseover", () => {
      lastTip = { id: key };
      tipPinned = false;
    })
    .on("click", (e) => {
      if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      if (typeof window.isMedicaoAtiva === "function" && window.isMedicaoAtiva()) {
        try {
          if (typeof window.__medicaoIgnoreNextMapClick2D === "function") window.__medicaoIgnoreNextMapClick2D();
          if (typeof window.__medicaoAddPoint2D === "function") window.__medicaoAddPoint2D(layer.getLatLng());
        } catch (_) {}
        return;
      }
      if (handleSelecaoClick(p, layer)) return;
      lastTip = { id: key };
      tipPinned = true;
      try { layer.openTooltip?.(); } catch {}
      abrirPopup(p);
    });

  layer.posteData = p;
  idToMarker.set(key, layer);
  return layer;
}

// =====================================================================
// Helpers de adicionar marcador ao cluster 2D
// =====================================================================
function adicionarMarker(p) {
  const layer = criarLayerPoste(p);
  markers.addLayer(layer);
}

// =====================================================================
// carregarTodosPostesGradualmente + hardReset
// =====================================================================
function carregarTodosPostesGradualmente() {
  todosCarregados = false;
  markers.clearLayers();
  refreshClustersSoon();

  // Ajuste automático para máquinas com menos RAM/CPU (ex.: notebooks 8GB)
  const loteAtivo = __PERF_LITE ? 350 : 1200;
  const loteHidden = __PERF_LITE ? 1200 : 3500;

  let i = 0;

  function addChunk() {
    const lote = document.hidden ? loteHidden : loteAtivo;
    const end = Math.min(i + lote, todosPostes.length);

    const layers = new Array(end - i);
    let k = 0;
    for (let j = i; j < end; j++) {
      layers[k++] = criarLayerPoste(todosPostes[j]);
    }

    if (layers.length) { markers.addLayers(layers); refreshClustersSoon(); }

    // ajuda o GC em máquinas com pouca RAM
    i = end;

    if (i < todosPostes.length) {
      scheduleIdle(addChunk);
    } else {
      todosCarregados = true;
      window.__resumeCarregamentoPostes = null;
      hideOverlay();
      reabrirTooltipFixo(0);
      reabrirPopupFixo(0);
      atualizar3DSeAtivo();
    }
  }

  // Se o Chrome “pausar” o carregamento quando você sair da aba,
  // a gente re-agenda quando voltar.
  window.__resumeCarregamentoPostes = () => scheduleIdle(addChunk);

  scheduleIdle(addChunk);
}

function hardReset() {
  markers.clearLayers();
  refreshClustersSoon();
  idToMarker.clear();

  if (typeof window.reconstruirFonte3D === "function") window.reconstruirFonte3D();

  carregarTodosPostesGradualmente();
}

function exibirTodosPostes() {
  markers.clearLayers();
  refreshClustersSoon();
  todosPostes.forEach(adicionarMarker);
  refreshClustersSoon();
  atualizar3DSeAtivo();
}

// =====================================================================
// script-3d-override.js
// Override completo do modo 3D com clusters + poste 3D + funções do 2D
// =====================================================================
(function () {
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL não encontrado.");
    return;
  }

  const MAP3D_STYLE = "https://tiles.openfreemap.org/styles/bright";

  const MAP3D_SOURCE_ACTIVE = "postes-geojson-active";
  const MAP3D_SOURCE_SELECTED = "postes-geojson-selected";
  const MAP3D_SOURCE_ROUTE = "postes-geojson-route";
  const MAP3D_SOURCE_ROUTE_MASS = "postes-geojson-route-mass";
  const MAP3D_SOURCE_ROUTE_LABELS = "postes-geojson-route-labels";
  const MAP3D_SOURCE_ANALISE_POLY = "postes-geojson-analise-poly";
  const MAP3D_SOURCE_MASS = "postes-geojson-mass";
  const MAP3D_SOURCE_POLES = "postes-geojson-poles";

  const MAP3D_LAYER_CLUSTER_SHADOW = "postes-3d-clusters-shadow";
  const MAP3D_LAYER_CLUSTER = "postes-3d-clusters";
  const MAP3D_LAYER_CLUSTER_COUNT = "postes-3d-cluster-count";

  const MAP3D_LAYER_POINT_GLOW = "postes-3d-points-glow";
  const MAP3D_LAYER_POINT_BODY = "postes-3d-points-body";
  const MAP3D_LAYER_POINT_LABELS = "postes-3d-point-labels";

  const MAP3D_LAYER_SELECTED_GLOW = "postes-3d-selected-glow";
  const MAP3D_LAYER_SELECTED = "postes-3d-selected";

  const MAP3D_LAYER_ROUTE = "postes-3d-route";
  const MAP3D_LAYER_ROUTE_MASS = "postes-3d-route-mass";
  const MAP3D_LAYER_ROUTE_LABELS = "postes-3d-route-labels";
  const MAP3D_LAYER_ANALISE_POLY_FILL = "postes-3d-analise-poly-fill";
  const MAP3D_LAYER_ANALISE_POLY_LINE = "postes-3d-analise-poly-line";
  const MAP3D_LAYER_MASS = "postes-3d-mass";
  const MAP3D_LAYER_MASS_ICON = "postes-3d-mass-icon";
  const MAP3D_LAYER_MASS_LABELS = "postes-3d-mass-labels";

  const MAP3D_LAYER_POLE = "postes-3d-pole";

  const POLE_BASE_SIZE_METERS = 0.45;
  const POLE_MAX_VISIBLE = 2500;
  const POLE_MIN_ZOOM = 16;

  let postes3DMasterGeoJSON = null;
  let postes3DActiveGeoJSON = null;
  let postes3DSourceLoaded = false;
  let postes3DAnimFrame = null;
  let postes3DPulseTick = 0;
  let filtro3DAtivo = false;
  let idsFiltrados3D = null;
  let ultimoPopup3D = null;
  let modoAnalise3DAtivo = false;

  function montarGeoJSONPostes3D(lista = todosPostes) {
    return {
      type: "FeatureCollection",
      features: (lista || []).map((p) => {
        const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
        const materialTipo = getMaterialTipo(p);

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [Number(p.lon), Number(p.lat)]
          },
          properties: {
            id: String(p.id || ""),
            qtd_empresas: qtd,
            nome_municipio: p.nome_municipio || "",
            nome_bairro: p.nome_bairro || "",
            nome_logradouro: p.nome_logradouro || "",
            coordenadas: p.coordenadas || "",
            empresas: typeof empresasToString === "function" ? (empresasToString(p) || "Disponível") : "Disponível",
            material: (p.material || p.tipo || p.tipo_poste || "").toString(),
            material_tipo: materialTipo,
            is_critico: qtd > 8 ? 1 : 0
          }
        };
      })
    };
  }

  function getMasterGeoJSON3D() {
    if (!postes3DMasterGeoJSON) {
      postes3DMasterGeoJSON = montarGeoJSONPostes3D(todosPostes);
    }
    return postes3DMasterGeoJSON;
  }

  function getListaAtiva3D() {
    if (!filtro3DAtivo || !idsFiltrados3D) return todosPostes;
    return todosPostes.filter((p) => idsFiltrados3D.has(String(p.id)));
  }

  function removeLayerIfExists(layerId) {
    if (map3d && map3d.getLayer(layerId)) {
      try { map3d.removeLayer(layerId); } catch (_) {}
    }
  }

  function removeSourceIfExists(sourceId) {
    if (map3d && map3d.getSource(sourceId)) {
      try { map3d.removeSource(sourceId); } catch (_) {}
    }
  }

  function resetarEstrutura3D() {
    if (!map3d) return;

    [
      MAP3D_LAYER_CLUSTER_SHADOW,
      MAP3D_LAYER_CLUSTER,
      MAP3D_LAYER_CLUSTER_COUNT,
      MAP3D_LAYER_POINT_GLOW,
      MAP3D_LAYER_POINT_BODY,
      MAP3D_LAYER_POINT_LABELS,
      MAP3D_LAYER_SELECTED_GLOW,
      MAP3D_LAYER_SELECTED,
      MAP3D_LAYER_ROUTE,
      MAP3D_LAYER_ROUTE_MASS,
      MAP3D_LAYER_ROUTE_LABELS,
      MAP3D_LAYER_MASS,
      MAP3D_LAYER_MASS_ICON,
      MAP3D_LAYER_MASS_LABELS
    ].forEach(removeLayerIfExists);

    [
      MAP3D_SOURCE_ACTIVE,
      MAP3D_SOURCE_SELECTED,
      MAP3D_SOURCE_ROUTE,
      MAP3D_SOURCE_ROUTE_MASS,
      MAP3D_SOURCE_ROUTE_LABELS,
      MAP3D_SOURCE_MASS
    ].forEach(removeSourceIfExists);

    postes3DSourceLoaded = false;
  }

  function adicionarPredios3D() {
    if (!map3d || !map3dLoaded) return;
    if (map3d.getLayer("3d-buildings")) return;

    const layers = map3d.getStyle().layers || [];
    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].type === "symbol" && layers[i].layout && layers[i].layout["text-field"]) {
        labelLayerId = layers[i].id;
        break;
      }
    }

    if (!map3d.getSource("openfreemap")) {
      map3d.addSource("openfreemap", {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet"
      });
    }

    map3d.addLayer(
      {
        id: "3d-buildings",
        source: "openfreemap",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], ["get", "height"], 0],
            0, "#d1d5db",
            60, "#94a3b8",
            200, "#64748b"
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14, 0,
            15, ["*", ["coalesce", ["get", "render_height"], ["get", "height"], 8], 0.75],
            16, ["*", ["coalesce", ["get", "render_height"], ["get", "height"], 8], 1.15]
          ],
          "fill-extrusion-base": [
            "coalesce",
            ["get", "render_min_height"],
            ["get", "min_height"],
            0
          ],
          "fill-extrusion-opacity": 0.88
        }
      },
      labelLayerId
    );
  }


  function adicionarVegetacao3D() {
    if (!map3d || !map3dLoaded) return;
    if (map3d.getLayer("3d-trees")) return;

    const layers = map3d.getStyle().layers || [];
    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].type === "symbol" && layers[i].layout && layers[i].layout["text-field"]) {
        labelLayerId = layers[i].id;
        break;
      }
    }

    // Usa o mesmo source de tiles do OpenFreeMap
    if (!map3d.getSource("openfreemap")) {
      map3d.addSource("openfreemap", { type: "vector", url: "https://tiles.openfreemap.org/planet" });
    }

    // “Mata/vegetação” (OpenMapTiles: landcover.class costuma trazer wood/scrub)
    map3d.addLayer(
      {
        id: "3d-trees",
        source: "openfreemap",
        "source-layer": "landcover",
        type: "symbol",
        minzoom: 14,
        filter: ["any",
          ["==", ["get", "class"], "wood"],
          ["==", ["get", "class"], "scrub"]
        ],
        layout: {
          "icon-image": "tree-3d",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.10, 16, 0.16, 18, 0.22],
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport"
        },
        paint: { "icon-opacity": 0.85 }
      },
      labelLayerId
    );
  }

  async function garantirSources3D() {
    if (!map3d || !map3dLoaded) return;
    if (postes3DSourceLoaded) return;

    const master = getMasterGeoJSON3D();

    map3d.addSource(MAP3D_SOURCE_ACTIVE, {
      type: "geojson",
      data: postes3DActiveGeoJSON || master,
      cluster: true,
      clusterMaxZoom: 17,
      clusterRadius: 60
    });

    map3d.addSource(MAP3D_SOURCE_SELECTED, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map3d.addSource(MAP3D_SOURCE_ROUTE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

        map3d.addSource(MAP3D_SOURCE_ROUTE_MASS, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map3d.addSource(MAP3D_SOURCE_ROUTE_LABELS, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map3d.addSource(MAP3D_SOURCE_ANALISE_POLY, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map3d.addSource(MAP3D_SOURCE_MASS, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    postes3DSourceLoaded = true;
  }

  function garantirCamadasPostes3D() {
    if (!map3d || !map3dLoaded) return;

    if (!map3d.getLayer(MAP3D_LAYER_CLUSTER_SHADOW)) {
      map3d.addLayer({
        id: MAP3D_LAYER_CLUSTER_SHADOW,
        type: "circle",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 20, 50, 26, 200, 32, 1000, 40],
          "circle-color": "rgba(0,0,0,0.18)",
          "circle-blur": 0.8,
          "circle-translate": [0, 2]
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_CLUSTER)) {
      map3d.addLayer({
        id: MAP3D_LAYER_CLUSTER,
        type: "circle",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#60a5fa", 50, "#3b82f6", 200, "#2563eb", 1000, "#1d4ed8"],
          "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 200, 26, 1000, 32],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.96
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_CLUSTER_COUNT)) {
      map3d.addLayer({
        id: MAP3D_LAYER_CLUSTER_COUNT,
        type: "symbol",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
                  },
        paint: { "text-color": "#ffffff" }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_POINT_GLOW)) {
      map3d.addLayer({
        id: MAP3D_LAYER_POINT_GLOW,
        type: "circle",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["!", ["has", "point_count"]],
        minzoom: 14,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 17, 7, 20, 10],
          "circle-color": ["case",
            [">=", ["get", "qtd_empresas"], 9], "rgba(185,28,28,0.55)",
            [">=", ["get", "qtd_empresas"], 5], "rgba(239,68,68,0.40)",
            "rgba(34,197,94,0.30)"
          ],
          "circle-blur": 0.8,
          "circle-translate": [0, 4],
          "circle-opacity": 0.7
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_POINT_BODY)) {
      map3d.addLayer({
        id: MAP3D_LAYER_POINT_BODY,
        type: "symbol",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["!", ["has", "point_count"]],
        minzoom: 13,
        layout: {
          "icon-image": [
            "case",
            ["==", ["get", "material_tipo"], "madeira"], "poste-madeira-3d",
            "poste-concreto-3d"
          ],
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            13, 0.18,
            16, 0.28,
            18, 0.40,
            20, 0.55
          ],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "icon-keep-upright": true
        },
        paint: {
          "icon-opacity": 1
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_POINT_LABELS)) {
      map3d.addLayer({
        id: MAP3D_LAYER_POINT_LABELS,
        type: "symbol",
        source: MAP3D_SOURCE_ACTIVE,
        filter: ["!", ["has", "point_count"]],
        minzoom: 18,
        layout: {
          "text-field": ["get", "id"],
          "text-size": 11,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport"
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_SELECTED_GLOW)) {
      map3d.addLayer({
        id: MAP3D_LAYER_SELECTED_GLOW,
        type: "circle",
        source: MAP3D_SOURCE_SELECTED,
        paint: {
          "circle-radius": 14,
          "circle-color": "rgba(59,130,246,0.24)",
          "circle-blur": 1.0,
          "circle-opacity": 0.5
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_SELECTED)) {
      map3d.addLayer({
        id: MAP3D_LAYER_SELECTED,
        type: "circle",
        source: MAP3D_SOURCE_SELECTED,
        paint: {
          "circle-radius": 8,
          "circle-color": "#3b82f6",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_ROUTE)) {
      map3d.addLayer({
        id: MAP3D_LAYER_ROUTE,
        type: "line",
        source: MAP3D_SOURCE_ROUTE,
        paint: {
          "line-color": "#1d4ed8",
          "line-width": 4,
          "line-opacity": 0.95,
          "line-dasharray": [2, 2]
        }
      });
    }


    // Polígono de destaque da análise (área do projeto)
    if (!map3d.getLayer(MAP3D_LAYER_ANALISE_POLY_FILL)) {
      map3d.addLayer({
        id: MAP3D_LAYER_ANALISE_POLY_FILL,
        type: "fill",
        source: MAP3D_SOURCE_ANALISE_POLY,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.12
        }
      });
    }
    if (!map3d.getLayer(MAP3D_LAYER_ANALISE_POLY_LINE)) {
      map3d.addLayer({
        id: MAP3D_LAYER_ANALISE_POLY_LINE,
        type: "line",
        source: MAP3D_SOURCE_ANALISE_POLY,
        layout: { visibility: "none" },
        paint: {
          "line-color": "#16a34a",
          "line-width": 2,
          "line-opacity": 0.85,
          "line-dasharray": [2, 2]
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_ROUTE_MASS)) {
      map3d.addLayer({
        id: MAP3D_LAYER_ROUTE_MASS,
        type: "line",
        source: MAP3D_SOURCE_ROUTE_MASS,
        paint: {
          "line-color": "#2563eb",
          "line-width": 4,
          "line-opacity": 0.95,
          "line-dasharray": [2, 2]
        }
      });
    }


    if (!map3d.getLayer(MAP3D_LAYER_ROUTE_LABELS)) {
      map3d.addLayer({
        id: MAP3D_LAYER_ROUTE_LABELS,
        type: "symbol",
        source: MAP3D_SOURCE_ROUTE_LABELS,
        minzoom: 13,
        layout: {
          "text-field": ["get", "label"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 15, 12, 17, 14, 19, 16],
          "text-offset": [0, -1.1],
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0f172a",
          "text-halo-width": 2.2
        }
      });
    }



    if (!map3d.getLayer(MAP3D_LAYER_MASS)) {
      map3d.addLayer({
        id: MAP3D_LAYER_MASS,
        type: "circle",
        source: MAP3D_SOURCE_MASS,
        paint: {
          "circle-radius": 8,
          "circle-color": ["coalesce", ["get", "cor"], "#f59e0b"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
    }

    if (!map3d.getLayer(MAP3D_LAYER_MASS_ICON)) {
      map3d.addLayer({
        id: MAP3D_LAYER_MASS_ICON,
        type: "symbol",
        source: MAP3D_SOURCE_MASS,
        layout: {
          "icon-image": [
            "case",
            ["==", ["get", "material_tipo"], "madeira"], "poste-madeira-3d",
            "poste-concreto-3d"
          ],
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            13, 0.18,
            16, 0.28,
            18, 0.40,
            20, 0.55
          ],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "icon-keep-upright": true
        },
        paint: {
          "icon-opacity": 1
        }
      });
    }


    if (!map3d.getLayer(MAP3D_LAYER_MASS_LABELS)) {
      map3d.addLayer({
        id: MAP3D_LAYER_MASS_LABELS,
        type: "symbol",
        source: MAP3D_SOURCE_MASS,
        layout: {
          "text-field": ["coalesce", ["get", "numero"], ""],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 13, 15, 15, 17, 18, 19, 22],
          "text-anchor": "center",
          "text-allow-overlap": true
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#111827",
          "text-halo-width": 2.6
        }
      });
    }
  }

  function abrirPopup3DDoPoste(poste) {
    if (!map3d) return;
    if (ultimoPopup3D) {
      try { ultimoPopup3D.remove(); } catch (_) {}
    }
    ultimoPopup3D = new maplibregl.Popup({ closeButton: true, maxWidth: "380px" })
      .setLngLat([Number(poste.lon), Number(poste.lat)])
      .setHTML(montarPopupModeloCard(poste))
      .addTo(map3d);
  }

  function atualizarSelecao3DVisual() {
  if (!map3d || !map3dLoaded) return;

  const srcSel = map3d.getSource(MAP3D_SOURCE_SELECTED);
  const srcRoute = map3d.getSource(MAP3D_SOURCE_ROUTE);

  // Pontos selecionados
  if (srcSel) {
    const featsSel = postesSelecionados.map(({ poste }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(poste.lon), Number(poste.lat)] },
      properties: { id: String(poste.id || "") }
    }));
    srcSel.setData({ type: "FeatureCollection", features: featsSel });
  }

  // Linha da seleção (linha azul tracejada)
  if (srcRoute) {
    const featsRoute = postesSelecionados.length >= 2
      ? [{
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: postesSelecionados.map(({ poste }) => [Number(poste.lon), Number(poste.lat)])
          },
          properties: {}
        }]
      : [];
    srcRoute.setData({ type: "FeatureCollection", features: featsRoute });
  }
}

function handleSelecao3D(poste) {
    const idAtual = String(poste.id);
    const idx = postesSelecionados.findIndex((r) => String(r.poste.id) === idAtual);

    if (idx >= 0) {
      postesSelecionados.splice(idx, 1);
    } else {
      if (postesSelecionados.length >= 300) {
        alert("Limite máximo de 300 postes na seleção.");
        return true;
      }
      postesSelecionados.push({ poste, layer: null });
    }

    if (typeof atualizarEstadoBotaoSelecao === "function") atualizarEstadoBotaoSelecao();
    atualizarSelecao3DVisual();
    return true;
  }

  
  function setModoAnalise3D(ativo) {
    if (!map3d || !map3dLoaded) return;
    modoAnalise3DAtivo = !!ativo;

    const normalLayers = [
      MAP3D_LAYER_CLUSTER_SHADOW,
      MAP3D_LAYER_CLUSTER,
      MAP3D_LAYER_CLUSTER_COUNT,
      MAP3D_LAYER_POINT_GLOW,
      MAP3D_LAYER_POINT_BODY,
      MAP3D_LAYER_POINT_LABELS,
      MAP3D_LAYER_SELECTED_GLOW,
      MAP3D_LAYER_SELECTED,
      MAP3D_LAYER_ROUTE
    ];

    const analiseLayers = [
      MAP3D_LAYER_ANALISE_POLY_FILL,
      MAP3D_LAYER_ANALISE_POLY_LINE,
      MAP3D_LAYER_ROUTE_MASS,
      MAP3D_LAYER_ROUTE_LABELS,
      MAP3D_LAYER_MASS,
      MAP3D_LAYER_MASS_ICON,
      MAP3D_LAYER_MASS_LABELS
    ];

    const setVis = (layerId, vis) => {
      try {
        if (map3d.getLayer(layerId)) map3d.setLayoutProperty(layerId, "visibility", vis);
      } catch (_) {}
    };

    normalLayers.forEach((id) => setVis(id, modoAnalise3DAtivo ? "none" : "visible"));
    analiseLayers.forEach((id) => setVis(id, modoAnalise3DAtivo ? "visible" : "none"));

    // respeita o toggle de rótulos de trechos
    try { if (map3d.getLayer(MAP3D_LAYER_ROUTE_LABELS)) map3d.setLayoutProperty(MAP3D_LAYER_ROUTE_LABELS, "visibility", (modoAnalise3DAtivo && analiseDistanciasVisiveis) ? "visible" : "none"); } catch (_) {}
  }

  // Permite o botão do painel controlar os rótulos (1-2, 2-3...) no 3D
  window.setVisTrechosAnalise3D = function (vis) {
    try {
      if (!map3d || !map3dLoaded) return;
      const v = (vis && modoAnalise3DAtivo) ? "visible" : "none";
      if (map3d.getLayer(MAP3D_LAYER_ROUTE_LABELS)) map3d.setLayoutProperty(MAP3D_LAYER_ROUTE_LABELS, "visibility", v);
    } catch (_) {}
  };

function limparCamadasMassivas3D() {
    if (!map3d || !map3dLoaded) return;
    const srcMass = map3d.getSource(MAP3D_SOURCE_MASS);
    const srcRouteMass = map3d.getSource(MAP3D_SOURCE_ROUTE_MASS);
    const srcRouteLabels = map3d.getSource(MAP3D_SOURCE_ROUTE_LABELS);
    const srcPoly = map3d.getSource(MAP3D_SOURCE_ANALISE_POLY);
    if (srcMass) srcMass.setData({ type: "FeatureCollection", features: [] });
    if (srcRouteMass) srcRouteMass.setData({ type: "FeatureCollection", features: [] });
    if (srcRouteLabels) srcRouteLabels.setData({ type: "FeatureCollection", features: [] });
    if (srcPoly) srcPoly.setData({ type: "FeatureCollection", features: [] });
  }

  function desenharAnaliseMassa3D(encontrados, intermediarios = []) {
    if (!map3d || !map3dLoaded) return;

    const srcMass = map3d.getSource(MAP3D_SOURCE_MASS);
    const srcRouteMass = map3d.getSource(MAP3D_SOURCE_ROUTE_MASS);
    const srcRouteLabels = map3d.getSource(MAP3D_SOURCE_ROUTE_LABELS);
    if (!srcMass || !srcRouteMass || !srcRouteLabels) return;

    function fmtDistLocal(m) {
      const n = Number(m || 0);
      if (!isFinite(n)) return "0 m";
      if (n >= 1000) return (n / 1000).toFixed(2).replace(".", ",") + " km";
      return Math.round(n) + " m";
    }

    const feats = [];

    encontrados.forEach((p, i) => {
      const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] },
        properties: { id: String(p.id || ""), numero: String(i + 1), cor: qtd >= 5 ? "#ef4444" : "#22c55e", material_tipo: getMaterialTipo(p) }
      });
    });

    intermediarios.forEach((p) => {
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] },
        properties: { id: String(p.id || ""), numero: "", cor: "#f59e0b", material_tipo: getMaterialTipo(p) }
      });
    });

    const routeFeature = encontrados.length >= 2
      ? [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: encontrados.map((p) => [Number(p.lon), Number(p.lat)]) },
          properties: {}
        }]
      : [];


    // Labels de trechos (1-2, 2-3…) + total do projeto
    const labelFeats = [];
    if (encontrados.length >= 2 && typeof getDistanciaMetros === "function") {
      let total = 0;
      for (let i = 0; i < encontrados.length - 1; i++) {
        const a = encontrados[i], b = encontrados[i + 1];
        const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
        total += d;
        const mid = [(Number(a.lon) + Number(b.lon)) / 2, (Number(a.lat) + Number(b.lat)) / 2];
        labelFeats.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: mid },
          properties: { label: `${i + 1}-${i + 2}: ${fmtDistLocal(d)}` }
        });
      }
      const last = encontrados[encontrados.length - 1];
      labelFeats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(last.lon), Number(last.lat)] },
        properties: { label: `Total: ${fmtDistLocal(total)}` }
      });
    }

    srcMass.setData({ type: "FeatureCollection", features: feats });
    srcRouteMass.setData({ type: "FeatureCollection", features: routeFeature });
    srcRouteLabels.setData({ type: "FeatureCollection", features: (analiseDistanciasVisiveis ? labelFeats : []) });

    // Polígono da análise no 3D
    try {
      if (typeof setPoligonoAnalise3D === "function") setPoligonoAnalise3D(encontrados);
    } catch (_) {}
  }


  function setPoligonoAnalise3D(encontrados) {
    try {
      if (!map3d || !map3dLoaded) return;
      const srcPoly = map3d.getSource(MAP3D_SOURCE_ANALISE_POLY);
      if (!srcPoly) return;

      const ptsLngLat = (encontrados || [])
        .map(p => [Number(p.lon), Number(p.lat)])
        .filter(p => isFinite(p[0]) && isFinite(p[1]));
      if (!ptsLngLat.length) {
        srcPoly.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      let ring = null;
      if (ptsLngLat.length >= 3) {
        const hull = (typeof __convexHullLngLat === "function") ? __convexHullLngLat(ptsLngLat) : ptsLngLat;
        ring = hull.concat([hull[0]]);
      } else {
        ring = (typeof __bboxPolygonLngLat === "function") ? __bboxPolygonLngLat(ptsLngLat, 45) : null;
      }
      if (!ring || ring.length < 4) {
        srcPoly.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const poly = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {}
      };

      srcPoly.setData({ type: "FeatureCollection", features: [poly] });

      // se estiver em análise, garante visibilidade
      try {
        if (modoAnalise3DAtivo) {
          if (map3d.getLayer(MAP3D_LAYER_ANALISE_POLY_FILL)) map3d.setLayoutProperty(MAP3D_LAYER_ANALISE_POLY_FILL, "visibility", "visible");
          if (map3d.getLayer(MAP3D_LAYER_ANALISE_POLY_LINE)) map3d.setLayoutProperty(MAP3D_LAYER_ANALISE_POLY_LINE, "visibility", "visible");
        }
      } catch (_) {}
    } catch (_) {}
  }


  function metersToLng(meters, lat) {
    return meters / (111320 * Math.cos((lat * Math.PI) / 180));
  }

  function metersToLat(meters) {
    return meters / 110540;
  }

  function pointToSquarePolygon(lon, lat, sizeMeters) {
    return [[
      [lon - metersToLng(sizeMeters / 2, lat), lat - metersToLat(sizeMeters / 2)],
      [lon + metersToLng(sizeMeters / 2, lat), lat - metersToLat(sizeMeters / 2)],
      [lon + metersToLng(sizeMeters / 2, lat), lat + metersToLat(sizeMeters / 2)],
      [lon - metersToLng(sizeMeters / 2, lat), lat + metersToLat(sizeMeters / 2)],
      [lon - metersToLng(sizeMeters / 2, lat), lat - metersToLat(sizeMeters / 2)]
    ]];
  }

  function getMaterialTipo(poste) {
    const matRaw = (poste.material || poste.tipo || poste.tipo_poste || "").toString().toLowerCase();
    return matRaw.includes("madeira") ? "madeira" : "concreto";
  }

  function getAlturaPoste3D(poste) {
    const qtd = Array.isArray(poste.empresas) ? poste.empresas.length : 0;
    const material = getMaterialTipo(poste);
    const base = material === "madeira" ? 8.5 : 10.5;
    const bonus = Math.min(qtd * 0.35, 3.5);
    return +(base + bonus).toFixed(2);
  }

  // =====================================================================
  // atualizarPostesExtrudados3D — DESATIVADO intencionalmente.
  // O usuário quer ver apenas o ícone 2D do poste no mapa 3D,
  // sem extrusão 3D em forma de coluna.
  // =====================================================================
  function atualizarPostesExtrudados3D() {
    return;
  }

  function iniciarAnimacao3D() {
    if (!map3d || postes3DAnimFrame) return;

    const tick = () => {
      if (!map3d || !map3dLoaded) {
        postes3DAnimFrame = null;
        return;
      }

      postes3DPulseTick += 0.08;
      const pulse = (Math.sin(postes3DPulseTick) + 1) / 2;

      try {
        if (map3d.getLayer(MAP3D_LAYER_POINT_GLOW)) {
          map3d.setPaintProperty(MAP3D_LAYER_POINT_GLOW, "circle-opacity", 0.40 + pulse * 0.25);
        }

        if (map3d.getLayer(MAP3D_LAYER_SELECTED_GLOW)) {
          map3d.setPaintProperty(MAP3D_LAYER_SELECTED_GLOW, "circle-radius", 12 + pulse * 4);
          map3d.setPaintProperty(MAP3D_LAYER_SELECTED_GLOW, "circle-opacity", 0.28 + pulse * 0.18);
        }
      } catch (_) {}

      postes3DAnimFrame = requestAnimationFrame(tick);
    };

    postes3DAnimFrame = requestAnimationFrame(tick);
  }

  function bindAtualizacaoPostes3D() {
    if (!map3d || map3d.__postes3dMoveBound) return;

    let timer = null;
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        atualizarPostesExtrudados3D();
      }, 120);
    };

    map3d.on("moveend", agendar);
    map3d.on("zoomend", agendar);
    map3d.__postes3dMoveBound = true;
  }

  function bindEventosPostes3D() {
    if (!map3d || map3d.__postes3dEventsBound) return;

    const clusterClick = (e) => {
      const feature = e.features && e.features[0];
      if (!feature) return;

      const clusterId = feature.properties.cluster_id;
      const source = map3d.getSource(MAP3D_SOURCE_ACTIVE);
      if (!source || typeof source.getClusterExpansionZoom !== "function") return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map3d.easeTo({
          center: feature.geometry.coordinates,
          zoom,
          duration: 800
        });
      });
    };

    map3d.on("click", MAP3D_LAYER_CLUSTER, clusterClick);
    map3d.on("click", MAP3D_LAYER_CLUSTER_COUNT, clusterClick);

    const clickPoste = (e) => {
      const f = e.features && e.features[0];
      if (!f) return;

      const id = String(f.properties.id || "");
      const poste = todosPostes.find((p) => String(p.id) === id);
      if (!poste) return;

      // Se estiver em modo medir, clicar no poste adiciona ponto de medição (e não abre popup)
      if (typeof window.isMedicaoAtiva === "function" && window.isMedicaoAtiva()) {
        try {
          if (typeof window.__medicaoIgnoreNextMapClick3D === "function") window.__medicaoIgnoreNextMapClick3D();
          if (typeof window.__medicaoAddPoint3D === "function") {
            window.__medicaoAddPoint3D([Number(poste.lon), Number(poste.lat)]);
          }
        } catch (_) {}
        return;
      }

      if (selecaoAtiva) {
        handleSelecao3D(poste);
        return;
      }

      abrirPopup3DDoPoste(poste);
    };

    map3d.on("click", MAP3D_LAYER_POINT_BODY, clickPoste);
    map3d.on("click", MAP3D_LAYER_POINT_LABELS, clickPoste);
    map3d.on("click", MAP3D_LAYER_SELECTED, clickPoste);
    map3d.on("click", MAP3D_LAYER_MASS, clickPoste);
    map3d.on("click", MAP3D_LAYER_MASS_ICON, clickPoste);
    map3d.on("click", MAP3D_LAYER_MASS_LABELS, clickPoste);

    [
      MAP3D_LAYER_CLUSTER,
      MAP3D_LAYER_CLUSTER_COUNT,
      MAP3D_LAYER_POINT_BODY,
      MAP3D_LAYER_POINT_LABELS,
      MAP3D_LAYER_SELECTED,
      MAP3D_LAYER_MASS,
      MAP3D_LAYER_MASS_ICON,
      MAP3D_LAYER_MASS_LABELS
    ].forEach((layerId) => {
      map3d.on("mouseenter", layerId, () => {
        map3d.getCanvas().style.cursor = "pointer";
      });
      map3d.on("mouseleave", layerId, () => {
        map3d.getCanvas().style.cursor = "";
      });
    });

    map3d.__postes3dEventsBound = true;
  }

  function atualizarSourceAtiva3D(lista) {
    postes3DActiveGeoJSON = montarGeoJSONPostes3D(lista);
    if (!map3d || !map3dLoaded) return;

    const src = map3d.getSource(MAP3D_SOURCE_ACTIVE);
    if (src) src.setData(postes3DActiveGeoJSON);
    atualizarPostesExtrudados3D();
  }

  function restaurarDatasetCompleto3D() {
    filtro3DAtivo = false;
    idsFiltrados3D = null;
    postes3DActiveGeoJSON = getMasterGeoJSON3D();

    if (!map3d || !map3dLoaded) return;
    const src = map3d.getSource(MAP3D_SOURCE_ACTIVE);
    if (src) src.setData(postes3DActiveGeoJSON);
    atualizarPostesExtrudados3D();
  }

  function aplicarFiltro3D(lista) {
    filtro3DAtivo = true;
    idsFiltrados3D = new Set((lista || []).map((p) => String(p.id)));
    atualizarSourceAtiva3D(lista);
  }

  function zoomToListaUniversal(lista, is3D = false) {
    if (!lista || !lista.length) return;

    if (is3D && map3d) {
      const bounds = new maplibregl.LngLatBounds();
      lista.forEach((p) => bounds.extend([Number(p.lon), Number(p.lat)]));
      map3d.fitBounds(bounds, { padding: 80, duration: 1000, pitch: 60, bearing: -25 });
    } else {
      map.fitBounds(L.latLngBounds(lista.map((p) => [p.lat, p.lon])));
    }
  }

  function focarPosteUniversal(poste) {
    if (!poste) return;

    if (modoMapaAtual === "3d" && map3d) {
      map3d.flyTo({
        center: [Number(poste.lon), Number(poste.lat)],
        zoom: 18,
        pitch: 60,
        bearing: -25,
        duration: 1000
      });
      setTimeout(() => {
        abrirPopup3DDoPoste(poste);
        atualizarPostesExtrudados3D();
      }, 350);
    } else {
      map.setView([poste.lat, poste.lon], 18);
      if (typeof abrirPopup === "function") abrirPopup(poste);
    }
  }

  function focarCoordenadaUniversal(lat, lon) {
    if (modoMapaAtual === "3d" && map3d) {
      map3d.flyTo({
        center: [Number(lon), Number(lat)],
        zoom: 18,
        pitch: 60,
        bearing: -25,
        duration: 900
      });

      if (ultimoPopup3D) {
        try { ultimoPopup3D.remove(); } catch (_) {}
      }

      ultimoPopup3D = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat([Number(lon), Number(lat)])
        .setHTML(`<b>Coordenada:</b> ${lat}, ${lon}`)
        .addTo(map3d);
    } else {
      map.setView([lat, lon], 18);
      L.popup().setLatLng([lat, lon]).setContent(`<b>Coordenada:</b> ${lat}, ${lon}`).openOn(map);
    }
  }

  function syncLeafletTo3DOverride() {
    if (!map3d) return;

    const center = map.getCenter();
    const zoom = map.getZoom();

    map3d.jumpTo({
      center: [center.lng, center.lat],
      zoom: Math.max(zoom - 1, 1),
      pitch: 60,
      bearing: -25
    });

    setTimeout(() => {
      try {
        map3d.resize();
        atualizarPostesExtrudados3D();
      } catch (_) {}
    }, 80);
  }

  function sync3DToLeafletOverride() {
    if (!map3d) return;

    const center = map3d.getCenter();
    const zoom = map3d.getZoom();

    map.setView([center.lat, center.lng], Math.round(zoom + 1));

    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 150);
  }

  // =====================================================================
  // CSS: separação física entre modo 2D (Leaflet) e modo 3D (MapLibre).
  // =====================================================================
  (function injectModo3DStyles() {
    if (document.getElementById("modo3d-leaflet-hide")) return;
    const css = `
      body.modo-3d-ativo #map {
        position: fixed !important;
        left: -200vw !important;
        top: 0 !important;
        pointer-events: none !important;
        z-index: -999 !important;
      }
      body.modo-3d-ativo #map .leaflet-pane,
      body.modo-3d-ativo #map .leaflet-top,
      body.modo-3d-ativo #map .leaflet-bottom,
      body.modo-3d-ativo #map .leaflet-control-container {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      body.modo-3d-ativo #map3d {
        display: block !important;
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 1 !important;
      }
      body:not(.modo-3d-ativo) #map3d {
        position: fixed !important;
        left: -200vw !important;
        top: 0 !important;
        display: block !important;
        pointer-events: none !important;
        z-index: -999 !important;
      }
    `;
    const style = document.createElement("style");
    style.id = "modo3d-leaflet-hide";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // =====================================================================
  // ativarMapa3D
  // =====================================================================
  window.ativarMapa3D = async function () {
    const map2dEl = document.getElementById("map");
    const map3dEl = document.getElementById("map3d");

    if (!map2dEl || !map3dEl) return;
    if (!todosPostes.length) {
      alert("Os postes ainda não terminaram de carregar.");
      return;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();

    document.body.classList.add("modo-3d-ativo");

    if (map.hasLayer(markers)) map.removeLayer(markers);

    if (!map3d) {
      map3d = new maplibregl.Map({
        container: "map3d",
        style: MAP3D_STYLE,
        transformRequest: (url, resourceType) => {
          try {
            if (resourceType === "Glyphs" && String(url).includes("tiles.openfreemap.org")) {
              const u = new URL(url);
              const parts = u.pathname.split("/").filter(Boolean);
              const range = parts.pop();
              const fontstack = parts.pop();
              if (fontstack && range) {
                return { url: `https://demotiles.maplibre.org/font/${fontstack}/${range}` };
              }
            }
          } catch (_) {}
          return { url };
        },
        center: [center.lng, center.lat],
        zoom: Math.max(zoom - 1, 1),
        pitch: 60,
        bearing: -25,
        antialias: false,
        preserveDrawingBuffer: false
      });

      map3d.addControl(new maplibregl.NavigationControl(), "top-right");

      map3d.on("load", async () => {
        map3dLoaded = true;

        function svgToPngImageData(svgStr, w, h) {
          return new Promise((resolve) => {
            const cleanSvg = svgStr
              .replace(/<svg /, '<svg style="background:none;" ')
              .replace(/background="[^"]*"/g, '')
              .replace(/background:[^;"']*/g, 'background:none');

            const blob = new Blob([cleanSvg], { type: "image/svg+xml;charset=utf-8" });
            const url  = URL.createObjectURL(blob);
            const img  = new Image();

            img.onload = () => {
              const canvas = document.createElement("canvas");
              const scale  = 2;
              canvas.width  = w * scale;
              canvas.height = h * scale;
              const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
              ctx.drawImage(img, 0, 0, w * scale, h * scale);
              const imageData = ctx.getImageData(0, 0, w * scale, h * scale);
              URL.revokeObjectURL(url);
              resolve({ width: w * scale, height: h * scale, data: imageData.data });
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
          });
        }

        const [spriteConcreto, spriteMadeira] = await Promise.all([
          svgToPngImageData(SVG_3D_POSTE_CONCRETO, 64, 128),
          svgToPngImageData(SVG_3D_POSTE_MADEIRA,  64, 128)
        ]);

        if (spriteConcreto && !map3d.hasImage("poste-concreto-3d")) {
          map3d.addImage("poste-concreto-3d", spriteConcreto, { pixelRatio: 2 });
        }
        if (spriteMadeira && !map3d.hasImage("poste-madeira-3d")) {
          map3d.addImage("poste-madeira-3d", spriteMadeira, { pixelRatio: 2 });
        }

                const SVG_TREE_3D = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="26" cy="22" r="12" fill="#2e7d32" stroke="#1b5e20" stroke-width="2"/>
  <circle cx="38" cy="24" r="14" fill="#388e3c" stroke="#1b5e20" stroke-width="2"/>
  <circle cx="32" cy="34" r="14" fill="#43a047" stroke="#1b5e20" stroke-width="2"/>
  <rect x="28" y="34" width="8" height="22" rx="2" fill="#6d4c41" stroke="#4e342e" stroke-width="2"/>
</svg>`;
        const treeSprite = await svgToPngImageData(SVG_TREE_3D, 64, 64);
        if (treeSprite && !map3d.hasImage("tree-3d")) {
          map3d.addImage("tree-3d", treeSprite, { pixelRatio: 2 });
        }

        resetarEstrutura3D();
        adicionarPredios3D();
        adicionarVegetacao3D();
        await garantirSources3D();
        garantirCamadasPostes3D();
        bindEventosPostes3D();
        bindAtualizacaoPostes3D();
        iniciarAnimacao3D();
        atualizarPostesExtrudados3D();
      });
    } else {
      syncLeafletTo3DOverride();
    }

    modoMapaAtual = "3d";

    const esperarLoad = () =>
      new Promise((resolve) => {
        if (map3dLoaded) return resolve();
        map3d.once("load", resolve);
      });

    await esperarLoad();
    syncLeafletTo3DOverride();
    atualizarSelecao3DVisual();

    setTimeout(() => {
      try {
        map3d.resize();
        atualizarPostesExtrudados3D();
      } catch (_) {}
    }, 150);
  };

  // =====================================================================
  // ativarMapa2D
  // =====================================================================
  window.ativarMapa2D = function () {
    const map2dEl = document.getElementById("map");
    const map3dEl = document.getElementById("map3d");

    if (!map2dEl || !map3dEl) return;

    if (map3d) sync3DToLeafletOverride();

    document.body.classList.remove("modo-3d-ativo");

    modoMapaAtual = "2d";

    if (!map.hasLayer(markers)) map.addLayer(markers);

    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 200);
  };

  function reconstruirFonte3D(lista = null) {
    postes3DMasterGeoJSON = null;

    if (lista && Array.isArray(lista)) {
      aplicarFiltro3D(lista);
      return;
    }

    try { setModoAnalise3D(false); } catch (_) {}
    try { limparCamadasMassivas3D(); } catch (_) {}

    restaurarDatasetCompleto3D();
  }

  function atualizar3DSeAtivo() {
    if (modoMapaAtual !== "3d") return;
    if (!map3d || !map3dLoaded) return;

    setTimeout(() => {
      try {
        map3d.resize();
        atualizarSelecao3DVisual();
        atualizarPostesExtrudados3D();
      } catch (_) {}
    }, 50);
  }

  window.reconstruirFonte3D = reconstruirFonte3D;
  window.atualizar3DSeAtivo = atualizar3DSeAtivo;
  window.atualizarSelecao3DVisual = atualizarSelecao3DVisual;
  window.setModoAnalise3D = setModoAnalise3D;
  window.limparCamadasMassivas3D = limparCamadasMassivas3D;
  window.desenharAnaliseMassa3D = desenharAnaliseMassa3D;
  window.focarPosteUniversal = focarPosteUniversal;
  window.focarCoordenadaUniversal = focarCoordenadaUniversal;
  window.montarGeoJSONPostes3D = montarGeoJSONPostes3D;
  window.getMasterGeoJSON3D = getMasterGeoJSON3D;
  window.aplicarFiltro3D = aplicarFiltro3D;
  window.restaurarDatasetCompleto3D = restaurarDatasetCompleto3D;
  window.getMapa3D = () => map3d;
  window.getModoMapaAtual = () => modoMapaAtual;

  // =====================================================================
  // buscarID — funciona em 2D e 3D
  // =====================================================================
  window.buscarID = function () {
    const id = document.getElementById("busca-id")?.value.trim();
    const p = todosPostes.find((x) => String(x.id) === String(id));
    if (!p) return alert("Poste não encontrado.");
    focarPosteUniversal(p);
  };

  // =====================================================================
  // buscarCoordenada — funciona em 2D e 3D
  // =====================================================================
  window.buscarCoordenada = function () {
    const inpt = document.getElementById("busca-coord")?.value.trim();
    const [lat, lon] = (inpt || "").split(/,\s*/).map(Number);
    if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
    focarCoordenadaUniversal(lat, lon);
  };

  // =====================================================================
  // filtrarLocal — funciona em 2D e 3D
  // =====================================================================
  window.filtrarLocal = function () {
    const getVal = (id) => (document.getElementById(id)?.value || "").trim().toLowerCase();
    const [mun, bai, log, emp] = ["busca-municipio", "busca-bairro", "busca-logradouro", "busca-empresa"].map(getVal);

    const filtro = todosPostes.filter(
      (p) =>
        (!mun || (p.nome_municipio || "").toLowerCase() === mun) &&
        (!bai || (p.nome_bairro || "").toLowerCase() === bai) &&
        (!log || (p.nome_logradouro || "").toLowerCase() === log) &&
        (!emp || hasEmpresaNome(p, emp))
    );

    if (!filtro.length) return alert("Nenhum poste encontrado com esses filtros.");

    markers.clearLayers();
    if (typeof refreshClustersSoon === "function") refreshClustersSoon();
    filtro.forEach((p) => adicionarMarker(p));
    if (typeof refreshClustersSoon === "function") refreshClustersSoon();
    if (typeof reabrirTooltipFixo === "function") reabrirTooltipFixo(0);
    if (typeof reabrirPopupFixo === "function") reabrirPopupFixo(0);

    aplicarFiltro3D(filtro);

    if (modoMapaAtual === "3d") {
      zoomToListaUniversal(filtro, true);
    } else {
      try {
        const bounds = L.latLngBounds(filtro.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds);
      } catch (_) {}
    }

    if (typeof gerarExcelCliente === "function") gerarExcelCliente(filtro.map((p) => p.id));
    if (typeof gerarCSVParaBase44 === "function") gerarCSVParaBase44(filtro.map((p) => p.id));
  };

  // =====================================================================
  // resetarMapa — funciona em 2D e 3D
  // =====================================================================
  
window.resetarMapa = function () {
    if (typeof limparSelecaoESair === "function") limparSelecaoESair({ manterMarcadores: true });
    if (typeof popupPinned !== "undefined") popupPinned = false;
    if (typeof lastPopup !== "undefined") lastPopup = null;
    if (typeof tipPinned !== "undefined") tipPinned = false;
    if (typeof lastTip !== "undefined") lastTip = null;

    if (typeof showOverlay === "function") showOverlay("Resetando…");

    // Se a base já foi carregada uma vez, não “recarrega tudo”:
    // só volta as camadas normais (2D e 3D) usando cache em memória.
    const baseJaMontada = (typeof markers !== "undefined" && typeof markers.getLayers === "function" && markers.getLayers().length > 0);

    try {
      if (baseJaMontada) {
        resetarRapidoBase();
        return;
      }
    } catch (_) {}

    // Fallback (primeiro carregamento / base ainda não montada)
    try { sairModoAnalise2D(); } catch (_) {}
    try { if (typeof setModoAnalise3D === "function") setModoAnalise3D(false); } catch (_) {}
    try { if (typeof limparCamadasMassivas3D === "function") limparCamadasMassivas3D(); } catch (_) {}
    try { if (typeof restaurarDatasetCompleto3D === "function") restaurarDatasetCompleto3D(); } catch (_) {}

    if (typeof hardReset === "function") {
      hardReset();
    } else if (typeof carregarTodosPostesGradualmente === "function") {
      carregarTodosPostesGradualmente();
    }

    atualizar3DSeAtivo();
  };
;

  // =====================================================================
  // consultarIDsEmMassa — funciona em 2D e 3D
  // =====================================================================
  
window.consultarIDsEmMassa = function () {
    const ids = (document.getElementById("ids-multiplos")?.value || "")
      .split(/[^0-9]+/).filter(Boolean);

    if (!ids.length) return alert("Nenhum ID fornecido.");

    if (typeof showOverlay === "function") showOverlay("Processando IDs e gerando análise…");

    // Ativa modo análise no 2D sem destruir o dataset base (evita “recarregar tudo” no reset)
    try { entrarModoAnalise2D(); } catch (_) {}
    try { limparAnaliseInfo(); } catch (_) {}

    // Limpa estado anterior da análise
    window.numeroMarkers = [];
    window.intermediarios = [];
    window.intermediariosPostes = [];
    window.tracadoMassivo = null;
    window.analiseSegmentMarkers = [];
    window.analiseDistancias = null;
    window.analiseEncontrados = null;
    window.analisePolygonRing = null;

    const normId = (v) => (typeof keyId === "function" ? keyId(v) : String(v));

    const encontrados = ids
      .map((id) => todosPostes.find((p) => normId(p.id) === normId(id)))
      .filter(Boolean);

    // guarda a sequência encontrada para PDF/relatórios (polígono/traçado)
    try { window.analiseEncontrados = encontrados.slice(); } catch (_) {}


    if (!encontrados.length) {
      try { resetarRapidoBase(); } catch (_) {}
      if (typeof hideOverlay === "function") hideOverlay();
      return alert("Nenhum poste encontrado.");
    }

    // ---------- Distâncias do projeto (1-2, 2-3, …) ----------
    function fmtDist(m) {
      const n = Number(m || 0);
      if (!isFinite(n)) return "0 m";
      if (n >= 1000) return (n / 1000).toFixed(2).replace(".", ",") + " km";
      return Math.round(n) + " m";
    }

    const segDist = [];
    const cumDist = [0];
    let totalDist = 0;
    for (let i = 0; i < encontrados.length - 1; i++) {
      const a = encontrados[i], b = encontrados[i + 1];
      const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
      segDist.push(d);
      totalDist += d;
      cumDist.push(totalDist);
    }
    window.analiseDistancias = { segDist, cumDist, totalDist, totalPostes: encontrados.length };
    try { __atualizarEstadoBtnTrechosAnalise(); } catch (_) {}

    const addNumero = (p, num) => {
      const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
      const cor = qtd >= 5 ? "red" : "green";
      const html = `<div style="background:${cor};color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white">${num}</div>`;
      const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ html }) });

      const idx = num - 1;
      const acum = cumDist[idx] || 0;
      const prox = (idx < segDist.length) ? segDist[idx] : null;
      const tip = [
        `<b>ID:</b> ${p.id}`,
        `<b>Acumulado:</b> ${fmtDist(acum)}`,
        prox != null ? `<b>${num}-${num + 1}:</b> ${fmtDist(prox)}` : `<b>Fim do projeto</b>`
      ].join("<br>");

      mk.bindTooltip(tip, { direction: "top", sticky: true });

      mk.on("mouseover", () => {
        if (typeof lastTip !== "undefined") lastTip = { id: normId(p.id) };
        if (typeof tipPinned !== "undefined") tipPinned = false;
      });

      mk.on("click", (e) => {
        if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);

        // Se estiver medindo, clique no poste vira ponto de medição
        if (typeof window.isMedicaoAtiva === "function" && window.isMedicaoAtiva()) {
          try {
            if (typeof window.__medicaoAddPoint2D === "function") window.__medicaoAddPoint2D(mk.getLatLng());
          } catch (_) {}
          return;
        }

        if (typeof handleSelecaoClick === "function" && handleSelecaoClick(p, mk)) return;
        if (typeof lastTip !== "undefined") lastTip = { id: normId(p.id) };
        if (typeof tipPinned !== "undefined") tipPinned = true;
        try { mk.openTooltip?.(); } catch {}
        if (typeof abrirPopup === "function") abrirPopup(p);
      });

      mk.posteData = p;
      try { analiseLayer2D.addLayer(mk); } catch (_) { mk.addTo(map); }
      window.numeroMarkers.push(mk);
    };

    encontrados.forEach((p, i) => addNumero(p, i + 1));

    // Intermediários (como “pontos de referência” entre IDs, quando a distância é grande)
    encontrados.slice(0, -1).forEach((a, i) => {
      const b = encontrados[i + 1];
      const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
      if (d > 50) {
        todosPostes
          .filter((p) => !ids.includes(normId(p.id)))
          .filter((p) =>
            getDistanciaMetros(a.lat, a.lon, p.lat, p.lon) +
            getDistanciaMetros(b.lat, b.lon, p.lat, p.lon) <= d + 20
          )
          .forEach((p) => {
            const empresasStr = typeof empresasToString === "function" ? (empresasToString(p) || "Disponível") : "Disponível";
            const cm = L.circleMarker([p.lat, p.lon], {
              radius: 6, color: "gold", fillColor: "yellow", fillOpacity: 0.8
            })
              .bindTooltip(`ID: ${p.id}<br>Empresas: ${empresasStr}`, { direction: "top", sticky: true })
              .on("mouseover", () => {
                if (typeof lastTip !== "undefined") lastTip = { id: normId(p.id) };
                if (typeof tipPinned !== "undefined") tipPinned = false;
              })
              .on("click", (e) => {
                if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);

                // Medição: clique no intermediário também vira ponto
                if (typeof window.isMedicaoAtiva === "function" && window.isMedicaoAtiva()) {
                  try {
                    if (typeof window.__medicaoAddPoint2D === "function") window.__medicaoAddPoint2D(cm.getLatLng());
                  } catch (_) {}
                  return;
                }

                if (typeof handleSelecaoClick === "function" && handleSelecaoClick(p, cm)) return;
                if (typeof lastTip !== "undefined") lastTip = { id: normId(p.id) };
                if (typeof tipPinned !== "undefined") tipPinned = true;
                try { cm.openTooltip?.(); } catch {}
                if (typeof abrirPopup === "function") abrirPopup(p);
              });

            cm.posteData = p;
            try { analiseLayer2D.addLayer(cm); } catch (_) { cm.addTo(map); }
            window.intermediarios.push(cm);
            window.intermediariosPostes.push(p);
          });
      }
    });

    // Traçado (tracejado igual ao 2D) + labels de trecho (1-2, 2-3…)
    const coords = encontrados.map((p) => [p.lat, p.lon]);
    // Polígono de destaque da área do projeto
    try { desenharPoligonoAnalise2D(encontrados); } catch (_) {}
    if (coords.length >= 2) {
      const line = L.polyline(coords, { color: "blue", weight: 3, dashArray: "4,6" });
      try { analiseLayer2D.addLayer(line); } catch (_) { line.addTo(map); }
      window.tracadoMassivo = line;

      for (let i = 0; i < encontrados.length - 1; i++) {
        const a = encontrados[i], b = encontrados[i + 1];
        const mid = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
        const d = segDist[i] || getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);

        const html = `<div style="
          background:rgba(15,27,42,.92);
          color:#fff;
          padding:2px 6px;
          border-radius:999px;
          border:1px solid rgba(25,214,143,.55);
          font:800 11px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
          white-space:nowrap;
          box-shadow:0 6px 16px rgba(0,0,0,.18);
        ">${i + 1}-${i + 2}: ${fmtDist(d)}</div>`;

        const segMk = L.marker([mid[0], mid[1]], {
          interactive: false,
          icon: L.divIcon({ className: "analise-seg-label", html, iconSize: null })
        });

        try { analiseSegmentLayer2D.addLayer(segMk); } catch (_) { segMk.addTo(map); }
        window.analiseSegmentMarkers.push(segMk);
      }

      if (modoMapaAtual !== "3d") {
        try { map.fitBounds(L.latLngBounds(coords)); } catch {}
      }
    } else if (coords.length === 1 && modoMapaAtual !== "3d") {
      map.setView(coords[0], 18);
    }

    // Resumo (inclui distância total)
    window.ultimoResumoPostes = {
      total: ids.length,
      encontrados: encontrados.length,
      dist_total_m: totalDist,
      disponiveis: encontrados.filter((p) => (Array.isArray(p.empresas) ? p.empresas.length : 0) <= 4).length,
      ocupados: encontrados.filter((p) => (Array.isArray(p.empresas) ? p.empresas.length : 0) >= 5).length,
      naoEncontrados: ids.filter((id) => !todosPostes.some((p) => normId(p.id) === normId(id))),
      intermediarios: window.intermediarios.length,
    };

    // Painel: contador do projeto
    try {
      setAnaliseInfo(
        `🧮 <b>Projeto</b>: ${encontrados.length} postes • <b>Distância total</b>: ${fmtDist(totalDist)}<br>` +
        `<span style="opacity:.85">Trechos (1-2, 2-3, …) rotulados no mapa.</span>`,
        true
      );
    } catch (_) {}

    // 3D: desenha só os postes da análise + rota (sem refetch) + labels de trecho
    try { desenharAnaliseMassa3D(encontrados, window.intermediariosPostes || []); } catch (_) {}

    if (modoMapaAtual === "3d") {
      try { setModoAnalise3D(true); } catch (_) {}
      try { zoomToListaUniversal(encontrados, true); } catch (_) {}
    } else {
      try { setModoAnalise3D(false); } catch (_) {}
    }

    if (typeof reabrirTooltipFixo === "function") reabrirTooltipFixo(0);
    if (typeof reabrirPopupFixo === "function") reabrirPopupFixo(0);
    atualizar3DSeAtivo();
    if (typeof hideOverlay === "function") hideOverlay();
  };

;

  // Rebind dos botões do DOM após carregamento
  document.addEventListener("DOMContentLoaded", () => {
    const maybeRebind = (id, evt, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener(evt, fn);
    };

    maybeRebind("btnBuscarID", "click", window.buscarID);
    maybeRebind("btnBuscarCoord", "click", window.buscarCoordenada);
    maybeRebind("btnFiltrarLocal", "click", window.filtrarLocal);
    maybeRebind("btnResetarMapa", "click", window.resetarMapa);
    maybeRebind("btnConsultarIDs", "click", window.consultarIDsEmMassa);
  });
})();

/* ====================================================================
   GEOJSON – polígonos de municípios
==================================================================== */
const GEOJSON_BASE = "/data/geojson";

const MUNICIPIOS_META = [
  { id: "aparecida", db: "APARECIDA", label: "APARECIDA", logo: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Bras%C3%A3o_de_Aparecida.jpg" },
  { id: "biritiba", db: "BIRITIBA MIRIM", label: "BIRITIBA MIRIM", logo: "https://upload.wikimedia.org/wikipedia/commons/4/42/Biritiba_Mirim_%28SP%29_-_Brasao.svg" },
  { id: "cacapava", db: "CAÇAPAVA", label: "CAÇAPAVA", logo: "https://www.camaracacapava.sp.gov.br/public/admin/globalarq/uploads/files/brasao-da-cidade.png" },
  { id: "cachoeira", db: "CACHOEIRA PAULISTA", label: "CACHOEIRA PAULISTA", logo: "https://upload.wikimedia.org/wikipedia/commons/3/32/Bras%C3%A3o_de_Cachoeira_Paulista.png" },
  { id: "canas", db: "CANAS", label: "CANAS", logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSg067-ZJ_PZzDuuwryzTkiYYaqXWOhQW2SrQ&s" },
  { id: "caraguatatuba", db: "CARAGUATATUBA", label: "CARAGUATATUBA", logo: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Brasao_Caraguatatuba_SaoPaulo_Brasil.svg" },
  { id: "cruzeiro", db: "CRUZEIRO", label: "CRUZEIRO", logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRVKs5qniu5fCCJ0WNQUyPlTdIZwr7TJAI94w&s" },
  { id: "ferraz", db: "FERRAZ DE VASCONCELOS", label: "FERRAZ DE VASCONCELOS", logo: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Brasao_ferraz.JPG" },
  { id: "guararema", db: "GUARAREMA", label: "GUARAREMA", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a0/Bras%C3%A3o_de_Guararema-SP.png" },
  { id: "guaratingueta", db: "GUARATINGUETÁ", label: "GUARATINGUETÁ", logo: "https://upload.wikimedia.org/wikipedia/commons/1/17/Brasaoguara.jpg" },
  { id: "guarulhos", db: "GUARULHOS", label: "GUARULHOS", logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Bras%C3%A3o_de_Guarulhos.png" },
  { id: "itaquaquecetuba", db: "ITAQUAQUECETUBA", label: "ITAQUAQUECETUBA", logo: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Bras%C3%A3o_de_armas_itaquaquecetuba.jpg" },
  { id: "jacarei", db: "JACAREÍ", label: "JACAREÍ", logo: "https://www.jacarei.sp.leg.br/wp-content/uploads/2018/08/C%C3%A2mara-realiza-audi%C3%AAncia-para-discuss%C3%A3o-do-trabalho-de-revis%C3%A3o-do-Bras%C3%A3o-de-Armas-do-Munic%C3%ADpio.jpg" },
  { id: "jambeiro", db: "JAMBEIRO", label: "JAMBEIRO", logo: "https://upload.wikimedia.org/wikipedia/commons/1/15/Jambeiro%2C_bras%C3%A3o_municipal.png" },
  { id: "lorena", db: "LORENA", label: "LORENA", logo: "https://upload.wikimedia.org/wikipedia/commons/5/5a/Lorena_brasao.png" },
  { id: "mogi", db: "MOGI DAS CRUZES", label: "MOGI DAS CRUZES", logo: "https://upload.wikimedia.org/wikipedia/commons/5/5c/Bras%C3%A3o_de_Mogi_das_Cruzes_%28SP%29.png" },
  { id: "monteirolobato", db: "MONTEIRO LOBATO", label: "MONTEIRO LOBATO", logo: "https://monteirolobato.sp.gov.br/admin/ckeditor/getimage?imageId=41" },
  { id: "pindamonhangaba", db: "PINDAMONHANGABA", label: "PINDAMONHANGABA", logo: "https://upload.wikimedia.org/wikipedia/commons/4/40/Bras%C3%A3o_Pindamonhangaba.png" },
  { id: "poa", db: "POÁ", label: "POÁ", logo: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Brasaopoaense.gif" },
  { id: "potim", db: "POTIM", label: "POTIM", logo: "https://upload.wikimedia.org/wikipedia/commons/6/6d/Potim_brasao.png" },
  { id: "roseira", db: "ROSEIRA", label: "ROSEIRA", logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRZMJ4log_5opnq1asDpe3MAWNJbzxyljyyYg&s" },
  { id: "salesopolis", db: "SALESÓPOLIS", label: "SALESÓPOLIS", logo: "https://upload.wikimedia.org/wikipedia/commons/3/38/Brasao_salesopolis.jpg" },
  { id: "santabranca", db: "SANTA BRANCA", label: "SANTA BRANCA", logo: "https://upload.wikimedia.org/wikipedia/commons/5/5a/Bras%C3%A3o_do_Municipio_de_Santa_Branca-SP.png" },
  { id: "sjc", db: "SÃO JOSÉ DOS CAMPOS", label: "SÃO JOSÉ DOS CAMPOS", logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ-bWQ-MvK79eykZnLcN9fX-IhQiwdakJUyBA&s" },
  { id: "saosebastiao", db: "SÃO SEBASTIÃO", label: "SÃO SEBASTIÃO", logo: "https://upload.wikimedia.org/wikipedia/commons/f/f6/Brasao_saosebastiao.gif" },
  { id: "suzano", db: "SUZANO", label: "SUZANO", logo: "https://upload.wikimedia.org/wikipedia/commons/c/ce/BrasaoSuzano.svg" },
  { id: "taubate", db: "TAUBATÉ", label: "TAUBATÉ", logo: "https://upload.wikimedia.org/wikipedia/commons/9/94/Brasaotaubate.png" },
  { id: "tremembe", db: "TREMEMBÉ", label: "TREMEMBÉ", logo: "https://simbolosmunicipais.com.br/multimidia/sp/sp-tremembe-brasao-tHWCFSiL.jpg" },
];

const MUNI_COLORS = {};
const MUNI_COLORS_PALETTE = [
  "#22c55e", "#3b82f6", "#eab308", "#f97316", "#a855f7",
  "#f43f5e", "#14b8a6", "#6366f1", "#84cc16", "#ec4899",
  "#10b981", "#0ea5e9", "#ef4444", "#8b5cf6", "#06b6d4",
  "#facc15", "#4ade80", "#fb7185", "#f59e0b", "#0f766e"
];
MUNICIPIOS_META.forEach((m, idx) => {
  MUNI_COLORS[m.id] = MUNI_COLORS_PALETTE[idx % MUNI_COLORS_PALETTE.length];
});

const layerMunicipios = L.layerGroup().addTo(map);

async function carregarPoligonosMunicipios(ids) {
  layerMunicipios.clearLayers();

  const alvo = ids && ids.length ? ids : MUNICIPIOS_META.map(m => m.id);

  await Promise.all(
    alvo.map(async (id) => {
      const urls = [
        `${GEOJSON_BASE}/${id}.geojson`,
        `/geojson/${id}.geojson`,
        `/data/geojson/${id}.geojson`,
      ];
      let ultimoErro = null;

      for (const url of urls) {
        try {
          const resp = await fetch(url, { cache: "no-store" });
          if (!resp.ok) {
            ultimoErro = new Error(`HTTP ${resp.status}`);
            continue;
          }
          const geo = await resp.json();
          const meta = MUNICIPIOS_META.find(m => m.id === id);
          const color = meta ? (MUNI_COLORS[meta.id] || "#19d68f") : "#19d68f";

          const poly = L.geoJSON(geo, {
            style: {
              color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.15
            },
            filter: (feature) => {
              const type = feature?.geometry?.type;
              return type !== "Point" && type !== "MultiPoint";
            }
          });
          poly.addTo(layerMunicipios);
          return;
        } catch (e) {
          ultimoErro = e;
        }
      }

      console.error("Erro ao carregar GeoJSON do município:", id, "Detalhe:", ultimoErro);
    })
  );
}

/* ====================================================================
   Modo inicial / modal de seleção
==================================================================== */
let modoAtual = null;
let modalModoEl = null;
const selecionadosSet = new Set();

function buildModalModoInicial() {
  if (modalModoEl) return modalModoEl;

  const backdrop = document.createElement("div");
  backdrop.id = "modalModoInicial";
  backdrop.className = "modo-backdrop";

  const card = document.createElement("div");
  card.className = "modo-card";
  card.innerHTML = `
    <div class="modo-head">
      <div>
        <h2>Como você quer visualizar os postes?</h2>
        <p>Você pode carregar todos os 620 mil postes de uma vez ou focar em um ou mais municípios para deixar o mapa mais leve.</p>
      </div>
      <div class="modo-tag">
        <i class="fa fa-bolt"></i> Carregamento inteligente
      </div>
    </div>

    <div class="modo-footer" style="margin-bottom:6px;">
      <div class="modo-footer-left">
        <button type="button" id="btnModoTodos" class="modo-btn-primary">
          <i class="fa fa-globe"></i> Ver todos os postes
        </button>
        <button type="button" id="btnModoSelecionados" class="modo-btn-secondary">
          <i class="fa fa-layer-group"></i> Carregar municípios selecionados
        </button>
      </div>
      <div class="modo-footer-right">
        <span id="modoCounter" class="modo-counter">Nenhum município selecionado ainda.</span>
      </div>
    </div>

    <div style="font-size:13px;color:#9ca3af;margin-bottom:4px;">
      Selecione abaixo um ou mais municípios para visualizar apenas os postes dessas áreas:
    </div>
    <div id="grid-municipios-modal" class="modo-grid"></div>

    <div class="modo-footer" style="margin-top:14px;">
      <div class="modo-footer-left">
        <span class="modo-counter">
          Dica: para análises focadas (Ministério Público, Prefeituras, etc.), use a opção por município para manter o mapa mais fluido.
        </span>
      </div>
      <div class="modo-footer-right">
        <button type="button" id="btnModoFechar" class="modo-btn-secondary">
          Fechar
        </button>
      </div>
    </div>
  `;

  const grid = card.querySelector("#grid-municipios-modal");
  const counter = card.querySelector("#modoCounter");

  MUNICIPIOS_META.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modo-card-muni";
    btn.dataset.id = m.id;
    btn.innerHTML = `
      <img src="${m.logo}" alt="Prefeitura de ${escapeHtml(m.label)}">
      <span>${escapeHtml(m.label)}</span>
    `;
    btn.addEventListener("click", () => {
      if (selecionadosSet.has(m.id)) {
        selecionadosSet.delete(m.id);
        btn.classList.remove("selected");
      } else {
        selecionadosSet.add(m.id);
        btn.classList.add("selected");
      }
      const n = selecionadosSet.size;
      if (!n) counter.textContent = "Nenhum município selecionado ainda.";
      else if (n === 1) counter.textContent = "1 município selecionado.";
      else counter.textContent = `${n} municípios selecionados.`;
    });
    grid.appendChild(btn);
  });

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const btnTodos = card.querySelector("#btnModoTodos");
  const btnSel = card.querySelector("#btnModoSelecionados");
  const btnFechar = card.querySelector("#btnModoFechar");

  btnTodos.addEventListener("click", () => {
    fecharModalModoInicial();
    modoAtual = "todos";
    showOverlay("Carregando todos os municípios e postes…");
    if (window.userLocationMarker && map.hasLayer(window.userLocationMarker)) {
      map.removeLayer(window.userLocationMarker);
      window.userLocationMarker = null;
    }
    carregarPoligonosMunicipios();
    carregarTodosPostesGradualmente();
  });

  btnSel.addEventListener("click", () => {
    if (!selecionadosSet.size) {
      alert("Selecione ao menos um município para carregar.");
      return;
    }
    const ids = Array.from(selecionadosSet);
    fecharModalModoInicial();
    modoAtual = "municipios";

    const muniDbSet = new Set();
    ids.forEach((id) => {
      const meta = MUNICIPIOS_META.find((m) => m.id === id);
      if (meta) muniDbSet.add(normKey(meta.db));
    });

    showOverlay("Carregando municípios selecionados e respectivos postes…");
    carregarPoligonosMunicipios(ids);
    carregarPostesPorMunicipiosGradual(muniDbSet);
  });

  btnFechar.addEventListener("click", fecharModalModoInicial);

  modalModoEl = backdrop;
  return modalModoEl;
}

function abrirModalModoInicial() {
  const m = buildModalModoInicial();
  m.style.display = "flex";
}

function fecharModalModoInicial() {
  if (modalModoEl) modalModoEl.style.display = "none";
}

function carregarPostesPorMunicipiosGradual(muniDbSet) {
  markers.clearLayers();

  const candidatos = todosPostes.filter((p) =>
    muniDbSet.has(normKey(p.nome_municipio || ""))
  );

  if (!candidatos.length) {
    hideOverlay();
    alert("Nenhum poste encontrado para os municípios selecionados.");
    return;
  }

  const lote = document.hidden ? 3500 : 1200;
  let i = 0;

  function addChunk() {
    const slice = candidatos.slice(i, i + lote);
    const layers = slice.map(criarLayerPoste);
    if (layers.length) { markers.addLayers(layers); refreshClustersSoon(); }
    i += lote;
    if (i < candidatos.length) {
      scheduleIdle(addChunk);
    } else {
      hideOverlay();
      reabrirTooltipFixo(0);
      reabrirPopupFixo(0);
      atualizar3DSeAtivo();
      try {
        const bounds = L.latLngBounds(candidatos.map(p => [p.lat, p.lon]));
        map.fitBounds(bounds);
      } catch {}
    }
  }
  scheduleIdle(addChunk);
}

// ---- Indicadores / BI (refs de gráfico) ----
let chartMunicipiosRef = null;

// ---------------------- HUD na lateral --------------------------------
(function buildHud() {
  const hud = document.getElementById("tempo");
  const painel = document.querySelector(".painel-busca");
  if (!hud || !painel) return;

  const actions = painel.querySelector(".actions");
  hud.classList.add("dock-hud");
  if (actions && actions.parentNode === painel) painel.insertBefore(hud, actions.nextSibling);
  else painel.appendChild(hud);

  hud.innerHTML = "";

  const horaRow = document.createElement("div");
  horaRow.className = "hora-row";
  horaRow.innerHTML = `<span class="dot"></span><span class="hora">--:--</span>`;
  hud.appendChild(horaRow);

  const card = document.createElement("div");
  card.className = "weather-card";
  card.innerHTML = `
    <div class="weather-row">
      <img alt="Clima" src="" />
      <div class="tempo-text">
        <b>Carregando…</b><span> </span><small> </small>
      </div>
    </div>
    <div class="map-row">
      <span class="lbl">Mapa</span>
      <span class="select-wrap">
        <svg class="ico-globe" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="#111827" stroke-width="2" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="#111827" stroke-width="2" />
          <path d="M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" fill="none" stroke="#111827" stroke-width="2"/>
        </svg>
        <select id="select-base">
          <option value="rua">Rua</option>
          <option value="sat">Satélite</option>
          <option value="satlabels">Satélite + rótulos</option>
        </select>
        <svg class="ico-caret" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </div>
  `;
  hud.appendChild(card);

  const selectBase = card.querySelector("#select-base");
  selectBase.addEventListener("change", e => setBase(e.target.value));
})();

// ---------------------------------------------------------------------
// Carrega /api/postes
// ---------------------------------------------------------------------
fetch("/api/postes", { credentials: "include" })
  .then((res) => {
    if (res.status === 401) {
      window.location.href = "/login.html";
      throw new Error("Não autorizado");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((data) => {
    const agrupado = {};

    data.forEach((p) => {
      if (!p.coordenadas) return;
      const [lat, lon] = p.coordenadas.split(/,\s*/).map(Number);
      if (isNaN(lat) || isNaN(lon)) return;

      if (!agrupado[p.id]) {
        agrupado[p.id] = {
          ...p,
          empresas: [],
          lat,
          lon
        };
      }

      const nomeEmpresa = p.empresa && String(p.empresa).toUpperCase() !== "DISPONÍVEL"
        ? p.empresa
        : null;

      if (nomeEmpresa) {
        agrupado[p.id].empresas.push({
          id_insercao: p.id_insercao ?? null,
          nome: nomeEmpresa
        });
      }
    });

    const postsArray = Object.values(agrupado).map((p) => {
      const seen = new Set();
      const empresasUniq = [];
      (p.empresas || []).forEach((e) => {
        const nome = typeof e === "string" ? e : (e.nome || e.empresa || "");
        const idIns = typeof e === "object" && e !== null ? e.id_insercao ?? "" : "";
        const key = `${nome}|${idIns}`;
        if (nome && !seen.has(key)) {
          seen.add(key);
          empresasUniq.push({ id_insercao: idIns || null, nome });
        }
      });
      return { ...p, empresas: empresasUniq };
    });

    postsArray.forEach((poste) => {
      todosPostes.push(poste);
      municipiosSet.add(poste.nome_municipio);
      bairrosSet.add(poste.nome_bairro);
      logradourosSet.add(poste.nome_logradouro);

      poste.empresas.forEach((e) => {
        const nome = typeof e === "string" ? e : (e.nome || e.empresa || "");
        if (!nome) return;
        empresasContagem[nome] = (empresasContagem[nome] || 0) + 1;
      });
    });

    if (typeof window.reconstruirFonte3D === "function") window.reconstruirFonte3D();

    preencherListas();
    hideOverlay();
    abrirModalModoInicial();
  })
  .catch((err) => {
    console.error("Erro ao carregar postes:", err);
    hideOverlay();
    if (err.message !== "Não autorizado") alert("Erro ao carregar dados dos postes.");
  });

// ---------------------------------------------------------------------
// Preenche datalists de autocomplete
// ---------------------------------------------------------------------
function preencherListas() {
  const mount = (set, id) => {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = "";
    Array.from(set).filter(Boolean).sort().forEach((v) => {
      const o = document.createElement("option");
      o.value = v; dl.appendChild(o);
    });
  };
  mount(municipiosSet, "lista-municipios");
  mount(bairrosSet, "lista-bairros");
  mount(logradourosSet, "lista-logradouros");

  const dlEmp = document.getElementById("lista-empresas");
  if (dlEmp) {
    dlEmp.innerHTML = "";
    Object.keys(empresasContagem).sort().forEach((e) => {
      const o = document.createElement("option");
      o.value = e; o.label = `${e} (${empresasContagem[e]} postes)`; dlEmp.appendChild(o);
    });
  }
}

// ---------------------------------------------------------------------
// Geração de Excel no cliente via SheetJS
// ---------------------------------------------------------------------
function gerarExcelCliente(filtroIds) {
  const idSet = new Set((filtroIds || []).map(keyId));
  const dadosParaExcel = [];

  todosPostes
    .filter((p) => idSet.has(keyId(p.id)))
    .forEach((p) => {
      const detalhes = Array.isArray(p.empresas) && p.empresas.length
        ? p.empresas
        : [{ nome: "", id_insercao: "" }];

      detalhes.forEach((e) => {
        const nome = typeof e === "string" ? e : (e.nome || e.empresa || "");
        let idIns = "";
        if (typeof e === "object" && e !== null) {
          idIns = e.id_insercao ?? "";
        } else if (p.id_insercao != null) {
          idIns = p.id_insercao;
        }

        dadosParaExcel.push({
          "ID POSTE": p.id,
          Município: p.nome_municipio,
          Bairro: p.nome_bairro,
          Logradouro: p.nome_logradouro,
          Empresa: nome,
          "ID INSERÇÃO": idIns,
          Coordenadas: p.coordenadas,
        });
      });
    });

  const ws = XLSX.utils.json_to_sheet(dadosParaExcel);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filtro");
  XLSX.writeFile(wb, "relatorio_postes_filtrados.xlsx");
}

// ---------------------------------------------------------------------
// Geração de CSV no cliente (Base44 / EO)
// ---------------------------------------------------------------------
function gerarCSVParaEO(filtroIds) {
  const idSet = new Set((filtroIds || []).map(keyId));
  const headers = [
    "ID",
    "Data Desocupacao",
    "Nome da Empresa",
    "Poste",
    "Tipo",
    "Observacao",
    "Esforco",
    "Cabo/equipamento ativo",
    "Tipo",
    "Ordenacao",
    "Em Uso",
    "Numero Medidor",
    "Municipio"
  ];

  let csvContent = headers.join(";") + "\n";

  todosPostes
    .filter((p) => idSet.has(keyId(p.id)))
    .forEach((p) => {
      const detalhes = Array.isArray(p.empresas) && p.empresas.length
        ? p.empresas
        : [{ nome: "", id_insercao: "" }];

      detalhes.forEach((e) => {
        const nome = typeof e === "string" ? e : (e.nome || e.empresa || "");

        let idIns = "";
        if (typeof e === "object" && e !== null) idIns = e.id_insercao ?? "";
        else if (p.id_insercao != null) idIns = p.id_insercao;

        const row = [
          idIns,
          "",
          nome,
          p.id,
          "",
          "",
          "",
          "",
          "FIBRA",
          "1",
          "",
          "",
          p.nome_municipio
        ];

        const rowString = row.map(val => {
          const v = String(val || "");
          if (v.includes('"') || v.includes(";") || v.includes("\n")) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        }).join(";");

        csvContent += rowString + "\n";
      });
    });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "exportacao_base44.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const gerarCSVParaBase44 = gerarCSVParaEO;

// ---------------------------------------------------------------------
// Modo Censo
// ---------------------------------------------------------------------
document.getElementById("btnCenso")?.addEventListener("click", async () => {
  censoMode = !censoMode;

  markers.clearLayers();
  refreshClustersSoon();

  if (!censoMode) {
    exibirTodosPostes();
    reabrirTooltipFixo(0);
    reabrirPopupFixo(0);
    atualizar3DSeAtivo();
    return;
  }

  if (!censoIds) {
    try {
      const res = await fetch("/api/censo", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      censoIds = new Set(arr.map((i) => String(i.poste)));
    } catch {
      alert("Não foi possível carregar dados do censo.");
      censoMode = false;
      exibirTodosPostes();
      reabrirTooltipFixo(0);
      reabrirPopupFixo(0);
      atualizar3DSeAtivo();
      return;
    }
  }

  todosPostes
    .filter((p) => censoIds.has(String(p.id)))
    .forEach((poste) => {
      const c = L.circleMarker([poste.lat, poste.lon], {
        radius: 6, color: "#666", fillColor: "#bbb", weight: 2, fillOpacity: 0.8
      }).bindTooltip(`ID: ${poste.id}`, { direction: "top", sticky: true });

      c.on("mouseover", () => { lastTip = { id: keyId(poste.id) }; tipPinned = false; });
      c.on("click", (e) => {
        if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
        if (handleSelecaoClick(poste, c)) return;
        lastTip = { id: keyId(poste.id) }; tipPinned = true;
        try { c.openTooltip?.(); } catch {}
        abrirPopup(poste);
      });

      c.posteData = poste;
      markers.addLayer(c);
    });

  refreshClustersSoon();
  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);
  atualizar3DSeAtivo();
});

// ---------------------------------------------------------------------
// Interações / filtros (versões 2D-only)
// ---------------------------------------------------------------------
function buscarID() {
  if (typeof window.buscarID === "function" && window.buscarID !== buscarID) {
    return window.buscarID();
  }
  const id = document.getElementById("busca-id")?.value.trim();
  const p = todosPostes.find((x) => keyId(x.id) === keyId(id));
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], 18);
  abrirPopup(p);
}

function buscarCoordenada() {
  if (typeof window.buscarCoordenada === "function" && window.buscarCoordenada !== buscarCoordenada) {
    return window.buscarCoordenada();
  }
  const inpt = document.getElementById("busca-coord")?.value.trim();
  const [lat, lon] = (inpt || "").split(/,\s*/).map(Number);
  if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
  map.setView([lat, lon], 18);
  L.popup().setLatLng([lat, lon]).setContent(`<b>Coordenada:</b> ${lat}, ${lon}`).openOn(map);
}

function filtrarLocal() {
  if (typeof window.filtrarLocal === "function" && window.filtrarLocal !== filtrarLocal) {
    return window.filtrarLocal();
  }
  const getVal = (id) => (document.getElementById(id)?.value || "").trim().toLowerCase();
  const [mun, bai, log, emp] = ["busca-municipio", "busca-bairro", "busca-logradouro", "busca-empresa"].map(getVal);

  const filtro = todosPostes.filter(
    (p) =>
      (!mun || (p.nome_municipio || "").toLowerCase() === mun) &&
      (!bai || (p.nome_bairro || "").toLowerCase() === bai) &&
      (!log || (p.nome_logradouro || "").toLowerCase() === log) &&
      (!emp || hasEmpresaNome(p, emp))
  );

  if (!filtro.length) return alert("Nenhum poste encontrado com esses filtros.");

  markers.clearLayers();
  refreshClustersSoon();
  filtro.forEach(adicionarMarker);
  refreshClustersSoon();
  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);

  atualizar3DSeAtivo();

  fetch("/api/postes/report", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: filtro.map((p) => p.id) }),
  })
    .then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Não autorizado");
      }
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      return res.blob();
    })
    .then((b) => {
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = "relatorio_postes_filtro_backend.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    })
    .catch((e) => { console.error("Erro exportar filtro:", e); alert("Falha ao gerar Excel backend:\n" + e.message); });

  gerarExcelCliente(filtro.map((p) => p.id));
  gerarCSVParaBase44(filtro.map((p) => p.id));
}


function resetarMapa() {
  // Se o override 3D existir, ele controla o reset (com cache em memória)
  if (typeof window.resetarMapa === "function" && window.resetarMapa !== resetarMapa) {
    return window.resetarMapa();
  }

  limparSelecaoESair({ manterMarcadores: true });
  popupPinned = false; lastPopup = null;
  tipPinned = false; lastTip = null;

  // Se já existe base montada, faz reset rápido (sem recarregar)
  const baseJaMontada = (typeof markers !== "undefined" && typeof markers.getLayers === "function" && markers.getLayers().length > 0);
  if (baseJaMontada) {
    showOverlay("Resetando…");
    try { resetarRapidoBase(); } catch (_) {}
    return;
  }

  // Fallback: ainda não montou base (primeiro carregamento)
  showOverlay("Carregando todos os postes…");
  modoAtual = "todos";
  hardReset();
}


// ---------------------------------------------------------------------
// Street View
// ---------------------------------------------------------------------
function buildGoogleMapsPanoURL(lat, lng) {
  return `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`;
}
function streetImageryBlockHTML(lat, lng, label = "Abrir no Google Street View") {
  const url = buildGoogleMapsPanoURL(lat, lng);
  return `
    <button class="mp-btn-street" type="button" onclick="window.open('${url}','_blank','noopener')">
      ${label}
    </button>
    <div class="mp-street-note">
      *Se não houver cobertura exata no ponto, o Google aproxima para a vista mais próxima.
    </div>
  `.trim();
}

(function addStreetViewControl() {
  const Control = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const div = L.DomUtil.create("div", "leaflet-bar");
      const btn = L.DomUtil.create("a", "", div);
      btn.href = "#";
      btn.title = "Abrir Google Street View no centro do mapa";
      btn.innerHTML = "StreetView";
      btn.style.padding = "6px 8px";
      btn.style.textDecoration = "none";
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        const c = map.getCenter();
        window.open(buildGoogleMapsPanoURL(c.lat, c.lng), "_blank", "noopener");
      });
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  map.addControl(new Control());
})();

// ---------------------------------------------------------------------
// Popup em formato de card
// ---------------------------------------------------------------------
function montarPopupModeloCard(p) {
  const nomesEmpresas = getEmpresasNomesArray(p);
  const detalhes = Array.isArray(p.empresas) && p.empresas.length
    ? p.empresas
    : nomesEmpresas.map((nome) => ({ id_insercao: null, nome }));

  const total = detalhes.length;
  const tituloEmpresas =
    total === 0 ? "Nenhuma empresa cadastrada"
    : total === 1 ? "1 Empresa neste poste"
    : `${total} Empresas neste poste`;

  const idPoste = String(p.id ?? "");
  const rua = (p.nome_logradouro || "-").toString();
  const bairro = (p.nome_bairro || "-").toString();
  const cidade = (p.nome_municipio || "-").toString();
  const coordsText = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

  const linhasEmpresas = detalhes.length
    ? detalhes.map((e) => {
        const nome = typeof e === "string" ? e : (e.nome || e.empresa || "");
        const idIns = typeof e === "object" && e !== null ? (e.id_insercao ?? "") : "";
        return `
          <div class="mp-empresa-item" onclick="toggleEmpresaExtra(this)">
            <div class="mp-empresa-status">
              <span class="mp-status-badge"></span>
            </div>
            <div class="mp-empresa-textos">
              <div class="mp-empresa-nome">${escapeHtml(nome)}</div>
              <div class="mp-empresa-extra">
                ID inserção: <b>${escapeHtml(idIns || "—")}</b>
              </div>
            </div>
            <div class="mp-empresa-arrow">›</div>
          </div>
        `;
      }).join("")
    : `
      <div class="mp-empresa-empty">
        <i>Disponível (sem empresas)</i>
      </div>
    `;

  return `
    <div class="mp-card">
      <div class="mp-header">
        <div class="mp-header-title">${escapeHtml(tituloEmpresas)}</div>
        <div class="mp-header-sub">ID poste: ${escapeHtml(idPoste)}</div>
      </div>

      <div class="mp-local">
        <div class="mp-local-principal">${escapeHtml(rua)}</div>
        <div class="mp-local-secundario">
          ${escapeHtml(bairro)} · ${escapeHtml(cidade)}
        </div>
        <div class="mp-local-coord">
          Coord: ${coordsText}
        </div>
      </div>

      <div class="mp-copy-line">
        <span class="mp-copy-label">ID</span>
        <span class="mp-copy-value">${escapeHtml(idPoste)}</span>
        <button class="mp-copy-btn"
                data-copy="${escapeAttr(idPoste)}"
                onclick="copyBtnHandler(this)"
                title="Copiar ID do poste">
          <i class="fa fa-copy"></i>
        </button>
      </div>

      <div class="mp-copy-line">
        <span class="mp-copy-label">Rua</span>
        <span class="mp-copy-value">${escapeHtml(rua)}</span>
        <button class="mp-copy-btn"
                data-copy="${escapeAttr(rua)}"
                onclick="copyBtnHandler(this)"
                title="Copiar rua">
          <i class="fa fa-copy"></i>
        </button>
      </div>

      <div class="mp-copy-line">
        <span class="mp-copy-label">Coord.</span>
        <span class="mp-copy-value">${coordsText}</span>
        <button class="mp-copy-btn"
                data-copy="${escapeAttr(coordsText)}"
                onclick="copyBtnHandler(this)"
                title="Copiar coordenadas">
          <i class="fa fa-copy"></i>
        </button>
      </div>

      <div class="mp-empresas-lista">
        ${linhasEmpresas}
      </div>

      ${streetImageryBlockHTML(p.lat, p.lon)}
    </div>
  `;
}

function abrirPopup(p) {
  const html = montarPopupModeloCard(p);
  lastPopup = { lat: p.lat, lon: p.lon, html };
  popupPinned = true;
  mainPopup.setLatLng([p.lat, p.lon]).setContent(html);
  if (!map.hasLayer(mainPopup)) mainPopup.addTo(map);
}

// ---------------------------------------------------------------------
// Minha localização
// ---------------------------------------------------------------------
window.userLocationMarker = null;

document.getElementById("localizacaoUsuario")?.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Geolocalização não suportada.");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const latlng = [coords.latitude, coords.longitude];
      if (window.userLocationMarker && map.hasLayer(window.userLocationMarker)) {
        map.removeLayer(window.userLocationMarker);
      }
      window.userLocationMarker = L.marker(latlng).addTo(map).bindPopup("📍 Você está aqui!").openPopup();
      map.setView(latlng, 17);
      obterPrevisaoDoTempo(coords.latitude, coords.longitude);
    },
    () => alert("Erro ao obter localização."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---------------------------------------------------------------------
// Hora local
// ---------------------------------------------------------------------
function mostrarHoraLocal() {
  const s = document.querySelector("#hora span, #tempo .hora-row .hora");
  if (!s) return;
  s.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
setInterval(mostrarHoraLocal, 60000);
mostrarHoraLocal();

// ---------------------------------------------------------------------
// Clima via OpenWeatherMap
// ---------------------------------------------------------------------
function preencherClimaUI(data) {
  const card = document.querySelector("#tempo .weather-card");
  if (!card) return;
  const img = card.querySelector(".weather-row img");
  const t = card.querySelector(".tempo-text");
  try {
    const url = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    img.src = url;
    t.innerHTML = `<b>${data.weather[0].description}</b><span>${data.main.temp.toFixed(1)}°C</span><small>(${data.name})</small>`;
  } catch {
    t.innerHTML = `<b>Erro ao obter clima</b>`;
  }
}
function obterPrevisaoDoTempo(lat, lon) {
  const API_KEY = "b93c96ebf4fef0c26a0caaacdd063ee0";
  fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&lang=pt_br&units=metric&appid=${API_KEY}`)
    .then((r) => r.json())
    .then(preencherClimaUI)
    .catch(() => {
      const t = document.querySelector("#tempo .tempo-text");
      if (t) t.innerHTML = `<b>Erro ao obter clima</b>`;
    });
}
(function initWeather() {
  const fallback = () => obterPrevisaoDoTempo(-23.55, -46.63);
  if (!navigator.geolocation) return fallback();
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => obterPrevisaoDoTempo(coords.latitude, coords.longitude),
    fallback,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
  );
})();

setInterval(() => {
  const fallback = () => obterPrevisaoDoTempo(-23.55, -46.63);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => obterPrevisaoDoTempo(coords.latitude, coords.longitude),
    fallback
  );
}, 600000);

// ---------------------------------------------------------------------
// Consulta massiva + traçado (versão 2D-only)
// ---------------------------------------------------------------------
function consultarIDsEmMassa() {
  if (typeof window.consultarIDsEmMassa === "function" && window.consultarIDsEmMassa !== consultarIDsEmMassa) {
    return window.consultarIDsEmMassa();
  }

  const ids = (document.getElementById("ids-multiplos")?.value || "")
    .split(/[^0-9]+/).filter(Boolean);

  if (!ids.length) return alert("Nenhum ID fornecido.");

  showOverlay("Processando IDs e gerando análise…");

  markers.clearLayers();
  refreshClustersSoon();

  if (window.tracadoMassivo) map.removeLayer(window.tracadoMassivo);
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  window.numeroMarkers = [];

  const encontrados = ids
    .map((id) => todosPostes.find((p) => keyId(p.id) === keyId(id)))
    .filter(Boolean);

  if (!encontrados.length) {
    hideOverlay();
    return alert("Nenhum poste encontrado.");
  }

  encontrados.forEach((p, i) => adicionarNumerado(p, i + 1));

  window.intermediarios = [];
  encontrados.slice(0, -1).forEach((a, i) => {
    const b = encontrados[i + 1];
    const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
    if (d > 50) {
      todosPostes
        .filter((p) => !ids.includes(keyId(p.id)))
        .filter((p) =>
          getDistanciaMetros(a.lat, a.lon, p.lat, p.lon) +
          getDistanciaMetros(b.lat, b.lon, p.lat, p.lon) <= d + 20
        )
        .forEach((p) => {
          const empresasStr = empresasToString(p) || "Disponível";
          const m = L.circleMarker([p.lat, p.lon], {
            radius: 6, color: "gold", fillColor: "yellow", fillOpacity: 0.8
          })
            .bindTooltip(`ID: ${p.id}<br>Empresas: ${empresasStr}`, { direction: "top", sticky: true })
            .on("mouseover", () => { lastTip = { id: keyId(p.id) }; tipPinned = false; })
            .on("click", (e) => {
              if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
              if (handleSelecaoClick(p, m)) return;
              lastTip = { id: keyId(p.id) }; tipPinned = true;
              try { m.openTooltip?.(); } catch {}
              abrirPopup(p);
            })
            .addTo(map);

          m.posteData = p;
          window.intermediarios.push(m);
        });
    }
  });

  map.addLayer(markers);
  refreshClustersSoon();

  const coords = encontrados.map((p) => [p.lat, p.lon]);
  if (coords.length >= 2) {
    window.tracadoMassivo = L.polyline(coords, { color: "blue", weight: 3, dashArray: "4,6" }).addTo(map);
    map.fitBounds(L.latLngBounds(coords));
  } else {
    map.setView(coords[0], 18);
  }

  window.ultimoResumoPostes = {
    total: ids.length,
    disponiveis: encontrados.filter((p) => (Array.isArray(p.empresas) ? p.empresas.length : 0) <= 4).length,
    ocupados: encontrados.filter((p) => (Array.isArray(p.empresas) ? p.empresas.length : 0) >= 5).length,
    naoEncontrados: ids.filter((id) => !todosPostes.some((p) => keyId(p.id) === keyId(id))),
    intermediarios: window.intermediarios.length,
  };

  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);
  atualizar3DSeAtivo();
  hideOverlay();
}

function adicionarNumerado(p, num) {
  const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
  const cor = qtd >= 5 ? "red" : "green";
  const html = `<div style="background:${cor};color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white">${num}</div>`;
  const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ html }) });
  mk.bindTooltip(`${p.id}`, { direction: "top", sticky: true });
  mk.on("mouseover", () => { lastTip = { id: keyId(p.id) }; tipPinned = false; });
  mk.on("click", (e) => {
    if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
    if (handleSelecaoClick(p, mk)) return;
    lastTip = { id: keyId(p.id) }; tipPinned = true;
    try { mk.openTooltip?.(); } catch {}
    abrirPopup(p);
  });
  mk.posteData = p;
  mk.addTo(markers);
  refreshClustersSoon();
  window.numeroMarkers.push(mk);
}

function gerarPDFComMapa() {
  const { jsPDF } = (window.jspdf || {});
  if (!jsPDF) return alert("Biblioteca de PDF (jsPDF) não carregou.");

  const resumo = window.ultimoResumoPostes || {};
  const dist = window.analiseDistancias || {};
  const titulo = "Relatório — Análise de Projeto";
  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const fmtDist = (m) => {
    const n = Number(m || 0);
    if (!isFinite(n)) return "0 m";
    if (n >= 1000) return (n / 1000).toFixed(2).replace(".", ",") + " km";
    return Math.round(n) + " m";
  };

  const addResumo = (yStart) => {
    let y = yStart;
    doc.setFontSize(12);
    doc.text(titulo, 10, y); y += 7;
    doc.setFontSize(10);
    doc.text("Gerado em: " + dataHora, 10, y); y += 8;

    const totalPostes = resumo.encontrados || dist.totalPostes || resumo.total || 0;
    const distTotal = resumo.dist_total_m || dist.totalDist || resumo.dist_total || 0;

    doc.setFontSize(12);
    doc.text(`Postes no projeto: ${totalPostes}`, 10, y); y += 6;
    doc.text(`Distância total: ${fmtDist(distTotal)}`, 10, y); y += 8;

    doc.setFontSize(10);
    if (typeof resumo.disponiveis !== "undefined") { doc.text("✔️ Até 4 empresas: " + (resumo.disponiveis || 0), 10, y); y += 6; }
    if (typeof resumo.ocupados !== "undefined") { doc.text("❌ 5+ empresas: " + (resumo.ocupados || 0), 10, y); y += 6; }
    if (typeof resumo.intermediarios !== "undefined") { doc.text("🟡 Intermediários: " + (resumo.intermediarios || 0), 10, y); y += 6; }

    const nao = Array.isArray(resumo.naoEncontrados) ? resumo.naoEncontrados : [];
    if (nao.length) {
      const txt = ("⚠️ Não encontrados (" + nao.length + "): " + nao.join(", "));
      doc.text(doc.splitTextToSize(txt, 270), 10, y);
      y += 10;
    }
  };

  const finalizar = () => {
    try { doc.save("relatorio_projeto.pdf"); } catch (e) { alert("Falha ao baixar o PDF."); }
  };

  const desenharEsquemaProjetoNoPDF = (docRef, x, y, w, h) => {
    const ptsObj = Array.isArray(window.analiseEncontrados) ? window.analiseEncontrados : [];
    const pts = ptsObj
      .map(p => [Number(p.lon), Number(p.lat)])
      .filter(p => isFinite(p[0]) && isFinite(p[1]));

    if (pts.length < 2) return;

    // Polígono (hull ou bbox)
    let ring = null;
    if (pts.length >= 3) {
      const hull = __convexHullLngLat(pts);
      ring = hull && hull.length ? hull.concat([hull[0]]) : null;
    } else {
      ring = __bboxPolygonLngLat(pts, 45);
    }

    const all = (ring && ring.length >= 4) ? ring : pts;

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of all) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    if (!isFinite(minLng) || !isFinite(minLat) || minLng === maxLng || minLat === maxLat) return;

    // padding
    const padX = (maxLng - minLng) * 0.08;
    const padY = (maxLat - minLat) * 0.08;
    minLng -= padX; maxLng += padX; minLat -= padY; maxLat += padY;

    const proj = (lng, lat) => {
      const px = x + ((lng - minLng) / (maxLng - minLng)) * w;
      const py = y + ((maxLat - lat) / (maxLat - minLat)) * h;
      return [px, py];
    };

    // moldura
    try { docRef.setDrawColor(210, 210, 210); } catch (_) {}
    try { docRef.rect(x, y, w, h); } catch (_) {}

    // desenha polígono
    if (ring && ring.length >= 4) {
      try { docRef.setDrawColor(34, 197, 94); } catch (_) {}
      try { docRef.setLineWidth(0.6); } catch (_) {}
      try { docRef.setLineDashPattern([4, 3], 0); } catch (_) {}
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = proj(ring[i][0], ring[i][1]);
        const [x2, y2] = proj(ring[i + 1][0], ring[i + 1][1]);
        try { docRef.line(x1, y1, x2, y2); } catch (_) {}
      }
      try { docRef.setLineDashPattern([], 0); } catch (_) {}
    }

    // traçado (ordem do projeto)
    const route = ptsObj
      .map(p => [Number(p.lon), Number(p.lat)])
      .filter(p => isFinite(p[0]) && isFinite(p[1]));

    if (route.length >= 2) {
      try { docRef.setDrawColor(37, 99, 235); } catch (_) {}
      try { docRef.setLineWidth(0.7); } catch (_) {}
      try { docRef.setLineDashPattern([3, 3], 0); } catch (_) {}
      for (let i = 0; i < route.length - 1; i++) {
        const [x1, y1] = proj(route[i][0], route[i][1]);
        const [x2, y2] = proj(route[i + 1][0], route[i + 1][1]);
        try { docRef.line(x1, y1, x2, y2); } catch (_) {}
      }
      try { docRef.setLineDashPattern([], 0); } catch (_) {}
    }

    // pontos (início/fim em destaque)
    const drawPoint = (lng, lat, r, fill) => {
      const [px, py] = proj(lng, lat);
      try { docRef.setDrawColor(20, 20, 20); } catch (_) {}
      try { docRef.setFillColor(...fill); } catch (_) {}
      try { docRef.circle(px, py, r, "FD"); } catch (_) {}
    };

    // todos os pontos pequenos
    for (const [lng, lat] of route) drawPoint(lng, lat, 1.1, [249, 115, 22]);

    // início/fim maiores
    if (route.length) {
      drawPoint(route[0][0], route[0][1], 2.0, [34, 197, 94]);
      drawPoint(route[route.length - 1][0], route[route.length - 1][1], 2.0, [239, 68, 68]);
    }

    // legenda
    try {
      docRef.setFontSize(9);
      docRef.text("Esquema vetorial do projeto (polígono + traçado)", x + 2, y + h - 2);
    } catch (_) {}
  };


  const tentarCaptura3D = () => {
    try {
      if (modoMapaAtual !== "3d" || !map3d || !map3dLoaded) return null;
      const c = map3d.getCanvas();
      return c && c.toDataURL ? c.toDataURL("image/png") : null;
    } catch (_) {
      return null;
    }
  };

  const capturarLeafletDataURL = () => new Promise((resolve) => {
    try {
      // tenta trocar momentaneamente para um basemap com CORS (Carto) para permitir canvas
      const hadCarto = map.hasLayer(cartoPositronAll);
      const hadOSM = map.hasLayer(osm);

      try {
        if (!hadCarto) map.addLayer(cartoPositronAll);
        if (hadOSM) map.removeLayer(osm);
      } catch (_) {}

      setTimeout(() => {
        leafletImage(map, (err, canvas) => {
          // restaura basemap original
          try {
            if (!hadCarto && map.hasLayer(cartoPositronAll)) map.removeLayer(cartoPositronAll);
            if (hadOSM && !map.hasLayer(osm)) map.addLayer(osm);
          } catch (_) {}

          if (err || !canvas) return resolve(null);
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch (_) {
            resolve(null);
          }
        });
      }, 180);
    } catch (_) {
      resolve(null);
    }
  });

  (async () => {
    // Tenta captura do 3D primeiro (se estiver no 3D)
    let imgData = tentarCaptura3D();

    // Se não conseguiu, tenta o 2D via leaflet-image
    if (!imgData) imgData = await capturarLeafletDataURL();

    if (imgData) {
      // área para imagem
      doc.addImage(imgData, "PNG", 10, 12, 277, 130, undefined, "FAST");
      addResumo(150);
      finalizar();
      return;
    }

    // Fallback: sem imagem do basemap — desenha esquema vetorial do projeto (polígono + traçado)
    try { desenharEsquemaProjetoNoPDF(doc, 10, 12, 277, 130); } catch (_) {}

    addResumo(150);
    doc.setFontSize(9);
    doc.text("Obs.: o basemap não pôde ser capturado (CORS). Foi gerado um esquema vetorial do projeto.", 10, 195);
    finalizar();
  })();
}

function getDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ===============================
// POLÍGONO DA ANÁLISE (Convex Hull simples) — 2D/3D
// ===============================
function __convexHullLngLat(points) {
  // points: Array<[lng, lat]>
  const pts = (points || [])
    .map(p => [Number(p[0]), Number(p[1])])
    .filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (pts.length < 3) return pts;

  // monotonic chain
  pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  return hull.length ? hull : pts;
}

function __bboxPolygonLngLat(points, paddingMeters = 35) {
  const pts = (points || []).map(p => [Number(p[0]), Number(p[1])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  // padding aproximado em graus
  const padLat = paddingMeters / 110540;
  const midLat = (minLat + maxLat) / 2;
  const padLng = paddingMeters / (111320 * Math.cos((midLat * Math.PI) / 180));
  minLng -= padLng; maxLng += padLng; minLat -= padLat; maxLat += padLat;
  return [[minLng, minLat],[maxLng, minLat],[maxLng, maxLat],[minLng, maxLat],[minLng, minLat]];
}

function desenharPoligonoAnalise2D(encontrados) {
  try {
    if (!Array.isArray(encontrados) || !encontrados.length) return null;
    const ptsLngLat = encontrados.map(p => [Number(p.lon), Number(p.lat)]).filter(p => isFinite(p[0]) && isFinite(p[1]));

    let ring = null;
    if (ptsLngLat.length >= 3) {
      const hull = __convexHullLngLat(ptsLngLat);
      ring = hull.concat([hull[0]]);
    } else {
      ring = __bboxPolygonLngLat(ptsLngLat, 45);
    }
    if (!ring || ring.length < 4) return null;

    try { window.analisePolygonRing = ring; } catch (_) {}

    const latlngs = ring.map(([lng, lat]) => [lat, lng]);
    if (analisePolygon2D) {
      try { analiseLayer2D.removeLayer(analisePolygon2D); } catch (_) {}
      analisePolygon2D = null;
    }
    analisePolygon2D = L.polygon(latlngs, {
      color: "#16a34a",
      weight: 2,
      opacity: 0.9,
      fillColor: "#22c55e",
      fillOpacity: 0.12,
      dashArray: "6,6"
    });
    try { analiseLayer2D.addLayer(analisePolygon2D); } catch (_) { analisePolygon2D.addTo(map); }
    return analisePolygon2D;
  } catch (_) {
    return null;
  }
}

// Exporta Excel genérico (backend)
function exportarExcel(ids) {
  fetch("/api/postes/report", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
    .then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Não autorizado");
      }
      if (!res.ok) {
        let err;
        try { err = (await res.json()).error; } catch {}
        throw new Error(err || `HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then((b) => {
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = "relatorio_postes.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    })
    .catch((e) => { console.error("Erro Excel:", e); alert("Falha ao gerar Excel:\n" + e.message); });
}

// Botão Excel
document.getElementById("btnGerarExcel")?.addEventListener("click", () => {
  if (postesSelecionados.length) {
    const ids = postesSelecionados.map((r) => r.poste.id);
    exportarExcel(ids);
    gerarExcelCliente(ids);
    gerarCSVParaBase44(ids);
    return;
  }

  const ids = (document.getElementById("ids-multiplos")?.value || "")
    .split(/[^0-9]+/).filter(Boolean);
  if (!ids.length) return alert("Informe ao menos um ID ou selecione postes no mapa.");
  exportarExcel(ids);
  gerarExcelCliente(ids);
  gerarCSVParaBase44(ids);
});

// Toggle painel
document.getElementById("togglePainel")?.addEventListener("click", () => {
  const p = document.querySelector(".painel-busca");
  const body = document.body;
  if (!p) return;
  p.classList.toggle("collapsed");
  body.classList.toggle("sidebar-collapsed", p.classList.contains("collapsed"));
  const onEnd = () => { map.invalidateSize(); p.removeEventListener("transitionend", onEnd); };
  p.addEventListener("transitionend", onEnd);
});

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_token");
    document.cookie = "auth_token=; Max-Age=0; path=/; SameSite=Lax";
  } catch {}
  if (navigator.onLine) {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
  }
  window.location.replace("/login.html");
});

/* --------------------------------------------------------------------
   Indicadores (BI)
-------------------------------------------------------------------- */
function agregaPorMunicipio({ empresa = "", apenasVisiveis = false } = {}) {
  const empresaNorm = (empresa || "").trim().toLowerCase();
  const bounds = apenasVisiveis ? map.getBounds() : null;
  const mapa = new Map();
  let total = 0;

  for (const p of todosPostes) {
    if (bounds && !bounds.contains([p.lat, p.lon])) continue;
    if (empresaNorm && !hasEmpresaNome(p, empresaNorm)) continue;

    const key = p.nome_municipio || "—";
    mapa.set(key, (mapa.get(key) || 0) + 1);
    total++;
  }

  const rows = Array.from(mapa.entries())
    .map(([municipio, qtd]) => ({ municipio, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  return { rows, total };
}

function rowsToCSV(rows) {
  const header = "Municipio,Quantidade\n";
  const body = rows
    .map(r => `"${(r.municipio || "").replace(/"/g, '""')}",${r.qtd}`)
    .join("\n");
  return header + body + "\n";
}

function getMunicipioMetaByName(nome) {
  if (!nome) return null;
  const target = normKey(nome);
  return (
    MUNICIPIOS_META.find(m => normKey(m.db) === target || normKey(m.label) === target) ||
    null
  );
}

(function injectExtraPanelButtons() {
  const actions = document.querySelector(".painel-busca .actions");
  if (!actions) return;

  let btnSel = document.getElementById("btnSelecionarPostes");
  if (!btnSel) {
    btnSel = document.createElement("button");
    btnSel.id = "btnSelecionarPostes";
    btnSel.innerHTML = '<i class="fa fa-hand-pointer"></i> Selecionar Postes';
    btnSel.addEventListener("click", () => {
      if (!selecaoAtiva) entrarModoSelecao();
    });
    actions.appendChild(btnSel);
  }

  let btnLimpar = document.getElementById("btnLimparSelecao");
  if (!btnLimpar) {
    btnLimpar = document.createElement("button");
    btnLimpar.id = "btnLimparSelecao";
    btnLimpar.innerHTML = '<i class="fa fa-xmark"></i> Limpar seleção';
    btnLimpar.addEventListener("click", () => limparSelecaoESair());
    actions.appendChild(btnLimpar);
  }

  let btnV = document.getElementById("btnVisualizacao");
  if (btnV) {
    btnV.addEventListener("click", abrirModalModoInicial);
  } else {
    btnV = document.createElement("button");
    btnV.id = "btnVisualizacao";
    btnV.innerHTML = '<i class="fa fa-eye"></i> Visualização';
    btnV.addEventListener("click", abrirModalModoInicial);
    actions.appendChild(btnV);
  }

  let btnI = document.getElementById("btnIndicadores");
  if (btnI) {
    btnI.addEventListener("click", abrirIndicadores);
  } else {
    btnI = document.createElement("button");
    btnI.id = "btnIndicadores";
    btnI.innerHTML = '<i class="fa fa-chart-column"></i> Indicadores';
    btnI.addEventListener("click", abrirIndicadores);
    actions.appendChild(btnI);
  }

  atualizarEstadoBotaoSelecao();
})();

function ensureBIModal() {
  if (document.getElementById("modalIndicadores")) return;

  const backdrop = document.createElement("div");
  backdrop.className = "bi-backdrop";
  backdrop.id = "modalIndicadores";
  backdrop.innerHTML = `
    <div class="bi-card">
      <div class="bi-head">
        <h3>Indicadores de Postes</h3>
        <button id="fecharIndicadores" class="bi-close">Fechar</button>
      </div>

      <div class="bi-body">
        <div>
          <canvas id="chartMunicipios" height="160"></canvas>
        </div>
        <div class="bi-side">
          <label>Filtrar por empresa (opcional)</label>
          <input id="filtroEmpresaBI"
                 list="lista-empresas"
                 placeholder="Ex.: VIVO, CLARO..."
                 class="bi-input">
          <label class="bi-chk">
            <input type="checkbox" id="apenasVisiveisBI">
            Considerar apenas os postes visíveis no mapa
          </label>
          <div id="resumoBI" class="bi-resumo"></div>
          <button id="exportarCsvBI" class="bi-btn">
            <i class="fa fa-file-csv"></i> Exportar CSV
          </button>
        </div>
      </div>

      <div class="bi-table-wrap">
        <div style="overflow:auto;border:1px solid #eee;border-radius:8px;">
          <table id="tabelaMunicipios" class="bi-table">
            <thead>
              <tr>
                <th style="text-align:left;">Município</th>
                <th style="text-align:right;">Qtd. de Postes</th>
                <th style="text-align:right;">Ações</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div id="detalhesMunicipio" class="bi-detalhes" style="display:none;">
          <h4>Detalhes de <span id="detMunicipioNome"></span></h4>
          <div id="detMunicipioResumo" class="bi-detalhes-resumo"></div>

          <div class="bi-detalhes-cols">
            <div>
              <strong>Empresas (todas)</strong>
              <table id="detTabelaEmpresas" class="bi-mini-table">
                <thead>
                  <tr><th>Empresa</th><th class="num">Qtd. postes</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div>
              <strong>Bairros (top 50)</strong>
              <table id="detTabelaBairros" class="bi-mini-table">
                <thead>
                  <tr><th>Bairro</th><th class="num">Qtd. postes</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div>
              <strong>Logradouros (top 50)</strong>
              <table id="detTabelaLogradouros" class="bi-mini-table">
                <thead>
                  <tr><th>Logradouro</th><th class="num">Qtd. postes</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  document.getElementById("fecharIndicadores")?.addEventListener("click", fecharIndicadores);
  document.getElementById("filtroEmpresaBI")?.addEventListener("input", atualizarIndicadores);
  document.getElementById("apenasVisiveisBI")?.addEventListener("change", atualizarIndicadores);

  map.on("moveend zoomend", () => {
    const modal = document.getElementById("modalIndicadores");
    const onlyView = document.getElementById("apenasVisiveisBI");
    if (modal && modal.style.display === "flex" && onlyView && onlyView.checked) {
      atualizarIndicadores();
    }
  });
}

function abrirIndicadores() {
  ensureBIModal();
  const modal = document.getElementById("modalIndicadores");
  if (!modal) return;

  function proceed() {
    modal.style.display = "flex";
    atualizarIndicadores();
  }

  if (typeof Chart === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = proceed;
    s.onerror = proceed;
    document.head.appendChild(s);
  } else {
    proceed();
  }
}

function fecharIndicadores() {
  const m = document.getElementById("modalIndicadores");
  if (m) m.style.display = "none";
}

function getDetalhesMunicipioAgregado(municipio, { empresa = "", apenasVisiveis = false } = {}) {
  const muniNorm = (municipio || "").toLowerCase();
  const empresaNorm = (empresa || "").trim().toLowerCase();
  const bounds = apenasVisiveis ? map.getBounds() : null;

  const empCounts = new Map();
  const bairroCounts = new Map();
  const logCounts = new Map();
  let totalPostes = 0;

  for (const p of todosPostes) {
    if (!p.nome_municipio) continue;
    if (p.nome_municipio.toLowerCase() !== muniNorm) continue;
    if (bounds && !bounds.contains([p.lat, p.lon])) continue;
    if (empresaNorm && !hasEmpresaNome(p, empresaNorm)) continue;

    totalPostes++;

    const bairro = p.nome_bairro || "—";
    bairroCounts.set(bairro, (bairroCounts.get(bairro) || 0) + 1);

    const log = p.nome_logradouro || "—";
    logCounts.set(log, (logCounts.get(log) || 0) + 1);

    const emps = getEmpresasNomesArray(p);
    if (!emps || !emps.length) continue;

    const seen = new Set();
    for (const raw of emps) {
      const nome = (raw || "").trim();
      if (!nome || seen.has(nome)) continue;
      seen.add(nome);
      empCounts.set(nome, (empCounts.get(nome) || 0) + 1);
    }
  }

  const toRows = (m, limit) => {
    let arr = Array.from(m.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
    if (typeof limit === "number") arr = arr.slice(0, limit);
    return arr;
  };

  return {
    totalPostes,
    totalEmpresas: empCounts.size,
    empresasRows: toRows(empCounts),
    bairrosRows: toRows(bairroCounts, 50),
    logradourosRows: toRows(logCounts, 50),
  };
}

function montarLinhasMiniTabela(rows) {
  if (!rows.length) {
    return `<tr><td colspan="2" style="padding:4px 6px;color:#6b7280;">Sem dados.</td></tr>`;
  }
  return rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.nome)}</td><td class="num">${r.qtd.toLocaleString("pt-BR")}</td></tr>`
    )
    .join("");
}

function mostrarDetalhesMunicipio(municipio) {
  const box = document.getElementById("detalhesMunicipio");
  const nomeEl = document.getElementById("detMunicipioNome");
  const resumoEl = document.getElementById("detMunicipioResumo");
  if (!box || !nomeEl || !resumoEl) return;

  const empresa = document.getElementById("filtroEmpresaBI")?.value || "";
  const apenasVisiveis = !!document.getElementById("apenasVisiveisBI")?.checked;

  const det = getDetalhesMunicipioAgregado(municipio, { empresa, apenasVisiveis });

  nomeEl.textContent = municipio;

  resumoEl.innerHTML =
    `Postes no município${empresa ? ` para <b>${escapeHtml(empresa)}</b>` : ""}: <b>${det.totalPostes.toLocaleString("pt-BR")}</b>` +
    ` · Empresas distintas: <b>${det.totalEmpresas.toLocaleString("pt-BR")}</b>` +
    `<br>Distribuição de postes por <b>empresa</b>, <b>bairro</b> e <b>logradouro</b>.`;

  const empTb = document.querySelector("#detTabelaEmpresas tbody");
  const baiTb = document.querySelector("#detTabelaBairros tbody");
  const logTb = document.querySelector("#detTabelaLogradouros tbody");

  if (empTb) empTb.innerHTML = montarLinhasMiniTabela(det.empresasRows);
  if (baiTb) baiTb.innerHTML = montarLinhasMiniTabela(det.bairrosRows);
  if (logTb) logTb.innerHTML = montarLinhasMiniTabela(det.logradourosRows);

  box.style.display = det.totalPostes ? "block" : "none";
}

function attachChartClickHandler() {
  if (!chartMunicipiosRef) return;
  chartMunicipiosRef.options.onClick = (evt, elements) => {
    if (!elements || !elements.length) return;
    const first = elements[0];
    const idx = first.index;
    const label = chartMunicipiosRef.data.labels[idx];
    if (label) mostrarDetalhesMunicipio(label);
  };
  chartMunicipiosRef.update();
}

function atualizarIndicadores() {
  const empresa = document.getElementById("filtroEmpresaBI")?.value || "";
  const apenasVisiveis = !!document.getElementById("apenasVisiveisBI")?.checked;

  const { rows, total } = agregaPorMunicipio({ empresa, apenasVisiveis });

  const tb = document.querySelector("#tabelaMunicipios tbody");
  if (tb) {
    tb.innerHTML =
      rows.map((r) => {
        const meta = getMunicipioMetaByName(r.municipio);
        const logo = meta ? meta.logo : "";
        return `
          <tr data-municipio="${escapeAttr(r.municipio)}">
            <td>
              <div class="bi-muni-cell">
                ${logo ? `<img src="${escapeAttr(logo)}" alt="${escapeAttr(r.municipio)}" class="bi-muni-logo">` : ""}
                <span class="bi-muni-name">${escapeHtml(r.municipio)}</span>
              </div>
            </td>
            <td class="num">${r.qtd.toLocaleString("pt-BR")}</td>
            <td class="num">
              <button type="button" class="bi-ver-empresas" data-municipio="${escapeAttr(r.municipio)}">
                <i class="fa fa-building"></i> Ver empresas
              </button>
            </td>
          </tr>`;
      }).join("") ||
      `<tr><td colspan="3" style="padding:10px;color:#6b7280;">Sem dados para os filtros.</td></tr>`;

    tb.onclick = (ev) => {
      const btn = ev.target.closest(".bi-ver-empresas");
      if (btn && btn.dataset.municipio) {
        mostrarDetalhesMunicipio(btn.dataset.municipio);
        return;
      }
      const tr = ev.target.closest("tr[data-municipio]");
      if (!tr || !tr.dataset.municipio) return;
      mostrarDetalhesMunicipio(tr.dataset.municipio);
    };
  }

  const resumo = document.getElementById("resumoBI");
  if (resumo) {
    const txtEmp = empresa ? ` para <b>${empresa}</b>` : "";
    const txtScope = apenasVisiveis ? " (apenas área visível)" : "";
    resumo.innerHTML = `Total de postes${txtEmp}: <b>${total.toLocaleString("pt-BR")}</b>${txtScope}`;
  }

  const chartRows = rows.slice(0, 20);
  const labels = chartRows.map((r) => r.municipio);
  const data = chartRows.map((r) => r.qtd);
  const ctx = document.getElementById("chartMunicipios");

  if (typeof Chart !== "undefined" && ctx) {
    if (chartMunicipiosRef) {
      chartMunicipiosRef.data.labels = labels;
      chartMunicipiosRef.data.datasets[0].data = data;
      chartMunicipiosRef.update();
    } else {
      chartMunicipiosRef = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{ label: "Postes por município", data }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { autoSkip: false, maxRotation: 75, minRotation: 45 } },
            y: { beginAtZero: true },
          },
        },
      });
    }
    attachChartClickHandler();
  }

  const btnCsv = document.getElementById("exportarCsvBI");
  if (btnCsv) {
    btnCsv.onclick = () => {
      const csv = rowsToCSV(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sufixo = empresa ? `_${empresa.replace(/\W+/g, "_")}` : "";
      a.href = url;
      a.download = `postes_por_municipio${sufixo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }

  if (!rows.length) {
    const box = document.getElementById("detalhesMunicipio");
    if (box) box.style.display = "none";
  }
}

/* ====================================================================
   Reabertura do tooltip/popup após reconstrução do cluster
==================================================================== */
markers.on("animationend", () => { reabrirTooltipFixo(0); reabrirPopupFixo(0); });
markers.on("spiderfied", () => { reabrirTooltipFixo(0); reabrirPopupFixo(0); });
markers.on("unspiderfied", () => { reabrirTooltipFixo(0); reabrirPopupFixo(0); });
map.on("layeradd", (ev) => { if (ev.layer === markers) { reabrirTooltipFixo(120); } });

window.getMapa3D = () => map3d;
window.getModoMapaAtual = () => modoMapaAtual;
// =====================================================================
//  🚗 ADDON — Simulação de Carrinho no Mapa 3D (colar no final do script.js)
// =====================================================================

/* ====================================================================
   CSS do painel de simulação
==================================================================== */
(function injectCarAnimationStyles() {
  const css = `
    #carSimPanel {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2500;
      display: none;
      flex-direction: column;
      gap: 0;
      min-width: 380px;
      max-width: 96vw;
      font-family: 'Segoe UI', system-ui, sans-serif;
      filter: drop-shadow(0 8px 32px rgba(0,0,0,.38));
    }
    #carSimPanel.visible {
      display: flex;
      animation: carPanelIn .3s cubic-bezier(.34,1.56,.64,1) both;
    }
    @keyframes carPanelIn {
      from { opacity:0; transform: translateX(-50%) translateY(18px) scale(.95); }
      to   { opacity:1; transform: translateX(-50%) translateY(0)    scale(1);   }
    }
    .car-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 10px 14px 8px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border-radius: 16px 16px 0 0;
      border: 1px solid rgba(99,232,180,.25); border-bottom: none;
    }
    .car-panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 700; color: #f1f5f9; letter-spacing: .3px;
    }
    .car-panel-title .car-icon-wrap {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #19d68f, #0ea5e9);
      border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px;
    }
    .car-panel-badge {
      background: rgba(99,232,180,.15); border: 1px solid rgba(99,232,180,.30);
      color: #6ee7b7; border-radius: 999px; padding: 2px 8px;
      font-size: 10px; font-weight: 700; letter-spacing: .5px;
    }
    .car-panel-close {
      background: rgba(255,255,255,.08); border: none; border-radius: 8px;
      color: #94a3b8; width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 14px; transition: background .15s, color .15s;
    }
    .car-panel-close:hover { background: rgba(255,255,255,.15); color: #f1f5f9; }
    .car-panel-body {
      background: rgba(15,23,42,.92); backdrop-filter: blur(12px) saturate(1.4);
      border: 1px solid rgba(99,232,180,.18); border-top: none;
      border-radius: 0 0 16px 16px; padding: 12px 14px 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .car-progress-wrap { display: flex; align-items: center; gap: 8px; }
    .car-progress-track {
      flex: 1; height: 6px; background: rgba(255,255,255,.10);
      border-radius: 999px; overflow: hidden; position: relative;
    }
    .car-progress-fill {
      height: 100%; width: 0%; border-radius: 999px;
      background: linear-gradient(90deg, #19d68f, #0ea5e9);
      transition: width .1s linear; position: relative;
    }
    .car-progress-fill::after {
      content: ''; position: absolute; right: 0; top: 50%;
      transform: translateY(-50%); width: 10px; height: 10px;
      background: #fff; border-radius: 50%;
      box-shadow: 0 0 6px #19d68f, 0 0 12px #0ea5e9;
    }
    .car-progress-pct {
      font-size: 11px; font-weight: 700; color: #94a3b8; min-width: 34px; text-align: right;
    }
    .car-segment-info { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #64748b; }
    .car-segment-info .car-seg-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #19d68f;
      box-shadow: 0 0 6px #19d68f; flex-shrink: 0;
      animation: carDotPulse 1.2s ease-in-out infinite;
    }
    @keyframes carDotPulse {
      0%,100% { box-shadow: 0 0 4px #19d68f; transform: scale(1); }
      50%      { box-shadow: 0 0 10px #19d68f, 0 0 18px #0ea5e9; transform: scale(1.3); }
    }
    .car-segment-info .car-seg-dot.paused {
      animation: none; background: #f59e0b; box-shadow: 0 0 6px #f59e0b;
    }
    .car-seg-text { color: #94a3b8; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .car-seg-dist { color: #6ee7b7; font-weight: 700; white-space: nowrap; }
    .car-controls { display: flex; align-items: center; gap: 8px; }
    .car-btn {
      border: none; border-radius: 10px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 5px;
      font-size: 12px; font-weight: 600;
      transition: transform .12s, box-shadow .12s, background .15s; white-space: nowrap;
    }
    .car-btn:active { transform: scale(.94); }
    .car-btn-play {
      background: linear-gradient(135deg, #19d68f, #0ea5e9);
      color: #0f172a; padding: 8px 16px; flex: 1; font-size: 13px;
    }
    .car-btn-play:hover { box-shadow: 0 4px 14px rgba(25,214,143,.4); }
    .car-btn-stop {
      background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.30);
      color: #fca5a5; padding: 8px 12px;
    }
    .car-btn-stop:hover { background: rgba(239,68,68,.25); }
    .car-btn-loop {
      background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.30);
      color: #a5b4fc; padding: 8px 12px;
    }
    .car-btn-loop:hover { background: rgba(99,102,241,.25); }
    .car-btn-loop.active {
      background: rgba(99,102,241,.30); border-color: rgba(99,102,241,.6); color: #818cf8;
    }
    .car-speed-row { display: flex; align-items: center; gap: 10px; }
    .car-speed-label { font-size: 11px; color: #64748b; white-space: nowrap; }
    .car-speed-slider-wrap { flex: 1; position: relative; height: 14px; display: flex; align-items: center; }
    .car-speed-track {
      flex: 1; height: 4px; background: rgba(255,255,255,.10);
      border-radius: 999px; position: relative;
    }
    .car-speed-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #19d68f, #0ea5e9); pointer-events: none; }
    .car-speed-thumb {
      position: absolute; top: 50%; transform: translate(-50%,-50%);
      width: 14px; height: 14px; background: #fff; border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,.4); pointer-events: none;
    }
    input.car-speed-input {
      -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
      background: transparent; outline: none; border: none; cursor: pointer;
      position: absolute; inset: 0; width: 100%; opacity: 0;
    }
    .car-speed-val { font-size: 11px; font-weight: 700; color: #6ee7b7; min-width: 48px; text-align: right; }
    .car-stats { display: flex; gap: 6px; }
    .car-stat {
      flex: 1; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
      border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px;
    }
    .car-stat-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    .car-stat-value { font-size: 13px; font-weight: 800; color: #e2e8f0; line-height: 1; }
    .car-stat-value.highlight { color: #6ee7b7; }
    .car-no-route { text-align: center; padding: 8px 0 2px; font-size: 12px; color: #64748b; line-height: 1.5; }
    .car-no-route strong { display: block; color: #94a3b8; font-size: 13px; margin-bottom: 2px; }
    #btnCarroSimulacao { position: relative; overflow: hidden; grid-column: 1 / -1; }
    #btnCarroSimulacao::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(90deg, transparent, rgba(25,214,143,.15), transparent);
      transform: translateX(-100%); animation: carBtnShine 2.5s ease-in-out infinite;
    }
    @keyframes carBtnShine {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(100%); }
      100% { transform: translateX(100%); }
    }
  `;
  const s = document.createElement("style");
  s.id = "car-animation-styles";
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ====================================================================
   SVG do carrinho (top-down, aponta para Norte = heading 0)
==================================================================== */
const SVG_CAR_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" width="64" height="96">
  <defs>
    <radialGradient id="bodyGrad" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="100%" stop-color="#16a34a"/>
    </radialGradient>
    <filter id="carGlow">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <ellipse cx="32" cy="84" rx="16" ry="5" fill="rgba(0,0,0,0.25)"/>
  <rect x="10" y="22" width="44" height="58" rx="10" fill="url(#bodyGrad)" stroke="#15803d" stroke-width="1.5" filter="url(#carGlow)"/>
  <rect x="15" y="26" width="34" height="24" rx="6" fill="#bfdbfe" stroke="#93c5fd" stroke-width="1" opacity="0.9"/>
  <rect x="13" y="26" width="4" height="18" rx="2" fill="#15803d"/>
  <rect x="47" y="26" width="4" height="18" rx="2" fill="#15803d"/>
  <rect x="14" y="10" width="36" height="14" rx="7" fill="#22c55e" stroke="#15803d" stroke-width="1.2"/>
  <rect x="20" y="8" width="24" height="6" rx="3" fill="#16a34a" stroke="#14532d" stroke-width="1"/>
  <ellipse cx="22" cy="9" rx="4" ry="3" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>
  <ellipse cx="42" cy="9" rx="4" ry="3" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>
  <ellipse cx="18" cy="78" rx="5" ry="3.5" fill="#fca5a5" stroke="#dc2626" stroke-width="1"/>
  <ellipse cx="46" cy="78" rx="5" ry="3.5" fill="#fca5a5" stroke="#dc2626" stroke-width="1"/>
  <ellipse cx="16" cy="32" rx="7" ry="7" fill="#1f2937" stroke="#374151" stroke-width="1.5"/>
  <ellipse cx="16" cy="32" rx="3.5" ry="3.5" fill="#6b7280"/>
  <ellipse cx="48" cy="32" rx="7" ry="7" fill="#1f2937" stroke="#374151" stroke-width="1.5"/>
  <ellipse cx="48" cy="32" rx="3.5" ry="3.5" fill="#6b7280"/>
  <ellipse cx="16" cy="68" rx="7" ry="7" fill="#1f2937" stroke="#374151" stroke-width="1.5"/>
  <ellipse cx="16" cy="68" rx="3.5" ry="3.5" fill="#6b7280"/>
  <ellipse cx="48" cy="68" rx="7" ry="7" fill="#1f2937" stroke="#374151" stroke-width="1.5"/>
  <ellipse cx="48" cy="68" rx="3.5" ry="3.5" fill="#6b7280"/>
</svg>`;

/* ====================================================================
   IDs das camadas do carrinho
==================================================================== */
const CAR_SOURCE_ID     = "car-anim-source";
const CAR_LAYER_ID      = "car-anim-layer";
const CAR_TRAIL_SRC_ID  = "car-trail-source";
const CAR_TRAIL_LINE_ID = "car-trail-layer";
const CAR_TRAIL_GLOW_ID = "car-trail-glow";
const CAR_ROUTE_SRC_ID  = "car-full-route-source";
const CAR_ROUTE_LINE_ID = "car-full-route-layer";
const CAR_IMG_NAME      = "car-sprite-3d";

/* ====================================================================
   Estado da animação
==================================================================== */
let _carRoute        = [];
let _carAnimRunning  = false;
let _carAnimPaused   = false;
let _carAnimLoop     = false;
let _carAnimRafId    = null;
let _carAnimT        = 0;
let _carAnimSpeed    = 0.00055;
let _carTrailCoords  = [];
const CAR_TRAIL_MAX  = 60;

/* ====================================================================
   Helpers geométricos
==================================================================== */
function _carHaversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _carInterpolate(route, t) {
  if (!route.length) return null;
  if (route.length === 1) return { coord: route[0], bearing: 0, segIdx: 0, donekm: 0, totalKm: 0 };

  const dists = [0];
  for (let i = 1; i < route.length; i++)
    dists.push(dists[i-1] + _carHaversineKm(route[i-1], route[i]));

  const total  = dists[dists.length - 1];
  const target = Math.min(t, 0.9999) * total;

  let segIdx = 0;
  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= target) { segIdx = i - 1; break; }
  }
  segIdx = Math.min(segIdx, route.length - 2);

  const segLen = dists[segIdx + 1] - dists[segIdx];
  const localT = segLen > 0 ? (target - dists[segIdx]) / segLen : 0;
  const [x0, y0] = route[segIdx];
  const [x1, y1] = route[segIdx + 1];
  const coord   = [x0 + (x1 - x0) * localT, y0 + (y1 - y0) * localT];
  const bearing = (Math.atan2(x1 - x0, y1 - y0) * 180 / Math.PI + 360) % 360;

  return { coord, bearing, segIdx, totalKm: total, donekm: target };
}

/* ====================================================================
   Registra o sprite SVG no MapLibre
==================================================================== */
async function _registerCarSprite() {
  const m3d = window.getMapa3D ? window.getMapa3D() : null;
  if (!m3d || m3d.hasImage(CAR_IMG_NAME)) return;

  const blob = new Blob([SVG_CAR_SPRITE], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);

  await new Promise((resolve) => {
    const img = new Image(64, 96);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale  = 2;
      canvas.width  = 64 * scale;
      canvas.height = 96 * scale;
      canvas.getContext("2d", { alpha: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      try {
        m3d.addImage(CAR_IMG_NAME, {
          width: canvas.width, height: canvas.height, data: imageData.data
        }, { pixelRatio: scale });
      } catch (_) {}
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    img.src = url;
  });
}

/* ====================================================================
   Garante que as camadas do carrinho existem no mapa 3D
==================================================================== */
function _ensureCarLayers() {
  const m3d = window.getMapa3D ? window.getMapa3D() : null;
  if (!m3d) return;

  if (!m3d.getSource(CAR_ROUTE_SRC_ID)) {
    m3d.addSource(CAR_ROUTE_SRC_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!m3d.getLayer(CAR_ROUTE_LINE_ID)) {
    m3d.addLayer({ id: CAR_ROUTE_LINE_ID, type: "line", source: CAR_ROUTE_SRC_ID,
      paint: { "line-color": "#6ee7b7", "line-width": 3, "line-opacity": 0.22, "line-dasharray": [3, 5] } });
  }

  if (!m3d.getSource(CAR_TRAIL_SRC_ID)) {
    m3d.addSource(CAR_TRAIL_SRC_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!m3d.getLayer(CAR_TRAIL_GLOW_ID)) {
    m3d.addLayer({ id: CAR_TRAIL_GLOW_ID, type: "line", source: CAR_TRAIL_SRC_ID,
      paint: { "line-color": "#34d399", "line-width": 10, "line-opacity": 0.18, "line-blur": 4 } });
  }
  if (!m3d.getLayer(CAR_TRAIL_LINE_ID)) {
    m3d.addLayer({ id: CAR_TRAIL_LINE_ID, type: "line", source: CAR_TRAIL_SRC_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#6ee7b7", "line-width": 3, "line-opacity": 0.80 } });
  }

  if (!m3d.getSource(CAR_SOURCE_ID)) {
    m3d.addSource(CAR_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!m3d.getLayer(CAR_LAYER_ID)) {
    m3d.addLayer({ id: CAR_LAYER_ID, type: "symbol", source: CAR_SOURCE_ID,
      layout: {
        "icon-image": CAR_IMG_NAME,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.32, 17, 0.52, 20, 0.82],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport"
      },
      paint: { "icon-opacity": 1 }
    });
  }
}

/* ====================================================================
   Atualiza as fontes GeoJSON a cada frame
==================================================================== */
function _updateCarSources(coord, bearing) {
  const m3d = window.getMapa3D ? window.getMapa3D() : null;
  if (!m3d) return;

  const carSrc = m3d.getSource(CAR_SOURCE_ID);
  if (carSrc) {
    carSrc.setData({ type: "FeatureCollection", features: [{
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: { bearing }
    }]});
  }

  _carTrailCoords.push(coord);
  if (_carTrailCoords.length > CAR_TRAIL_MAX) _carTrailCoords.shift();

  const trailSrc = m3d.getSource(CAR_TRAIL_SRC_ID);
  if (trailSrc && _carTrailCoords.length >= 2) {
    trailSrc.setData({ type: "FeatureCollection", features: [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: [..._carTrailCoords] },
      properties: {}
    }]});
  }
}

/* ====================================================================
   Atualiza UI do painel
==================================================================== */
function _updateCarUI(t, result) {
  const fill     = document.getElementById("carProgressFill");
  const pct      = document.getElementById("carProgressPct");
  const dot      = document.getElementById("carSegDot");
  const segTx    = document.getElementById("carSegText");
  const segDi    = document.getElementById("carSegDist");
  const statDone = document.getElementById("carStatDone");
  const statTot  = document.getElementById("carStatTotal");
  const statSeg  = document.getElementById("carStatSeg");
  const statSpd  = document.getElementById("carStatSpeed");

  const pctVal = Math.min(Math.round(t * 100), 100);
  if (fill) fill.style.width = pctVal + "%";
  if (pct)  pct.textContent  = pctVal + "%";
  if (dot)  dot.classList.toggle("paused", _carAnimPaused);

  if (result) {
    const doneKm  = (result.donekm  || 0).toFixed(2);
    const totalKm = (result.totalKm || 0).toFixed(2);
    const seg     = result.segIdx + 1;
    const totalSeg = _carRoute.length - 1;
    const kmh      = Math.round(_carAnimSpeed * 80000);
    if (segTx)    segTx.textContent   = `Segmento ${seg} / ${totalSeg}`;
    if (segDi)    segDi.textContent   = `${doneKm} km`;
    if (statDone) statDone.textContent = doneKm + " km";
    if (statTot)  statTot.textContent  = totalKm + " km";
    if (statSeg)  statSeg.textContent  = `${seg} / ${totalSeg}`;
    if (statSpd)  statSpd.textContent  = kmh + " km/h";
  }
}

/* ====================================================================
   Loop de animação (requestAnimationFrame)
==================================================================== */
function _carAnimLoopFn() {
  if (!_carAnimRunning) return;

  if (!_carAnimPaused) {
    _carAnimT += _carAnimSpeed;
    if (_carAnimT >= 1) {
      if (_carAnimLoop) {
        _carAnimT = 0;
        _carTrailCoords = [];
      } else {
        _carAnimT = 1;
        _carAnimRunning = false;
        _updateCarPlayBtn(false);
        _updateCarUI(1, null);
        return;
      }
    }
  }

  const result = _carInterpolate(_carRoute, _carAnimT);
  if (result) {
    _updateCarSources(result.coord, result.bearing);
    _updateCarUI(_carAnimT, result);
  }

  _carAnimRafId = requestAnimationFrame(_carAnimLoopFn);
}

function _updateCarPlayBtn(playing) {
  const btn = document.getElementById("carBtnPlay");
  if (!btn) return;
  btn.innerHTML = playing
    ? '<i class="fa fa-pause"></i> Pausar'
    : '<i class="fa fa-play"></i>  Iniciar';
}

/* ====================================================================
   Constrói a rota: postes selecionados → fallback 30 postes próximos
==================================================================== */
function _buildCarRoute() {
  if (typeof postesSelecionados !== "undefined" && postesSelecionados.length >= 2) {
    return postesSelecionados.map(r => [Number(r.poste.lon), Number(r.poste.lat)]);
  }
  if (typeof todosPostes === "undefined" || !todosPostes.length) return [];

  const m3d = window.getMapa3D ? window.getMapa3D() : null;
  const ctr = m3d ? m3d.getCenter() : { lat: -23.2, lng: -45.9 };
  return [...todosPostes]
    .sort((a, b) =>
      _carHaversineKm([a.lon, a.lat], [ctr.lng, ctr.lat]) -
      _carHaversineKm([b.lon, b.lat], [ctr.lng, ctr.lat])
    )
    .slice(0, 30)
    .map(p => [Number(p.lon), Number(p.lat)]);
}



/* ====================================================================
   Ferramenta de MEDIÇÃO (2D + 3D)
   - Clique 1x para marcar o 1º ponto, clique no 2º ponto para medir
   - Se clicar em vários pontos, soma e mostra distância total
   - Mostra também a distância de cada trecho (1-2, 2-3, …)
   - ESC desliga o modo medir
==================================================================== */
(function initFerramentaMedicaoV2() {
  let medicaoAtiva = false;

  // Evita "ponto duplo" quando o clique vem de marcador/layer (o evento também dispara no mapa)
  let ignoreNextMapClick2D = false;
  let ignoreNextMapClick3D = false;

  window.__medicaoIgnoreNextMapClick2D = function(){ ignoreNextMapClick2D = true; };
  window.__medicaoIgnoreNextMapClick3D = function(){ ignoreNextMapClick3D = true; };

  // ---------- Helpers ----------
  function fmtDist(m) {
    const n = Number(m || 0);
    if (!isFinite(n)) return "0 m";
    if (n >= 1000) return (n / 1000).toFixed(2).replace(".", ",") + " km";
    return Math.round(n) + " m";
  }
  function setBtnActive(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", !!on);
  }
  function setInfo(html, show = true) {
    const box = document.getElementById("medidaInfo");
    if (!box) return;
    box.innerHTML = html || "";
    box.style.display = show ? "block" : "none";
  }

  // ---------- 2D ----------
  const grupoMedida2D = L.layerGroup().addTo(map);
  let pontos2D = [];

  function render2D() {
    grupoMedida2D.clearLayers();

    if (!pontos2D.length) {
      setInfo("", false);
      return;
    }

    // Linha
    L.polyline(pontos2D, {
      color: "#2563eb",
      weight: 3,
      opacity: 0.95,
      dashArray: "6,6"
    }).addTo(grupoMedida2D);

    // Pontos + segmentos
    let total = 0;
    let ultimoTrecho = 0;

    pontos2D.forEach((p, idx) => {
      // ponto
      const mk = L.circleMarker(p, {
        radius: 5,
        weight: 2,
        color: "#ffffff",
        fillColor: "#2563eb",
        fillOpacity: 1
      }).addTo(grupoMedida2D);

      // trechos (label no meio do trecho)
      if (idx >= 1) {
        const a = pontos2D[idx - 1];
        const b = pontos2D[idx];
        const d = a.distanceTo(b);
        total += d;
        ultimoTrecho = d;

        const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
        const html = `
          <div style="
            background:rgba(15,27,42,.92);
            color:#fff;
            padding:2px 6px;
            border-radius:999px;
            border:1px solid rgba(25,214,143,.55);
            font:800 11px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
            white-space:nowrap;
            box-shadow:0 6px 16px rgba(0,0,0,.18);
          ">${idx}-${idx + 1}: ${fmtDist(d)}</div>`;
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({ className: "measure-seg-label", html, iconSize: null })
        }).addTo(grupoMedida2D);
      }

      // label total no último ponto
      if (idx === pontos2D.length - 1) {
        const tip = L.tooltip({
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "measure-tooltip"
        }).setContent(`📏 ${fmtDist(total)} (${pontos2D.length} pts)`);
        mk.bindTooltip(tip).openTooltip();
      }
    });

    if (pontos2D.length === 1) {
      setInfo(`📏 <b>Selecione o 2º ponto</b> • 1 ponto marcado`, true);
    } else {
      setInfo(`📏 Total: <b>${fmtDist(total)}</b> • Último trecho: <b>${fmtDist(ultimoTrecho)}</b> • ${pontos2D.length} pontos`, true);
    }
  }

  function addPoint2D(latlng) {
    if (!medicaoAtiva) return;
    if (!latlng) return;
    const last = pontos2D[pontos2D.length - 1];
    if (last && typeof last.distanceTo === "function" && last.distanceTo(latlng) < 0.5) return; // evita duplo-clique no mesmo ponto
    pontos2D.push(latlng);
    render2D();
  }

  // Clique no mapa
  map.on("click", (e) => {
    if (!medicaoAtiva) return;
    if (ignoreNextMapClick2D) { ignoreNextMapClick2D = false; return; }
    if (typeof window.getModoMapaAtual === "function" && window.getModoMapaAtual() !== "2d") return;
    addPoint2D(e.latlng);
  });

  // API p/ clique em marcadores (quando o usuário clicar no poste)
  window.__medicaoAddPoint2D = function (latlng) {
    try { addPoint2D(latlng); } catch (_) {}
  };

  // ---------- 3D (MapLibre) ----------
  const MEASURE3D_SOURCE = "medir-geojson";
  const MEASURE3D_LINE = "medir-linha";
  const MEASURE3D_POINTS = "medir-pontos";
  const MEASURE3D_LABELS = "medir-labels";

  let pontos3D = [];

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const lat1 = toRad(a[1]), lon1 = toRad(a[0]);
    const lat2 = toRad(b[1]), lon2 = toRad(b[0]);
    const dlat = lat2 - lat1;
    const dlon = lon2 - lon1;
    const s = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function ensureMeasure3D() {
    if (!map3d) return;

    const run = () => {
      try {
        if (!map3d.getSource(MEASURE3D_SOURCE)) {
          map3d.addSource(MEASURE3D_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] }
          });
        }

        if (!map3d.getLayer(MEASURE3D_LINE)) {
          map3d.addLayer({
            id: MEASURE3D_LINE,
            type: "line",
            source: MEASURE3D_SOURCE,
            filter: ["==", ["get", "kind"], "line"],
            paint: {
              "line-color": "#2563eb",
              "line-width": 4,
              "line-opacity": 0.95,
              "line-dasharray": [2, 2]
            }
          });
        }

        if (!map3d.getLayer(MEASURE3D_POINTS)) {
          map3d.addLayer({
            id: MEASURE3D_POINTS,
            type: "circle",
            source: MEASURE3D_SOURCE,
            filter: ["==", ["get", "kind"], "pt"],
            paint: {
              "circle-radius": 6,
              "circle-color": "#2563eb",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2
            }
          });
        }

        if (!map3d.getLayer(MEASURE3D_LABELS)) {
          map3d.addLayer({
            id: MEASURE3D_LABELS,
            type: "symbol",
            source: MEASURE3D_SOURCE,
            filter: ["==", ["get", "kind"], "lbl"],
            minzoom: 13,
            layout: {
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-offset": [0, -1.2],
              "text-allow-overlap": true,
              "text-ignore-placement": true
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#0f172a",
              "text-halo-width": 1.2
            }
          });
        }

        if (!ensureMeasure3D._bound) {
          ensureMeasure3D._bound = true;
          map3d.on("click", (ev) => {
            if (!medicaoAtiva) return;
            if (ignoreNextMapClick3D) { ignoreNextMapClick3D = false; return; }
            if (typeof window.getModoMapaAtual === "function" && window.getModoMapaAtual() !== "3d") return;
            const lngLat = ev.lngLat;
            if (!lngLat) return;
            addPoint3D([Number(lngLat.lng), Number(lngLat.lat)]);
          });
        }
      } catch (e) {
        console.warn("Medir 3D não inicializou:", e);
      }
    };

    if (map3dLoaded) run();
    else try { map3d.once("load", run); } catch (_) {}
  }

  function render3D() {
    if (!map3d || !map3dLoaded) return;
    ensureMeasure3D();
    const src = map3d.getSource(MEASURE3D_SOURCE);
    if (!src) return;

    const features = [];

    if (pontos3D.length >= 2) {
      features.push({
        type: "Feature",
        properties: { kind: "line" },
        geometry: { type: "LineString", coordinates: pontos3D }
      });
    }

    pontos3D.forEach((c) => {
      features.push({
        type: "Feature",
        properties: { kind: "pt" },
        geometry: { type: "Point", coordinates: c }
      });
    });

    let total = 0;
    let ultimoTrecho = 0;

    for (let i = 1; i < pontos3D.length; i++) {
      const a = pontos3D[i - 1];
      const b = pontos3D[i];
      const d = haversineM(a, b);
      total += d;
      ultimoTrecho = d;

      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      features.push({
        type: "Feature",
        properties: { kind: "lbl", label: `${i}-${i + 1}: ${fmtDist(d)}` },
        geometry: { type: "Point", coordinates: mid }
      });
    }

    if (pontos3D.length >= 2) {
      const last = pontos3D[pontos3D.length - 1];
      features.push({
        type: "Feature",
        properties: { kind: "lbl", label: `📏 Total: ${fmtDist(total)}` },
        geometry: { type: "Point", coordinates: last }
      });
      setInfo(`📏 Total: <b>${fmtDist(total)}</b> • Último trecho: <b>${fmtDist(ultimoTrecho)}</b> • ${pontos3D.length} pontos`, true);
    } else if (pontos3D.length === 1) {
      setInfo(`📏 <b>Selecione o 2º ponto</b> • 1 ponto marcado`, true);
    } else {
      setInfo("", false);
    }

    try {
      src.setData({ type: "FeatureCollection", features });
    } catch (_) {}
  }

  function addPoint3D(coord) {
    if (!medicaoAtiva) return;
    if (!coord || coord.length < 2) return;
    const last = pontos3D[pontos3D.length - 1];
    if (last && haversineM(last, coord) < 0.5) return; // evita ponto duplo
    pontos3D.push(coord);
    render3D();
  }

  window.__medicaoAddPoint3D = function (coord) {
    try { addPoint3D(coord); } catch (_) {}
  };

  // ---------- API pública ----------
  window.toggleMedicao = function () {
    medicaoAtiva = !medicaoAtiva;
    setBtnActive("btnMedir", medicaoAtiva);

    if (medicaoAtiva) {
      if (typeof window.getModoMapaAtual === "function" && window.getModoMapaAtual() === "3d") {
        ensureMeasure3D();
      }
      setInfo("📏 <b>Modo medir ativo</b> • clique no mapa (ou no poste) para marcar pontos • <b>ESC</b> para sair", true);
    } else {
      setInfo("", false);
      ignoreNextMapClick2D = false;
      ignoreNextMapClick3D = false;
    }
    return medicaoAtiva;
  };

  window.limparMedicao = function () {
    pontos2D = [];
    pontos3D = [];
    ignoreNextMapClick2D = false;
    ignoreNextMapClick3D = false;
    try { grupoMedida2D.clearLayers(); } catch (_) {}

    if (map3d && map3dLoaded) {
      ensureMeasure3D();
      try {
        const src = map3d.getSource(MEASURE3D_SOURCE);
        if (src) src.setData({ type: "FeatureCollection", features: [] });
      } catch (_) {}
    }

    setInfo("", false);
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && medicaoAtiva) {
      medicaoAtiva = false;
      ignoreNextMapClick2D = false;
      ignoreNextMapClick3D = false;
      setBtnActive("btnMedir", false);
      setInfo("", false);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && medicaoAtiva) {
      if (typeof window.getModoMapaAtual === "function" && window.getModoMapaAtual() === "3d") ensureMeasure3D();
    }
  });

  window.isMedicaoAtiva = () => medicaoAtiva;
})();



// Inicializa o estado do botão de trechos quando a página carregar
try {
  document.addEventListener("DOMContentLoaded", () => {
    try { __atualizarEstadoBtnTrechosAnalise(); } catch (_) {}
  });
} catch (_) {}
