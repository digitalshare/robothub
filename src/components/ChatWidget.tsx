import { useEffect, useRef, useState } from 'react';
import { chat } from '../lib/api';
import type { ChatMessage } from '../lib/types';
import { useChat } from '../contexts/ChatContext';

export default function ChatWidget() {
  const { open, attachment, openChat, closeChat, clearAttachment } = useChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // When opened from an "Ask AI" selection, focus the input.
  useEffect(() => {
    if (open && attachment) inputRef.current?.focus();
  }, [open, attachment]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const currentAttachment = attachment;
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const res = await chat({
        message: text,
        attached_text: currentAttachment?.text,
        article_id: currentAttachment?.articleId ?? null,
        session_id: sessionId,
        history,
      });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, sources: res.sources }]);
      clearAttachment();
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : 'Something went wrong.'}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // Collapsed: floating bubble bottom-right.
  if (!open) {
    return (
      <button
        onClick={() => openChat()}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 flex items-center justify-center text-2xl"
        title="Ask the AI assistant"
        aria-label="Open AI chat"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-40 w-full sm:w-[400px] h-[80vh] sm:h-[600px] max-h-screen bg-white border border-slate-200 sm:rounded-xl shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-brand-600 text-white sm:rounded-t-xl">
        <span className="text-lg">🤖</span>
        <div className="leading-tight">
          <div className="font-semibold text-sm">RobotHub Assistant</div>
          <div className="text-[11px] text-brand-100">RAG over the news knowledge base</div>
        </div>
        <button onClick={closeChat} className="ml-auto text-brand-100 hover:text-white text-xl leading-none" aria-label="Collapse chat">
          ⌄
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500">
            <p className="mb-2">Ask anything about robotics &amp; physical AI news.</p>
            <ul className="space-y-1">
              {['What happened at CES 2026?', 'How much funding is going into robotics?', 'What is physical AI?'].map((q) => (
                <li key={q}>
                  <button onClick={() => setInput(q)} className="text-brand-600 hover:underline text-left">
                    “{q}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.content}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/60 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500">Sources</div>
                  {m.sources.map((s, j) => (
                    <a
                      key={j}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[12px] text-brand-700 hover:underline truncate"
                    >
                      [{j + 1}] {s.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 rounded-2xl px-3 py-2 text-sm">Thinking…</div>
          </div>
        )}
      </div>

      {/* Attachment chip */}
      {attachment && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 text-xs text-amber-800">
            <span className="font-semibold whitespace-nowrap">📎 Asking about:</span>
            <span className="flex-1 line-clamp-2">
              {attachment.articleTitle ? `“${attachment.articleTitle}” — ` : ''}
              {attachment.text}
            </span>
            <button onClick={clearAttachment} className="text-amber-600 hover:text-amber-900" aria-label="Remove attachment">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask a question…"
            className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
