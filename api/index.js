// api/index.js
// Vercel chama isso como função serverless.
// Basta exportar o app do server.js (sem serverless-http).

const app = require("../server");
module.exports = app;
