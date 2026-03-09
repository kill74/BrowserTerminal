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
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          // Pretend to be a normal browser so websites don't block us
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
          status: response.status 
        });
      }
      
      const text = await response.text();
      res.json({ content: text });
    } catch (error: any) {
      console.error(`[PROXY ERROR] ${error.message}`);
      res.status(500).json({ error: `Connection error: ${error.message}` });
    }
  });

  // 2. Iframe Proxy (used for the 'browse' and 'search' commands)
  // This is the magic that allows us to embed websites inside our terminal.
  // It fetches the website, strips out security headers that block iframes,
  // and injects custom scripts to handle navigation.
  app.get("/api/iframe-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    
    console.log(`[PROXY] Request for: ${targetUrl}`);
    
    if (!targetUrl) {
      return res.status(400).send("Missing URL parameter");
    }
    
    try {
      const url = new URL(targetUrl);
      
      // Fetch the website content. 
      // We use redirect: 'manual' so we can catch redirects and rewrite them 
      // to stay within our proxy.
      let response = await fetch(url.toString(), {
        redirect: 'manual',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      
      console.log(`[PROXY] Fetched ${targetUrl} - Status: ${response.status}`);

      // Handle Redirects (301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const absoluteLocation = new URL(location, url.toString()).toString();
          console.log(`[PROXY] Redirecting to: ${absoluteLocation}`);
          return res.redirect(`/api/iframe-proxy?url=${encodeURIComponent(absoluteLocation)}`);
        }
      }

      if (!response.ok) {
        // Return a custom HTML error page for the iframe
        res.status(response.status).send(`
          <div style="font-family: sans-serif; padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
            <h3 style="margin-top: 0;">Failed to load website</h3>
            <p><strong>URL:</strong> ${targetUrl}</p>
            <p><strong>Status:</strong> ${response.status} ${response.statusText}</p>
            <p>The website might be blocking proxy requests or is currently unavailable.</p>
          </div>
        `);
        return;
      }
      
      // --- Header Modification ---
      // We need to remove headers that prevent the site from loading in an iframe
      const headers = new Headers(response.headers);
      
      // Remove security headers that block embedding
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.delete("content-security-policy-report-only");
      headers.delete("x-content-security-policy");
      headers.delete("cross-origin-opener-policy");
      headers.delete("cross-origin-embedder-policy");
      headers.delete("cross-origin-resource-policy");
      
      // Remove encoding headers because we are going to modify the HTML text
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      
      // Forward the modified headers to the client
      res.status(response.status);
      headers.forEach((value, key) => {
        // Don't forward some headers that might cause issues
        if (!['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      
      const contentType = response.headers.get("content-type") || "";
      
      // If it's an HTML page, we need to modify it
      if (contentType.includes("text/html")) {
        let html = await response.text();
        
        // --- HTML Sanitization ---
        
        // 1. Strip all <script> tags more robustly
        html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
        html = html.replace(/<script\b[^>]*\/>/gi, '');
        
        // 2. Strip meta refresh tags
        html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');
        
        // 3. Strip CSP meta tags
        html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
        html = html.replace(/<meta[^>]+http-equiv=["']?x-content-security-policy["']?[^>]*>/gi, '');
        
        // 4. Strip frame-busting JS in attributes (like onload="if(top!=self)...")
        html = html.replace(/\bon\w+\s*=\s*["'][^"']*?top\s*!==?\s*self[^"']*?["']/gi, '');
        
        // --- HTML Injection ---
        
        const finalUrl = new URL(response.url);
        
        // We inject a <base> tag so that relative links (like "/about") resolve correctly
        // We also inject CSS to force the body to be visible, overriding any frame-busting CSS
        const headInjection = `
          <base href="${finalUrl.origin}${finalUrl.pathname}">
          <style>
            html, body {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
          </style>
        `;
        
        // We inject a script to intercept clicks and form submissions.
        // Instead of letting the iframe navigate (which often breaks), we send a message
        // to our React app, which then runs a new 'browse' command for the new URL.
        const bodyInjection = `
          <script>
            // Intercept link clicks
            document.addEventListener('click', function(e) {
              const a = e.target.closest('a');
              if (a && a.href && !a.href.startsWith('javascript:')) {
                e.preventDefault();
                e.stopPropagation();
                window.parent.postMessage({ type: 'navigate', url: a.href }, '*');
              }
            }, true);
            
            // Intercept form submissions (like search bars)
            document.addEventListener('submit', function(e) {
              const form = e.target.closest('form');
              if (form && form.method.toUpperCase() === 'GET') {
                e.preventDefault();
                e.stopPropagation();
                
                // Build the new URL with the form data
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
                
                // Tell the React app to navigate
                window.parent.postMessage({ type: 'navigate', url: url.toString() }, '*');
              }
            }, true);
          </script>
        `;
        
        // Insert our injections into the HTML
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>\n${headInjection}`);
        } else {
          html = `${headInjection}\n${html}`;
        }
        
        if (html.includes("</body>")) {
          html = html.replace("</body>", `${bodyInjection}\n</body>`);
        } else {
          html = `${html}\n${bodyInjection}`;
        }
        
        res.send(html);
      } else {
        // If it's not HTML (e.g., an image, CSS, or JSON), just send the raw data
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (error: any) {
      console.error(`[PROXY ERROR] ${error.message}`);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <h3 style="margin-top: 0;">Proxy Connection Error</h3>
          <p><strong>URL:</strong> ${targetUrl}</p>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Please check if the URL is correct and reachable.</p>
        </div>
      `);
    }
  });

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
