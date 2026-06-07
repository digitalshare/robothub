import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getArticle } from '../lib/api';
import type { Article } from '../lib/types';
import { useChat } from '../contexts/ChatContext';
import { platformMeta, statsLine } from '../lib/platforms';

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

function youtubeEmbedId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch (_) {
    return null;
  }
  return null;
}

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<SelectionState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { openChat } = useChat();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getArticle(id)
      .then(setArticle)
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || text.length < 2 || !selection || !bodyRef.current) {
      setSel(null);
      return;
    }
    // Only react to selections inside the article body.
    const anchor = selection.anchorNode;
    if (!anchor || !bodyRef.current.contains(anchor)) {
      setSel(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setSel({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, []);

  useEffect(() => {
    const onScroll = () => setSel(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-slate-500">Loading…</div>;
  if (!article)
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-slate-600">Article not found.</p>
        <Link to="/" className="text-brand-600 hover:underline">
          ← Back to news
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/" className="text-sm text-brand-600 hover:underline">
        ← Back to news
      </Link>

      <div className="flex items-center gap-2 mt-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${platformMeta(article.platform).badgeClass}`}>
          {platformMeta(article.platform).icon} {platformMeta(article.platform).label}
        </span>
        {statsLine(article.stats as Record<string, unknown> | null) && (
          <span className="text-xs text-slate-400">{statsLine(article.stats as Record<string, unknown> | null)}</span>
        )}
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 leading-tight">{article.title}</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-3">
        {article.source && <span className="font-medium text-slate-700">{article.source}</span>}
        {article.author && <span>· {article.author}</span>}
        {article.published_at && <span>· {new Date(article.published_at).toLocaleDateString()}</span>}
        <a href={article.media_url || article.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-brand-600 hover:underline">
          Open on {platformMeta(article.platform).label} ↗
        </a>
      </div>

      {(() => {
        const ytId = article.platform === 'youtube' ? youtubeEmbedId(article.media_url || article.url) : null;
        const hero = article.image_url || article.thumbnail_url;
        if (ytId) {
          return (
            <div className="mt-4 aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${ytId}`}
                title={article.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        if (hero) {
          return (
            <a href={article.media_url || article.url} target="_blank" rel="noopener noreferrer" className="block mt-4">
              <img src={hero} alt="" className="w-full rounded-lg border border-slate-200" loading="lazy"
                onError={(e) => ((e.currentTarget.style.display = 'none'))} />
            </a>
          );
        }
        return null;
      })()}

      <div className="mt-4 mb-4 text-sm text-slate-500 bg-brand-50 border border-brand-100 rounded-md px-3 py-2">
        💡 Tip: select any text below to <span className="font-semibold text-brand-700">Ask AI</span> about it.
      </div>

      {article.summary && <p className="text-lg text-slate-700 mb-4">{article.summary}</p>}

      <div ref={bodyRef} onMouseUp={handleSelection} className="article-body text-slate-800">
        {article.content || article.summary}
      </div>

      {sel && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            openChat({ text: sel.text, articleId: article.id, articleTitle: article.title });
            setSel(null);
            window.getSelection()?.removeAllRanges();
          }}
          style={{ position: 'fixed', left: sel.x, top: sel.y, transform: 'translate(-50%, -100%)' }}
          className="z-50 px-3 py-1.5 rounded-full bg-brand-600 text-white text-sm font-medium shadow-lg hover:bg-brand-700 flex items-center gap-1"
        >
          💬 Ask AI
        </button>
      )}
    </div>
  );
}
