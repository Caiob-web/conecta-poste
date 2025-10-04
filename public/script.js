// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
//  (Street View via link público do Google — sem API, sem custo)
// =====================================================================

// ------------------------- Estilos do HUD (hora/tempo/mapa) ----------
(function injectHudStyles() {
  const css = `
    /* HUD raiz (caixa externa) */
    #tempo{
      display:flex;
      flex-direction:column;
      gap:10px;
      padding:12px 14px;
      border-radius:14px;
      background:rgba(255,255,255,0.92);
      box-shadow:0 8px 24px rgba(0,0,0,.12);
      backdrop-filter:saturate(1.15) blur(2px);
    }
    /* Hora */
    #tempo .hora-row{
      display:flex;
      align-items:center;
      gap:8px;
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:#0f172a;
      font-weight:700;
    }
    #tempo .hora-row .dot{
      width:10px;height:10px;border-radius:50%;
      background:linear-gradient(180deg,#1e3a8a,#2563eb);
      box-shadow:0 0 0 2px #e5e7eb inset;
      display:inline-block;
    }

    /* Cartão do clima + seletor */
    #tempo .weather-card{
      display:flex;
      flex-direction:column;
      gap:10px;
      padding:12px 14px;
      border-radius:12px;
      background:rgba(255,255,255,0.95);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
      min-width:260px;
    }
    #tempo .weather-row{
      display:flex;
      align-items:center;
      gap:10px;
      min-height:40px;
    }
    #tempo .weather-row img{ width:28px; height:28px; object-fit:contain; }
    #tempo .tempo-text{ display:flex; flex-direction:column; gap:2px; font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#1f2937; }
    #tempo .tempo-text b{ font-weight:700; }
    #tempo .tempo-text small{ color:#6b7280; }

    /* Linha do seletor de mapa dentro do cartão */
    #tempo .map-row{
      margin-top:6px;
      padding-top:8px;
      border-top:1px dashed rgba(0,0,0,.10);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    #tempo .map-row .lbl{
      font: 12px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      letter-spacing:.2px;
      color:#475569;
      font-weight:700;
    }
    #tempo .select-wrap{
      position:relative; display:inline-flex; align-items:center; gap:8px;
      padding:8px 36px 8px 12px; border:1px solid #e5e7eb; border-radius:999px;
      background:#ffffff; transition:border-color .15s ease, box-shadow .15s ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
    }
    #tempo .select-wrap:focus-within{ border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.20); }
    #tempo .select-wrap .ico-globe{ width:16px;height:16px;opacity:.75; }
    #tempo .select-wrap .ico-caret{
      position:absolute; right:10px; width:14px; height:14px; opacity:.6; pointer-events:none;
    }
    #tempo select{ appearance:none; border:0; outline:none; background:transparent; padding:0; margin:0; font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; cursor:pointer; }

    /* ---- Modal Indicadores (BI) ---- */
    .bi-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:4000;background:rgba(0,0,0,.35);}
    .bi-card{width:min(960px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.2);font-family:'Segoe UI',system-ui;}
    .bi-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee;}
    .bi-head h3{margin:0;font-weight:700;color:#111827;font-size:16px}
    .bi-close{border:0;background:#f3f4f6;color:#111827;border-radius:8px;padding:6px 10px;cursor:pointer}
    .bi-body{padding:12px 16px;display:grid;grid-template-columns:1fr 320px;gap:12px;}
    .bi-side label{font-size:13px;color:#374151}
    .bi-input{padding:8px;border:1px solid #ddd;border-radius:8px;width:100%}
    .bi-chk{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px;color:#374151;}
    .bi-resumo{margin-top:8px;font-size:13px;color:#111827;}
    .bi-btn{margin-top:8px;border:1px solid #ddd;background:#fff;border-radius:8px;padding:8px;cursor:pointer}
    .bi-table-wrap{padding:0 16px 16px 16px;}
    .bi-table{width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:8px;overflow:auto}
    .bi-table thead{background:#f9fafb}
    .bi-table th,.bi-table td{padding:10px;border-bottom:1px solid #eee}
    .bi-table td.num{text-align:right}
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
      position: fixed !important;
      top: 0; right: 0; height: 100vh; width: var(--dock-w);
      overflow: auto; overflow-x: hidden;
      border-left: 2px solid var(--ui-border, #19d68f);
      border-radius: 0 !important;
      padding: 12px 12px 20px;
      transform: translateX(0%); transition: transform .25s ease;
      z-index: 1000; box-sizing: border-box;
    }
    .painel-busca .actions{
      display: grid !important; grid-template-columns: repeat(2, 1fr) !important;
      gap: 10px !important; margin-top: 6px;
    }
    .painel-busca.collapsed{ transform: translateX(100%); }

    #togglePainel{
      position: fixed !important; top: 50%;
      right: calc(var(--dock-w) + 6px); transform: translateY(-50%);
      width: 42px; height: 64px; border-radius: 10px 0 0 10px !important;
      background: var(--ui-bg, #0f1b2a) !important;
      border: 1px solid var(--ui-border, #19d68f) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.28) !important; z-index: 1100;
      display:flex;align-items:center;justify-content:center;
    }
    body.sidebar-collapsed #togglePainel{ right: 6px !important; }
    #togglePainel i{ transition: transform .2s ease; }
    body.sidebar-collapsed #togglePainel i{ transform: scaleX(-1); }

    #localizacaoUsuario, #logoutBtn{
      position: fixed !important; right: calc(var(--dock-w) + 16px); z-index: 1100;
    }
    body.sidebar-collapsed #localizacaoUsuario, body.sidebar-collapsed #logoutBtn{ right: 16px !important; }

    /* HUD acoplado na lateral (logo abaixo das ações) */
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
      transform: translate(-50%, -50%);
      user-select:none; pointer-events:auto;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// ------------------------- Mapa & Camadas base -----------------------
const map = L.map("map", { preferCanvas: true }).setView([-23.2, -45.9], 12);

// Rua (OSM)
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });
// Satélite (Esri)
const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19 }
);
// Rótulos por cima do satélite
const labelsPane = map.createPane("labels");
// FIX: manter rótulos **abaixo** dos tooltips (tooltipPane=650). Antes era 650 e podia cobrir o tooltip.
labelsPane.style.zIndex = 640;
labelsPane.style.pointerEvents = "none";
const cartoLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
  { pane: "labels", maxZoom: 19, subdomains: "abcd" }
);
const satComRotulos = L.layerGroup([esriSat, cartoLabels]);

// Começa com Rua (OSM)
osm.addTo(map);

// === Renderer Canvas + estilo das bolinhas (verde/verm) ===
const DOT_RENDERER = L.canvas({ padding: 0.5 });
function dotStyle(qtdEmpresas){
  return {
    radius: 6,
    color: "#fff",
    weight: 1,
    fillColor: (qtdEmpresas >= 5 ? "#d64545" : "#24a148"),
    fillOpacity: 0.95,
    renderer: DOT_RENDERER,
    // FIX: garantir interatividade do path em Canvas e evitar “propagação” fechar/consumir cliques
    interactive: true,
    bubblingMouseEvents: false
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
  iconCreateFunction: function (cluster) {
    return new L.DivIcon({
      html: String(cluster.getChildCount()),
      className: "cluster-num-only",
      iconSize: null
    });
  }
});
markers.on("clusterclick", (e) => e.layer.spiderfy());
// failsafe: qualquer layer simples dentro do cluster abre popup
markers.on("click", (e) => {
  // FIX: se vier DOM event, não deixa “subir”
  if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
  const l = e.layer;
  if (l && typeof l.getAllChildMarkers === "function") return; // é um cluster
  if (l && l.posteData) {
    // salvar último selecionado e abrir tooltip se tiver
    try { lastSelectedId = l.posteData.id; l.openTooltip?.(); } catch {}
    abrirPopup(l.posteData);
  }
});
map.addLayer(markers);

// -------------------- Carregamento GRADATIVO GLOBAL ------------------
const idToMarker = new Map();   // cache: id -> L.Layer
let todosCarregados = false;

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
function scheduleIdle(fn){ document.hidden ? setTimeout(fn, 0) : idle(fn); }

/* ====================================================================
   Popup fixo: instância única, sem piscar
==================================================================== */
const mainPopup = L.popup({ closeOnClick:false, autoClose:false, maxWidth:360 });
let popupPinned = false;                 // true se o usuário não fechou o popup
let lastPopup = null;                    // {lat, lon, html}

// >>> NOVO: lembrar último poste clicado (para reabrir tooltip)
let lastSelectedId = null;

// >>> NOVO: reabrir tooltip do último poste selecionado (sem mexer em zoom)
function reabrirTooltipFixo(delay = 0){
  if (!lastSelectedId) return;
  const layer = idToMarker.get(lastSelectedId);
  if (!layer) return;
  const open = () => { try { layer.openTooltip?.(); } catch {} };
  delay ? setTimeout(open, delay) : open();
}

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

// Cria (ou retorna do cache) o layer do poste, SEM adicioná-lo
function criarLayerPoste(p){
  if (idToMarker.has(p.id)) return idToMarker.get(p.id);
  const layer = L.circleMarker([p.lat, p.lon], dotStyle(p.empresas.length))
    .bindTooltip(
      `ID: ${p.id} — ${p.empresas.length} ${p.empresas.length === 1 ? "empresa" : "empresas"}`,
      { direction: "top", sticky: true }
    )
    .on("click", (e) => {
      // FIX: impedir que o clique “suba” e garantir abertura
      if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      try { e.target.openTooltip?.(); } catch {}
      lastSelectedId = p.id;            // <<< NOVO
      abrirPopup(p);
    });
  layer.posteData = p; // usado pelo failsafe do cluster
  idToMarker.set(p.id, layer);
  return layer;
}

// Adiciona 1 poste (usado em filtros, etc.)
function adicionarMarker(p) {
  const layer = criarLayerPoste(p);
  if (!markers.hasLayer(layer)) markers.addLayer(layer);
}

// Exibe TODOS os já criados no cache
function exibirTodosPostes() {
  const arr = Array.from(idToMarker.values());
  markers.clearLayers();
  if (arr.length) markers.addLayers(arr); // usa chunkedLoading
  reabrirPopupFixo(0);
  reabrirTooltipFixo(0); // <<< NOVO
}

// Carrega gradativamente TODOS os postes (uma vez) e mantém no mapa
function carregarTodosPostesGradualmente() {
  if (todosCarregados) { exibirTodosPostes(); return; }
  const lote = document.hidden ? 3500 : 1200;
  let i = 0;
  function addChunk() {
    const slice = todosPostes.slice(i, i + lote);
    const layers = slice.map(criarLayerPoste);
    if (layers.length) markers.addLayers(layers);
    i += lote;
    if (i < todosPostes.length) scheduleIdle(addChunk);
    else { todosCarregados = true; reabrirPopupFixo(0); reabrirTooltipFixo(0); } // <<< NOVO
  }
  scheduleIdle(addChunk);
}

// ---- Indicadores / BI (refs de gráfico) ----
let chartMunicipiosRef = null;

// Dados e sets para autocomplete
const todosPostes = [];
const empresasContagem = {};
const municipiosSet = new Set();
const bairrosSet = new Set();
const logradourosSet = new Set();
let censoMode = false, censoIds = null;

// Spinner overlay
const overlay = document.getElementById("carregando");
if (overlay) overlay.style.display = "flex";

// ---------------------- HUD na lateral --------------------------------
(function buildHud() {
  const hud = document.getElementById("tempo");
  const painel = document.querySelector(".painel-busca");
  if (!hud || !painel) return;

  // move o HUD para o painel, logo abaixo do .actions (lado direito)
  const actions = painel.querySelector(".actions");
  hud.classList.add("dock-hud");
  if (actions && actions.parentNode === painel) {
    painel.insertBefore(hud, actions.nextSibling);
  } else {
    painel.appendChild(hud);
  }

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
        <b>Carregando…</b>
        <span> </span>
        <small> </small>
      </div>
    </div>
    <div class="map-row">
      <span class="lbl">Mapa</span>
      <span class="select-wrap">
        <svg class="ico-globe" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="#111827" stroke-width="2" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="#111827" stroke-width="2" />
          <path d="M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20"
                fill="none" stroke="#111827" stroke-width="2"/>
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
      if (!agrupado[p.id]) agrupado[p.id] = { ...p, empresas: new Set(), lat, lon };
      if (p.empresa && p.empresa.toUpperCase() !== "DISPONÍVEL")
        agrupado[p.id].empresas.add(p.empresa);
    });
    const postsArray = Object.values(agrupado).map((p) => ({ ...p, empresas: [...p.empresas] }));

    postsArray.forEach((poste) => {
      todosPostes.push(poste);
      municipiosSet.add(poste.nome_municipio);
      bairrosSet.add(poste.nome_bairro);
      logradourosSet.add(poste.nome_logradouro);
      poste.empresas.forEach((e) => (empresasContagem[e] = (empresasContagem[e] || 0) + 1));
    });
    preencherListas();

    carregarTodosPostesGradualmente();
  })
  .catch((err) => {
    console.error("Erro ao carregar postes:", err);
    if (overlay) overlay.style.display = "none";
    if (err.message !== "Não autorizado")
      alert("Erro ao carregar dados dos postes.");
  });

// ---------------------------------------------------------------------
// Preenche datalists de autocomplete
// ---------------------------------------------------------------------
function preencherListas() {
  const mount = (set, id) => {
    const dl = document.getElementById(id);
    Array.from(set).sort().forEach((v) => {
      const o = document.createElement("option");
      o.value = v; dl.appendChild(o);
    });
  };
  mount(municipiosSet, "lista-municipios");
  mount(bairrosSet, "lista-bairros");
  mount(logradourosSet, "lista-logradouros");
  const dlEmp = document.getElementById("lista-empresas");
  Object.keys(empresasContagem).sort().forEach((e) => {
    const o = document.createElement("option");
    o.value = e; o.label = `${e} (${empresasContagem[e]} postes)`; dlEmp.appendChild(o);
  });
}

// ---------------------------------------------------------------------
// Geração de Excel no cliente via SheetJS
// ---------------------------------------------------------------------
function gerarExcelCliente(filtroIds) {
  const dadosParaExcel = todosPostes
    .filter((p) => filtroIds.includes(p.id))
    .map((p) => ({
      "ID POSTE": p.id,
      Município: p.nome_municipio,
      Bairro: p.nome_bairro,
      Logradouro: p.nome_logradouro,
      Empresas: p.empresas.join(", "),
      Coordenadas: p.coordenadas,
    }));
  const ws = XLSX.utils.json_to_sheet(dadosParaExcel);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filtro");
  XLSX.writeFile(wb, "relatorio_postes_filtrados.xlsx");
}

// ---------------------------------------------------------------------
// Modo Censo
// ---------------------------------------------------------------------
document.getElementById("btnCenso").addEventListener("click", async () => {
  censoMode = !censoMode;
  markers.clearLayers();
  if (!censoMode) { exibirTodosPostes(); reabrirTooltipFixo(0); reabrirPopupFixo(0); return; }

  if (!censoIds) {
    try {
      const res = await fetch("/api/censo", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      censoIds = new Set(arr.map((i) => String(i.poste)));
    } catch {
      alert("Não foi possível carregar dados do censo.");
      censoMode = false; exibirTodosPostes(); reabrirTooltipFixo(0); reabrirPopupFixo(0); return;
    }
  }
  todosPostes
    .filter((p) => censoIds.has(String(p.id)))
    .forEach((poste) => {
      const c = L.circleMarker([poste.lat, poste.lon], {
        radius: 6, color: "#666", fillColor: "#bbb", weight: 2, fillOpacity: 0.8, renderer: DOT_RENDERER,
        // FIX: garantir clique no Canvas e não deixar subir
        interactive: true, bubblingMouseEvents: false
      }).bindTooltip(`ID: ${poste.id}`, { direction: "top", sticky: true });
      c.on("click", (e) => {
        if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
        try{c.openTooltip?.();}catch{}
        lastSelectedId = poste.id;        // <<< NOVO
        abrirPopup(poste);
      });
      c.posteData = poste;
      markers.addLayer(c);
    });
  reabrirTooltipFixo(0); // <<< NOVO
  reabrirPopupFixo(0);
});

// ---------------------------------------------------------------------
// Interações / filtros
// ---------------------------------------------------------------------
function buscarID() {
  const id = document.getElementById("busca-id").value.trim();
  const p = todosPostes.find((x) => x.id === id);
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], 18);
  lastSelectedId = p.id;                  // <<< NOVO
  abrirPopup(p);
}

function buscarCoordenada() {
  const inpt = document.getElementById("busca-coord").value.trim();
  const [lat, lon] = inpt.split(/,\s*/).map(Number);
  if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
  map.setView([lat, lon], 18);
  L.popup().setLatLng([lat, lon]).setContent(`<b>Coordenada:</b> ${lat}, ${lon}`).openOn(map);
}

function filtrarLocal() {
  const getVal = (id) => document.getElementById(id).value.trim().toLowerCase();
  const [mun, bai, log, emp] = ["busca-municipio","busca-bairro","busca-logradouro","busca-empresa"].map(getVal);
  const filtro = todosPostes.filter(
    (p) =>
      (!mun || p.nome_municipio.toLowerCase() === mun) &&
      (!bai || p.nome_bairro.toLowerCase() === bai) &&
      (!log || p.nome_logradouro.toLowerCase() === log) &&
      (!emp || p.empresas.join(", ").toLowerCase().includes(emp))
  );
  if (!filtro.length) return alert("Nenhum poste encontrado com esses filtros.");
  markers.clearLayers();

  filtro.forEach(adicionarMarker);
  reabrirTooltipFixo(0); // <<< NOVO
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
    .catch((e) => {
      console.error("Erro exportar filtro:", e);
      alert("Falha ao gerar Excel backend:\n" + e.message);
    });

  gerarExcelCliente(filtro.map((p) => p.id));
}

function resetarMapa() { exibirTodosPostes(); reabrirTooltipFixo(0); reabrirPopupFixo(0); } // <<< NOVO

/* ====================================================================
   ÍCONES 48px — poste fotorealista + halo de disponibilidade
==================================================================== */
function makePolePhoto48(glowHex) {
  const svg = `
  <svg width="48" height="48" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gHalo" cx="21" cy="24" r="18" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${glowHex}" stop-opacity=".26"/>
        <stop offset="1" stop-color="${glowHex}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="gWood" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#8a6139"/>
        <stop offset=".5" stop-color="#9b6e41"/>
        <stop offset="1" stop-color="#6f4f31"/>
      </linearGradient>
      <linearGradient id="gSteel" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#9aa3ad"/>
        <stop offset=".55" stop-color="#e7ebef"/>
        <stop offset="1" stop-color="#7b8590"/>
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".25"/>
      </filter>
    </defs>
    <circle cx="21" cy="24" r="18" fill="url(#gHalo)"/>
    <g filter="url(#shadow)">
      <rect x="19.2" y="6" width="3.6" height="25" rx="1.6" fill="url(#gWood)"/>
      <rect x="21.2" y="6" width="0.7" height="25" fill="rgba(255,255,255,.18)"/>
      <ellipse cx="21" cy="31.5" rx="6.5" ry="2.2" fill="rgba(0,0,0,.20)" opacity=".45"/>
      <rect x="11" y="11.2" width="20" height="2.6" rx="1.3" fill="url(#gSteel)"/>
      <path d="M14.4 13.5 L21 19 M27.6 13.5 L21 19" stroke="#3b4046" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
      <circle cx="15.2" cy="12.6" r="1.2" fill="#cfd6dd"/>
      <circle cx="21"   cy="12.6" r="1.2" fill="#cfd6dd"/>
      <circle cx="26.8" cy="12.6" r="1.2" fill="#cfd6dd"/>
      <path d="M11.2 10.6 C 16.5 14.2, 25.5 14.2, 30.8 10.6" fill="none" stroke="#6f757c" stroke-width="1" opacity=".6"/>
      <rect x="23.8" y="17" width="6" height="7.2" rx="1.2" fill="#d9e1e8" stroke="#2f343a" stroke-width="1"/>
      <rect x="12.2" y="17.6" width="5.2" height="6.4" rx="1.1" fill="#dfe7ee" stroke="#2f343a" stroke-width="1" opacity=".85"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ICON_GREEN_48 = L.icon({
  iconUrl: makePolePhoto48("#24a148"),
  iconSize: [48, 48], iconAnchor: [24, 34], popupAnchor: [0, -22], tooltipAnchor: [0, -22]
});
const ICON_RED_48 = L.icon({
  iconUrl: makePolePhoto48("#d64545"),
  iconSize: [48, 48], iconAnchor: [24, 34], popupAnchor: [0, -22], tooltipAnchor: [0, -22]
});
function poleIcon48(color) { return color === "red" ? ICON_RED_48 : ICON_GREEN_48; }
function poleColorByEmpresas(qtd) { return (qtd >= 5) ? "red" : "green"; }

// ---------------------------------------------------------------------
// === Street View gratuito (link público) =============================
function buildGoogleMapsPanoURL(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}
function googleButtonHTML(lat, lng, label = "Abrir no Google Street View") {
  const url = buildGoogleMapsPanoURL(lat, lng);
  return `<button onclick="window.open('${url}','_blank','noopener')"
    style="padding:6px 10px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;cursor:pointer;font:12px system-ui">
    ${label}
  </button>`;
}
function streetImageryBlockHTML(lat, lng) {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${googleButtonHTML(lat, lng)}
    </div>
    <small style="color:#777;display:block;margin-top:4px">
      *Se não houver cobertura exata no ponto, o Google aproxima para a vista mais próxima.
    </small>
  `.trim();
}

(function addStreetViewControl() {
  if (typeof L === "undefined" || typeof map === "undefined" || !map) return;
  const Control = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const div = L.DomUtil.create("div", "leaflet-bar");
      const btn = L.DomUtil.create("a", "", div);
      btn.href = "#"; btn.title = "Abrir Google Street View no centro do mapa";
      btn.innerHTML = "StreetView"; btn.style.padding = "6px 8px"; btn.style.textDecoration = "none";
      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        const c = map.getCenter();
        window.open(buildGoogleMapsPanoURL(c.lat, c.lng), "_blank", "noopener");
      });
      L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  map.addControl(new Control());
})();

// ---------------------------------------------------------------------
// Abre popup (usa a instância única mainPopup)
// ---------------------------------------------------------------------
function abrirPopup(p) {
  const list = p.empresas.map((e) => `<li>${e}</li>`).join("");
  const html = `
    <b>ID:</b> ${p.id}<br>
    <b>Coord:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}<br>
    <b>Município:</b> ${p.nome_municipio}<br>
    <b>Bairro:</b> ${p.nome_bairro}<br>
    <b>Logradouro:</b> ${p.nome_logradouro}<br>
    <b>Empresas:</b><ul>${list}</ul>
    ${streetImageryBlockHTML(p.lat, p.lon)}
  `;
  lastPopup = { lat: p.lat, lon: p.lon, html };
  popupPinned = true;
  mainPopup.setLatLng([p.lat, p.lon]).setContent(html);
  if (!map.hasLayer(mainPopup)) mainPopup.addTo(map);
}

// ---------------------------------------------------------------------
// Minha localização
// ---------------------------------------------------------------------
document.getElementById("localizacaoUsuario").addEventListener("click", () => {
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
// Clima via OpenWeatherMap (com fallback se geo falhar)
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

// tenta pegar geo; se falhar, usa SP
(function initWeather() {
  const fallback = () => obterPrevisaoDoTempo(-23.55, -46.63); // São Paulo
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
  const ids = document.getElementById("ids-multiplos").value.split(/[^0-9]+/).filter(Boolean);
  if (!ids.length) return alert("Nenhum ID fornecido.");
  markers.clearLayers();
  if (window.tracadoMassivo) map.removeLayer(window.tracadoMassivo);
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  window.numeroMarkers = [];

  const encontrados = ids.map((id) => todosPostes.find((p) => p.id === id)).filter(Boolean);
  if (!encontrados.length) return alert("Nenhum poste encontrado.");
  encontrados.forEach((p, i) => adicionarNumerado(p, i + 1));

  window.intermediarios = [];
  encontrados.slice(0, -1).forEach((a, i) => {
    const b = encontrados[i + 1];
    const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
    if (d > 50) {
      todosPostes
        .filter((p) => !ids.includes(p.id))
        .filter((p) =>
          getDistanciaMetros(a.lat, a.lon, p.lat, p.lon) +
          getDistanciaMetros(b.lat, b.lon, p.lat, p.lon) <= d + 20
        )
        .forEach((p) => {
          const m = L.circleMarker([p.lat, p.lon], {
            radius: 6, color: "gold", fillColor: "yellow", fillOpacity: 0.8,
            // FIX: interativo e sem bubbling
            interactive: true, bubblingMouseEvents: false
          }).bindTooltip(`ID: ${p.id}<br>Empresas: ${p.empresas.join(", ")}`, { direction: "top", sticky: true })
            .on("click", (e) => { if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent); try{m.openTooltip?.();}catch{} lastSelectedId = p.id; abrirPopup(p); })
            .addTo(map);
          m.posteData = p;
          window.intermediarios.push(m);
        });
    }
  });
  map.addLayer(markers);
  const coords = encontrados.map((p) => [p.lat, p.lon]);
  if (coords.length >= 2) {
    window.tracadoMassivo = L.polyline(coords, { color: "blue", weight: 3, dashArray: "4,6" }).addTo(map);
    map.fitBounds(L.latLngBounds(coords));
  } else {
    map.setView(coords[0], 18);
  }

  window.ultimoResumoPostes = {
    total: ids.length,
    disponiveis: encontrados.filter((p) => p.empresas.length <= 4).length,
    ocupados: encontrados.filter((p) => p.empresas.length >= 5).length,
    naoEncontrados: ids.filter((id) => !todosPostes.some((p) => p.id === id)),
    intermediarios: window.intermediarios.length,
  };

  reabrirTooltipFixo(0); // <<< NOVO (voltar tooltip após análise)
  reabrirPopupFixo(0);
}

// Adiciona marcador numerado (usa o mesmo abrirPopup)
function adicionarNumerado(p, num) {
  const cor = p.empresas.length >= 5 ? "red" : "green";
  const html = `<div style="
      background:${cor};color:white;width:22px;height:22px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white
    ">${num}</div>`;
  const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ html }) });
  mk.bindTooltip(`${p.id}`, { direction: "top", sticky: true });
  mk.on("click", (e) => { if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent); try{mk.openTooltip?.();}catch{} lastSelectedId = p.id; abrirPopup(p); });
  mk.posteData = p;
  mk.addTo(markers);
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
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Limpa campos e layers auxiliares
function limparTudo() {
  if (window.tracadoMassivo) { map.removeLayer(window.tracadoMassivo); window.tracadoMassivo = null; }
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  ["ids-multiplos","busca-id","busca-coord","busca-municipio","busca-bairro","busca-logradouro","busca-empresa"]
    .forEach((id) => { document.getElementById(id).value = ""; });
  resetarMapa();
}

// Exporta Excel genérico
function exportarExcel(ids) {
  fetch("/api/postes/report", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
    .then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Não autorizado");
      }
      if (!res.ok) {
        let err; try { err = (await res.json()).error; } catch {}
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
    .catch((e) => {
      console.error("Erro Excel:", e);
      alert("Falha ao gerar Excel:\n" + e.message);
    });
}

// Botão Excel
document.getElementById("btnGerarExcel").addEventListener("click", () => {
  const ids = document.getElementById("ids-multiplos").value.split(/[^0-9]+/).filter(Boolean);
  if (!ids.length) return alert("Informe ao menos um ID.");
  exportarExcel(ids);
});

// Toggle painel
document.getElementById("togglePainel").addEventListener("click", () => {
  const p = document.querySelector(".painel-busca");
  const body = document.body;
  p.classList.toggle("collapsed");
  body.classList.toggle("sidebar-collapsed", p.classList.contains("collapsed"));
  const onEnd = () => { map.invalidateSize(); p.removeEventListener("transitionend", onEnd); };
  p.addEventListener("transitionend", onEnd);
});

// Logout (ATUALIZADO: robusto a offline e rota opcional)
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    // limpa credenciais locais sempre
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_token");
    document.cookie = "auth_token=; Max-Age=0; path=/; SameSite=Lax";
  } catch {}

  // tenta avisar o servidor apenas se estiver online; ignora falhas
  if (navigator.onLine) {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
  }

  // usa replace para não voltar com back
  window.location.replace("/login.html");
});

/* --------------------------------------------------------------------
   === Indicadores (BI) — injeção automática de botão + modal ===
-------------------------------------------------------------------- */

// Agregação por município, com filtros
function agregaPorMunicipio({ empresa = "", apenasVisiveis = false } = {}) {
  const empresaNorm = (empresa || "").trim().toLowerCase();
  const bounds = apenasVisiveis ? map.getBounds() : null;

  const mapa = new Map();
  let total = 0;

  for (const p of todosPostes) {
    if (bounds && !bounds.contains([p.lat, p.lon])) continue;
    if (empresaNorm) {
      const hit = p.empresas?.some(e => (e || "").toLowerCase().includes(empresaNorm));
      if (!hit) continue;
    }
    const key = p.nome_municipio || "—";
    mapa.set(key, (mapa.get(key) || 0) + 1);
    total++;
  }

  const rows = Array.from(mapa.entries())
    .map(([municipio, qtd]) => ({ municipio, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  return { rows, total };
}

// CSV
function rowsToCSV(rows) {
  const header = "Municipio,Quantidade\n";
  const body = rows.map(r => `"${(r.municipio||"").replace(/"/g,'""')}",${r.qtd}`).join("\n");
  return header + body + "\n";
}

// Injeta botão "Indicadores"
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

// Modal de BI
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
        <div><canvas id="chartMunicipios" height="160"></canvas></div>
        <div class="bi-side">
          <label>Filtrar por empresa (opcional)</label>
          <input id="filtroEmpresaBI" list="lista-empresas" placeholder="Ex.: VIVO, CLARO..." class="bi-input">
          <label class="bi-chk">
            <input type="checkbox" id="apenasVisiveisBI"> Considerar apenas os postes visíveis no mapa
          </label>
          <div id="resumoBI" class="bi-resumo"></div>
          <button id="exportarCsvBI" class="bi-btn"><i class="fa fa-file-csv"></i> Exportar CSV</button>
        </div>
      </div>
      <div class="bi-table-wrap">
        <div style="overflow:auto;border:1px solid #eee;border-radius:8px;">
          <table id="tabelaMunicipios" class="bi-table">
            <thead>
              <tr><th style="text-align:left;">Município</th><th style="text-align:right;">Qtd. de Postes</th></tr>
            </thead>
            <tbody></tbody>
          </table>
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
  function proceed() { modal.style.display = "flex"; atualizarIndicadores(); }
  if (typeof Chart === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = proceed; s.onerror = proceed;
    document.head.appendChild(s);
  } else { proceed(); }
}
function fecharIndicadores() { const m = document.getElementById("modalIndicadores"); if (m) m.style.display = "none"; }

function atualizarIndicadores() {
  const empresa = document.getElementById("filtroEmpresaBI")?.value || "";
  const apenasVisiveis = !!document.getElementById("apenasVisiveisBI")?.checked;

  const { rows, total } = agregaPorMunicipio({ empresa, apenasVisiveis });

  const tb = document.querySelector("#tabelaMunicipios tbody");
  if (tb) {
    tb.innerHTML = rows.map(r => `
      <tr><td>${r.municipio}</td><td class="num">${r.qtd.toLocaleString("pt-BR")}</td></tr>
    `).join("") || `<tr><td colspan="2" style="padding:10px;color:#6b7280;">Sem dados para os filtros.</td></tr>`;
  }

  const resumo = document.getElementById("resumoBI");
  if (resumo) {
    const txtEmp = empresa ? ` para <b>${empresa}</b>` : "";
    const txtScope = apenasVisiveis ? " (apenas área visível)" : "";
    resumo.innerHTML = `Total de postes${txtEmp}: <b>${total.toLocaleString("pt-BR")}</b>${txtScope}`;
  }

  const labels = rows.slice(0, 20).map(r => r.municipio);
  const data = rows.slice(0, 20).map(r => r.qtd);
  const ctx = document.getElementById("chartMunicipios");

  if (typeof Chart !== "undefined" && ctx) {
    if (chartMunicipiosRef) {
      chartMunicipiosRef.data.labels = labels;
      chartMunicipiosRef.data.datasets[0].data = data;
      chartMunicipiosRef.update();
    } else {
      chartMunicipiosRef = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Postes por município", data }] },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true } }
        }
      });
    }
  }

  const btnCsv = document.getElementById("exportarCsvBI");
  if (btnCsv) {
    btnCsv.onclick = () => {
      const csv = rowsToCSV(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sufixo = empresa ? `_${empresa.replace(/\W+/g,'_')}` : "";
      a.download = `postes_por_municipio${sufixo}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }
}

/* ====================================================================
   TEMA ESCURO – PALETA DO PRINT
==================================================================== */
(function injectDarkPanelStyles(){
  const css = `
  :root{
    --ui-bg:#0f1b2a; --ui-elev:#132235; --ui-text:#e6edf7; --ui-muted:#9fb3c8;
    --ui-border:#19d68f; --ui-border-dim:#134e37; --ui-accent:#18c77f; --ui-accent-2:#0fb171; --ui-danger:#ef4444;
  }
  .painel-busca{
    color:var(--ui-text); background:var(--ui-bg); border:1px solid var(--ui-border);
    border-radius:14px; box-shadow:0 8px 28px rgba(0,0,0,.25); padding:12px;
  }
  .painel-busca h2, .painel-busca h3{ margin:0 0 8px 0; font-weight:800; letter-spacing:.3px; color:var(--ui-text); }
  .painel-busca input, .painel-busca select, .painel-busca textarea{
    width:100%; background:var(--ui-elev); color:var(--ui-text); border:1px solid var(--ui-border);
    border-radius:10px; padding:8px 10px; outline:none; transition:border-color .15s ease, box-shadow .15s ease;
  }
  .painel-busca input::placeholder, .painel-busca textarea::placeholder{ color:#89a2b7; }
  .painel-busca input:focus, .painel-busca select:focus, .painel-busca textarea:focus{
    border-color:var(--ui-accent); box-shadow:0 0 0 3px rgba(24,199,127,.25);
  }
  .painel-busca button, .painel-busca .actions button{
    background:var(--ui-accent); color:#031d12; font-weight:800; border:1px solid var(--ui-border);
    border-radius:10px; padding:8px 10px; cursor:pointer;
    transition:transform .12s ease, background .15s ease, border-color .15s ease;
  }
  .painel-busca button:hover{ background:var(--ui-accent-2); transform:translateY(-1px); }
  .painel-busca button:disabled{ opacity:.6; cursor:not-allowed; }

  #tempo{
    background:rgba(10,20,32,.9) !important; color:var(--ui-text) !important; border:1px solid var(--ui-border);
  }
  #tempo .hora-row{ color:var(--ui-text) !important; }
  #tempo .hora-row .dot{ background:radial-gradient(circle at 40% 40%, var(--ui-accent), #0b6a45); box-shadow:0 0 0 2px rgba(24,199,127,.25) inset; }
  #tempo .weather-card{ background:rgba(15,27,42,.92) !important; border:1px solid var(--ui-border); }
  #tempo .tempo-text{ color:var(--ui-text) !important; }
  #tempo .tempo-text small{ color:var(--ui-muted) !important; }
  #tempo .map-row{ border-top:1px dashed rgba(25,214,143,.35) !important; }
  #tempo .select-wrap{ background:#0d1a2b !important; color:var(--ui-text); border-color:var(--ui-border) !important; }
  #tempo select{ color:var(--ui-text) !important; }
  #tempo .select-wrap:focus-within{ box-shadow:0 0 0 3px rgba(24,199,127,.22) !important; border-color:var(--ui-accent) !important; }
  `;
  const style = document.createElement('style');
  style.id = 'dark-poste-theme';
  style.textContent = css;
  document.head.appendChild(style);
})();
