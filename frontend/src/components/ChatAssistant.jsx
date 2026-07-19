// src/components/ChatAssistant.jsx
import React, { useState, useRef, useEffect } from 'react';
import { askQuestion } from '../hooks/useRealtime';

const QUICK_PROMPTS = [
  'Where is the nearest medical station?',
  'Which gate has the lowest crowd density?',
  'Where can I find accessible restrooms?',
  'Tell me about Gate C.',
  'Where is the nearest food court to Gate A?',
];

export default function ChatAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hi! I'm **CrowdSense AI** 🏟️\n\nAsk me anything about MetLife Stadium — gate locations, crowd conditions, restrooms, medical points, or food courts.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: query, timestamp: new Date() }]);
    setLoading(true);

    try {
      const res = await askQuestion(query);
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          text: res.answer,
          sources: res.sources,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setError('Could not reach the AI backend. Make sure the backend is running on port 8000.');
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          text: '⚠️ Unable to connect to backend. Please start the FastAPI server.',
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500/80 to-cyan-600/80 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-teal-400 border-2 border-navy-800" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-sm text-white leading-none">AI Assistant</h2>
          <p className="text-[10px] text-teal-400 mt-0.5">Powered by CrowdSense RAG</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scroll px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_PROMPTS.slice(0, 3).map((p, i) => (
            <button
              key={i}
              onClick={() => send(p)}
              disabled={loading}
              className="text-[10px] px-2 py-1 rounded-lg border border-teal-500/20 text-teal-400 bg-teal-500/5
                         hover:bg-teal-500/15 transition-colors disabled:opacity-40 truncate max-w-[120px]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-navy-700/50 border border-white/10 rounded-xl px-3 py-2 focus-within:border-teal-500/50 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about gates, food, medical…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none outline-none
                       max-h-20 leading-relaxed disabled:opacity-50"
            style={{ minHeight: '1.5rem' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            id="chat-send-btn"
            className="w-8 h-8 rounded-lg bg-teal-500 hover:bg-teal-400 flex items-center justify-center
                       transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shrink-0"
          >
            <svg className="w-4 h-4 text-navy-950" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {error && (
          <p className="text-[10px] text-red-400 mt-1 px-1">{error}</p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const lines = message.text.split('\n');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={isUser ? 'chat-user' : 'chat-ai'}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {lines.map((line, i) => {
            // Bold markdown
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
              <React.Fragment key={i}>
                {parts.map((part, j) =>
                  part.startsWith('**') && part.endsWith('**')
                    ? <strong key={j} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                    : <span key={j}>{part}</span>
                )}
                {i < lines.length - 1 && <br />}
              </React.Fragment>
            );
          })}
        </div>
        {message.sources && message.sources.length > 0 && (
          <SourceBadges sources={message.sources} />
        )}
        <p className="text-[9px] text-slate-600 mt-1.5 text-right">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function SourceBadges({ sources }) {
  const unique = [...new Map(sources.map(s => [s.type, s])).values()].slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {unique.map((s, i) => (
        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-500 border border-teal-500/20">
          {s.type?.replace('_', ' ')}
        </span>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="chat-ai flex items-center gap-1 py-3 px-4">
        {[0, 150, 300].map(d => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
