import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load .env.local first, then fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config();

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
      
      const text = await response.text();
      res.send(text);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      
      // Fetch the website content
      const response = await fetch(url.toString(), {
        headers: {
          // Use a very standard browser user-agent
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      });
      
      console.log(`[PROXY] Fetched ${targetUrl} - Status: ${response.status}`);
      
      // --- Header Modification ---
      // We need to remove headers that prevent the site from loading in an iframe
      const headers = new Headers(response.headers);
      
      // Remove security headers that block embedding
      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.delete("cross-origin-opener-policy");
      headers.delete("cross-origin-embedder-policy");
      
      // Remove encoding headers because we are going to modify the HTML text
      // If we leave these, the browser will try to decompress our modified text and fail
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      
      // Forward the modified headers to the client
      res.status(response.status);
      headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      const contentType = response.headers.get("content-type") || "";
      
      // If it's an HTML page, we need to modify it
      if (contentType.includes("text/html")) {
        let html = await response.text();
        
        // --- HTML Sanitization ---
        
        // 1. Strip all <script> tags. 
        // Why? Many sites have "frame-busting" scripts that detect if they are in an iframe
        // and force the parent window to redirect. Removing scripts prevents this.
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // 2. Strip meta refresh tags.
        // Why? Prevents the page from automatically redirecting us away.
        html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');
        
        // 3. Strip Content-Security-Policy meta tags.
        // Why? Same reason as the HTTP headers, they can block our injected scripts.
        html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
        
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
      res.status(500).send(`Error loading iframe: ${error.message}`);
    }
  });

  // ============================================================================
  // 3. Ollama AI Route
  // ============================================================================
  // This route talks to your local Ollama instance.
  // Make sure Ollama is running (ollama serve) before using the 'ai' command.
  // Configure the model and URL in your .env.local file.

  app.post("/api/ai", async (req, res) => {
    const { messages } = req.body as { messages: { role: string; content: string }[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
    }

    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const ollamaModel   = process.env.OLLAMA_MODEL   || "llama3";

    console.log(`[OLLAMA] Sending request to ${ollamaBaseUrl} using model: ${ollamaModel}`);

    try {
      // We use the /api/chat endpoint which supports multi-turn conversations.
      // Ollama streams responses by default — we set stream:false to get one clean reply.
      const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages,
          stream: false,
        }),
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        console.error(`[OLLAMA ERROR] Status ${ollamaRes.status}: ${errText}`);
        return res.status(502).json({
          error: `Ollama returned an error (HTTP ${ollamaRes.status}). Is Ollama running? Is the model "${ollamaModel}" pulled?`,
          detail: errText,
        });
      }

      const data = await ollamaRes.json() as {
        message: { role: string; content: string };
        done: boolean;
      };

      // Return just the assistant's reply text so the frontend keeps it simple
      res.json({ reply: data.message?.content ?? "" });

    } catch (error: any) {
      // This usually means Ollama is not running at all
      console.error(`[OLLAMA ERROR] ${error.message}`);
      res.status(503).json({
        error: "Could not connect to Ollama. Make sure it is running with 'ollama serve'.",
        detail: error.message,
      });
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
