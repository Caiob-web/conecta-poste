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
    #tempo .weather-row img{
      width:28px; height:28px; object-fit:contain;
    }
    #tempo .tempo-text{
      display:flex; flex-direction:column;
      gap:2px;
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:#1f2937;
    }
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
      position:relative;
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 36px 8px 12px;
      border:1px solid #e5e7eb;
      border-radius:999px;           /* pill */
      background:#ffffff;
      transition:border-color .15s ease, box-shadow .15s ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
    }
    #tempo .select-wrap:focus-within{
      border-color:#6366f1;
      box-shadow:0 0 0 3px rgba(99,102,241,.20);
    }
    #tempo .select-wrap .ico-globe{
      width:16px;height:16px;opacity:.75;
    }
    #tempo .select-wrap .ico-caret{
      position:absolute; right:10px; width:14px; height:14px; opacity:.6;
      pointer-events:none;
    }
    #tempo select{
      appearance:none; -webkit-appearance:none; -moz-appearance:none;
      border:0; outline:none; background:transparent;
      padding:0; margin:0;
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:#111827; cursor:pointer;
    }

    /* ---- Modal Indicadores (BI) injetado por JS ---- */
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
   Sidebar fixa (dock) na divisória direita + botão de recolher/exibir
   + grade de botões corrigida para caber na largura do dock
==================================================================== */
(function injectDockSidebarStyles(){
  const css = `
    :root{ --dock-w: 340px; }

    /* torna o painel uma sidebar fixa ocupando a altura toda */
    .painel-busca{
      position: fixed !important;
      top: 0;
      right: 0;
      height: 100vh;
      width: var(--dock-w);
      overflow: auto;
      overflow-x: hidden;
      border-left: 2px solid var(--ui-border, #19d68f);
      border-radius: 0 !important;
      padding: 12px;
      padding-bottom: 16px;
      transform: translateX(0%);
      transition: transform .25s ease;
      z-index: 1000;
      box-sizing: border-box;
    }

    /* inputs/áreas para não estourarem a largura */
    .painel-busca .field,
    .painel-busca input,
    .painel-busca textarea,
    .painel-busca select{
      min-width: 0;
      box-sizing: border-box;
    }

    /* AÇÕES — 2 colunas fixas no dock (sem cortar) */
    .painel-busca .actions{
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 10px !important;
      margin-top: 6px;
    }
    .painel-busca .actions button{
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* estado recolhido (fora da tela) */
    .painel-busca.collapsed{ transform: translateX(100%); }

    /* botão/aba na divisória (usa o #togglePainel existente) */
    #togglePainel{
      position: fixed !important;
      top: 50%;
      right: calc(var(--dock-w) + 6px);
      transform: translateY(-50%);
      width: 42px; height: 64px;
      border-radius: 10px 0 0 10px !important;
      background: var(--ui-bg, #0f1b2a) !important;
      border: 1px solid var(--ui-border, #19d68f) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.28) !important;
      z-index: 1100;
      display:flex;align-items:center;justify-content:center;
    }
    body.sidebar-collapsed #togglePainel{ right: 6px !important; }

    /* demais botões de topo se alinham à divisória */
    #localizacaoUsuario, #logoutBtn{
      position: fixed !important;
      right: calc(var(--dock-w) + 16px);
      z-index: 1100;
    }
    body.sidebar-collapsed #localizacaoUsuario,
    body.sidebar-collapsed #logoutBtn{
      right: 16px !important;
    }

    /* ícone muda de direção */
    #togglePainel i{ transition: transform .2s ease; }
    body.sidebar-collapsed #togglePainel i{ transform: scaleX(-1); }
  `;
  const style = document.createElement('style');
  style.id = 'dock-sidebar-styles';
  style.textContent = css;
  document.head.appendChild(style);

  // Ajusta o rótulo/ícone inicial do toggle
  window.addEventListener('DOMContentLoaded', () => {
    const tgl = document.getElementById('togglePainel');
    if (tgl) tgl.innerHTML = '<i class="fa fa-chevron-right"></i>';
  });
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
labelsPane.style.zIndex = 650;
labelsPane.style.pointerEvents = "none";
const cartoLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
  { pane: "labels", maxZoom: 19, subdomains: "abcd" }
);
const satComRotulos = L.layerGroup([esriSat, cartoLabels]);

// Começa com Rua (OSM)
osm.addTo(map);

// alternância programática (usada pelo seletor)
let currentBase = osm;
function setBase(mode) {
  if (map.hasLayer(currentBase)) map.removeLayer(currentBase);
  if (mode === "sat") currentBase = esriSat;
  else if (mode === "satlabels") currentBase = satComRotulos;
  else currentBase = osm;
  currentBase.addTo(map);
}

// -------------------- Cluster global (sempre adicionado) -------------
const markers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
  // chunking interno do plugin
  chunkedLoading: true,
  chunkDelay: 5,
  chunkInterval: 50
});
markers.on("clusterclick", (e) => e.layer.spiderfy());
map.addLayer(markers); // 🔒 nunca removemos do mapa

// -------------------- Carregamento progressivo + cache ---------------
const MIN_ZOOM_POSTES = 15;      // usado apenas para focar no buscar; não gateia carregamento
const idToMarker = new Map();    // cache: id -> L.Marker
let todosPostes = [];            // preenchido após fetch
let carregouTodosNoCluster = false; // marca fim do carregamento total
let emCenso = false;

// ---------------- Overlay helper ----------------
const overlay = document.getElementById("carregando");
function showOverlay(txt){
  if (!overlay) return;
  overlay.style.display = "flex";
  const span = overlay.querySelector(".texto") || overlay.querySelector("span");
  if (span) span.textContent = txt || "Carregando…";
}
function setOverlayProgress(pct){
  if (!overlay) return;
  const span = overlay.querySelector(".texto") || overlay.querySelector("span");
  if (span) span.textContent = `Carregando postes… ${pct}%`;
}
function hideOverlay(){ if (overlay) overlay.style.display = "none"; }
showOverlay("Carregando dados…");

// --------- fábrica de marker sem adicionar (usado no carregamento) ---
function createMarkerForPoste(p){
  let mk = idToMarker.get(p.id);
  if (!mk) {
    const cor = poleColorByEmpresas(p.empresas.length);
    mk = L.marker([p.lat, p.lon], { icon: poleIcon48(cor) })
      .bindTooltip(
        `ID: ${p.id} — ${p.empresas.length} ${p.empresas.length === 1 ? "empresa" : "empresas"}`,
        { direction: "top", sticky: true }
      );
    mk.on("click", () => abrirPopup(p));
    idToMarker.set(p.id, mk);
  }
  return mk;
}

// util — adicionar uma lista de postes ao cluster, PROGRESSIVO e leve
function addMarkersInChunks(postes, onDone, factory) {
  const hasRIC = typeof window.requestIdleCallback === "function";
  let i = 0;
  let firstShown = false;

  function step(deadline){
    const t0 = performance.now();
    const batch = [];

    while (i < postes.length) {
      const p = postes[i++];
      const lyr = factory ? factory(p) : createMarkerForPoste(p);
      if (lyr) batch.push(lyr);

      const budgetOK = hasRIC ? (deadline.timeRemaining() > 7) : ((performance.now() - t0) < 10);
      if (!budgetOK || batch.length >= 600) break;
    }

    if (batch.length) {
      markers.addLayers(batch);               // lote = mais rápido
      if (!firstShown) { hideOverlay(); firstShown = true; }
      const pct = Math.min(100, Math.round((i / postes.length) * 100));
      setOverlayProgress(pct);
    }

    if (i < postes.length) {
      schedule();
    } else {
      carregouTodosNoCluster = true;
      onDone && onDone();
    }
  }

  function schedule(){
    if (hasRIC) requestIdleCallback(step, { timeout: 100 });
    else requestAnimationFrame(() => step({ timeRemaining: () => 0 }));
  }

  if (postes.length) {
    setOverlayProgress(0);
    schedule();
  } else {
    hideOverlay();
    onDone && onDone();
  }
}

// -------------------------------- Início: carregar TODOS -------------
function exibirTodosPostes() {
  markers.clearLayers();              // não removemos o grupo, só os itens
  carregouTodosNoCluster = false;
  showOverlay("Carregando postes…");
  addMarkersInChunks(todosPostes, () => hideOverlay());
}

// ---- Indicadores / BI (refs de gráfico) ----
let chartMunicipiosRef = null;

// Dados auxiliares para autocomplete
const empresasContagem = {};
const municipiosSet = new Set();
const bairrosSet = new Set();
const logradourosSet = new Set();
let censoIds = null;

// ---------------------- HUD: estrutura dentro de #tempo --------------
(function buildHud() {
  const hud = document.getElementById("tempo");
  if (!hud) return;

  hud.innerHTML = "";

  // Hora
  const horaRow = document.createElement("div");
  horaRow.className = "hora-row";
  horaRow.innerHTML = `<span class="dot"></span><span class="hora">--:--</span>`;
  hud.appendChild(horaRow);

  // Cartão: clima + seletor de mapa (dentro do mesmo card)
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
// Carrega /api/postes e JÁ INICIA a renderização progressiva
// ---------------------------------------------------------------------
fetch("/api/postes")
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
      if (!agrupado[p.id]) agrupado[p.id] = { ...p, empresas: new Set(), lat, lon };
      if (p.empresa && p.empresa.toUpperCase() !== "DISPONÍVEL")
        agrupado[p.id].empresas.add(p.empresa);
    });
    todosPostes = Object.values(agrupado).map((p) => ({
      ...p,
      empresas: [...p.empresas],
    }));

    // Popular estruturas de autocomplete
    todosPostes.forEach((poste) => {
      municipiosSet.add(poste.nome_municipio);
      bairrosSet.add(poste.nome_bairro);
      logradourosSet.add(poste.nome_logradouro);
      poste.empresas.forEach(
        (e) => (empresasContagem[e] = (empresasContagem[e] || 0) + 1)
      );
    });
    preencherListas();

    // 👉 Carrega TODOS imediatamente (sem depender de zoom)
    exibirTodosPostes();
  })
  .catch((err) => {
    console.error("Erro ao carregar postes:", err);
    hideOverlay();
    if (err.message !== "Não autorizado")
      alert("Erro ao carregar dados dos postes.");
  });

// ---------------------------------------------------------------------
// Preenche datalists de autocomplete
// ---------------------------------------------------------------------
function preencherListas() {
  const mount = (set, id) => {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = "";
    Array.from(set)
      .sort()
      .forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        dl.appendChild(o);
      });
  };
  mount(municipiosSet, "lista-municipios");
  mount(bairrosSet, "lista-bairros");
  mount(logradourosSet, "lista-logradouros");
  const dlEmp = document.getElementById("lista-empresas");
  if (dlEmp) {
    dlEmp.innerHTML = "";
    Object.keys(empresasContagem)
      .sort()
      .forEach((e) => {
        const o = document.createElement("option");
        o.value = e;
        o.label = `${e} (${empresasContagem[e]} postes)`;
        dlEmp.appendChild(o);
      });
  }
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
  emCenso = !emCenso;
  markers.clearLayers(); // não removemos o layer do mapa

  if (!emCenso) {
    // voltar a exibir TODOS assim que sair do censo
    exibirTodosPostes();
    return;
  }

  showOverlay("Carregando Censo…");
  if (!censoIds) {
    try {
      const res = await fetch("/api/censo");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      censoIds = new Set(arr.map((i) => String(i.poste)));
    } catch (e) {
      hideOverlay();
      alert("Não foi possível carregar dados do censo.");
      emCenso = false;
      exibirTodosPostes();
      return;
    }
  }

  // adiciona marcadores do censo de forma progressiva
  const lista = todosPostes.filter((p) => censoIds.has(String(p.id)));
  addMarkersInChunks(
    lista,
    () => hideOverlay(),
    (poste) => {
      const c = L.circleMarker([poste.lat, poste.lon], {
        radius: 6,
        color: "#666",
        fillColor: "#bbb",
        weight: 2,
        fillOpacity: 0.8,
      }).bindTooltip(`ID: ${poste.id}`, { direction: "top", sticky: true });
      c.on("click", () => abrirPopup(poste));
      return c;
    }
  );
});

// ---------------------------------------------------------------------
// Interações / filtros
// ---------------------------------------------------------------------
function buscarID() {
  const id = document.getElementById("busca-id").value.trim();
  const p = todosPostes.find((x) => x.id === id);
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], Math.max(18, MIN_ZOOM_POSTES));
  let mk = idToMarker.get(p.id);
  if (!mk) {
    const cor = poleColorByEmpresas(p.empresas.length);
    mk = L.marker([p.lat, p.lon], { icon: poleIcon48(cor) })
      .bindTooltip(`ID: ${p.id}`, { direction: "top", sticky: true });
    mk.on("click", () => abrirPopup(p));
    idToMarker.set(p.id, mk);
  }
  if (!markers.hasLayer(mk)) markers.addLayer(mk);
  abrirPopup(p);
}

function buscarCoordenada() {
  const inpt = document.getElementById("busca-coord").value.trim();
  const [lat, lon] = inpt.split(/,\s*/).map(Number);
  if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
  map.setView([lat, lon], Math.max(18, MIN_ZOOM_POSTES));
  L.popup().setLatLng([lat, lon]).setContent(`<b>Coordenada:</b> ${lat}, ${lon}`).openOn(map);
}

function filtrarLocal() {
  const getVal = (id) => (document.getElementById(id)?.value || "").trim().toLowerCase();
  const [mun, bai, log, emp] = ["busca-municipio","busca-bairro","busca-logradouro","busca-empresa"].map(getVal);

  const filtro = todosPostes.filter(
    (p) =>
      (!mun || (p.nome_municipio||"").toLowerCase() === mun) &&
      (!bai || (p.nome_bairro||"").toLowerCase() === bai) &&
      (!log || (p.nome_logradouro||"").toLowerCase() === log) &&
      (!emp || p.empresas.join(", ").toLowerCase().includes(emp))
  );
  if (!filtro.length) return alert("Nenhum poste encontrado com esses filtros.");

  // exibe somente o filtro (progressivo)
  emCenso = false;
  markers.clearLayers();
  showOverlay("Aplicando filtro…");
  addMarkersInChunks(filtro, () => {
    hideOverlay();
    // export backend + cliente
    fetch("/api/postes/report", {
      method: "POST",
      credentials: "same-origin",
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
        a.href = u;
        a.download = "relatorio_postes_filtro_backend.xlsx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(u);
      })
      .catch((e) => {
        console.error("Erro exportar filtro:", e);
        alert("Falha ao gerar Excel backend:\n" + e.message);
      });

    gerarExcelCliente(filtro.map((p) => p.id));
  });
}

function resetarMapa() {
  emCenso = false;
  exibirTodosPostes(); // volta a exibir tudo, sem depender de zoom
}

/* ====================================================================
   ÍCONES 48px — poste fotorealista + halo de disponibilidade
   (verde para ≤4 empresas, vermelho para ≥5 empresas)
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

    <!-- HALO -->
    <circle cx="21" cy="24" r="18" fill="url(#gHalo)"/>

    <!-- poste -->
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
  iconSize: [48, 48],
  iconAnchor: [24, 34],
  popupAnchor: [0, -22],
  tooltipAnchor: [0, -22]
});
const ICON_RED_48 = L.icon({
  iconUrl: makePolePhoto48("#d64545"),
  iconSize: [48, 48],
  iconAnchor: [24, 34],
  popupAnchor: [0, -22],
  tooltipAnchor: [0, -22]
});
function poleIcon48(color) {
  return color === "red" ? ICON_RED_48 : ICON_GREEN_48;
}
function poleColorByEmpresas(qtd) {
  return (qtd >= 5) ? "red" : "green";
}

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

// Controle no mapa (linka o centro atual para o Street View)
(function addStreetViewControl() {
  if (typeof L === "undefined" || typeof map === "undefined" || !map) return;
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
// Adiciona marker isolado (usa cache) — ainda usado por alguns fluxos
// ---------------------------------------------------------------------
function adicionarMarker(p) {
  let mk = idToMarker.get(p.id);
  if (!mk) {
    const cor = poleColorByEmpresas(p.empresas.length);
    mk = L.marker([p.lat, p.lon], { icon: poleIcon48(cor) })
      .bindTooltip(
        `ID: ${p.id} — ${p.empresas.length} ${p.empresas.length === 1 ? "empresa" : "empresas"}`,
        { direction: "top", sticky: true }
      );
    mk.on("click", () => abrirPopup(p));
    idToMarker.set(p.id, mk);
  }
  if (!markers.hasLayer(mk)) markers.addLayer(mk);
}

// Abre popup
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
  L.popup().setLatLng([p.lat, p.lon]).setContent(html).openOn(map);
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
      map.setView(latlng, Math.max(17, MIN_ZOOM_POSTES));
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
  s.textContent = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&lang=pt_br&units=metric&appid=${API_KEY}`
  )
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
  const ids = document
    .getElementById("ids-multiplos")
    .value.split(/[^0-9]+/)
    .filter(Boolean);
  if (!ids.length) return alert("Nenhum ID fornecido.");
  markers.clearLayers();
  if (window.tracadoMassivo) map.removeLayer(window.tracadoMassivo);
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  window.numeroMarkers = [];

  const encontrados = ids
    .map((id) => todosPostes.find((p) => p.id === id))
    .filter(Boolean);
  if (!encontrados.length) return alert("Nenhum poste encontrado.");
  encontrados.forEach((p, i) => adicionarNumerado(p, i + 1));

  // intermediários e traçado
  window.intermediarios = [];
  encontrados.slice(0, -1).forEach((a, i) => {
    const b = encontrados[i + 1];
    const d = getDistanciaMetros(a.lat, a.lon, b.lat, b.lon);
    if (d > 50) {
      todosPostes
        .filter((p) => !ids.includes(p.id))
        .filter(
          (p) =>
            getDistanciaMetros(a.lat, a.lon, p.lat, p.lon) +
              getDistanciaMetros(b.lat, b.lon, p.lat, p.lon) <=
            d + 20
        )
        .forEach((p) => {
          const m = L.circleMarker([p.lat, p.lon], {
            radius: 6,
            color: "gold",
            fillColor: "yellow",
            fillOpacity: 0.8,
          })
            .bindTooltip(`ID: ${p.id}<br>Empresas: ${p.empresas.join(", ")}`, {
              direction: "top",
              sticky: true,
            })
            .on("click", () => abrirPopup(p))
            .addTo(map);
          window.intermediarios.push(m);
        });
    }
  });
  map.addLayer(markers);
  const coords = encontrados.map((p) => [p.lat, p.lon]);
  if (coords.length >= 2) {
    window.tracadoMassivo = L.polyline(coords, {
      color: "blue",
      weight: 3,
      dashArray: "4,6",
    }).addTo(map);
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

  // Mostra apenas estes no cluster (progressivo)
  addMarkersInChunks(encontrados, () => {});
}

// Adiciona marcador numerado
function adicionarNumerado(p, num) {
  const cor = p.empresas.length >= 5 ? "red" : "green";
  const html = `<div style="
      background:${cor};color:white;width:22px;height:22px;
      border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:12px;border:2px solid white
    ">${num}</div>`;
  const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ html }) });
  mk.bindTooltip(`${p.id}`, { direction: "top", sticky: true });
  mk.bindPopup(
    `<b>ID:</b> ${p.id}<br><b>Município:</b> ${
      p.nome_municipio
    }<br><b>Empresas:</b><ul>${p.empresas.map((e) => `<li>${e}</li>`).join("")}</ul>`
  );
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

    const resumo = window.ultimoResumoPostes || {
      disponiveis: 0,
      ocupados: 0,
      naoEncontrados: [],
      intermediarios: 0,
    };

    let y = 140;
    doc.setFontSize(12);
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
  if (window.tracadoMassivo) {
    map.removeLayer(window.tracadoMassivo);
    window.tracadoMassivo = null;
  }
  window.intermediarios?.forEach((m) => map.removeLayer(m));
  ["ids-multiplos","busca-id","busca-coord","busca-municipio","busca-bairro","busca-logradouro","busca-empresa"]
    .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  resetarMapa();
}

// Exporta Excel genérico
function exportarExcel(ids) {
  fetch("/api/postes/report", {
    method: "POST",
    credentials: "same-origin",
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
      a.href = u;
      a.download = "relatorio_postes.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

// Toggle painel (agora como sidebar recolhível)
document.getElementById("togglePainel").addEventListener("click", () => {
  const p = document.querySelector(".painel-busca");
  const body = document.body;
  p.classList.toggle("collapsed");
  body.classList.toggle("sidebar-collapsed", p.classList.contains("collapsed"));

  // Leaflet precisa recalcular quando o layout muda
  const onEnd = () => {
    map.invalidateSize();
    p.removeEventListener("transitionend", onEnd);
  };
  p.addEventListener("transitionend", onEnd);
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login.html";
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

// Injeta botão "Indicadores" se não existir
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

// Injeta modal de BI se não existir
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
              <tr>
                <th style="text-align:left;">Município</th>
                <th style="text-align:right;">Qtd. de Postes</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  // eventos do modal
  document.getElementById("fecharIndicadores")?.addEventListener("click", fecharIndicadores);
  document.getElementById("filtroEmpresaBI")?.addEventListener("input", atualizarIndicadores);
  document.getElementById("apenasVisiveisBI")?.addEventListener("change", atualizarIndicadores);

  // Atualiza ao mover o mapa (se aberto e opção marcada)
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

  // Carrega Chart.js do CDN se não estiver presente
  function proceed() {
    modal.style.display = "flex";
    atualizarIndicadores();
  }
  if (typeof Chart === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = proceed;
    s.onerror = proceed; // mesmo sem Chart.js, mostra tabela/resumo
    document.head.appendChild(s);
  } else {
    proceed();
  }
}

function fecharIndicadores() {
  const modal = document.getElementById("modalIndicadores");
  if (!modal) return;
  modal.style.display = "none";
}

function atualizarIndicadores() {
  const empresa = document.getElementById("filtroEmpresaBI")?.value || "";
  const apenasVisiveis = !!document.getElementById("apenasVisiveisBI")?.checked;

  const { rows, total } = agregaPorMunicipio({ empresa, apenasVisiveis });

  // tabela
  const tb = document.querySelector("#tabelaMunicipios tbody");
  if (tb) {
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${r.municipio}</td>
        <td class="num">${r.qtd.toLocaleString("pt-BR")}</td>
      </tr>
    `).join("") || `<tr><td colspan="2" style="padding:10px;color:#6b7280;">Sem dados para os filtros.</td></tr>`;
  }

  // resumo
  const resumo = document.getElementById("resumoBI");
  if (resumo) {
    const txtEmp = empresa ? ` para <b>${empresa}</b>` : "";
    const txtScope = apenasVisiveis ? " (apenas área visível)" : "";
    resumo.innerHTML = `Total de postes${txtEmp}: <b>${total.toLocaleString("pt-BR")}</b>${txtScope}`;
  }

  // gráfico (opcional se Chart.js disponível)
  const labels = rows.slice(0, 20).map(r => r.municipio); // top 20
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
        data: {
          labels,
          datasets: [{ label: "Postes por município", data }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { autoSkip: true, maxRotation: 0 } },
            y: { beginAtZero: true }
          }
        }
      });
    }
  }

  // export CSV
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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }
}

/* ====================================================================
   TEMA ESCURO – PALETA DO PRINT (apenas estilo, sem alterar lógica)
   - Aplica na .painel-busca (inputs, selects, botões) e no HUD #tempo
   - Verdes: contorno/realce
==================================================================== */
(function injectDarkPanelStyles(){
  const css = `
  :root{
    --ui-bg:#0f1b2a;           /* fundo principal (azul petróleo) */
    --ui-elev:#132235;         /* cartões elevados */
    --ui-text:#e6edf7;         /* texto principal */
    --ui-muted:#9fb3c8;        /* texto secundário */
    --ui-border:#19d68f;       /* verde contorno */
    --ui-border-dim:#134e37;   /* verde escurecido para hover */
    --ui-accent:#18c77f;       /* verde botões */
    --ui-accent-2:#0fb171;     /* hover */
    --ui-danger:#ef4444;
  }

  /* Painel */
  .painel-busca{
    color:var(--ui-text);
    background:var(--ui-bg);
    border:1px solid var(--ui-border);
    border-radius:14px;
    box-shadow:0 8px 28px rgba(0,0,0,.25);
    padding:12px;
  }
  .painel-busca h2, .painel-busca h3{
    margin:0 0 8px 0;
    font-weight:800;
    letter-spacing:.3px;
    color:var(--ui-text);
  }

  /* Inputs */
  .painel-busca input,
  .painel-busca select,
  .painel-busca textarea{
    width:100%;
    background:var(--ui-elev);
    color:var(--ui-text);
    border:1px solid var(--ui-border);
    border-radius:10px;
    padding:8px 10px;
    outline:none;
    transition:border-color .15s ease, box-shadow .15s ease;
  }
  .painel-busca input::placeholder,
  .painel-busca textarea::placeholder{ color:#89a2b7; }
  .painel-busca input:focus,
  .painel-busca select:focus,
  .painel-busca textarea:focus{
    border-color:var(--ui-accent);
    box-shadow:0 0 0 3px rgba(24,199,127,.25);
  }

  /* Botões */
  .painel-busca button,
  .painel-busca .actions button{
    background:var(--ui-accent);
    color:#031d12;
    font-weight:800;
    border:1px solid var(--ui-border);
    border-radius:10px;
    padding:8px 10px;
    cursor:pointer;
    transition:transform .12s ease, background .15s ease, border-color .15s ease;
  }
  .painel-busca button:hover{ background:var(--ui-accent-2); transform:translateY(-1px); }
  .painel-busca button:disabled{ opacity:.6; cursor:not-allowed; }

  /* Tabelas / cards genéricos nessa área escura */
  .painel-busca .card, .painel-busca table{
    background:var(--ui-elev);
    color:var(--ui-text);
    border:1px solid var(--ui-border);
    border-radius:10px;
  }
  .painel-busca table th, .painel-busca table td{
    border-bottom:1px solid rgba(25,214,143,.18);
  }

  /* HUD (#tempo) no tema escuro */
  #tempo{
    background:rgba(10,20,32,.9) !important;
    color:var(--ui-text) !important;
    border:1px solid var(--ui-border);
  }
  #tempo .hora-row{ color:var(--ui-text) !important; }
  #tempo .hora-row .dot{
    background:radial-gradient(circle at 40% 40%, var(--ui-accent), #0b6a45);
    box-shadow:0 0 0 2px rgba(24,199,127,.25) inset;
  }
  #tempo .weather-card{
    background:rgba(15,27,42,.92) !important;
    border:1px solid var(--ui-border);
  }
  #tempo .tempo-text{ color:var(--ui-text) !important; }
  #tempo .tempo-text small{ color:var(--ui-muted) !important; }
  #tempo .map-row{ border-top:1px dashed rgba(25,214,143,.35) !important; }
  #tempo .select-wrap{
    background:#0d1a2b !important; color:var(--ui-text);
    border-color:var(--ui-border) !important;
  }
  #tempo select{ color:var(--ui-text) !important; }
  #tempo .select-wrap:focus-within{
    box-shadow:0 0 0 3px rgba(24,199,127,.22) !important;
    border-color:var(--ui-accent) !important;
  }
  `;
  const style = document.createElement('style');
  style.id = 'dark-poste-theme';
  style.textContent = css;
  document.head.appendChild(style);
})();
