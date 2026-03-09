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

const HELP_TEXT = `Available commands:
  help          - Show this help message
  clear         - Clear the terminal
  search <q>    - Search the web (uses DuckDuckGo Lite)
  browse <url>  - Open a website in an iframe (auto-searches if not a URL)
  curl <url>    - Fetch raw HTML of a website
  echo <text>   - Print text
  date          - Show current date/time
  
Note: Clicking links inside the browser will automatically run a new browse command!`;

const INITIAL_HISTORY: HistoryItem[] = [
  { id: '1', type: 'text', content: 'Welcome to WebTerm v2.0.0' },
  { id: '2', type: 'text', content: 'Type "help" for a list of commands.' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function App() {
  // --- State ---
  const [history, setHistory] = useState<HistoryItem[]>(INITIAL_HISTORY);
  const [input, setInput] = useState('');
  
  // Command history for up/down arrow navigation
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // --- Refs ---
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  
  // Auto-scroll to bottom when history changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // --- Helpers ---

  // Helper to add a new item to the terminal history
  const appendToHistory = (item: Omit<HistoryItem, 'id'>) => {
    setHistory(prev => [...prev, { ...item, id: Date.now().toString() + Math.random().toString(36).substring(7) }]);
  };

  // Helper to format YouTube URLs into embed URLs so they play nicely in iframes
  const formatYouTubeUrl = (url: string): { url: string; isEmbed: boolean } => {
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
      try {
        const videoId = url.includes('youtu.be/') 
          ? url.split('youtu.be/')[1].split('?')[0]
          : new URLSearchParams(url.split('?')[1]).get('v');
          
        if (videoId) {
          return { url: `https://www.youtube.com/embed/${videoId}?autoplay=1`, isEmbed: true };
        }
      } catch (e) {
        // Ignore parsing errors and fall through
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

    // 2. Echo the command to the screen
    appendToHistory({ type: 'command', content: trimmed });
    setInput('');

    // 3. Parse the command
    const parts = trimmed.split(' ');
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
      case 'browse': {
        if (!args[0]) {
          appendToHistory({ type: 'error', content: `Usage: ${command} <url or query>` });
          break;
        }
        
        let query = args.join(' ');
        let targetUrl = query;
        
        // Determine if it's a search query or a direct URL
        const isSearch = command === 'search' || (!targetUrl.includes('.') || targetUrl.includes(' '));
        
        if (isSearch) {
          // Use DuckDuckGo Lite for searches as it works well without JS and avoids CAPTCHAs
          targetUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          // Auto-prepend https:// if missing
          targetUrl = 'https://' + targetUrl;
        }

        // Check if it's a YouTube link and convert to embed if so
        const { url: finalUrl, isEmbed } = formatYouTubeUrl(targetUrl);

        // Special handling for YouTube homepage which requires JS
        if (finalUrl.toLowerCase().includes('youtube.com') && !isEmbed && !finalUrl.includes('search')) {
          appendToHistory({ 
            type: 'text', 
            content: '💡 [SYSTEM] The full YouTube homepage requires JavaScript. Redirecting to search results...' 
          });
          targetUrl = `https://lite.duckduckgo.com/lite/?q=site:youtube.com+${encodeURIComponent(query.replace('youtube.com', '').trim() || 'trending')}`;
        } else {
          targetUrl = finalUrl;
        }

        // Render the iframe
        appendToHistory({
          type: 'iframe',
          content: 'Loading...',
          // If it's a direct embed (like YouTube), load it directly. 
          // Otherwise, route it through our proxy to bypass security restrictions.
          url: isEmbed ? targetUrl : `/api/iframe-proxy?url=${encodeURIComponent(targetUrl)}`
        });
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
      
      default:
        appendToHistory({ type: 'error', content: `Command not found: ${command}` });
    }
  }, [commandHistory, historyIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div 
      className="min-h-screen bg-black text-green-500 p-4 font-mono text-sm sm:text-base flex flex-col" 
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 text-green-400 border-b border-green-900 pb-2">
        <TerminalIcon size={20} />
        <h1 className="font-bold tracking-wider">WEB-TERM</h1>
      </div>
      
      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-4">
        {history.map((item) => (
          <div key={item.id} className="break-words">
            
            {/* Command Echo */}
            {item.type === 'command' && (
              <div className="flex">
                <span className="text-blue-400 mr-2">user@web-term:~$</span>
                <span className="text-white">{item.content}</span>
              </div>
            )}
            
            {/* Standard Text Output */}
            {item.type === 'text' && (
              <pre className="whitespace-pre-wrap text-green-300 font-mono m-0 p-0">{item.content}</pre>
            )}
            
            {/* Error Output */}
            {item.type === 'error' && (
              <div className="text-red-400">{item.content}</div>
            )}
            
            {/* Iframe Browser Output */}
            {item.type === 'iframe' && (
              <div className="mt-2 border border-green-800 rounded overflow-hidden bg-white w-full max-w-5xl h-[60vh] sm:h-[70vh] relative">
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
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation allow-downloads"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
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
      <div className="flex mt-2 items-center">
        <span className="text-blue-400 mr-2">user@web-term:~$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none outline-none text-white caret-green-500"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
