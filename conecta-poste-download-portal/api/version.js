const FALLBACK_VERSION = "1.0.60";
const RELEASE_API_URL = "https://api.github.com/repos/Caiob-web/conecta-poste/releases/latest";

function extractVersion(tagName = "") {
  const match = String(tagName).match(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : FALLBACK_VERSION;
}

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "conecta-poste-download-portal"
      }
    });

    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const release = await response.json();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    res.end(JSON.stringify({
      version: extractVersion(release.tag_name),
      tagName: release.tag_name,
      updatedAt: release.published_at ? new Date(release.published_at).toLocaleDateString("pt-BR") : null
    }));
  } catch {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60");
    res.end(JSON.stringify({
      version: FALLBACK_VERSION,
      tagName: `desktop-v${FALLBACK_VERSION}`,
      updatedAt: null
    }));
  }
};
