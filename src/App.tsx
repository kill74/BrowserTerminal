import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

type HistoryItem = {
  id: string;
  type: 'command' | 'text' | 'html' | 'iframe' | 'error';
  content: string;
  url?: string;
};

export default function App() {
  const [history, setHistory] = useState<HistoryItem[]>([
    { id: '1', type: 'text', content: 'Welcome to WebTerm v2.0.0' },
    { id: '2', type: 'text', content: 'Type "help" for a list of commands.' },
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'navigate' && event.data.url) {
        handleCommand(`browse ${event.data.url}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [history, commandHistory, historyIndex]);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);

    const newHistory = [...history, { id: Date.now().toString(), type: 'command', content: trimmed } as HistoryItem];
    setHistory(newHistory);
    setInput('');

    const parts = trimmed.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        setHistory(prev => [...prev, {
          id: Date.now().toString() + 'h',
          type: 'text',
          content: `Available commands:
  help          - Show this help message
  clear         - Clear the terminal
  search <q>    - Search the web
  browse <url>  - Open a website in an iframe (auto-searches if not a URL)
  curl <url>    - Fetch raw HTML of a website
  echo <text>   - Print text
  date          - Show current date/time
  
Note: Clicking links inside the browser will automatically run a new browse command!`
        }]);
        break;
      case 'clear':
        setHistory([]);
        break;
      case 'echo':
        setHistory(prev => [...prev, {
          id: Date.now().toString() + 'e',
          type: 'text',
          content: args.join(' ')
        }]);
        break;
      case 'date':
        setHistory(prev => [...prev, {
          id: Date.now().toString() + 'd',
          type: 'text',
          content: new Date().toString()
        }]);
        break;
      case 'search':
      case 'browse': {
        if (!args[0]) {
          setHistory(prev => [...prev, { id: Date.now().toString() + 'err', type: 'error', content: `Usage: ${command} <url or query>` }]);
          break;
        }
        let query = args.join(' ');
        let url = query;
        
        if (command === 'search' || (!url.includes('.') || url.includes(' '))) {
          url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        // YouTube video detection to use embed player for better iframe support
        let isDirectEmbed = false;
        if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
          try {
            const videoId = url.includes('youtu.be/') 
              ? url.split('youtu.be/')[1].split('?')[0]
              : new URLSearchParams(url.split('?')[1]).get('v');
            if (videoId) {
              url = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
              isDirectEmbed = true;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        setHistory(prev => [...prev, {
          id: Date.now().toString() + 'b',
          type: 'iframe',
          content: 'Loading...',
          url: isDirectEmbed ? url : `/api/iframe-proxy?url=${encodeURIComponent(url)}`
        }]);
        break;
      }
      case 'curl': {
        if (!args[0]) {
          setHistory(prev => [...prev, { id: Date.now().toString() + 'err', type: 'error', content: 'Usage: curl <url>' }]);
          break;
        }
        let url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        try {
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          setHistory(prev => [...prev, {
            id: Date.now().toString() + 'c',
            type: 'text',
            content: text.slice(0, 2000) + (text.length > 2000 ? '\n...[truncated]' : '')
          }]);
        } catch (err: any) {
          setHistory(prev => [...prev, { id: Date.now().toString() + 'err', type: 'error', content: `Error: ${err.message}` }]);
        }
        break;
      }
      default:
        setHistory(prev => [...prev, {
          id: Date.now().toString() + 'err',
          type: 'error',
          content: `Command not found: ${command}`
        }]);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-500 p-4 font-mono text-sm sm:text-base flex flex-col" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center gap-2 mb-4 text-green-400 border-b border-green-900 pb-2">
        <TerminalIcon size={20} />
        <h1 className="font-bold tracking-wider">WEB-TERM</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 pb-4">
        {history.map((item) => (
          <div key={item.id} className="break-words">
            {item.type === 'command' && (
              <div className="flex">
                <span className="text-blue-400 mr-2">user@web-term:~$</span>
                <span className="text-white">{item.content}</span>
              </div>
            )}
            {item.type === 'text' && (
              <pre className="whitespace-pre-wrap text-green-300 font-mono">{item.content}</pre>
            )}
            {item.type === 'error' && (
              <div className="text-red-400">{item.content}</div>
            )}
            {item.type === 'iframe' && (
              <div className="mt-2 border border-green-800 rounded overflow-hidden bg-white w-full max-w-5xl h-[70vh]">
                <div className="bg-gray-200 text-black px-2 py-1 text-xs border-b border-gray-300 flex items-center justify-between">
                  <span className="truncate">{decodeURIComponent(item.url?.replace('/api/iframe-proxy?url=', '') || '')}</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>
                <iframe 
                  src={item.url} 
                  className="w-full h-full border-none bg-white" 
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation allow-downloads"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex mt-2 items-center">
        <span className="text-blue-400 mr-2">user@web-term:~$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
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
          }}
          className="flex-1 bg-transparent border-none outline-none text-white caret-green-500"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
