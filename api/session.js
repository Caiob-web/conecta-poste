const { readSession } = require("./_auth.js");

module.exports = function handler(req, res) {
  const session = readSession(req);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    authenticated: Boolean(session),
    user: session ? { id: session.sub, username: session.username } : null
  }));
};
