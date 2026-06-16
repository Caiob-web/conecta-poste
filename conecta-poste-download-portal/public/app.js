const loginPanel = document.getElementById("loginPanel");
const downloadPanel = document.getElementById("downloadPanel");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const welcomeText = document.getElementById("welcomeText");
const greetingText = document.getElementById("greetingText");
const releaseVersion = document.getElementById("releaseVersion");
const releaseMeta = document.getElementById("releaseMeta");
const downloadVersion = document.getElementById("downloadVersion");

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia — Conecta Poste";
  if (hour < 18) return "Boa tarde — Conecta Poste";
  return "Boa noite — Conecta Poste";
}

if (greetingText) {
  greetingText.textContent = getGreeting();
}

async function carregarVersaoAtual() {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) throw new Error("Falha ao carregar versão.");

    const data = await res.json();
    const version = data.version || "1.0.59";
    const label = `v${version}`;

    if (releaseVersion) releaseVersion.textContent = version;
    if (downloadVersion) downloadVersion.textContent = label;
    if (releaseMeta) {
      releaseMeta.textContent = `Windows • WebView2 • SQLite offline • atualizado em ${data.updatedAt || "release latest"}`;
    }
  } catch {
    if (releaseVersion) releaseVersion.textContent = "1.0.59";
    if (downloadVersion) downloadVersion.textContent = "v1.0.59";
  }
}

function setMessage(text, ok = false) {
  loginMessage.textContent = text || "";
  loginMessage.classList.toggle("ok", Boolean(ok));
}

function showDownload(user) {
  loginPanel.classList.add("hidden");
  downloadPanel.classList.remove("hidden");
  welcomeText.textContent = `Olá, ${user.username}. Seu download está liberado.`;
}

function showLogin() {
  downloadPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

async function checkSession() {
  try {
    const res = await fetch("/api/session", { credentials: "include" });
    const data = await res.json();
    if (data.authenticated && data.user) {
      showDownload(data.user);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");
  loginButton.disabled = true;
  loginButton.textContent = "Validando...";

  const form = new FormData(loginForm);

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Não foi possível entrar.");
      return;
    }

    setMessage("Login autorizado.", true);
    showDownload(data.user);
  } catch {
    setMessage("Falha de conexão. Tente novamente.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Entrar no portal";
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include"
    });
  } finally {
    loginForm.reset();
    showLogin();
  }
});

carregarVersaoAtual();
checkSession();
