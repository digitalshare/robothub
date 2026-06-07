import { useEffect, useState } from 'react';
import { createTopic, deleteTopic, fetchTopicNow, listTopics, updateTopic } from '../../lib/api';
import type { Platform, Topic } from '../../lib/types';
import { PLATFORMS } from '../../lib/platforms';

export default function AdminTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  // new topic form
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [interval, setInterval] = useState(360);
  const [topN, setTopN] = useState(8);
  const [platforms, setPlatforms] = useState<Platform[]>(['news']);

  const reload = () => listTopics().then(setTopics).finally(() => setLoading(false));
  useEffect(() => {
    reload();
  }, []);

  const togglePlatform = (p: Platform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !query.trim()) return;
    await createTopic({ name, query, interval_minutes: interval, top_n: topN, platforms: platforms.length ? platforms : ['news'] });
    setName('');
    setQuery('');
    setPlatforms(['news']);
    reload();
  };

  const toggle = async (t: Topic) => {
    await updateTopic(t.id, { schedule_enabled: !t.schedule_enabled });
    reload();
  };

  const cyclePlatform = async (t: Topic, p: Platform) => {
    const cur: Platform[] = t.platforms?.length ? t.platforms : ['news'];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    await updateTopic(t.id, { platforms: next.length ? next : ['news'] });
    reload();
  };

  const runNow = async (t: Topic) => {
    setBusyId(t.id);
    setMsg('');
    try {
      const res = await fetchTopicNow(t.id);
      if (res.error) setMsg(`${t.name}: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
      else setMsg(`${t.name}: fetched ${res.found ?? 0}, inserted ${res.inserted ?? 0} new article(s).`);
    } catch (err) {
      setMsg(`${t.name}: ${err instanceof Error ? err.message : 'failed'}`);
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const remove = async (t: Topic) => {
    if (!confirm(`Delete topic "${t.name}"? Articles are kept.`)) return;
    await deleteTopic(t.id);
    reload();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Topics</h1>
      <p className="text-slate-500 mb-6">
        Define what to track. Toggle the schedule to enable automatic fetching via Bright Data.
      </p>

      <form onSubmit={add} className="bg-white border border-slate-200 rounded-lg p-4 mb-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Humanoid Robots"
            className="w-full px-3 py-2 border border-slate-300 rounded-md" />
        </div>
        <div className="sm:col-span-4">
          <label className="block text-xs font-medium text-slate-500 mb-1">Search query</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="humanoid robots"
            className="w-full px-3 py-2 border border-slate-300 rounded-md" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Interval (min)</label>
          <input type="number" min={1} value={interval} onChange={(e) => setInterval(+e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Top N</label>
          <input type="number" min={1} max={50} value={topN} onChange={(e) => setTopN(+e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md" />
        </div>
        <div className="sm:col-span-1">
          <button className="w-full py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700">Add</button>
        </div>
        <div className="sm:col-span-12">
          <label className="block text-xs font-medium text-slate-500 mb-1">Platforms to fetch</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p.key);
              return (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => togglePlatform(p.key)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="mr-1">{p.icon}</span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {msg && <div className="mb-4 text-sm bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-slate-700">{msg}</div>}

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Topic</th>
                <th className="px-4 py-2 font-medium">Query</th>
                <th className="px-4 py-2 font-medium">Platforms</th>
                <th className="px-4 py-2 font-medium">Interval</th>
                <th className="px-4 py-2 font-medium">Top N</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Schedule</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topics.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.query}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {PLATFORMS.map((p) => {
                        const on = (t.platforms?.length ? t.platforms : ['news']).includes(p.key);
                        return (
                          <button
                            key={p.key}
                            onClick={() => cyclePlatform(t, p.key)}
                            title={`${on ? 'Disable' : 'Enable'} ${p.label}`}
                            className={`px-1.5 py-0.5 rounded text-xs border ${
                              on ? `${p.badgeClass} border-transparent` : 'bg-white text-slate-300 border-slate-200'
                            }`}
                          >
                            {p.icon}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.interval_minutes}m</td>
                  <td className="px-4 py-3 text-slate-600">{t.top_n}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>{t.last_run_at ? new Date(t.last_run_at).toLocaleString() : '—'}</span>
                      {t.last_status && (
                        <span
                          title={t.last_error || undefined}
                          className={`px-1.5 py-0.5 rounded-full text-xs ${
                            t.last_status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {t.last_status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(t)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        t.schedule_enabled ? 'bg-brand-600' : 'bg-slate-300'
                      }`}
                      title={t.schedule_enabled ? 'Scheduled fetch ON' : 'Scheduled fetch OFF'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          t.schedule_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => runNow(t)}
                      disabled={busyId === t.id}
                      className="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50 mr-2"
                    >
                      {busyId === t.id ? 'Fetching…' : 'Fetch now'}
                    </button>
                    <button onClick={() => remove(t)} className="px-2.5 py-1 rounded-md text-red-600 hover:bg-red-50">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {topics.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No topics yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
