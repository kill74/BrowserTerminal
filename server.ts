import express from "express";
import { createServer as createViteServer } from "vite";
import ytdl from "@distube/ytdl-core";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ============================================================================
  // API ROUTES
  // ============================================================================

  // 1. Basic Proxy (used for the 'curl' command)
  // This simply fetches a URL and returns the raw text.
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          // Pretend to be a normal browser so websites don't block us
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({ 
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
          status: response.status 
        });
      }
      
      const text = await response.text();
      res.json({ content: text });
    } catch (error: any) {
      clearTimeout(timeout);
      const isTimeout = error.name === 'AbortError';
      console.error(`[PROXY ERROR] ${isTimeout ? 'Request timed out' : error.message}`);
      res.status(500).json({ 
        error: isTimeout ? "Connection timed out (10s)" : `Connection error: ${error.message}` 
      });
    }
  });

  // 2. Iframe Proxy (used for the 'browse' and 'search' commands)
  // This is the magic that allows us to embed websites inside our terminal.
  // It fetches the website, strips out security headers that block iframes,
  // and injects custom scripts to handle navigation.
  const iframeProxyHandler = async (req: express.Request, res: express.Response) => {
    const targetUrl = req.query.url as string;
    
    if (!targetUrl) {
      return res.status(400).send("Missing URL parameter");
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
      const url = new URL(targetUrl);
      
      const fetchOptions: RequestInit = {
        method: req.method,
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
          "Referer": url.origin,
          "Origin": url.origin
        }
      };

      // Forward body if it's a POST request
      if (req.method === 'POST' && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
        (fetchOptions.headers as any)["Content-Type"] = "application/json";
      }

      let response = await fetch(url.toString(), fetchOptions);
      clearTimeout(timeout);

      // Handle Redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const absoluteLocation = new URL(location, url.toString()).toString();
          return res.redirect(`/api/iframe-proxy?url=${encodeURIComponent(absoluteLocation)}`);
        }
      }

      if (!response.ok && response.status !== 404) {
        res.status(response.status).send(`
          <div style="font-family: sans-serif; padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
            <h3 style="margin-top: 0;">Failed to load website</h3>
            <p><strong>URL:</strong> ${targetUrl}</p>
            <p><strong>Status:</strong> ${response.status} ${response.statusText}</p>
          </div>
        `);
        return;
      }
      
      const headers = new Headers(response.headers);
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.delete("content-security-policy-report-only");
      headers.delete("cross-origin-opener-policy");
      headers.delete("content-encoding");
      headers.delete("content-length");
      
      res.status(response.status);
      headers.forEach((value, key) => {
        if (!['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      
      const contentType = response.headers.get("content-type") || "";
      
      if (contentType.includes("text/html")) {
        let html = await response.text();
        const finalUrl = new URL(response.url);

        // --- URL Rewriting ---
        // We rewrite URLs in the HTML so that all resources go through our proxy.
        // This helps with CORS and relative path issues.
        const proxyUrl = (originalUrl: string) => {
          if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('javascript:') || originalUrl.startsWith('#')) return originalUrl;
          try {
            const absolute = new URL(originalUrl, finalUrl.toString()).toString();
            return `/api/iframe-proxy?url=${encodeURIComponent(absolute)}`;
          } catch (e) {
            return originalUrl;
          }
        };

        // Rewrite href, src, action
        html = html.replace(/(href|src|action)\s*=\s*["']([^"']+)["']/gi, (match, attr, val) => {
          // Skip some common non-navigation attributes
          if (attr.toLowerCase() === 'src' && (val.endsWith('.js') || val.endsWith('.css'))) return match; 
          return `${attr}="${proxyUrl(val)}"`;
        });

        const headInjection = `
          <base href="${finalUrl.origin}${finalUrl.pathname}">
          <style>
            html, body { display: block !important; visibility: visible !important; opacity: 1 !important; }
            /* Hide some common overlays that might block interaction */
            .cookie-banner, #cookie-consent, .modal-backdrop { display: none !important; }
          </style>
        `;
        
        const bodyInjection = `
          <script>
            // Intercept all clicks to ensure they go through the terminal
            document.addEventListener('click', function(e) {
              const a = e.target.closest('a');
              if (a && a.href) {
                const url = new URL(a.href, document.baseURI).href;
                if (!url.startsWith('javascript:')) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Extract the actual target URL from our proxy URL if it's already proxied
                  let target = url;
                  if (url.includes('/api/iframe-proxy?url=')) {
                    const params = new URLSearchParams(new URL(url, window.location.origin).search);
                    target = params.get('url') || url;
                  }
                  window.parent.postMessage({ type: 'navigate', url: target }, '*');
                }
              }
            }, true);
            
            // Intercept form submissions
            document.addEventListener('submit', function(e) {
              const form = e.target.closest('form');
              if (form) {
                e.preventDefault();
                e.stopPropagation();
                
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const pair of formData.entries()) {
                  params.append(pair[0], pair[1].toString());
                }
                
                let action = form.action || window.location.href;
                if (action.includes('/api/iframe-proxy?url=')) {
                  const actionParams = new URLSearchParams(new URL(action, window.location.origin).search);
                  action = actionParams.get('url') || action;
                }

                const url = new URL(action);
                if (form.method.toUpperCase() === 'GET') {
                  const existingParams = new URLSearchParams(url.search);
                  for (const pair of params.entries()) {
                    existingParams.set(pair[0], pair[1]);
                  }
                  url.search = existingParams.toString();
                  window.parent.postMessage({ type: 'navigate', url: url.toString() }, '*');
                } else {
                  // For POST, we'll just try to navigate to the action with the params as query for now
                  // as our terminal 'browse' command is GET-based. 
                  // In a real browser this would be a POST, but for a terminal proxy, 
                  // many sites accept GET as a fallback or we'd need a more complex POST handler.
                  const existingParams = new URLSearchParams(url.search);
                  for (const pair of params.entries()) {
                    existingParams.set(pair[0], pair[1]);
                  }
                  url.search = existingParams.toString();
                  window.parent.postMessage({ type: 'navigate', url: url.toString() }, '*');
                }
              }
            }, true);

            // Shadow top and parent to prevent frame-busting
            window.top = window.self;
            window.parent = window.self;
          </script>
        `;
        
        html = html.replace("<head>", `<head>\n${headInjection}`);
        html = html.replace("</body>", `${bodyInjection}\n</body>`);
        res.send(html);
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (error: any) {
      clearTimeout(timeout);
      res.status(500).send(`<div style="padding:20px;color:red;">Proxy Error: ${error.message}</div>`);
    }
  };

  app.get("/api/iframe-proxy", iframeProxyHandler);
  app.post("/api/iframe-proxy", iframeProxyHandler);

  // 3. YouTube Audio Downloader
  app.get("/api/download", async (req, res) => {
    const videoUrl = req.query.url as string;
    
    if (!videoUrl) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }
    
    try {
      if (!ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }
      
      const info = await ytdl.getInfo(videoUrl);
      const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
      
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      ytdl(videoUrl, {
        filter: 'audioonly',
        quality: 'highestaudio',
      }).pipe(res);
      
    } catch (error: any) {
      console.error(`[DOWNLOAD ERROR] ${error.message}`);
      res.status(500).json({ error: `Download failed: ${error.message}` });
    }
  });

  // ============================================================================
  // VITE SETUP (Frontend)
  // ============================================================================

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
