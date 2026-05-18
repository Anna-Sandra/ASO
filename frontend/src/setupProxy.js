const { createProxyMiddleware } = require("http-proxy-middleware");

/**
 * Only forward API traffic to the backend. The simple `package.json` proxy was
 * sending webpack HMR files (*.hot-update.json) to :4000 and causing ECONNREFUSED
 * when the API was down or unrelated to that path.
 */
module.exports = function proxyApp(app) {
  const target = process.env.REACT_APP_PROXY_TARGET || "http://localhost:4000";
  /** Long proxy timeouts so SSE (assistant chat) survives slow CPU Ollama. */
  const longStreamTimeout = Number(process.env.REACT_APP_PROXY_SSE_TIMEOUT_MS) || 900000;
  app.use(
    "/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      proxyTimeout: longStreamTimeout,
      timeout: longStreamTimeout,
      onProxyReq(proxyReq, _req, _res) {
        /** Avoid intermediary gzip/deflate buffering that delays token chunks. */
        proxyReq.setHeader("accept-encoding", "identity");
      }
    })
  );
};
