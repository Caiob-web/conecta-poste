// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
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
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

// ------------------------- Mapa & Camadas base -----------------------
const map = L.map("map", { preferCanvas: true }).setView([-23.2, -45.9], 12);

// Rua (OSM)
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
});
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

// -------------------- Clusters com chunked loading -------------------
const markers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
  chunkedLoading: true,
  chunkDelay: 5,
  chunkInterval: 50
});
markers.on("clusterclick", (e) => e.layer.spiderfy());
map.addLayer(markers);

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
        <svg class="ico-globe" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm0 2c1.38 0 2.64.35 3.75.96-.78.68-1.6 1.91-2.16 3.54H10.4C9.84 6.87 9.02 5.64 8.25 4.96A7.96 7.96 0 0 1 12 4Zm-6.32 4h2.62c.23.98.37 2.07.39 3.2H4.4A8.05 8.05 0 0 1 5.68 8Zm-1.28 6h4.29c-.02 1.13-.16 2.22-.39 3.2H5.68A8.05 8.05 0  1 4.4 14Zm2.85 4h.01c.77-.68 1.59-1.91 2.14-3.54h3.19c.56 1.63 1.38 2.86 2.15 3.54A7.96 7.96 0 0 1 12 20c-1.38 0-2.64-.35-3.75-.96ZM19.6 14a8.05 8.05 0 0 1-1.28 3.2h-2.62c-.23-.98-.37-2.07-.39-3.2h4.29Zm-4.29-2c.02-1.13.16-2.22.39-3.2h2.62A8.05 8.05 0 0 1 19.6 12h-4.29ZM9.7 12c.02-1.13-.12-2.22-.36-3.2h5.32c-.24.98-.38 2.07-.36 3.2H9.7Zm.36 2h4.88c-.24 1.13-.6 2.22-1.06 3.2H11.1c-.46-.98-.82-2.07-1.06-3.2Z" fill="#111827"/></svg>
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

  // wire do seletor
  const selectBase = card.querySelector("#select-base");
  selectBase.addEventListener("change", e => setBase(e.target.value));
})();

// ---------------------------------------------------------------------
// Carrega /api/postes, trata 401 redirecionando
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
    const postsArray = Object.values(agrupado).map((p) => ({
      ...p,
      empresas: [...p.empresas],
    }));

    // Render em batches
    function addBatch(i = 0, batchSize = 500) {
      const slice = postsArray.slice(i, i + batchSize);
      slice.forEach((poste) => {
        todosPostes.push(poste);
        adicionarMarker(poste);
        municipiosSet.add(poste.nome_municipio);
        bairrosSet.add(poste.nome_bairro);
        logradourosSet.add(poste.nome_logradouro);
        poste.empresas.forEach(
          (e) => (empresasContagem[e] = (empresasContagem[e] || 0) + 1)
        );
      });
      if (i + batchSize < postsArray.length)
        setTimeout(() => addBatch(i + batchSize, batchSize), 0);
      else preencherListas();
    }
    addBatch();
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
  Object.keys(empresasContagem)
    .sort()
    .forEach((e) => {
      const o = document.createElement("option");
      o.value = e;
      o.label = `${e} (${empresasContagem[e]} postes)`;
      dlEmp.appendChild(o);
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
  if (!censoMode) return todosPostes.forEach(adicionarMarker);

  if (!censoIds) {
    try {
      const res = await fetch("/api/censo");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      censoIds = new Set(arr.map((i) => String(i.poste)));
    } catch {
      alert("Não foi possível carregar dados do censo.");
      censoMode = false;
      return todosPostes.forEach(adicionarMarker);
    }
  }
  todosPostes
    .filter((p) => censoIds.has(String(p.id)))
    .forEach((poste) => {
      const c = L.circleMarker([poste.lat, poste.lon], {
        radius: 6,
        color: "#666",
        fillColor: "#bbb",
        weight: 2,
        fillOpacity: 0.8,
      }).bindTooltip(`ID: ${poste.id}`, { direction: "top", sticky: true });
      c.on("click", () => abrirPopup(poste));
      markers.addLayer(c);
    });
});

// ---------------------------------------------------------------------
// Interações / filtros
// ---------------------------------------------------------------------
function buscarID() {
  const id = document.getElementById("busca-id").value.trim();
  const p = todosPostes.find((x) => x.id === id);
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], 18);
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
}

function resetarMapa() {
  markers.clearLayers();
  todosPostes.forEach(adicionarMarker);
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
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
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
// === Street Imagery (sem Google) — Helpers + Botões + Controle =======
// ---------------------------------------------------------------------
function buildBingStreetsideURL(lat, lng, zoom = 19) {
  return `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=${zoom}&style=x`;
}
function buildMapillaryURL(lat, lng, zoom = 17) {
  return `https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=${zoom}&focus=map`;
}
function bingStreetsideButtonHTML(lat, lng, label = "Abrir Bing Streetside") {
  const url = buildBingStreetsideURL(lat, lng);
  return `<button onclick="window.open('${url}','_blank','noopener')"
    style="padding:6px 10px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;cursor:pointer;font:12px system-ui">
    ${label}
  </button>`;
}
function mapillaryButtonHTML(lat, lng, label = "Abrir Mapillary") {
  const url = buildMapillaryURL(lat, lng);
  return `<button onclick="window.open('${url}','_blank','noopener')"
    style="padding:6px 10px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;cursor:pointer;font:12px system-ui">
    ${label}
  </button>`;
}
function streetImageryBlockHTML(lat, lng) {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${bingStreetsideButtonHTML(lat, lng)}
      ${mapillaryButtonHTML(lat, lng)}
    </div>
    <small style="color:#777;display:block;margin-top:4px">
      *Se não houver cobertura no ponto, o serviço volta para o mapa.
    </small>
  `.trim();
}
// Controle opcional no mapa (abre na coordenada do centro)
(function addStreetImageryControl() {
  if (typeof L === "undefined" || typeof map === "undefined" || !map) return;
  const Control = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const div = L.DomUtil.create("div", "leaflet-bar");
      div.style.display = "flex";
      div.style.flexDirection = "column";
      const btn1 = L.DomUtil.create("a", "", div);
      btn1.href = "#";
      btn1.title = "Abrir Bing Streetside no centro do mapa";
      btn1.innerHTML = "Streetside";
      btn1.style.padding = "6px 8px";
      btn1.style.textDecoration = "none";
      const btn2 = L.DomUtil.create("a", "", div);
      btn2.href = "#";
      btn2.title = "Abrir Mapillary no centro do mapa";
      btn2.innerHTML = "Mapillary";
      btn2.style.padding = "6px 8px";
      btn2.style.textDecoration = "none";
      btn2.style.borderTop = "1px solid #ccc";
      L.DomEvent.on(btn1, "click", (e) => {
        L.DomEvent.stop(e);
        const c = map.getCenter();
        window.open(buildBingStreetsideURL(c.lat, c.lng), "_blank", "noopener");
      });
      L.DomEvent.on(btn2, "click", (e) => {
        L.DomEvent.stop(e);
        const c = map.getCenter();
        window.open(buildMapillaryURL(c.lat, c.lng), "_blank", "noopener");
      });
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  map.addControl(new Control());
})();

/* ====================================================================
   Mapillary embutido no popup (interativo dentro do seu app)
   - Carrega SDK via CDN (dinamicamente)
   - Busca a imagem MAIS PRÓXIMA via API v4 (closeto)
   - Instancia o viewer no container do popup
   Docs de CDN/SDK: mapillary-js v4 (CDN). API v4 + 'closeto'. :contentReference[oaicite:1]{index=1}
   ==================================================================== */
const MAPILLARY_TOKEN = "COLOQUE_SUA_MAPILLARY_TOKEN_AQUI";

// carrega CSS/JS do Mapillary uma vez
let _mlyReadyPromise;
function ensureMapillaryReady() {
  if (_mlyReadyPromise) return _mlyReadyPromise;
  _mlyReadyPromise = new Promise((resolve, reject) => {
    // CSS
    const cssId = "mly-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css";
      document.head.appendChild(link);
    }
    // JS
    const jsId = "mly-js";
    if (window.Mapillary) return resolve();
    const s = document.createElement("script");
    s.id = jsId;
    s.src = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar Mapillary JS"));
    document.head.appendChild(s);
  });
  return _mlyReadyPromise;
}

// encontra imagem mais próxima (tenta lng,lat e depois lat,lng)
async function getNearestMapillaryImageId(lat, lng) {
  if (!MAPILLARY_TOKEN || MAPILLARY_TOKEN.includes("COLOQUE_")) return null;
  const base = "https://graph.mapillary.com/images?fields=id&limit=1";
  const tryFetch = async (closeto) => {
    const url = `${base}&closeto=${closeto}&access_token=${MAPILLARY_TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.data && j.data[0] && j.data[0].id ? j.data[0].id : null;
  };
  // API costuma aceitar lng,lat; alguns exemplos usam lat,lon — testamos os dois.
  return (await tryFetch(`${lng},${lat}`)) || (await tryFetch(`${lat},${lng}`)) || null;
}

// HTML do container do viewer
function mapillaryEmbedHTML(containerId, w = 420, h = 250) {
  return `
    <div style="margin-top:8px">
      <div id="${containerId}" class="mly-embed" style="width:${w}px;height:${h}px;border-radius:10px;overflow:hidden;background:#eef1f4"></div>
      <small style="color:#777">Se não aparecer, pode não haver cobertura do Mapillary nesse ponto.</small>
    </div>
  `;
}

// monta o viewer no container
async function mountMapillary(containerId, imageId) {
  try {
    await ensureMapillaryReady();
    // eslint-disable-next-line no-undef
    new Mapillary.Viewer({
      container: containerId,
      accessToken: MAPILLARY_TOKEN,
      imageId: imageId,
      component: { cover: true },
    });
  } catch (e) {
    console.warn("Mapillary viewer falhou:", e);
  }
}

// inicializa o viewer quando o popup abrir
map.on("popupopen", async (e) => {
  const root = e?.popup?._contentNode;
  if (!root) return;
  const div = root.querySelector(".mly-embed");
  if (!div || div.dataset.loaded) return;
  div.dataset.loaded = "1";
  const lat = Number(div.dataset.lat) || e.popup.getLatLng().lat;
  const lng = Number(div.dataset.lng) || e.popup.getLatLng().lng;
  const imageId = await getNearestMapillaryImageId(lat, lng);
  if (imageId) {
    await mountMapillary(div.id, imageId);
  } else {
    div.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font:12px system-ui;color:#666">Sem cobertura Mapillary aqui</div>`;
  }
});

// ---------------------------------------------------------------------
// Adiciona marker padrão
// ---------------------------------------------------------------------
function adicionarMarker(p) {
  const cor = poleColorByEmpresas(p.empresas.length);
  const m = L.marker([p.lat, p.lon], {
    icon: poleIcon48(cor),
  }).bindTooltip(
    `ID: ${p.id} — ${p.empresas.length} ${p.empresas.length === 1 ? "empresa" : "empresas"}`,
    { direction: "top", sticky: true }
  );
  m.on("click", () => abrirPopup(p));
  markers.addLayer(m);
}

// Abre popup
function abrirPopup(p) {
  const list = p.empresas.map((e) => `<li>${e}</li>`).join("");
  // cria um id único para o container do Mapillary
  const mlyId = `mly_${p.id}_${Math.random().toString(36).slice(2)}`;
  const html = `
    <b>ID:</b> ${p.id}<br>
    <b>Coord:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}<br>
    <b>Município:</b> ${p.nome_municipio}<br>
    <b>Bairro:</b> ${p.nome_bairro}<br>
    <b>Logradouro:</b> ${p.nome_logradouro}<br>
    <b>Empresas:</b><ul>${list}</ul>

    ${mapillaryEmbedHTML(mlyId, 420, 250)}
    ${streetImageryBlockHTML(p.lat, p.lon)}
  `;
  L.popup().setLatLng([p.lat, p.lon]).setContent(html).openOn(map);

  // guarda lat/lng no container para o listener usar
  const div = document.getElementById(mlyId);
  if (div) { div.dataset.lat = p.lat; div.dataset.lng = p.lon; }
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
    .forEach((id) => { document.getElementById(id).value = ""; });
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

// Toggle painel
document.getElementById("togglePainel").addEventListener("click", () => {
  const p = document.querySelector(".painel-busca");
  p.style.display = p.style.display === "none" ? "block" : "none";
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login.html";
});
