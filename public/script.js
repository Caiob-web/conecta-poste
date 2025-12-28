// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
//  (Street View via link público do Google — sem API, sem custo)
//  ✅ Postes em bolinhas (circleMarker)
//  ✅ Transformadores: ícone PNG (se existir) com fallback embutido + popup completo
// =====================================================================

// ------------------------- Estilos do HUD (hora/tempo/mapa) ----------
(function injectHudStyles() {
  const css = `
    /* HUD raiz (caixa externa) */
    #tempo{
      display:flex; flex-direction:column; gap:10px; padding:12px 14px;
      border-radius:14px; background:rgba(255,255,255,0.92);
      box-shadow:0 8px 24px rgba(0,0,0,0.12); backdrop-filter:saturate(1.15) blur(2px);
    }
    /* Hora */
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
    /* Cartão do clima + seletor */
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
    /* Linha do seletor de mapa dentro do cartão */
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

    /* ---- Modal Indicadores (BI) ---- */
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

    /* Detalhes por município */
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

    /* Garante tooltip acima de labels/polylines */
    .leaflet-tooltip-pane{ z-index: 650 !important; pointer-events:auto; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ====================================================================
   Estilos do popup tipo “card”
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

    /* Linhas com botão de copiar */
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
(function injectDockSidebarStyles(){
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
  const style = document.createElement('style');
  style.id = 'dock-sidebar-styles';
  style.textContent = css;
  document.head.appendChild(style);

  window.addEventListener('DOMContentLoaded', () => {
    const tgl = document.getElementById('togglePainel');
    if (tgl) tgl.innerHTML = '<i class="fa fa-chevron-right"></i>';
  });
})();

/* ====================================================================
   CLUSTER: mostrar SÓ NÚMEROS (sem bolhas)
==================================================================== */
(function injectClusterNumberStyles(){
  const css = `
    .cluster-num-only{
      background:transparent !important; border:none !important; box-shadow:none !important;
      color:#111827; font: 800 14px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      text-shadow: 0 0 3px #fff, 0 0 6px rgba(255,255,255,.9);
      transform: translate(-50%, -50%); user-select:none; pointer-events:auto;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// ------------------------- Mapa & Camadas base -----------------------
const map = L.map("map").setView([-23.2, -45.9], 12);

// Base layers
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });
const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });

const labelsPane = map.createPane("labels");
labelsPane.style.zIndex = 640;
labelsPane.style.pointerEvents = "none";
const cartoLabels = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png", {
  pane: "labels", maxZoom: 19, subdomains: "abcd"
});
const satComRotulos = L.layerGroup([esriSat, cartoLabels]);

osm.addTo(map);

// estilo dos pontos (postes)
function dotStyle(qtdEmpresas){
  return {
    radius: 6,
    color: "#fff",
    weight: 1,
    fillColor: (qtdEmpresas >= 5 ? "#d64545" : "#24a148"),
    fillOpacity: 0.95
  };
}

// alternância programática (usada pelo seletor)
let currentBase = osm;
function setBase(mode) {
  if (map.hasLayer(currentBase)) map.removeLayer(currentBase);
  if (mode === "sat") currentBase = esriSat;
  else if (mode === "satlabels") currentBase = satComRotulos;
  else currentBase = osm;
  currentBase.addTo(map);
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

// Spinner overlay
const overlay = document.getElementById("carregando");
if (overlay) overlay.style.display = "flex";

/* ====================================================================
   TRANSFORMADORES — camada própria
   ✅ Usa PNG /assets/transformador.png se existir
   ✅ Se não existir, usa fallback embutido (sem 404 no console)
   ✅ Popup mostra TODAS as colunas da tabela
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

  // atualiza os ícones do HTML (sidebar/legenda)
  document.querySelectorAll('img[data-icon="transformador"]').forEach((el) => {
    el.src = TRANSFORMADOR_PNG_URL;
    el.onerror = () => { el.src = TRANSFORMADOR_FALLBACK_DATAURI; };
  });

  return ICON_TRANSFORMADOR;
}

// pane transformadores
const transformadoresPane = map.createPane("transformadores");
transformadoresPane.style.zIndex = 635;

// cluster transformadores
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

function normKey(k){
  return String(k || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function buildNormMap(obj){
  const m = new Map();
  for (const [k, v] of Object.entries(obj || {})) m.set(normKey(k), v);
  return m;
}
function pickAny(obj, candidates = []){
  const m = buildNormMap(obj);
  for (const c of candidates){
    const v = m.get(normKey(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}
function extractLatLon(t){
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
function formatAny(v){
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

      const key = String(pickAny(t, ["id","id_transformador","codigo","cod_transformador"]) ?? idx);
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

/* ====================================================================
   Transformadores: toggle NÃO carrega mais na abertura
   Só busca dados quando o usuário marcar o checkbox
==================================================================== */
function syncTransformadoresToggle() {
  const chk = document.getElementById("chkTransformadores");
  if (!chk) return;

  // Garante que, na abertura, os transformadores NÃO estão visíveis
  chk.checked = false;
  if (map.hasLayer(transformadoresMarkers)) {
    map.removeLayer(transformadoresMarkers);
  }

  const onChange = async () => {
    if (chk.checked) {
      if (!map.hasLayer(transformadoresMarkers)) {
        map.addLayer(transformadoresMarkers);
      }
      await carregarTransformadores();
    } else {
      if (map.hasLayer(transformadoresMarkers)) {
        map.removeLayer(transformadoresMarkers);
      }
    }
  };

  chk.addEventListener("change", onChange);
}
window.addEventListener("DOMContentLoaded", syncTransformadoresToggle);

// -------------------- Cluster (só números) ---------------------------
const markers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
  chunkedLoading: true,
  chunkDelay: 5,
  chunkInterval: 50,
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

// -------------------- Carregamento GRADATIVO GLOBAL ------------------
const idToMarker = new Map();   // cache: id(string) -> L.Layer
let todosCarregados = false;
function keyId(id){ return String(id); }
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
function scheduleIdle(fn){ document.hidden ? setTimeout(fn, 0) : idle(fn); }
function refreshClustersSoon(){ requestAnimationFrame(() => markers.refreshClusters()); }

/* ====================================================================
   Popup fixo: instância única, sem piscar
==================================================================== */
const mainPopup = L.popup({ closeOnClick:false, autoClose:false, maxWidth:360 });
let popupPinned = false;
let lastPopup = null;

function reabrirPopupFixo(delay = 0){
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
let tipPinned = false;   // true após clique (para manter aberto)
let lastTip = null;      // { id }

function reabrirTooltipFixo(delay = 0) {
  if (!lastTip || !tipPinned) return;
  const open = () => {
    const layer = idToMarker.get(keyId(lastTip.id));
    if (layer && markers.hasLayer(layer)) { try { layer.openTooltip(); } catch {} }
  };
  delay ? setTimeout(open, delay) : open();
}

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

// Cria (ou retorna do cache) o layer do poste (BOLINHA)
function criarLayerPoste(p){
  const key = keyId(p.id);
  if (idToMarker.has(key)) return idToMarker.get(key);

  const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
  const txtQtd = qtd ? `${qtd} ${qtd === 1 ? "empresa" : "empresas"}` : "Disponível";

  const layer = L.circleMarker([p.lat, p.lon], dotStyle(qtd))
    .bindTooltip(`ID: ${p.id} — ${txtQtd}`, { direction: "top", sticky: true })
    .on("mouseover", () => { lastTip = { id: key }; tipPinned = false; })
    .on("click", (e) => {
      if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      lastTip = { id: key }; tipPinned = true;
      try { layer.openTooltip?.(); } catch {}
      abrirPopup(p);
    });

  layer.posteData = p;
  idToMarker.set(key, layer);
  return layer;
}

// Reconstrói tudo do zero (modo “cura tudo”)
function hardReset(){
  markers.clearLayers();
  idToMarker.clear();
  const layers = todosPostes.map(criarLayerPoste);
  if (layers.length) markers.addLayers(layers);
  refreshClustersSoon();
}

// Adiciona 1 poste
function adicionarMarker(p) {
  const layer = criarLayerPoste(p);
  if (!markers.hasLayer(layer)) { markers.addLayer(layer); refreshClustersSoon(); }
}

// Exibe TODOS os já criados no cache
function exibirTodosPostes() {
  const arr = Array.from(idToMarker.values());
  markers.clearLayers();
  if (arr.length) markers.addLayers(arr);
  refreshClustersSoon();
  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);
}

// Carrega gradativamente TODOS os postes (uma vez)
function carregarTodosPostesGradualmente() {
  if (todosCarregados) { exibirTodosPostes(); return; }
  const lote = document.hidden ? 3500 : 1200;
  let i = 0;
  function addChunk() {
    const slice = todosPostes.slice(i, i + lote);
    const layers = slice.map(criarLayerPoste);
    if (layers.length) { markers.addLayers(layers); refreshClustersSoon(); }
    i += lote;
    if (i < todosPostes.length) scheduleIdle(addChunk);
    else { todosCarregados = true; reabrirTooltipFixo(0); reabrirPopupFixo(0); }
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
// Carrega /api/postes, trata 401 redirecionando
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
    if (overlay) overlay.style.display = "none";
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

    preencherListas();
    carregarTodosPostesGradualmente();
  })
  .catch((err) => {
    console.error("Erro ao carregar postes:", err);
    if (overlay) overlay.style.display = "none";
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
        const idIns = typeof e === "object" && e !== null ? (e.id_insercao ?? "") : "";

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
        lastTip = { id: keyId(poste.id) }; tipPinned = true;
        try{ c.openTooltip?.(); } catch {}
        abrirPopup(poste);
      });

      c.posteData = poste;
      markers.addLayer(c);
    });

  refreshClustersSoon();
  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);
});

// ---------------------------------------------------------------------
// Interações / filtros
// ---------------------------------------------------------------------
function buscarID() {
  const id = document.getElementById("busca-id")?.value.trim();
  const p = todosPostes.find((x) => keyId(x.id) === keyId(id));
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], 18);
  abrirPopup(p);
}

function buscarCoordenada() {
  const inpt = document.getElementById("busca-coord")?.value.trim();
  const [lat, lon] = (inpt || "").split(/,\s*/).map(Number);
  if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
  map.setView([lat, lon], 18);
  L.popup().setLatLng([lat, lon]).setContent(`<b>Coordenada:</b> ${lat}, ${lon}`).openOn(map);
}

function filtrarLocal() {
  const getVal = (id) => (document.getElementById(id)?.value || "").trim().toLowerCase();
  const [mun, bai, log, emp] = ["busca-municipio","busca-bairro","busca-logradouro","busca-empresa"].map(getVal);

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
}

function resetarMapa() {
  popupPinned = false; lastPopup = null;
  tipPinned = false; lastTip = null;
  hardReset();
  reabrirTooltipFixo(0);
  reabrirPopupFixo(0);
}

// ---------------------------------------------------------------------
// Street View (link público)
// ---------------------------------------------------------------------
function buildGoogleMapsPanoURL(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
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
// Popup em formato de card com id_insercao + botões de copiar
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

// Abre popup fixo
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
document.getElementById("localizacaoUsuario")?.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Geolocalização não suportada.");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const latlng = [coords.latitude, coords.longitude];
      L.marker(latlng).addTo(map).bindPopup("📍 Você está aqui!").openPopup();
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
// Verificar (Consulta massiva + traçado + intermediários)
// ---------------------------------------------------------------------
function consultarIDsEmMassa() {
  const ids = (document.getElementById("ids-multiplos")?.value || "")
    .split(/[^0-9]+/).filter(Boolean);

  if (!ids.length) return alert("Nenhum ID fornecido.");

  markers.clearLayers();
  refreshClustersSoon();

  if (window.tracadoMassivo) map.removeLayer(window.tracadoMassivo);
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  window.numeroMarkers = [];

  const encontrados = ids
    .map((id) => todosPostes.find((p) => keyId(p.id) === keyId(id)))
    .filter(Boolean);

  if (!encontrados.length) return alert("Nenhum poste encontrado.");

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
              lastTip = { id: keyId(p.id) }; tipPinned = true;
              try{ m.openTooltip?.(); }catch{}
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
}

// Adiciona marcador numerado (para análise)
function adicionarNumerado(p, num) {
  const qtd = Array.isArray(p.empresas) ? p.empresas.length : 0;
  const cor = qtd >= 5 ? "red" : "green";
  const html = `<div style="background:${cor};color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white">${num}</div>`;
  const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ html }) });
  mk.bindTooltip(`${p.id}`, { direction: "top", sticky: true });
  mk.on("mouseover", () => { lastTip = { id: keyId(p.id) }; tipPinned = false; });
  mk.on("click", (e) => {
    if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
    lastTip = { id: keyId(p.id) }; tipPinned = true;
    try{ mk.openTooltip?.(); }catch{}
    abrirPopup(p);
  });
  mk.posteData = p;
  mk.addTo(markers);
  refreshClustersSoon();
  window.numeroMarkers.push(mk);
}

function gerarPDFComMapa() {
  if (!window.tracadoMassivo) return alert("Gere primeiro um traçado.");
  leafletImage(map, (err, canvas) => {
    if (err) return alert("Erro ao capturar imagem.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, 270, 120);
    const resumo = window.ultimoResumoPostes || { disponiveis: 0, ocupados: 0, naoEncontrados: [], intermediarios: 0 };
    let y = 140; doc.setFontSize(12);
    doc.text("Resumo da Verificação:", 10, y);
    doc.text(`✔️ Disponíveis: ${resumo.disponiveis}`, 10, y + 10);
    doc.text(`❌ Indisponíveis: ${resumo.ocupados}`, 10, y + 20);
    if (resumo.naoEncontrados.length) {
      const textoIds = resumo.naoEncontrados.join(", ");
      doc.text([`⚠️ Não encontrados (${resumo.naoEncontrados.length}):`, textoIds], 10, y + 30);
    } else {
      doc.text("⚠️ Não encontrados: 0", 10, y + 30);
    }
    doc.text(`🟡 Intermediários: ${resumo.intermediarios}`, 10, y + 50);
    doc.save("tracado_postes.pdf");
  });
}

// Distância em metros (haversine)
function getDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const ids = (document.getElementById("ids-multiplos")?.value || "")
    .split(/[^0-9]+/).filter(Boolean);
  if (!ids.length) return alert("Informe ao menos um ID.");
  exportarExcel(ids);
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
   === Indicadores (BI)
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
    .map(r => `"${(r.municipio || "").replace(/"/g,'""')}",${r.qtd}`)
    .join("\n");
  return header + body + "\n";
}

// botão "Indicadores" no painel
(function injectBIButton(){
  const actions = document.querySelector(".painel-busca .actions");
  if (!actions) return;
  if (!document.getElementById("btnIndicadores")) {
    const btn = document.createElement("button");
    btn.id = "btnIndicadores";
    btn.innerHTML = '<i class="fa fa-chart-column"></i> Indicadores';
    btn.addEventListener("click", abrirIndicadores);
    actions.appendChild(btn);
  }
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
              <strong>Empresas (top 15)</strong>
              <table id="detTabelaEmpresas" class="bi-mini-table">
                <thead>
                  <tr><th>Empresa</th><th class="num">Qtd. postes</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div>
              <strong>Bairros (top 15)</strong>
              <table id="detTabelaBairros" class="bi-mini-table">
                <thead>
                  <tr><th>Bairro</th><th class="num">Qtd. postes</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div>
              <strong>Logradouros (top 15)</strong>
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

  const toRows = (m, limit = 15) =>
    Array.from(m.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, limit);

  return {
    totalPostes,
    totalEmpresas: empCounts.size,
    empresasRows: toRows(empCounts, 15),
    bairrosRows: toRows(bairroCounts, 15),
    logradourosRows: toRows(logCounts, 15),
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
    ` · Empresas distintas: <b>${det.totalEmpresas.toLocaleString("pt-BR")}</b>`;

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
      rows.map((r) =>
        `<tr data-municipio="${escapeAttr(r.municipio)}"><td>${r.municipio}</td><td class="num">${r.qtd.toLocaleString("pt-BR")}</td></tr>`
      ).join("") ||
      `<tr><td colspan="2" style="padding:10px;color:#6b7280;">Sem dados para os filtros.</td></tr>`;

    tb.onclick = (ev) => {
      const tr = ev.target.closest("tr");
      if (!tr || !tr.dataset || !tr.dataset.municipio) return;
      mostrarDetalhesMunicipio(tr.dataset.municipio);
    };
  }

  const resumo = document.getElementById("resumoBI");
  if (resumo) {
    const txtEmp = empresa ? ` para <b>${empresa}</b>` : "";
    const txtScope = apenasVisiveis ? " (apenas área visível)" : "";
    resumo.innerHTML = `Total de postes${txtEmp}: <b>${total.toLocaleString("pt-BR")}</b>${txtScope}`;
  }

  const labels = rows.map((r) => r.municipio);
  const data = rows.map((r) => r.qtd);
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
            x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 45 } },
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
markers.on("spiderfied",   () => { reabrirTooltipFixo(0); reabrirPopupFixo(0); });
markers.on("unspiderfied", () => { reabrirTooltipFixo(0); reabrirPopupFixo(0); });
map.on("layeradd", (ev) => { if (ev.layer === markers) reabrirTooltipFixo(120); });
