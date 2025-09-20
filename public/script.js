// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
// =====================================================================

// ------------------------- Estilos do HUD (hora/tempo/mapa) ----------
(function injectHudStyles() {
  const css = `
    /* container do bloco de hora+tempo já existente (#tempo) */
    #tempo{
      display:flex;
      align-items:center;
      gap:14px;               /* respiro entre itens */
      padding:10px 12px;
      border-radius:12px;
      background:rgba(255,255,255,0.9);
      box-shadow:0 6px 18px rgba(0,0,0,.12);
      backdrop-filter:saturate(1.2) blur(2px);
    }
    #tempo img{
      width:28px; height:28px; object-fit:contain;
      margin-right:6px;
    }
    #tempo .tempo-text{
      line-height:1.15;
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:#1f2937;
    }
    #tempo .hora{
      font-weight:700;
      margin-right:2px;
      color:#0f172a;
    }
    /* seletor de mapa (ao lado, com bom espaçamento) */
    #base-switcher{
      display:inline-flex;
      align-items:center;
      gap:8px;
      margin-left:22px;       /* solta do bloco de tempo */
      padding-left:14px;
      border-left:1px solid rgba(0,0,0,.08);
    }
    #base-switcher .lbl{
      font: 12px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      letter-spacing:.2px;
      color:#475569;
      font-weight:600;
    }
    #base-switcher select{
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      padding:6px 28px 6px 10px;
      border:1px solid #d1d5db;
      border-radius:8px;
      background:#fff;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.06);
      outline:none;
      transition:border-color .15s ease, box-shadow .15s ease;
    }
    #base-switcher select:focus{
      border-color:#6366f1;
      box-shadow:0 0 0 3px rgba(99,102,241,.20);
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

// Inicializa mapa (preferCanvas ajuda em muitas features vetoriais)
const map = L.map("map", { preferCanvas: true }).setView([-23.2, -45.9], 12);

// ------------------------- Camadas base -------------------------------
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

// Alternador de base (usado pelo seletor no rodapé)
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
  chunkInterval: 50,
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
  // empresas com label
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

// ===== ÍCONES 36px em SVG inline (poste realista, 2 travessas) =====
function makePoleDataUri(hex) {
  const svg = `
  <svg width="36" height="36" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="woodGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%"  stop-color="#7a5c34"/>
        <stop offset="55%" stop-color="#8b673d"/>
        <stop offset="100%" stop-color="#6a4e2c"/>
      </linearGradient>
      <linearGradient id="steelGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#8e8e8e"/>
        <stop offset="45%" stop-color="#d9d9d9"/>
        <stop offset="100%" stop-color="#7a7a7a"/>
      </linearGradient>
      <radialGradient id="haloGrad" cx="12" cy="13" r="10" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="${hex}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${hex}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <circle cx="12" cy="13" r="10" fill="url(#haloGrad)"/>

    <path d="M12 4.2 C11.5 4.2 11.2 4.4 11.1 4.9 L11.1 19.5
             C11.1 20.1 11.7 20.6 12.0 20.6
             C12.3 20.6 12.9 20.1 12.9 19.5 L12.9 4.9
             C12.8 4.4 12.5 4.2 12.0 4.2 Z"
          fill="url(#woodGrad)"/>
    <rect x="11.1" y="3.7" width="1.8" height="0.7" rx="0.2" fill="#4a3a22" opacity="0.9"/>

    <g transform="rotate(-2 12 7.2)">
      <rect x="5.0" y="6.6" width="14.0" height="1.4" rx="0.7" fill="url(#steelGrad)"/>
      <circle cx="7.0"  cy="7.3" r="0.7" fill="#bfbfbf"/>
      <circle cx="12.0" cy="7.3" r="0.7" fill="#bfbfbf"/>
      <circle cx="17.0" cy="7.3" r="0.7" fill="#bfbfbf"/>
      <path d="M5.0 6.9 C 7.8 8.0, 16.2 8.0, 19.0 6.9" fill="none" stroke="#6e6e6e" stroke-width="0.6" stroke-linecap="round"/>
      <path d="M5.0 7.6 C 8.2 8.6, 15.8 8.6, 19.0 7.6" fill="none" stroke="#6e6e6e" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>
    </g>

    <g transform="rotate(1 12 10.2)">
      <rect x="6.0" y="9.5" width="12.0" height="1.3" rx="0.65" fill="url(#steelGrad)"/>
      <circle cx="7.8"  cy="10.2" r="0.65" fill="#c7c7c7"/>
      <circle cx="12.0" cy="10.2" r="0.65" fill="#c7c7c7"/>
      <circle cx="16.2" cy="10.2" r="0.65" fill="#c7c7c7"/>
      <path d="M6.0 9.9 C 8.5 10.9, 15.5 10.9, 18.0 9.9" fill="none" stroke="#6e6e6e" stroke-width="0.55" stroke-linecap="round" opacity="0.85"/>
    </g>

    <path d="M12.7 4.9 L12.7 19.5" stroke="rgba(255,255,255,0.18)" stroke-width="0.35"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ICON_GREEN_48 = L.icon({
  iconUrl: makePoleDataUri("#2E7D32"),
  iconSize: [36, 36],
  iconAnchor: [18, 21],
  popupAnchor: [0, -16],
  tooltipAnchor: [0, -16],
});
const ICON_RED_48 = L.icon({
  iconUrl: makePoleDataUri("#D32F2F"),
  iconSize: [36, 36],
  iconAnchor: [18, 21],
  popupAnchor: [0, -16],
  tooltipAnchor: [0, -16],
});
function poleIcon48(color) {
  return color === "red" ? ICON_RED_48 : ICON_GREEN_48;
}
function poleColorByEmpresas(qtd) {
  return qtd >= 5 ? "red" : "green";
}

// ---------------------------------------------------------------------
// Adiciona marker padrão (ícone 36px; sem limpar no zoom)
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
  const html = `
    <b>ID:</b> ${p.id}<br>
    <b>Coord:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}<br>
    <b>Município:</b> ${p.nome_municipio}<br>
    <b>Bairro:</b> ${p.nome_bairro}<br>
    <b>Logradouro:</b> ${p.nome_logradouro}<br>
    <b>Empresas:</b><ul>${list}</ul>
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
  const s = document.querySelector("#hora span");
  if (!s) return;
  s.textContent = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
setInterval(mostrarHoraLocal, 60000);
mostrarHoraLocal();

// ---------------------------------------------------------------------
// Clima via OpenWeatherMap
// ---------------------------------------------------------------------
function obterPrevisaoDoTempo(lat, lon) {
  const API_KEY = "b93c96ebf4fef0c26a0caaacdd063ee0";
  fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&lang=pt_br&units=metric&appid=${API_KEY}`
  )
    .then((r) => r.json())
    .then((data) => {
      const url = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
      const div = document.getElementById("tempo");
      // garante estrutura: <img> + <span.tempo-text>
      let img = div.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        div.prepend(img);
      }
      let span = div.querySelector("span.tempo-text");
      if (!span) {
        span = document.createElement("span");
        span.className = "tempo-text";
        div.appendChild(span);
      }
      img.src = url;
      span.textContent = `${data.weather[0].description}, ${data.main.temp.toFixed(1)}°C (${data.name})`;
    })
    .catch(() => {
      const t = document.querySelector("#tempo .tempo-text") || document.querySelector("#tempo span");
      if (t) t.textContent = "Erro ao obter clima.";
    });
}
navigator.geolocation.getCurrentPosition(
  ({ coords }) => obterPrevisaoDoTempo(coords.latitude, coords.longitude),
  () => {}
);
setInterval(
  () =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => obterPrevisaoDoTempo(coords.latitude, coords.longitude),
      () => {}
    ),
  600000
);

// ----------------- Seletor de base no rodapé (ao lado do clima) ------
(function mountBaseSwitcher() {
  const tempoDiv = document.getElementById("tempo");
  if (!tempoDiv) return;

  const wrap = document.createElement("span");
  wrap.id = "base-switcher";

  const lbl = document.createElement("span");
  lbl.textContent = "Mapa:";
  lbl.className = "lbl";

  const select = document.createElement("select");
  select.innerHTML = `
    <option value="rua">Rua</option>
    <option value="sat">Satélite</option>
    <option value="satlabels">Satélite + rótulos</option>
  `;
  select.addEventListener("change", (e) => setBase(e.target.value));

  wrap.appendChild(lbl);
  wrap.appendChild(select);
  tempoDiv.appendChild(wrap);
})();

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
