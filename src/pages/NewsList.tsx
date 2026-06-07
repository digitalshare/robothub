import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listArticles, listTopics } from '../lib/api';
import type { Article, Platform, Topic } from '../lib/types';
import { PLATFORMS, platformMeta, statsLine } from '../lib/platforms';

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function NewsList() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<string | undefined>(undefined);
  const [activePlatform, setActivePlatform] = useState<Platform | undefined>(undefined);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 12;

  useEffect(() => {
    listTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    listArticles({ topicId: activeTopic, platform: activePlatform, page, pageSize })
      .then(({ articles, total }) => {
        setArticles(articles);
        setTotal(total);
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeTopic, activePlatform, page]);

  const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Robotics &amp; Physical AI News</h1>
        <p className="text-slate-500 mt-1">
          Auto-curated from the web via Bright Data, searchable with an AI assistant.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => {
            setActiveTopic(undefined);
            setPage(0);
          }}
          className={`px-3 py-1.5 rounded-full text-sm border ${
            !activeTopic ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {topics.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTopic(t.id);
              setPage(0);
            }}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              activeTopic === t.id
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => {
            setActivePlatform(undefined);
            setPage(0);
          }}
          className={`px-3 py-1 rounded-full text-xs border ${
            !activePlatform ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All sources
        </button>
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setActivePlatform(activePlatform === p.key ? undefined : p.key);
              setPage(0);
            }}
            className={`px-3 py-1 rounded-full text-xs border ${
              activePlatform === p.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className="mr-1">{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500">Loading articles…</div>
      ) : articles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
          No articles yet. An admin can add a topic and run a fetch from the Topics page.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a) => {
            const pm = platformMeta(a.platform);
            const stats = statsLine(a.stats as Record<string, unknown> | null);
            const thumb = a.thumbnail_url || a.image_url;
            return (
              <Link
                key={a.id}
                to={`/article/${a.id}`}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow flex flex-col"
              >
                {thumb && (
                  <div className="relative aspect-video bg-slate-100">
                    <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover"
                      onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                    <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${pm.badgeClass}`}>
                      {pm.icon} {pm.label}
                    </span>
                    {(a.content_type === 'video' || a.content_type === 'reel') && (
                      <span className="absolute inset-0 flex items-center justify-center text-white/90 text-4xl drop-shadow">▶</span>
                    )}
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                    {!thumb && <span className={`px-2 py-0.5 rounded-full font-medium ${pm.badgeClass}`}>{pm.icon} {pm.label}</span>}
                    {topicName(a.topic_id) && (
                      <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">{topicName(a.topic_id)}</span>
                    )}
                    <span className="truncate">{a.source}</span>
                    <span className="ml-auto whitespace-nowrap">{timeAgo(a.published_at)}</span>
                  </div>
                  <h3 className="font-semibold text-slate-900 leading-snug mb-2 line-clamp-3">{a.title}</h3>
                  <p className="text-sm text-slate-600 line-clamp-3">{a.summary}</p>
                  {stats && <p className="mt-2 text-xs text-slate-400">{stats}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page + 1} of {Math.ceil(total / pageSize)}
          </span>
          <button
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
