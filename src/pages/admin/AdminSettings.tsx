import { useEffect, useState } from 'react';
import { getSettingsMasked, saveSettings } from '../../lib/api';
import type { SettingsMasked } from '../../lib/types';

const CHAT_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-sonnet-4.5',
  'google/gemini-2.5-flash',
];
const EMBED_MODELS = ['openai/text-embedding-3-small'];

export default function AdminSettings() {
  const [settings, setSettings] = useState<SettingsMasked | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [token, setToken] = useState('');
  const [chatModel, setChatModel] = useState('openai/gpt-4o-mini');
  const [embedModel, setEmbedModel] = useState('openai/text-embedding-3-small');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettingsMasked()
      .then((s) => {
        if (s) {
          setSettings(s);
          setMcpUrl(s.brightdata_mcp_url || '');
          setChatModel(s.chat_model);
          setEmbedModel(s.embed_model);
        }
      })
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const res = await saveSettings({ mcpUrl, token: token || undefined, chatModel, embedModel });
      setToken('');
      if (res.settings) setSettings(res.settings);
      setMsg('Settings saved.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Integration Settings</h1>
      <p className="text-slate-500 mb-6">
        Configure the Bright Data MCP connection used by scheduled fetches, and the AI models.
      </p>

      <form onSubmit={save} className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Bright Data MCP URL</label>
          <input
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            placeholder="https://mcp.brightdata.com/mcp"
            className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">Use the streamable-HTTP endpoint (…/mcp).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            BRIGHTDATA_API_TOKEN
            {settings?.token_set && <span className="ml-2 text-xs text-green-600 font-normal">● a token is saved</span>}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={settings?.token_set ? '•••••••• (leave blank to keep)' : 'Enter Bright Data API token'}
            className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">Stored encrypted; never displayed back.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Chat model</label>
            <select value={chatModel} onChange={(e) => setChatModel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md">
              {[...new Set([chatModel, ...CHAT_MODELS])].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Embedding model</label>
            <select value={embedModel} onChange={(e) => setEmbedModel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md">
              {[...new Set([embedModel, ...EMBED_MODELS])].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">1536-dim; changing requires re-embedding.</p>
          </div>
        </div>

        {msg && <div className="text-sm bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-slate-700">{msg}</div>}

        <button disabled={busy} className="px-4 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}
