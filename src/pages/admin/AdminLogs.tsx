import { useEffect, useState } from 'react';
import { listLogs, listTopics } from '../../lib/api';
import type { FetchLog, Topic } from '../../lib/types';

const statusColor: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  running: 'bg-amber-100 text-amber-700',
};

export default function AdminLogs() {
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const reload = (topicId?: string) => {
    setLoading(true);
    listLogs(topicId || undefined)
      .then(setLogs)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    listTopics().then(setTopics).catch(() => {});
    reload();
  }, []);

  const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name || '—';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fetch Logs</h1>
          <p className="text-slate-500">History of scheduled and manual fetch jobs.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              reload(e.target.value);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm"
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button onClick={() => reload(filter)} className="px-3 py-1.5 border border-slate-300 rounded-md text-sm hover:bg-slate-50">
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Topic</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Found</th>
                <th className="px-4 py-2 font-medium">Inserted</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(l.started_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-900">{topicName(l.topic_id)}</td>
                  <td className="px-4 py-3 text-slate-500">{l.trigger}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[l.status] || ''}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.articles_found}</td>
                  <td className="px-4 py-3 text-slate-600">{l.articles_inserted}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={l.error_message || ''}>
                    {l.error_message || (l.details ? JSON.stringify(l.details) : '')}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">No fetch logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
