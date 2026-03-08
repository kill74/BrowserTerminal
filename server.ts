import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/proxy", async (req, res) => {
    const urlStr = req.query.url as string;
    if (!urlStr) {
      return res.status(400).json({ error: "Missing URL" });
    }
    
    try {
      const response = await fetch(urlStr, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const text = await response.text();
      res.send(text);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/iframe-proxy", async (req, res) => {
    const urlStr = req.query.url as string;
    console.log(`[PROXY] Request for: ${urlStr}`);
    if (!urlStr) {
      return res.status(400).send("Missing URL");
    }
    
    try {
      const url = new URL(urlStr);
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      });
      
      console.log(`[PROXY] Fetched ${urlStr} - Status: ${response.status}`);
      
      const contentType = response.headers.get("content-type") || "";
      
      const headers = new Headers(response.headers);
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.delete("cross-origin-opener-policy");
      headers.delete("cross-origin-embedder-policy");
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      
      res.status(response.status);
      headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      if (contentType.includes("text/html")) {
        let html = await response.text();
        
        // Strip all script tags to prevent frame-busting and JS errors
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Strip meta refresh to prevent breaking out of the proxy
        html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');
        
        // Strip CSP meta tags
        html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
        
        const finalUrl = new URL(response.url);
        const baseTag = `<base href="${finalUrl.origin}${finalUrl.pathname}">
<style>
  html, body {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
</style>`;
        
        const scriptInjection = `
<script>
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (a && a.href && !a.href.startsWith('javascript:')) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'navigate', url: a.href }, '*');
    }
  }, true);
  document.addEventListener('submit', function(e) {
    const form = e.target.closest('form');
    if (form && form.method.toUpperCase() === 'GET') {
      e.preventDefault();
      e.stopPropagation();
      const formData = new FormData(form);
      const params = new URLSearchParams();
      for (const pair of formData.entries()) {
        params.append(pair[0], pair[1]);
      }
      const url = new URL(form.action || window.location.href);
      const existingParams = new URLSearchParams(url.search);
      for (const pair of params.entries()) {
        existingParams.set(pair[0], pair[1]);
      }
      url.search = existingParams.toString();
      window.parent.postMessage({ type: 'navigate', url: url.toString() }, '*');
    }
  }, true);
</script>
`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>\n${baseTag}`);
        } else {
          html = `${baseTag}\n${html}`;
        }
        
        if (html.includes("</body>")) {
          html = html.replace("</body>", `${scriptInjection}\n</body>`);
        } else {
          html = `${html}\n${scriptInjection}`;
        }
        res.send(html);
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (error: any) {
      res.status(500).send(`Error loading iframe: ${error.message}`);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
