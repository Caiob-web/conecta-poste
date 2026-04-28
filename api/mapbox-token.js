module.exports = function handler(req, res) {
  try {
    const token =
      process.env.MAPBOX_TOKEN ||          // ✅ padrão recomendado
      process.env.mapboxtoken ||           // compat (se existir)
      process.env.MAPBOXTOKEN ||           // compat
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 
      "";

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    res.end(JSON.stringify({ token }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ token: "" }));
  }
};
