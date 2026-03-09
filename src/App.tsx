import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type HistoryItem = {
  id: string;
  type: 'command' | 'text' | 'html' | 'iframe' | 'error';
  content: string;
  url?: string;
};

type Theme = 'dark' | 'light';

const HELP_TEXT = `Available commands:
  help          - Show this help message
  clear         - Clear the terminal
  search <q>    - Search the web (uses selected engine)
  engine <name> - Change search engine (ddg, google, bing, searx, brave)
  browse <url>  - Open a website in an iframe
  youtube <q>   - Search YouTube (uses privacy-friendly mirror)
  watch <url>   - Watch a YouTube video directly in the terminal
  mirror [next] - Show or cycle through YouTube mirrors
  curl <url>    - Fetch raw HTML of a website
  download <url>- Download YouTube video as MP3
  theme <mode>  - Change theme (light, dark, matrix, cyberpunk, etc.)
  css <styles>  - Inject custom CSS (use "css clear" to reset)
  cd <dir>      - Change directory (simulated)
  echo <text>   - Print text
  date          - Show current date/time
  ai <prompt>   - Chat with local Ollama (requires Ollama running)
  ollama <cmd>  - Ollama config (ollama status, ollama model <name>)
  twitch <name> - Watch a Twitch stream
  
Note: Clicking links inside the browser will automatically run a new browse command!`;

const PRESET_THEMES: Record<string, string> = {
  matrix: 'body { background-color: #000 !important; color: #00ff41 !important; } .text-blue-400 { color: #008f11 !important; } input { caret-color: #00ff41 !important; }',
  cyberpunk: 'body { background-color: #2b213a !important; color: #ff0055 !important; } .text-blue-400 { color: #00ff9f !important; } input { caret-color: #fdf500 !important; }',
  sakura: 'body { background-color: #fff5f7 !important; color: #d63384 !important; } .text-blue-400 { color: #ff85a2 !important; } input { caret-color: #d63384 !important; }',
  ocean: 'body { background-color: #001219 !important; color: #94d2bd !important; } .text-blue-400 { color: #005f73 !important; } input { caret-color: #ee9b00 !important; }',
};

const INITIAL_HISTORY: HistoryItem[] = [
  { id: '1', type: 'text', content: 'Welcome to WebTerm v2.0.0' },
  { id: '2', type: 'text', content: 'Type "help" for a list of commands.' },
];

const COMMANDS = ['help', 'clear', 'search', 'engine', 'browse', 'youtube', 'watch', 'mirror', 'curl', 'download', 'theme', 'css', 'cd', 'echo', 'date', 'ai', 'ollama', 'twitch'];
const THEME_MODES = ['light', 'dark', 'toggle', ...Object.keys(PRESET_THEMES)];

const SEARCH_ENGINES: Record<string, string> = {
  ddg: 'https://lite.duckduckgo.com/lite/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  searx: 'https://searx.be/search?q=',
  brave: 'https://search.brave.com/search?q=',
};

const YT_MIRRORS = [
  'https://inv.tux.rs',
  'https://invidious.drgns.space',
  'https://vid.puffyan.us',
  'https://yewtu.be',
  'https://invidious.sethforprivacy.com',
  'https://inv.riverside.rocks'
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function App() {
  // --- State ---
  const [history, setHistory] = useState<HistoryItem[]>(INITIAL_HISTORY);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [customCSS, setCustomCSS] = useState<string>('');
  const [currentDir, setCurrentDir] = useState<string>('~');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const [ytMirrorIndex, setYtMirrorIndex] = useState(0);
  const [searchEngine, setSearchEngine] = useState('ddg');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  
  // Reverse search state
  const [isReverseSearch, setIsReverseSearch] = useState(false);
  const [reverseSearchQuery, setReverseSearchQuery] = useState('');
  const [reverseSearchMatch, setReverseSearchMatch] = useState<string | null>(null);
  const [reverseSearchIndex, setReverseSearchIndex] = useState(-1);

  // Command history for up/down arrow navigation
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // For tab completion cycling
  const [completions, setCompletions] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState<number>(-1);

  // --- Refs ---
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  
  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-scroll to bottom when history changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Reset completions when input changes manually (not via tab)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (isReverseSearch) {
      setReverseSearchQuery(value);
      // Find first match
      const match = [...commandHistory].reverse().find(cmd => cmd.includes(value));
      setReverseSearchMatch(match || null);
      setReverseSearchIndex(0);
    } else {
      setInput(value);
      setCompletions([]);
      setCompletionIndex(-1);
    }
  };

  // --- Helpers ---

  // Helper to add a new item to the terminal history
  const appendToHistory = (item: Omit<HistoryItem, 'id'>) => {
    setHistory(prev => [...prev, { ...item, id: Date.now().toString() + Math.random().toString(36).substring(7) }]);
  };

  // Helper to format YouTube URLs into embed URLs or mirror URLs for better compatibility
  const formatYouTubeUrl = (url: string): { url: string; isEmbed: boolean } => {
    const mirror = YT_MIRRORS[ytMirrorIndex]; 
    
    // Check if it's a YouTube link or a link from one of our mirrors
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isMirror = YT_MIRRORS.some(m => {
      try {
        return url.includes(new URL(m).hostname);
      } catch {
        return false;
      }
    });

    if (isYouTube || isMirror) {
      try {
        const urlObj = new URL(url);
        // Handle direct video links (works for both YT and mirrors)
        let videoId = url.includes('youtu.be/') 
          ? url.split('youtu.be/')[1].split('?')[0]
          : urlObj.searchParams.get('v');
          
        if (videoId) {
          // Embeds are still best for direct videos as they are official and support JS
          return { url: `https://www.youtube.com/embed/${videoId}?autoplay=1`, isEmbed: true };
        }

        if (!isMirror) {
          // Handle search or homepage - redirect to mirror
          if (url.includes('/results?search_query=')) {
            const query = urlObj.searchParams.get('search_query');
            return { url: `${mirror}/search?q=${encodeURIComponent(query || '')}`, isEmbed: false };
          }
          return { url: mirror, isEmbed: false };
        }
      } catch (e) {
        return { url: isMirror ? url : mirror, isEmbed: false };
      }
    }
    return { url, isEmbed: false };
  };

  // --- Command Execution ---

  const handleCommand = React.useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // 1. Update command history for arrow key navigation
    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
    setCompletions([]);
    setCompletionIndex(-1);

    // 2. Echo the command to the screen
    appendToHistory({ type: 'command', content: trimmed });
    setInput('');

    // 3. Parse the command
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // 4. Execute the command
    switch (command) {
      case 'help':
        appendToHistory({ type: 'text', content: HELP_TEXT });
        break;
        
      case 'clear':
        setHistory([]);
        break;
        
      case 'echo':
        appendToHistory({ type: 'text', content: args.join(' ') });
        break;
        
      case 'date':
        appendToHistory({ type: 'text', content: new Date().toString() });
        break;

      case 'ai': {
        const prompt = args.join(' ');
        if (!prompt) {
          appendToHistory({ type: 'error', content: 'Usage: ai <prompt>' });
          break;
        }

        appendToHistory({ type: 'text', content: `[OLLAMA] Thinking... (Model: ${ollamaModel})` });
        setActiveProcesses(prev => [...prev, 'AI']);

        try {
          const response = await fetch(`${ollamaHost}/api/generate`, {
            method: 'POST',
            body: JSON.stringify({
              model: ollamaModel,
              prompt: prompt,
              stream: false
            }),
            headers: { 'Content-Type': 'application/json' }
          });

          if (!response.ok) {
            throw new Error(`Ollama error: ${response.statusText}`);
          }

          const data = await response.json();
          appendToHistory({ type: 'text', content: data.response });
        } catch (err: any) {
          appendToHistory({ 
            type: 'error', 
            content: `Ollama Connection Failed: ${err.message}\n\nTroubleshooting:\n1. Ensure Ollama is running locally.\n2. Ensure OLLAMA_ORIGINS="*" is set in your environment variables.\n3. If using HTTPS, browsers may block local HTTP requests. Try running Ollama with a secure tunnel or use Chrome's "Insecure content" site setting.` 
          });
        } finally {
          setActiveProcesses(prev => prev.filter(p => p !== 'AI'));
        }
        break;
      }

      case 'ollama': {
        const sub = args[0]?.toLowerCase();
        if (sub === 'status') {
          try {
            const res = await fetch(`${ollamaHost}/api/tags`);
            if (res.ok) {
              const data = await res.json();
              appendToHistory({ type: 'text', content: `Ollama is ONLINE at ${ollamaHost}\nAvailable models: ${data.models?.map((m: any) => m.name).join(', ') || 'None'}` });
            } else {
              appendToHistory({ type: 'error', content: `Ollama returned status ${res.status}` });
            }
          } catch (e: any) {
            appendToHistory({ type: 'error', content: `Ollama is OFFLINE: ${e.message}` });
          }
        } else if (sub === 'model') {
          if (args[1]) {
            setOllamaModel(args[1]);
            appendToHistory({ type: 'text', content: `Ollama model set to: ${args[1]}` });
          } else {
            appendToHistory({ type: 'text', content: `Current Ollama model: ${ollamaModel}` });
          }
        } else if (sub === 'host') {
          if (args[1]) {
            setOllamaHost(args[1]);
            appendToHistory({ type: 'text', content: `Ollama host set to: ${args[1]}` });
          } else {
            appendToHistory({ type: 'text', content: `Current Ollama host: ${ollamaHost}` });
          }
        } else {
          appendToHistory({ type: 'text', content: 'Usage: ollama <status|model|host> [value]' });
        }
        break;
      }

      case 'twitch': {
        const channel = args[0];
        if (!channel) {
          appendToHistory({ type: 'error', content: 'Usage: twitch <channel_name>' });
          break;
        }
        
        // Twitch requires ALL parent domains in the chain to be specified
        const hostname = window.location.hostname;
        const parents = [hostname];
        
        // Add AI Studio domains if we're likely running inside it
        if (hostname.includes('run.app')) {
          parents.push('ai.studio.google.com');
          parents.push('aistudio.google.com');
        }
        
        const parentParams = parents.map(p => `parent=${p}`).join('&');
        const twitchUrl = `https://player.twitch.tv/?channel=${channel}&${parentParams}&autoplay=true&muted=false`;
        
        appendToHistory({
          type: 'iframe',
          content: `Loading Twitch stream: ${channel}`,
          url: twitchUrl
        });
        break;
      }
        
      case 'search':
      case 'youtube':
      case 'watch':
      case 'browse': {
        if (!args[0]) {
          appendToHistory({ type: 'error', content: `Usage: ${command} <url or query>` });
          break;
        }
        
        let query = args.join(' ');
        let targetUrl = query;
        
        // Determine if it's a search query or a direct URL
        const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/.*)?$/i;
        const isUrl = urlPattern.test(targetUrl) && !targetUrl.includes(' ');
        
        // Validation for 'watch'
        if (command === 'watch') {
          if (!isUrl && targetUrl.length === 11) {
            targetUrl = `https://www.youtube.com/watch?v=${targetUrl}`;
          } else {
            if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
            try {
              new URL(targetUrl);
            } catch (e) {
              appendToHistory({ type: 'error', content: `Invalid URL or Video ID: "${query}"` });
              break;
            }
          }
        } 
        // Validation for 'browse' when it looks like a URL but might be malformed
        else if (command === 'browse' && !targetUrl.includes(' ') && targetUrl.includes('.')) {
          if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
          try {
            new URL(targetUrl);
          } catch (e) {
            appendToHistory({ type: 'error', content: `Malformed URL: "${query}"` });
            break;
          }
        }

        const isSearch = command === 'search' || command === 'youtube' || (!isUrl && command === 'browse');
        
        if (command === 'youtube') {
          targetUrl = `${YT_MIRRORS[ytMirrorIndex]}/search?q=${encodeURIComponent(query)}`;
        } else if (command === 'watch') {
          // targetUrl is already set above
        } else if (isSearch) {
          // Use selected search engine
          const engineUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.ddg;
          targetUrl = `${engineUrl}${encodeURIComponent(query)}`;
        } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = 'https://' + targetUrl;
        }

        // Special handling for DuckDuckGo main site - redirect to lite as it's more iframe-friendly
        if (targetUrl.includes('duckduckgo.com') && !targetUrl.includes('lite.duckduckgo.com') && !targetUrl.includes('/lite')) {
          const ddgUrl = new URL(targetUrl);
          const q = ddgUrl.searchParams.get('q');
          if (q) {
            targetUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`;
          } else {
            targetUrl = 'https://lite.duckduckgo.com/lite/';
          }
        }

        // Check if it's a YouTube link and convert to embed or mirror
        const { url: finalUrl, isEmbed } = formatYouTubeUrl(targetUrl);
        targetUrl = finalUrl;

        // Render the iframe
        appendToHistory({
          type: 'iframe',
          content: 'Loading...',
          url: isEmbed ? targetUrl : `/api/iframe-proxy?url=${encodeURIComponent(targetUrl)}`
        });
        break;
      }

      case 'engine': {
        const engine = args[0]?.toLowerCase();
        if (SEARCH_ENGINES[engine]) {
          setSearchEngine(engine);
          appendToHistory({ type: 'text', content: `Search engine set to ${engine}.` });
        } else {
          appendToHistory({ type: 'error', content: `Usage: engine <${Object.keys(SEARCH_ENGINES).join('|')}>` });
        }
        break;
      }
      
      case 'curl': {
        if (!args[0]) {
          appendToHistory({ type: 'error', content: 'Usage: curl <url>' });
          break;
        }
        
        let targetUrl = args[0];
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = 'https://' + targetUrl;
        }
        
        try {
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
          const data = await res.json();
          
          if (!res.ok) {
            appendToHistory({ type: 'error', content: `Fetch Error: ${data.error || res.statusText}` });
            return;
          }
          
          // Truncate output if it's too long so we don't crash the browser
          const content = data.content || '';
          const output = content.slice(0, 2000) + (content.length > 2000 ? '\n...[truncated]' : '');
          
          appendToHistory({ type: 'text', content: output });
        } catch (err: any) {
          appendToHistory({ type: 'error', content: `Terminal Error: ${err.message}` });
        }
        break;
      }

      case 'download': {
        if (!args[0]) {
          appendToHistory({ type: 'error', content: 'Usage: download <youtube-url>' });
          break;
        }

        const targetUrl = args[0];
        appendToHistory({ type: 'text', content: `Starting download for: ${targetUrl}...` });
        appendToHistory({ type: 'text', content: 'Please wait, this might take a few moments depending on the video length.' });

        // Show in status bar
        setActiveProcesses(prev => [...prev, 'DOWNLOAD']);
        setTimeout(() => {
          setActiveProcesses(prev => prev.filter(p => p !== 'DOWNLOAD'));
        }, 5000);

        // We use a hidden anchor tag to trigger the browser's download dialog
        const downloadUrl = `/api/download?url=${encodeURIComponent(targetUrl)}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = ''; // The server sets the filename via Content-Disposition
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        appendToHistory({ type: 'text', content: 'Download request sent to browser.' });
        break;
      }

      case 'theme': {
        const mode = args[0]?.toLowerCase();
        if (mode === 'light') {
          setTheme('light');
          setCustomCSS('');
          appendToHistory({ type: 'text', content: 'Theme set to light.' });
        } else if (mode === 'dark') {
          setTheme('dark');
          setCustomCSS('');
          appendToHistory({ type: 'text', content: 'Theme set to dark.' });
        } else if (PRESET_THEMES[mode]) {
          setCustomCSS(PRESET_THEMES[mode]);
          appendToHistory({ type: 'text', content: `Theme set to ${mode}.` });
        } else if (mode === 'toggle' || !mode) {
          setTheme(prev => prev === 'dark' ? 'light' : 'dark');
          setCustomCSS('');
          appendToHistory({ type: 'text', content: `Theme toggled to ${theme === 'dark' ? 'light' : 'dark'}.` });
        } else {
          appendToHistory({ type: 'error', content: `Usage: theme <light|dark|toggle|${Object.keys(PRESET_THEMES).join('|')}>` });
        }
        break;
      }

      case 'cd': {
        const dir = args[0] || '~';
        setCurrentDir(dir);
        appendToHistory({ type: 'text', content: `Changed directory to ${dir}` });
        break;
      }

      case 'mirror': {
        if (args[0] === 'next') {
          const nextIndex = (ytMirrorIndex + 1) % YT_MIRRORS.length;
          setYtMirrorIndex(nextIndex);
          appendToHistory({ type: 'text', content: `Switched to mirror: ${YT_MIRRORS[nextIndex]}` });
        } else {
          appendToHistory({ type: 'text', content: `Current mirror: ${YT_MIRRORS[ytMirrorIndex]}\nType "mirror next" to switch.` });
        }
        break;
      }

      case 'css': {
        if (!args[0]) {
          appendToHistory({ type: 'error', content: 'Usage: css <styles> or css clear' });
          break;
        }
        
        const styles = args.join(' ');
        if (styles.toLowerCase() === 'clear') {
          setCustomCSS('');
          appendToHistory({ type: 'text', content: 'Custom CSS cleared.' });
        } else {
          setCustomCSS(styles);
          appendToHistory({ type: 'text', content: 'Custom CSS applied.' });
        }
        break;
      }
      
      default:
        appendToHistory({ type: 'error', content: `Command not found: ${command}` });
    }
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for messages from the iframe proxy (e.g., when a user clicks a link)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // If the iframe sends a 'navigate' message, automatically run the browse command
      if (event.data && event.data.type === 'navigate' && event.data.url) {
        const url = event.data.url;
        appendToHistory({ type: 'text', content: `[NAV] Navigating to: ${url}` });
        handleCommand(`browse ${url}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleCommand]);

  // --- Keyboard Navigation ---
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      if (!isReverseSearch) {
        setIsReverseSearch(true);
        setReverseSearchQuery('');
        setReverseSearchMatch(null);
        setReverseSearchIndex(-1);
      } else {
        // Find next match
        const matches = [...commandHistory].reverse().filter(cmd => cmd.includes(reverseSearchQuery));
        if (matches.length > 0) {
          const nextIndex = (reverseSearchIndex + 1) % matches.length;
          setReverseSearchIndex(nextIndex);
          setReverseSearchMatch(matches[nextIndex]);
        }
      }
      return;
    }

    if (isReverseSearch) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmdToRun = reverseSearchMatch || reverseSearchQuery;
        setIsReverseSearch(false);
        handleCommand(cmdToRun);
      } else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        setIsReverseSearch(false);
        setReverseSearchQuery('');
        setReverseSearchMatch(null);
      }
      return;
    }

    if (e.key === 'Enter') {
      handleCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = historyIndex + 1 < commandHistory.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIndex);
        setInput(commandHistory[commandHistory.length - 1 - nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInput(commandHistory[commandHistory.length - 1 - nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      
      const parts = input.trimStart().split(/\s+/);
      const isCommand = parts.length <= 1 && !input.endsWith(' ');
      
      let currentCompletions = completions;
      let currentIndex = completionIndex;

      if (currentCompletions.length === 0) {
        if (isCommand) {
          const partial = parts[0] || '';
          currentCompletions = COMMANDS.filter(c => c.startsWith(partial.toLowerCase()));
        } else {
          const command = parts[0].toLowerCase();
          const partial = parts[parts.length - 1] || '';
          
          if (command === 'theme') {
            currentCompletions = THEME_MODES.filter(m => m.startsWith(partial.toLowerCase()));
          }
        }
        
        if (currentCompletions.length > 0) {
          setCompletions(currentCompletions);
          currentIndex = 0;
        }
      } else {
        currentIndex = (currentIndex + 1) % currentCompletions.length;
      }

      if (currentCompletions.length > 0) {
        setCompletionIndex(currentIndex);
        const completion = currentCompletions[currentIndex];
        
        if (isCommand) {
          setInput(completion + ' ');
        } else {
          const newParts = [...parts];
          newParts[newParts.length - 1] = completion;
          setInput(newParts.join(' ') + ' ');
        }
      }
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const isDark = theme === 'dark';

  return (
    <div 
      className={`min-h-screen p-4 font-mono text-sm sm:text-base flex flex-col transition-colors duration-300 ${
        isDark ? 'bg-black text-green-500' : 'bg-white text-blue-700'
      }`} 
      onClick={() => inputRef.current?.focus()}
    >
      {/* Custom CSS Injection */}
      {customCSS && <style dangerouslySetInnerHTML={{ __html: customCSS }} />}
      
      {/* Header */}
      <div className={`flex items-center justify-between mb-4 border-b pb-2 transition-colors duration-300 ${
        isDark ? 'text-green-400 border-green-900' : 'text-blue-600 border-blue-200'
      }`}>
        <div className="flex items-center gap-2">
          <TerminalIcon size={20} />
          <h1 className="font-bold tracking-wider">WEB-TERM</h1>
        </div>
        
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setTheme(prev => prev === 'dark' ? 'light' : 'dark');
          }}
          className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-tighter transition-all hover:scale-105 active:scale-95 ${
            isDark 
              ? 'bg-green-900/30 text-green-400 border border-green-800 hover:bg-green-900/50' 
              : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200'
          }`}
        >
          {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
      </div>
      
      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-4">
        {history.map((item) => (
          <div key={item.id} className="break-words">
            
            {/* Command Echo */}
            {item.type === 'command' && (
              <div className="flex">
                <span className={`mr-2 transition-colors duration-300 ${isDark ? 'text-blue-400' : 'text-blue-600 font-bold'}`}>user@web-term:~$</span>
                <span className={isDark ? 'text-white' : 'text-gray-900'}>{item.content}</span>
              </div>
            )}
            
            {/* Standard Text Output */}
            {item.type === 'text' && (
              <pre className={`whitespace-pre-wrap font-mono m-0 p-0 transition-colors duration-300 ${
                isDark ? 'text-green-300' : 'text-gray-700'
              }`}>{item.content}</pre>
            )}
            
            {/* Error Output */}
            {item.type === 'error' && (
              <div className="text-red-400 font-bold italic">{item.content}</div>
            )}
            
            {/* Iframe Browser Output */}
            {item.type === 'iframe' && (
              <div className={`mt-2 border rounded overflow-hidden bg-white w-full max-w-5xl h-[60vh] sm:h-[70vh] relative transition-colors duration-300 ${
                isDark ? 'border-green-800' : 'border-blue-200 shadow-lg'
              }`}>
                {/* Fake Browser Chrome */}
                <div className="bg-gray-200 text-black px-2 py-1 text-xs border-b border-gray-300 flex items-center justify-between sticky top-0 z-10">
                  <span className="truncate pr-4">
                    {decodeURIComponent(item.url?.replace('/api/iframe-proxy?url=', '') || '')}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  </div>
                </div>
                {/* Actual Iframe */}
                <iframe 
                  src={item.url} 
                  className="w-full h-full border-none bg-white" 
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-presentation allow-downloads allow-storage-access-by-user-activation"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; geolocation" 
                  allowFullScreen
                  title="Web Browser"
                />
              </div>
            )}
            
          </div>
        ))}
        {/* Invisible element to scroll to */}
        <div ref={bottomRef} />
      </div>
      
      {/* Input Area */}
      <div className="flex mt-2 items-center mb-8">
        {isReverseSearch ? (
          <span className={`mr-2 transition-colors duration-300 ${isDark ? 'text-yellow-400' : 'text-orange-600 font-bold'}`}>
            (reverse-i-search)`{reverseSearchQuery}': {reverseSearchMatch || ''}
          </span>
        ) : (
          <span className={`mr-2 transition-colors duration-300 ${isDark ? 'text-blue-400' : 'text-blue-600 font-bold'}`}>
            user@web-term:{currentDir}$
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={isReverseSearch ? reverseSearchQuery : input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={`flex-1 bg-transparent border-none outline-none caret-green-500 transition-colors duration-300 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* Status Bar */}
      <div className={`fixed bottom-0 left-0 right-0 h-6 flex items-center px-4 text-[10px] sm:text-xs font-bold uppercase tracking-wider z-50 transition-colors duration-300 ${
        isDark ? 'bg-green-900/80 text-green-400' : 'bg-blue-600 text-white'
      }`}>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-1">
            <span className="opacity-60">DIR:</span>
            <span>{currentDir}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="opacity-60">STATUS:</span>
            <span className={isOnline ? 'text-green-300' : 'text-red-400'}>
              {isOnline ? '● ONLINE' : '○ OFFLINE'}
            </span>
          </div>
          {activeProcesses.length > 0 && (
            <div className="flex items-center gap-1 animate-pulse">
              <span className="opacity-60">JOBS:</span>
              <span>{activeProcesses.join(', ')}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="opacity-60">ENGINE:</span>
            <span>{searchEngine.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="opacity-60">THEME:</span>
            <span>{theme.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="opacity-60">TIME:</span>
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
