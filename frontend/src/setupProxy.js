const { createProxyMiddleware } = require("http-proxy-middleware");

/**
 * Only forward API traffic to the backend. The simple `package.json` proxy was
 * sending webpack HMR files (*.hot-update.json) to :4000 and causing ECONNREFUSED
 * when the API was down or unrelated to that path.
 */
module.exports = function proxyApp(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.REACT_APP_PROXY_TARGET || "http://localhost:4000",
      changeOrigin: true
    })
  );
};
