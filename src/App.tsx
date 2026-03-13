import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Eye, EyeOff } from 'lucide-react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/themes/prism-tomorrow.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type HistoryItem = {
  id: string;
  type: 'command' | 'text' | 'html' | 'iframe' | 'error';
  content: string;
  url?: string;
};

type Theme = 'light' | 'dark';

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
  ls            - List files in virtual file system
  touch <file>  - Create an empty file
  cat <file>    - Read a file
  rm <file>     - Delete a file
  edit <file>   - Open the built-in code editor (aliases: vim, nvim, emacs)
  run <file>    - Execute a JavaScript file
  github <user> - Fetch a GitHub profile
  git clone <url>- Clone a GitHub repository into VFS
  
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

const COMMANDS = ['help', 'clear', 'search', 'engine', 'browse', 'youtube', 'watch', 'mirror', 'curl', 'download', 'theme', 'css', 'cd', 'echo', 'date', 'ai', 'ollama', 'twitch', 'ls', 'touch', 'cat', 'rm', 'edit', 'vim', 'nvim', 'emacs', 'run', 'github', 'git'];
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
  type TerminalTabState = {
    id: string;
    history: HistoryItem[];
    input: string;
    currentDir: string;
    commandHistory: string[];
    historyIndex: number;
    isReverseSearch: boolean;
    reverseSearchQuery: string;
    reverseSearchMatch: string | null;
    reverseSearchIndex: number;
    completions: string[];
    completionIndex: number;
  };

  const createNewTab = (): TerminalTabState => ({
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    history: INITIAL_HISTORY,
    input: '',
    currentDir: '~',
    commandHistory: [],
    historyIndex: -1,
    isReverseSearch: false,
    reverseSearchQuery: '',
    reverseSearchMatch: null,
    reverseSearchIndex: -1,
    completions: [],
    completionIndex: -1,
  });

  const [tabs, setTabs] = useState<TerminalTabState[]>([createNewTab()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const activeTab = tabs[activeTabIndex];
  const activeTabId = activeTab.id;

  const updateTab = (updates: Partial<TerminalTabState> | ((prev: TerminalTabState) => Partial<TerminalTabState>)) => {
    setTabs(prev => {
      const tabIndex = prev.findIndex(t => t.id === activeTabId);
      if (tabIndex === -1) return prev; // Tab was closed
      
      const newTabs = [...prev];
      const current = newTabs[tabIndex];
      const resolvedUpdates = typeof updates === 'function' ? updates(current) : updates;
      newTabs[tabIndex] = { ...current, ...resolvedUpdates };
      return newTabs;
    });
  };

  const history = activeTab.history;
  const setHistory = (val: HistoryItem[] | ((prev: HistoryItem[]) => HistoryItem[])) => updateTab(prev => ({ history: typeof val === 'function' ? val(prev.history) : val }));
  
  const input = activeTab.input;
  const setInput = (val: string | ((prev: string) => string)) => updateTab(prev => ({ input: typeof val === 'function' ? val(prev.input) : val }));
  
  const currentDir = activeTab.currentDir;
  const setCurrentDir = (val: string | ((prev: string) => string)) => updateTab(prev => ({ currentDir: typeof val === 'function' ? val(prev.currentDir) : val }));
  
  const isReverseSearch = activeTab.isReverseSearch;
  const setIsReverseSearch = (val: boolean | ((prev: boolean) => boolean)) => updateTab(prev => ({ isReverseSearch: typeof val === 'function' ? val(prev.isReverseSearch) : val }));
  
  const reverseSearchQuery = activeTab.reverseSearchQuery;
  const setReverseSearchQuery = (val: string | ((prev: string) => string)) => updateTab(prev => ({ reverseSearchQuery: typeof val === 'function' ? val(prev.reverseSearchQuery) : val }));
  
  const reverseSearchMatch = activeTab.reverseSearchMatch;
  const setReverseSearchMatch = (val: string | null | ((prev: string | null) => string | null)) => updateTab(prev => ({ reverseSearchMatch: typeof val === 'function' ? val(prev.reverseSearchMatch) : val }));
  
  const reverseSearchIndex = activeTab.reverseSearchIndex;
  const setReverseSearchIndex = (val: number | ((prev: number) => number)) => updateTab(prev => ({ reverseSearchIndex: typeof val === 'function' ? val(prev.reverseSearchIndex) : val }));
  
  const commandHistory = activeTab.commandHistory;
  const setCommandHistory = (val: string[] | ((prev: string[]) => string[])) => updateTab(prev => ({ commandHistory: typeof val === 'function' ? val(prev.commandHistory) : val }));
  
  const historyIndex = activeTab.historyIndex;
  const setHistoryIndex = (val: number | ((prev: number) => number)) => updateTab(prev => ({ historyIndex: typeof val === 'function' ? val(prev.historyIndex) : val }));
  
  const completions = activeTab.completions;
  const setCompletions = (val: string[] | ((prev: string[]) => string[])) => updateTab(prev => ({ completions: typeof val === 'function' ? val(prev.completions) : val }));
  
  const completionIndex = activeTab.completionIndex;
  const setCompletionIndex = (val: number | ((prev: number) => number)) => updateTab(prev => ({ completionIndex: typeof val === 'function' ? val(prev.completionIndex) : val }));

  const [theme, setTheme] = useState<Theme>('light');
  const [pendingAction, setPendingAction] = useState<{ action: () => void; message: string } | null>(null);
  const [customCSS, setCustomCSS] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const [ytMirrorIndex, setYtMirrorIndex] = useState(0);
  const [searchEngine, setSearchEngine] = useState('ddg');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  
  // Virtual File System & Editor
  type VFSEntry = { content: string; createdAt: string; isDir?: boolean; permissions?: string };
  const [vfs, setVfs] = useState<Record<string, VFSEntry>>({
    'hello.js': { content: 'console.log("Hello from WebTerm OS!");\n// Try running this with: run hello.js', createdAt: new Date().toISOString(), permissions: 'rw-r--r--' },
    'readme.txt': { content: 'Welcome to the Virtual File System.\nUse ls, touch, cat, rm, edit, and run.', createdAt: new Date().toISOString(), permissions: 'rw-r--r--' }
  });
  const [editor, setEditor] = useState<{
    isOpen: boolean;
    tabs: { file: string; content: string; mode: string }[];
    activeTabIndex: number;
  }>({ isOpen: false, tabs: [], activeTabIndex: 0 });
  const [closeConfirm, setCloseConfirm] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    tabIndex?: number;
  }>({ isOpen: false, type: 'all' });
  const [showPreview, setShowPreview] = useState(false);

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

  // Keyboard shortcuts for tabs
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Alt+T for new tab
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const newTab = createNewTab();
        setTabs(prev => [...prev, newTab]);
        setActiveTabIndex(prev => prev + 1);
      }
      // Alt+W for close tab
      else if (e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        setTabs(prev => {
          if (prev.length <= 1) return prev;
          setActiveTabIndex(active => Math.max(0, active === prev.length - 1 ? active - 1 : active));
          return prev.filter((_, i) => i !== activeTabIndex);
        });
      }
      // Alt+Left/Right to switch tabs
      else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveTabIndex(prev => (prev > 0 ? prev - 1 : tabs.length - 1));
      }
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveTabIndex(prev => (prev < tabs.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [tabs.length, activeTabIndex]);

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

  const handleCommand = async (cmd: string) => {
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

    if (pendingAction) {
      if (trimmed.toLowerCase() === 'y') {
        pendingAction.action();
        setPendingAction(null);
      } else if (trimmed.toLowerCase() === 'n') {
        appendToHistory({ type: 'text', content: 'Operation cancelled.' });
        setPendingAction(null);
      } else {
        appendToHistory({ type: 'text', content: 'Invalid input. Please type "y" or "n".' });
      }
      return;
    }

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

      // --- Virtual File System Commands ---
      case 'ls': {
        const files = Object.keys(vfs);
        if (files.length === 0) {
          appendToHistory({ type: 'text', content: 'Directory is empty.' });
        } else {
          const header = `${'NAME'.padEnd(20)} ${'SIZE'.padEnd(10)} ${'CREATED'.padEnd(20)} TYPE`;
          const fileList = files.map(f => {
            const entry = vfs[f];
            const size = entry.isDir ? '-' : new Blob([entry.content]).size;
            const date = new Date(entry.createdAt).toLocaleString();
            return `${f.padEnd(20)} ${size.toString().padEnd(10)} ${date.padEnd(20)} ${entry.isDir ? '[DIR]' : 'FILE'}`;
          }).join('\n');
          appendToHistory({ type: 'text', content: `${header}\n${fileList}` });
        }
        break;
      }

      case 'touch': {
        const file = args[0];
        if (!file) {
          appendToHistory({ type: 'error', content: 'Usage: touch <filename>' });
          break;
        }
        if (!vfs[file]) {
          setVfs(prev => ({ ...prev, [file]: { content: '', createdAt: new Date().toISOString(), permissions: 'rw-r--r--' } }));
        } else if (vfs[file].isDir) {
          appendToHistory({ type: 'error', content: `touch: cannot touch '${file}': Is a directory` });
        } else {
          // Update timestamp
          setVfs(prev => ({ ...prev, [file]: { ...prev[file], createdAt: new Date().toISOString() } }));
        }
        break;
      }

      case 'mkdir': {
        const dir = args[0];
        if (!dir) {
          appendToHistory({ type: 'error', content: 'Usage: mkdir <dirname>' });
          break;
        }
        if (!vfs[dir]) {
          setVfs(prev => ({ ...prev, [dir]: { content: '', createdAt: new Date().toISOString(), isDir: true, permissions: 'rwxr-xr-x' } }));
        } else {
          appendToHistory({ type: 'error', content: `mkdir: cannot create directory '${dir}': File exists` });
        }
        break;
      }

      case 'cat': {
        const file = args[0];
        if (!file) {
          appendToHistory({ type: 'error', content: 'Usage: cat <filename>' });
          break;
        }
        if (vfs[file] !== undefined) {
          if (vfs[file].isDir) {
            appendToHistory({ type: 'error', content: `cat: '${file}': Is a directory` });
          } else {
            appendToHistory({ type: 'text', content: vfs[file].content });
          }
        } else {
          appendToHistory({ type: 'error', content: `cat: '${file}': No such file or directory` });
        }
        break;
      }

      case 'rm': {
        const file = args[0];
        if (!file) {
          appendToHistory({ type: 'error', content: 'Usage: rm <filename>' });
          break;
        }
        if (vfs[file] !== undefined) {
          if (vfs[file].isDir) {
            appendToHistory({ type: 'error', content: `rm: cannot remove '${file}': Is a directory` });
          } else {
            setVfs(prev => {
              const newVfs = { ...prev };
              delete newVfs[file];
              return newVfs;
            });
            appendToHistory({ type: 'text', content: `Removed '${file}'` });
          }
        } else {
          appendToHistory({ type: 'error', content: `rm: cannot remove '${file}': No such file or directory` });
        }
        break;
      }

      case 'edit':
      case 'vim':
      case 'nvim':
      case 'emacs': {
        const file = args[0] || 'Untitled';
        setEditor(prev => {
          const existingTabIndex = prev.tabs.findIndex(t => t.file === file);
          if (existingTabIndex >= 0) {
            return { ...prev, isOpen: true, activeTabIndex: existingTabIndex };
          }
          const newTab = { file, content: vfs[file]?.content || '', mode: command };
          return {
            isOpen: true,
            tabs: [...prev.tabs, newTab],
            activeTabIndex: prev.tabs.length
          };
        });
        break;
      }

      case 'run': {
        const file = args[0];
        if (!file) {
          appendToHistory({ type: 'error', content: 'Usage: run <filename.js>' });
          break;
        }
        if (vfs[file] !== undefined) {
          setPendingAction({
            action: () => {
              try {
                // Capture console.log output
                let output = '';
                const originalLog = console.log;
                console.log = (...logArgs) => {
                  output += logArgs.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
                };
                
                // Execute the code
                // eslint-disable-next-line no-eval
                const result = eval(vfs[file].content);
                console.log = originalLog;
                
                if (output) {
                  appendToHistory({ type: 'text', content: output.trim() });
                } else if (result !== undefined) {
                  appendToHistory({ type: 'text', content: String(result) });
                } else {
                  appendToHistory({ type: 'text', content: '[Execution finished with no output]' });
                }
              } catch (e: any) {
                appendToHistory({ type: 'error', content: `Execution Error: ${e.message}` });
              }
            },
            message: `Are you sure you want to run ${file}? (y/n)`
          });
          appendToHistory({ type: 'text', content: `Are you sure you want to run ${file}? (y/n)` });
        } else {
          appendToHistory({ type: 'error', content: `run: ${file}: No such file` });
        }
        break;
      }

      case 'find': {
        const query = args[0];
        if (!query) {
          appendToHistory({ type: 'error', content: 'Usage: find <query>' });
          break;
        }
        const matches = Object.entries(vfs).filter(([name, entry]) => 
          name.includes(query) || entry.content.includes(query)
        );
        
        if (matches.length === 0) {
          appendToHistory({ type: 'text', content: `No files found matching '${query}'` });
        } else {
          const result = matches.map(([name, entry]) => 
            `${name} (${entry.isDir ? 'DIR' : 'FILE'})`
          ).join('\n');
          appendToHistory({ type: 'text', content: `Found ${matches.length} match(es):\n${result}` });
        }
        break;
      }

      case 'github': {
        const username = args[0];
        if (!username) {
          appendToHistory({ type: 'error', content: 'Usage: github <username>' });
          break;
        }
        
        appendToHistory({ type: 'text', content: `Fetching profile for ${username}...` });
        
        try {
          const [userRes, reposRes] = await Promise.all([
            fetch(`https://api.github.com/users/${username}`),
            fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=5`)
          ]);
          
          if (!userRes.ok) throw new Error(`User not found: ${userRes.status}`);
          if (!reposRes.ok) throw new Error(`Could not fetch repositories: ${reposRes.status}`);
          
          const user = await userRes.json();
          const repos = await reposRes.json();
          
          let output = `--- GitHub Profile: ${user.login} ---\n`;
          output += `Bio: ${user.bio || 'N/A'}\n`;
          output += `Followers: ${user.followers}\n`;
          output += `Public Repos: ${user.public_repos}\n\n`;
          output += `Recent Repositories:\n`;
          
          if (repos.length === 0) {
            output += 'No public repositories found.';
          } else {
            output += repos.map((r: any) => `- ${r.name} (${r.stargazers_count} stars)`).join('\n');
          }
          
          appendToHistory({ type: 'text', content: output });
          
        } catch (e: any) {
          appendToHistory({ type: 'error', content: `GitHub Error: ${e.message}` });
        }
        break;
      }

      case 'git': {
        const sub = args[0];
        if (sub === 'clone') {
          const repoUrl = args[1];
          if (!repoUrl) {
            appendToHistory({ type: 'error', content: 'Usage: git clone <repository-url>' });
            break;
          }
          
          let owner = '';
          let repo = '';
          try {
            const urlString = repoUrl.startsWith('http') ? repoUrl : `https://${repoUrl}`;
            const url = new URL(urlString);
            const parts = url.pathname.split('/').filter(Boolean);
            if (url.hostname.includes('github.com') && parts.length >= 2) {
              owner = parts[0];
              repo = parts[1].replace('.git', '');
            } else {
              throw new Error('Only GitHub repositories are supported currently.');
            }
          } catch (e: any) {
            appendToHistory({ type: 'error', content: `Invalid repository URL: ${e.message}` });
            break;
          }

          appendToHistory({ type: 'text', content: `Cloning into '${repo}'...` });
          setActiveProcesses(prev => [...prev, 'GIT']);
          
          try {
            const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
            if (!branchRes.ok) throw new Error(`Repository not found: ${branchRes.status}`);
            const repoData = await branchRes.json();
            const defaultBranch = repoData.default_branch;

            const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
            if (!treeRes.ok) throw new Error(`Failed to fetch repository tree: ${treeRes.status}`);
            const treeData = await treeRes.json();

            const files = treeData.tree.filter((t: any) => t.type === 'blob').slice(0, 30);
            
            appendToHistory({ type: 'text', content: `Fetching ${files.length} files (limited to 30 for VFS)...` });
            
            let fetched = 0;
            const newVfs = { ...vfs };
            
            for (const file of files) {
              try {
                const fileRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`);
                if (fileRes.ok) {
                  const content = await fileRes.text();
                  newVfs[`${repo}/${file.path}`] = { content, createdAt: new Date().toISOString() };
                  fetched++;
                }
              } catch (e) {
                // skip failed files
              }
            }
            
            setVfs(newVfs);
            appendToHistory({ type: 'text', content: `Successfully cloned ${fetched} files into '${repo}/'.\nUse 'ls' to view files.` });
          } catch (e: any) {
            appendToHistory({ type: 'error', content: `Git Error: ${e.message}` });
          } finally {
            setActiveProcesses(prev => prev.filter(p => p !== 'GIT'));
          }
        } else {
          appendToHistory({ type: 'error', content: 'Usage: git clone <repository-url>' });
        }
        break;
      }

      case 'github': {
        const username = args[0];
        if (!username) {
          appendToHistory({ type: 'error', content: 'Usage: github <username>' });
          break;
        }
        setActiveProcesses(prev => [...prev, 'GitHub']);
        try {
          const res = await fetch(`https://api.github.com/users/${username}`);
          if (!res.ok) throw new Error(`User not found: ${res.status}`);
          const data = await res.json();
          
          const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=3`);
          const repos = await reposRes.json();
          
          let out = `👤 GitHub Profile: ${data.name || data.login}\n`;
          out += `📝 Bio: ${data.bio || 'No bio'}\n`;
          out += `🌟 Followers: ${data.followers} | Following: ${data.following}\n`;
          out += `📦 Public Repos: ${data.public_repos}\n\n`;
          out += `Recent Repositories:\n`;
          if (repos && repos.length > 0) {
            repos.forEach((r: any) => {
              out += `  - ${r.name} (⭐ ${r.stargazers_count})\n`;
              out += `    ${r.description || 'No description'}\n`;
            });
          } else {
            out += `  No public repositories found.\n`;
          }
          appendToHistory({ type: 'text', content: out });
        } catch (e: any) {
          appendToHistory({ type: 'error', content: `GitHub Error: ${e.message}` });
        } finally {
          setActiveProcesses(prev => prev.filter(p => p !== 'GitHub'));
        }
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
  };

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
  // EDITOR CLOSE CONFIRMATION LOGIC
  // ============================================================================
  
  const hasUnsavedChanges = (index?: number) => {
    if (index !== undefined) {
      const tab = editor.tabs[index];
      return tab && tab.content !== (vfs[tab.file] || '');
    }
    return editor.tabs.some(tab => tab.content !== (vfs[tab.file] || ''));
  };

  const executeCloseTab = (index: number) => {
    setEditor(prev => {
      const newTabs = prev.tabs.filter((_, i) => i !== index);
      if (newTabs.length === 0) {
        setTimeout(() => inputRef.current?.focus(), 100);
        return { isOpen: false, tabs: [], activeTabIndex: 0 };
      }
      return {
        ...prev,
        tabs: newTabs,
        activeTabIndex: Math.min(prev.activeTabIndex, newTabs.length - 1)
      };
    });
  };

  const handleCloseTab = (index: number) => {
    if (hasUnsavedChanges(index)) {
      setCloseConfirm({ isOpen: true, type: 'single', tabIndex: index });
    } else {
      executeCloseTab(index);
    }
  };

  const executeCloseEditor = () => {
    setEditor({ isOpen: false, tabs: [], activeTabIndex: 0 });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCloseEditor = () => {
    if (hasUnsavedChanges()) {
      setCloseConfirm({ isOpen: true, type: 'all' });
    } else {
      executeCloseEditor();
    }
  };

  const handleConfirmClose = (save: boolean) => {
    if (save) {
      if (closeConfirm.type === 'single' && closeConfirm.tabIndex !== undefined) {
        const tab = editor.tabs[closeConfirm.tabIndex];
        setVfs(prev => ({ ...prev, [tab.file]: { content: tab.content, createdAt: prev[tab.file]?.createdAt || new Date().toISOString() } }));
        appendToHistory({ type: 'text', content: `Saved ${tab.file}` });
      } else {
        // Save all
        const newVfs = { ...vfs };
        editor.tabs.forEach(tab => {
          if (tab.content !== (vfs[tab.file]?.content || '')) {
            newVfs[tab.file] = { content: tab.content, createdAt: vfs[tab.file]?.createdAt || new Date().toISOString() };
            appendToHistory({ type: 'text', content: `Saved ${tab.file}` });
          }
        });
        setVfs(newVfs);
      }
    }
    
    setCloseConfirm({ isOpen: false, type: 'all' });
    
    if (closeConfirm.type === 'single' && closeConfirm.tabIndex !== undefined) {
      executeCloseTab(closeConfirm.tabIndex);
    } else {
      executeCloseEditor();
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
      <div className={`flex items-center justify-between mb-2 border-b pb-2 transition-colors duration-300 ${
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

      {/* Tab Bar */}
      <div className={`flex overflow-x-auto mb-4 border-b transition-colors duration-300 ${
        isDark ? 'border-green-900' : 'border-blue-200'
      }`}>
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`flex items-center px-4 py-2 cursor-pointer border-r text-sm transition-colors duration-300 ${
              isDark ? 'border-green-900' : 'border-blue-200'
            } ${
              index === activeTabIndex 
                ? (isDark ? 'bg-green-900/30 text-green-400' : 'bg-blue-100 text-blue-700') 
                : (isDark ? 'hover:bg-green-900/20 text-green-600' : 'hover:bg-blue-50 text-blue-500')
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTabIndex(index);
            }}
          >
            <span>Terminal {index + 1}</span>
            {tabs.length > 1 && (
              <button
                className={`ml-3 focus:outline-none ${isDark ? 'hover:text-red-400' : 'hover:text-red-500'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setTabs(prev => prev.filter((_, i) => i !== index));
                  if (activeTabIndex === index) {
                    setActiveTabIndex(Math.max(0, index - 1));
                  } else if (activeTabIndex > index) {
                    setActiveTabIndex(activeTabIndex - 1);
                  }
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className={`px-4 py-2 text-sm font-bold transition-colors duration-300 ${
            isDark ? 'hover:bg-green-900/20 text-green-500' : 'hover:bg-blue-50 text-blue-600'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setTabs(prev => [...prev, createNewTab()]);
            setActiveTabIndex(tabs.length);
          }}
          title="New Tab (Alt+T)"
        >
          + New Tab
        </button>
      </div>

      {/* URL Bar */}
      <div 
        className={`flex items-center gap-2 mb-4 border-b pb-2 transition-colors duration-300 ${
          isDark ? 'border-green-900' : 'border-blue-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`font-bold ${isDark ? 'text-green-400' : 'text-blue-600'}`}>URL:</span>
        <input
          type="text"
          placeholder="Enter website URL or search query..."
          className={`flex-1 bg-transparent outline-none px-2 py-1 transition-colors duration-300 ${
            isDark ? 'text-white placeholder-green-800' : 'text-gray-900 placeholder-blue-300'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = e.currentTarget.value.trim();
              if (val) {
                handleCommand(`browse ${val}`);
                e.currentTarget.value = '';
              }
            }
          }}
        />
        <button
          onClick={(e) => {
            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
            const val = input.value.trim();
            if (val) {
              handleCommand(`browse ${val}`);
              input.value = '';
            }
          }}
          className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-tighter transition-all hover:scale-105 active:scale-95 ${
            isDark 
              ? 'bg-green-900/30 text-green-400 border border-green-800 hover:bg-green-900/50' 
              : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200'
          }`}
        >
          Go
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

      {/* Editor Overlay */}
      {editor.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col font-mono">
          {/* Tab Bar */}
          <div className="flex bg-gray-900 text-gray-400 overflow-x-auto border-b border-gray-800">
            {editor.tabs.map((tab, index) => (
              <div
                key={index}
                className={`flex items-center px-4 py-2 cursor-pointer border-r border-gray-800 text-sm ${index === editor.activeTabIndex ? 'bg-gray-800 text-green-400' : 'hover:bg-gray-800'}`}
                onClick={() => setEditor(prev => ({ ...prev, activeTabIndex: index }))}
              >
                <span>{tab.file}</span>
                <button
                  className="ml-3 hover:text-red-400 focus:outline-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(index);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button 
              className="px-4 py-2 hover:bg-gray-800 text-green-500 text-sm font-bold"
              onClick={() => {
                const fileName = prompt('Enter new file name:', 'Untitled');
                if (fileName) {
                  setEditor(prev => {
                    const existingTabIndex = prev.tabs.findIndex(t => t.file === fileName);
                    if (existingTabIndex >= 0) {
                      return { ...prev, activeTabIndex: existingTabIndex };
                    }
                    return {
                      ...prev,
                      tabs: [...prev.tabs, { file: fileName, content: vfs[fileName]?.content || '', mode: 'edit' }],
                      activeTabIndex: prev.tabs.length
                    };
                  });
                }
              }}
            >
              + New Tab
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex justify-between items-center p-2 text-green-400 border-b border-green-800 bg-black">
            <span className="font-bold text-sm">
              📝 Editing: {editor.tabs[editor.activeTabIndex]?.file} 
              <span className="text-xs opacity-50 uppercase ml-2">[{editor.tabs[editor.activeTabIndex]?.mode}]</span>
            </span>
            <div className="flex gap-4 text-sm items-center">
              {editor.tabs[editor.activeTabIndex] && (editor.tabs[editor.activeTabIndex].file.endsWith('.md') || editor.tabs[editor.activeTabIndex].file.endsWith('.txt')) && (
                <button 
                  onClick={() => setShowPreview(!showPreview)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold uppercase tracking-tighter transition-all hover:scale-105 active:scale-95 ${
                    showPreview 
                      ? 'bg-blue-900/40 text-blue-400 border border-blue-800 hover:bg-blue-900/60' 
                      : 'bg-green-900/30 text-green-400 border border-green-800 hover:bg-green-900/50'
                  }`}
                  title="Toggle Preview"
                >
                  {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
              )}
              <button 
                onClick={() => {
                  const activeTab = editor.tabs[editor.activeTabIndex];
                  if (activeTab) {
                    setVfs(prev => ({ ...prev, [activeTab.file]: { content: activeTab.content, createdAt: prev[activeTab.file]?.createdAt || new Date().toISOString() } }));
                    appendToHistory({ type: 'text', content: `Saved ${activeTab.file}` });
                  }
                }}
                className="hover:text-white transition-colors"
              >
                [Ctrl+S] Save
              </button>
              <button 
                onClick={handleCloseEditor}
                className="hover:text-red-400 transition-colors"
              >
                [Esc] Close Editor
              </button>
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 overflow-hidden flex bg-transparent">
            {editor.tabs.length > 0 && (
              <>
                <div className={`flex-1 overflow-y-auto p-4 ${showPreview && (editor.tabs[editor.activeTabIndex].file.endsWith('.md') || editor.tabs[editor.activeTabIndex].file.endsWith('.txt')) ? 'border-r border-gray-800' : ''}`}>
                  <Editor
                    value={editor.tabs[editor.activeTabIndex].content}
                    onValueChange={code => setEditor(prev => {
                      const newTabs = [...prev.tabs];
                      newTabs[prev.activeTabIndex].content = code;
                      return { ...prev, tabs: newTabs };
                    })}
                    highlight={code => {
                      const file = editor.tabs[editor.activeTabIndex].file;
                      let lang = languages.plain;
                      let langName = 'plain';
                      
                      if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
                        lang = languages.js; langName = 'javascript';
                      } else if (file.endsWith('.css')) {
                        lang = languages.css; langName = 'css';
                      } else if (file.endsWith('.html')) {
                        lang = languages.html; langName = 'html';
                      } else if (file.endsWith('.json')) {
                        lang = languages.json; langName = 'json';
                      } else if (file.endsWith('.md')) {
                        lang = languages.markdown; langName = 'markdown';
                      } else if (file.endsWith('.py')) {
                        lang = languages.python; langName = 'python';
                      } else if (file.endsWith('.sh')) {
                        lang = languages.bash; langName = 'bash';
                      }
                      
                      return highlight(code, lang || languages.plain, langName);
                    }}
                    padding={10}
                    className="font-mono text-sm sm:text-base leading-relaxed text-green-300 min-h-full"
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      outline: 'none',
                    }}
                    textareaClassName="outline-none"
                    onKeyDown={e => {
                      if (e.ctrlKey && e.key === 's') {
                        e.preventDefault();
                        const activeTab = editor.tabs[editor.activeTabIndex];
                        if (activeTab) {
                          setVfs(prev => ({ ...prev, [activeTab.file]: { content: activeTab.content, createdAt: prev[activeTab.file]?.createdAt || new Date().toISOString() } }));
                          appendToHistory({ type: 'text', content: `Saved ${activeTab.file}` });
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCloseEditor();
                      }
                    }}
                    autoFocus
                  />
                </div>
                {showPreview && (editor.tabs[editor.activeTabIndex].file.endsWith('.md') || editor.tabs[editor.activeTabIndex].file.endsWith('.txt')) && (
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-900/80 text-gray-300 font-sans">
                    {editor.tabs[editor.activeTabIndex].file.endsWith('.md') ? (
                      <div className="prose prose-invert max-w-none prose-pre:bg-black prose-pre:border prose-pre:border-gray-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {editor.tabs[editor.activeTabIndex].content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {editor.tabs[editor.activeTabIndex].content}
                      </pre>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Close Confirmation Modal */}
          {closeConfirm.isOpen && (
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Unsaved Changes</h3>
                <p className="text-gray-300 mb-6">
                  {closeConfirm.type === 'single' 
                    ? `Save changes to "${editor.tabs[closeConfirm.tabIndex!]?.file}" before closing?` 
                    : "You have unsaved changes in one or more tabs. Save all before closing?"}
                </p>
                <div className="flex justify-end gap-4">
                  <button 
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    onClick={() => setCloseConfirm({ isOpen: false, type: 'all' })}
                  >
                    Cancel
                  </button>
                  <button 
                    className="px-4 py-2 bg-red-900/50 text-red-400 hover:bg-red-900 hover:text-red-300 transition-colors border border-red-800"
                    onClick={() => handleConfirmClose(false)}
                  >
                    Don't Save
                  </button>
                  <button 
                    className="px-4 py-2 bg-green-900/50 text-green-400 hover:bg-green-900 hover:text-green-300 transition-colors border border-green-800"
                    onClick={() => handleConfirmClose(true)}
                  >
                    {closeConfirm.type === 'single' ? 'Save' : 'Save All'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
