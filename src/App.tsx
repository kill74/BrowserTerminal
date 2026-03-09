import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Shield, Wifi, Cpu, Globe, Search, Play, Download, Settings, Palette, Command, Clock, ChevronRight, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  
Note: Clicking links inside the browser will automatically run a new browse command!`;

const PRESET_THEMES: Record<string, string> = {
  matrix: 'body { background-color: #000 !important; color: #00ff41 !important; } .text-blue-400 { color: #008f11 !important; } input { caret-color: #00ff41 !important; }',
  cyberpunk: 'body { background-color: #2b213a !important; color: #ff0055 !important; } .text-blue-400 { color: #00ff9f !important; } input { caret-color: #fdf500 !important; }',
  sakura: 'body { background-color: #fff5f7 !important; color: #d63384 !important; } .text-blue-400 { color: #ff85a2 !important; } input { caret-color: #d63384 !important; }',
  ocean: 'body { background-color: #001219 !important; color: #94d2bd !important; } .text-blue-400 { color: #005f73 !important; } input { caret-color: #ee9b00 !important; }',
};

const INITIAL_HISTORY: HistoryItem[] = [
  { id: '1', type: 'text', content: 'AETHER-SHELL [Version 4.2.0-LTS]' },
  { id: '2', type: 'text', content: '(c) 2026 AetherCorp. All rights reserved.' },
  { id: '3', type: 'text', content: 'Type "help" to initialize command list.' },
];

const COMMANDS = ['help', 'clear', 'search', 'engine', 'browse', 'youtube', 'watch', 'mirror', 'curl', 'download', 'theme', 'css', 'cd', 'echo', 'date'];
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
        handleCommand(`browse ${event.data.url}`);
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
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${isDark ? 'bg-[#050505] text-[#00ff9f]' : 'bg-[#f0f0f0] text-[#005f73]'}`}>
      {/* Custom CSS Injection */}
      {customCSS && <style dangerouslySetInnerHTML={{ __html: customCSS }} />}
      
      {/* Main Container */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full gap-6">
        
        {/* Top Header / Hardware Bar */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${isDark ? 'bg-[#00ff9f]/10 text-[#00ff9f]' : 'bg-[#005f73]/10 text-[#005f73]'}`}>
              <TerminalIcon size={24} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-[0.2em] uppercase neon-text">AETHER-SHELL</h1>
              <div className="flex items-center gap-2 text-[10px] opacity-50 font-mono">
                <span className="flex items-center gap-1"><Shield size={10} /> SECURE_ENCLAVE</span>
                <span className="flex items-center gap-1"><Cpu size={10} /> CORE_V4</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg glass-panel hover:bg-white/10 transition-colors group"
              title="Toggle Theme"
            >
              <Palette size={18} className="group-hover:rotate-12 transition-transform" />
            </button>
            <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Wifi size={12} className={isOnline ? 'text-green-400' : 'text-red-400'} />
                <span className={isOnline ? 'text-green-400' : 'text-red-400'}>
                  {isOnline ? 'UPLINK_STABLE' : 'UPLINK_LOST'}
                </span>
              </div>
              <span className="text-[10px] opacity-40 font-mono">NODE_ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Terminal Window */}
        <main className="flex-1 flex flex-col glass-panel rounded-3xl overflow-hidden relative crt-screen">
          {/* Window Controls */}
          <div className="h-10 bg-black/40 border-b border-white/5 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              <span className="ml-2 text-[10px] font-mono opacity-30 uppercase tracking-widest">System_Console</span>
            </div>
            <div className="flex items-center gap-4 opacity-30">
              <Command size={14} />
              <Maximize2 size={14} />
            </div>
          </div>

          {/* Output Area */}
          <div 
            className="flex-1 overflow-y-auto p-6 space-y-4 font-mono scroll-smooth"
            onClick={() => inputRef.current?.focus()}
          >
            <AnimatePresence initial={false}>
              {history.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="group"
                >
                  {/* Command Echo */}
                  {item.type === 'command' && (
                    <div className="flex items-center gap-3 mb-1">
                      <ChevronRight size={16} className="text-blue-400 opacity-50" />
                      <span className="text-white/90 font-bold tracking-tight">{item.content}</span>
                    </div>
                  )}
                  
                  {/* Standard Text Output */}
                  {item.type === 'text' && (
                    <pre className="whitespace-pre-wrap opacity-80 leading-relaxed text-sm sm:text-base">
                      {item.content}
                    </pre>
                  )}
                  
                  {/* Error Output */}
                  {item.type === 'error' && (
                    <div className="flex items-center gap-2 text-red-400/90 bg-red-400/5 p-3 rounded-lg border border-red-400/10 text-sm italic">
                      <X size={14} />
                      {item.content}
                    </div>
                  )}
                  
                  {/* Iframe Browser Output */}
                  {item.type === 'iframe' && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="mt-4 glass-panel rounded-2xl overflow-hidden w-full max-w-6xl h-[65vh] relative shadow-2xl shadow-black/50"
                    >
                      {/* Browser Chrome */}
                      <div className="bg-black/80 backdrop-blur-xl px-4 py-2 border-b border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Globe size={14} className="text-blue-400" />
                          <span className="text-[10px] font-mono opacity-60 truncate max-w-md">
                            {decodeURIComponent(item.url?.replace('/api/iframe-proxy?url=', '') || '')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 rounded bg-white/5 text-[9px] font-bold opacity-40 uppercase">Encrypted</div>
                        </div>
                      </div>
                      <iframe 
                        src={item.url} 
                        className="w-full h-full border-none bg-white" 
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-presentation allow-downloads allow-storage-access-by-user-activation"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; geolocation" 
                        allowFullScreen
                      />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-black/20 border-t border-white/5">
            <div className="flex items-center gap-4 relative">
              <div className={`flex-shrink-0 flex items-center gap-2 font-bold transition-colors ${isReverseSearch ? 'text-yellow-400' : 'text-blue-400'}`}>
                {isReverseSearch ? (
                  <Search size={18} />
                ) : (
                  <span className="text-xs opacity-40 tracking-tighter">SYS_PROMPT</span>
                )}
                <span className="text-sm tracking-widest">{currentDir}</span>
                <span className="opacity-40">$</span>
              </div>
              
              <div className="flex-1 relative">
                {isReverseSearch && (
                  <div className="absolute -top-10 left-0 glass-panel px-3 py-1.5 rounded-lg text-xs animate-in fade-in slide-in-from-bottom-2">
                    <span className="opacity-50 mr-2">MATCH:</span>
                    <span className="text-yellow-400 font-bold">{reverseSearchMatch || 'NO_MATCH'}</span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={isReverseSearch ? reverseSearchQuery : input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent border-none outline-none text-lg font-mono tracking-tight placeholder:opacity-20"
                  placeholder={isReverseSearch ? "Search history..." : "Enter command..."}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </main>

        {/* Footer Status Bar */}
        <footer className="glass-panel rounded-2xl px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Globe size={12} className="text-blue-400" />
              <span>{searchEngine}</span>
            </div>
            <div className="flex items-center gap-2">
              <Play size={12} className="text-red-400" />
              <span>Mirror_{ytMirrorIndex + 1}</span>
            </div>
            {activeProcesses.length > 0 && (
              <div className="flex items-center gap-2 text-yellow-400 animate-pulse">
                <Settings size={12} />
                <span>{activeProcesses.join('::')}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock size={12} />
              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
            <div className="px-2 py-0.5 rounded bg-white/10">
              V4.2.0_STABLE
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
