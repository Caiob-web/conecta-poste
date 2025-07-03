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
markers.on("clusterclick", (e) => e.layer.spiderfy());
map.addLayer(markers);

// Dados e sets para autocomplete
const todosPostes = [];
const empresasContagem = {};
const municipiosSet = new Set();
const bairrosSet = new Set();
const logradourosSet = new Set();
let censoMode = false,
  censoIds = null;

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
      if (!agrupado[p.id])
        agrupado[p.id] = { ...p, empresas: new Set(), lat, lon };
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

// Busca por ID
function buscarID() {
  const id = document.getElementById("busca-id").value.trim();
  const p = todosPostes.find((x) => x.id === id);
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
  const getVal = (id) => document.getElementById(id).value.trim().toLowerCase();
  const [mun, bai, log, emp] = [
    "busca-municipio",
    "busca-bairro",
    "busca-logradouro",
    "busca-empresa",
  ].map(getVal);
  const filtro = todosPostes.filter(
    (p) =>
      (!mun || p.nome_municipio.toLowerCase() === mun) &&
      (!bai || p.nome_bairro.toLowerCase() === bai) &&
      (!log || p.nome_logradouro.toLowerCase() === log) &&
      (!emp || p.empresas.join(", ").toLowerCase().includes(emp))
  );
  if (!
