// =====================================================================
//  script.js — Mapa de Postes + Excel, PDF, Censo, Coordenadas
// =====================================================================

// Inicializa mapa e clusters
const map = L.map("map").setView([-23.2, -45.9], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
const markers = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
});
markers.on("clusterclick", e => e.layer.spiderfy());
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
// Carrega dinamicamente os postes visíveis via BBOX + batch rendering
// ---------------------------------------------------------------------
async function carregarPostesVisiveis() {
  if (overlay) overlay.style.display = "flex";
  const bounds = map.getBounds().toBBoxString(); // minLon,minLat,maxLon,maxLat
  const url = `/api/postes?bbox=${bounds}`;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Limpa dados antigos
    markers.clearLayers();
    todosPostes.length = 0;
    municipiosSet.clear();
    bairrosSet.clear();
    logradourosSet.clear();
    Object.keys(empresasContagem).forEach(k => delete empresasContagem[k]);

    // Batch render para não travar UI
    const batchSize = 200;
    function addBatch(i = 0) {
      const slice = data.slice(i, i + batchSize);
      slice.forEach(p => {
        const [lat, lon] = p.coordenadas.split(/,\s*/).map(Number);
        if (isNaN(lat) || isNaN(lon)) return;
        todosPostes.push({ ...p, lat, lon });
        municipiosSet.add(p.nome_municipio);
        bairrosSet.add(p.nome_bairro);
        logradourosSet.add(p.nome_logradouro);
        p.empresas.forEach(e => {
          empresasContagem[e] = (empresasContagem[e] || 0) + 1;
        });
        const color = p.empresas.length >= 5 ? "red" : "green";
        const m = L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.8,
        }).bindTooltip(
          `ID: ${p.id} — ${p.empresas.length} empresas`,
          { direction: "top", sticky: true }
        );
        m.on("click", () => abrirPopup(p));
        markers.addLayer(m);
      });
      if (i + batchSize < data.length) {
        setTimeout(() => addBatch(i + batchSize), 0);
      } else {
        if (overlay) overlay.style.display = "none";
        preencherListas();
      }
    }
    addBatch();
  } catch (err) {
    console.error("Erro ao carregar postes por BBOX:", err);
    if (overlay) overlay.style.display = "none";
    alert("Erro ao carregar dados dos postes.");
  }
}

map.on("moveend", carregarPostesVisiveis);
carregarPostesVisiveis();

// ---------------------------------------------------------------------
// Preenche datalists de autocomplete
// ---------------------------------------------------------------------
function preencherListas() {
  const mount = (set, id) => {
    const dl = document.getElementById(id);
    dl.innerHTML = "";
    Array.from(set)
      .sort()
      .forEach(v => {
        const o = document.createElement("option");
        o.value = v;
        dl.appendChild(o);
      });
  };
  mount(municipiosSet, "lista-municipios");
  mount(bairrosSet, "lista-bairros");
  mount(logradourosSet, "lista-logradouros");
  const dlEmp = document.getElementById("lista-empresas");
  dlEmp.innerHTML = "";
  Object.keys(empresasContagem)
    .sort()
    .forEach(e => {
      const o = document.createElement("option");
      o.value = e;
      o.label = `${e} (${empresasContagem[e]} postes)`;
      dlEmp.appendChild(o);
    });
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
      censoIds = new Set(arr.map(i => String(i.poste)));
    } catch {
      alert("Não foi possível carregar dados do censo.");
      censoMode = false;
      return todosPostes.forEach(adicionarMarker);
    }
  }
  todosPostes
    .filter(p => censoIds.has(String(p.id)))
    .forEach(poste => {
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

// Busca por ID
function buscarID() {
  const id = document.getElementById("busca-id").value.trim();
  const p = todosPostes.find(x => x.id === id);
  if (!p) return alert("Poste não encontrado.");
  map.setView([p.lat, p.lon], 18);
  abrirPopup(p);
}

// Busca por coordenada
function buscarCoordenada() {
  const inpt = document.getElementById("busca-coord").value.trim();
  const [lat, lon] = inpt.split(/,\s*/).map(Number);
  if (isNaN(lat) || isNaN(lon)) return alert("Use o formato: lat,lon");
  map.setView([lat, lon], 18);
  L.popup()
    .setLatLng([lat, lon])
    .setContent(`<b>Coordenada:</b> ${lat}, ${lon}`)
    .openOn(map);
}

// Filtro Município/Bairro/Logradouro/Empresa
function filtrarLocal() {
  const getVal = id => document.getElementById(id).value.trim().toLowerCase();
  const [mun, bai, log, emp] = [
    "busca-municipio",
    "busca-bairro",
    "busca-logradouro",
    "busca-empresa",
  ].map(getVal);
  const filtro = todosPostes.filter(p =>
    (!mun || p.nome_municipio.toLowerCase() === mun) &&
    (!bai || p.nome_bairro.toLowerCase() === bai) &&
    (!log || p.nome_logradouro.toLowerCase() === log) &&
    (!emp || p.empresas.join(", ").toLowerCase().includes(emp))
  );
  if (!filtro.length) return alert("Nenhum poste encontrado com esses filtros.");
  markers.clearLayers();
  filtro.forEach(adicionarMarker);

  // exporta direto para Excel
  fetch("/api/postes/report", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: filtro.map(p => p.id) }),
  })
    .then(async res => {
      if (res.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Não autorizado");
      }
      if (!res.ok) {
        let err; try { err = (await res.json()).error } catch {};
        throw new Error(err || `HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then(b => {
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = "relatorio_postes_filtro.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    })
    .catch(e => { console.error("Erro exportar filtro:", e); alert("Falha ao gerar Excel:\n"+e.message); });
}

// Reset mapa
function resetarMapa() {
  markers.clearLayers();
  todosPostes.forEach(adicionarMarker);
}

// Adiciona marker padrão
function adicionarMarker(p) {
  const cor = p.empresas.length >= 5 ? "red" : "green";
  const c = L.circleMarker([p.lat, p.lon], {
    radius: 6,
    fillColor: cor,
    color: "#fff",
    weight: 2,
    fillOpacity: 0.8,
  }).bindTooltip(
    `ID: ${p.id} — ${p.empresas.length} ${
      p.empresas.length === 1 ? "empresa" : "empresas"
    }`, { direction: "top", sticky: true }
  );
  c.on("click", () => abrirPopup(p));
  markers.addLayer(c);
}

// Abre popup
function abrirPopup(p) {
  const list = p.empresas.map(e => `<li>${e}</li>`).join("");
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

// Consulta massiva + traçado + intermediários
function consultarIDsEmMassa() {
  const ids = document
    .getElementById("ids-multiplos")
    .value.split(/[^0-9]+/)
    .filter(Boolean);
  if (!ids.length) return alert("Nenhum ID fornecido.");
  markers.clear...
