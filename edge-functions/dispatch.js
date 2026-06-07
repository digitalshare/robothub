// dispatch: invoked every minute by the InsForge scheduler. Claims due topics and
// fetches each INLINE (the platform blocks edge->edge calls, so we cannot call
// fetch-topic over HTTP). Shares its pipeline with fetch-topic.js — keep in sync.
// Auth: x-service-secret header.
import { createClient } from 'npm:@insforge/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-service-secret',
};
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_PER_PLATFORM = 8;
const MAX_CHUNKS = 12;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_IMAGE_BYTES = 5_000_000;

const PLATFORM_CFG = {
  news:      { ct: 'article', q: (x) => `${x} news`,                            hosts: null },
  youtube:   { ct: 'video',   q: (x) => `${x} site:youtube.com`,                hosts: ['youtube.com', 'youtu.be'], path: /(\/watch\?v=|\/shorts\/|youtu\.be\/)/ },
  tiktok:    { ct: 'video',   q: (x) => `${x} site:tiktok.com`,                 hosts: ['tiktok.com'],               path: /\/(video|photo)\// },
  instagram: { ct: 'post',    q: (x) => `${x} site:instagram.com`,              hosts: ['instagram.com'],            path: /\/(p|reel|tv)\// },
  x:         { ct: 'post',    q: (x) => `${x} site:x.com OR site:twitter.com`,  hosts: ['x.com', 'twitter.com'],     path: /\/status\// },
};

async function embed(base, apiKey, model, text) {
  const r = await fetch(`${base}/api/ai/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}`);
  return (await r.json()).data[0].embedding;
}

function parseMcp(text) {
  const t = text.trim();
  if (t.startsWith('{')) { try { return JSON.parse(t); } catch (_) {} }
  let last = null;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.startsWith('data:')) {
      const p = l.slice(5).trim();
      if (!p || p === '[DONE]') continue;
      try { const o = JSON.parse(p); if (o.result || o.error) last = o; } catch (_) {}
    }
  }
  return last;
}
async function mcpSend(url, token, sessionId, msg) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
    'MCP-Protocol-Version': '2024-11-05',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg) });
  const sid = r.headers.get('mcp-session-id') || sessionId;
  const text = await r.text();
  if (!r.ok) throw new Error(`MCP ${msg.method} ${r.status}: ${text.slice(0, 160)}`);
  return { parsed: parseMcp(text), sessionId: sid };
}
async function mcpTool(url, token, sid, name, args) {
  const { parsed } = await mcpSend(url, token, sid, {
    jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method: 'tools/call', params: { name, arguments: args },
  });
  if (parsed?.error) throw new Error(`tool ${name}: ${JSON.stringify(parsed.error).slice(0, 160)}`);
  return (parsed?.result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

const NEWS_BLOCK = /google\.|bing\.|duckduckgo\.|youtube\.|youtu\.be|facebook\.|tiktok\.|instagram\.|twitter\.|x\.com|gstatic|schema\.org/;

function keeperFor(platform) {
  const cfg = PLATFORM_CFG[platform];
  if (!cfg || !cfg.hosts) return (host) => !NEWS_BLOCK.test(host);
  return (host, path) => cfg.hosts.some((h) => host === h || host.endsWith('.' + h)) && (!cfg.path || cfg.path.test(path));
}

function extractUrls(serp, limit, keep) {
  const urls = [], seen = new Set();
  const add = (u, title) => {
    try {
      const url = new URL(u);
      if (!/^https?:/.test(url.protocol)) return;
      const host = url.hostname.replace(/^www\./, '');
      if (!keep(host, url.pathname)) return;
      const clean = url.origin + url.pathname;
      if (seen.has(clean)) return;
      seen.add(clean);
      urls.push({ url: u, title: title || null, source: host });
    } catch (_) {}
  };
  let m;
  const reMd = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  while ((m = reMd.exec(serp))) add(m[2], m[1]);
  const reBare = /(https?:\/\/[^\s)"'<>]+)/g;
  while ((m = reBare.exec(serp))) add(m[1], null);
  return urls.slice(0, limit);
}
function chunkText(text) {
  const clean = (text || '').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  let i = 0;
  while (i < clean.length && out.length < MAX_CHUNKS) { out.push(clean.slice(i, i + CHUNK_SIZE)); i += CHUNK_SIZE - CHUNK_OVERLAP; }
  return out;
}
function deriveTitle(md, fb) {
  const h = (md || '').match(/^#\s+(.+)$/m);
  if (h) return h[1].trim().slice(0, 300);
  const f = (md || '').split('\n').map((l) => l.trim()).find((l) => l.length > 10);
  return (f || fb || 'Untitled').slice(0, 300);
}
function firstImage(markdown) {
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = re.exec(markdown || ''))) {
    const u = m[1];
    if (/\.svg($|\?)|data:|\/favicon|sprite|1x1|pixel|\.gif($|\?)/i.test(u)) continue;
    return u;
  }
  return null;
}
function youtubeId(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0] || null;
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
    return url.searchParams.get('v');
  } catch (_) { return null; }
}
function contentTypeFor(platform, url) {
  if (platform === 'x') return 'tweet';
  if (platform === 'instagram' && /\/reel\//.test(url)) return 'reel';
  return PLATFORM_CFG[platform]?.ct || 'article';
}

async function storeImage(base, apiKey, topicId, remoteUrl) {
  if (!remoteUrl) return null;
  try {
    const resp = await fetch(remoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0 RobotHubBot' } });
    if (!resp.ok) return remoteUrl;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return remoteUrl;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return remoteUrl;
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
    const key = `${topicId}/${fnv1a(remoteUrl)}.${ext}`;
    const form = new FormData();
    form.append('file', new Blob([buf], { type: ct }), key.split('/').pop());
    const up = await fetch(`${base}/api/storage/buckets/media/objects/${key}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (!up.ok) return remoteUrl;
    return `${base}/api/storage/buckets/media/objects/${key}`;
  } catch (_) {
    return remoteUrl;
  }
}

async function gatherPlatform(ctx, topic, platform) {
  const { base, apiKey, mcpUrl, mcpToken, sid, embedModel } = ctx;
  const cfg = PLATFORM_CFG[platform];
  if (!cfg) return [];
  const topN = Math.min(topic.top_n || 10, MAX_PER_PLATFORM);
  const serp = await mcpTool(mcpUrl, mcpToken, sid, 'search_engine', { query: cfg.q(topic.query), engine: 'google' });
  const candidates = extractUrls(serp, topN, keeperFor(platform));

  const out = [];
  for (const cand of candidates) {
    let md = '';
    try { md = await mcpTool(mcpUrl, mcpToken, sid, 'scrape_as_markdown', { url: cand.url }); } catch (_) {}
    const thin = !md || md.length < 200;
    if (thin && platform === 'news') continue;

    const title = cand.title || deriveTitle(md, cand.source);
    const cleanText = (md || '').replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
    const summary = (cleanText || title).slice(0, 320);
    const content = (md && md.length > 40 ? md : title).slice(0, 20000);

    let thumbRemote = null;
    if (platform === 'youtube') {
      const vid = youtubeId(cand.url);
      thumbRemote = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : firstImage(md);
    } else {
      thumbRemote = firstImage(md);
    }
    const stored = await storeImage(base, apiKey, topic.id, thumbRemote);

    const chunks = [];
    if (content && content.length > 40) {
      const pieces = chunkText(content);
      for (let i = 0; i < pieces.length; i++) {
        let e = null;
        try { e = await embed(base, apiKey, embedModel, pieces[i]); } catch (_) {}
        chunks.push({ chunk_index: i, content: pieces[i], embedding: e });
      }
    }

    out.push({
      title, url: cand.url, source: cand.source, summary, content,
      image_url: stored, thumbnail_url: stored, media_url: cand.url,
      platform, content_type: contentTypeFor(platform, cand.url), stats: null,
      raw: { query: cfg.q(topic.query), platform }, chunks,
    });
  }
  return out;
}

async function fetchTopic(svc, base, apiKey, secret, topic, cfg) {
  const { data: logId } = await svc.database.rpc('log_start', { p_secret: secret, p_topic_id: topic.id, p_trigger: 'schedule' });
  const finish = (status, found, inserted, error, details) =>
    svc.database.rpc('log_finish', { p_secret: secret, p_log_id: logId, p_status: status, p_found: found, p_inserted: inserted, p_error: error || null, p_details: details || null });
  try {
    const init = await mcpSend(cfg.brightdata_mcp_url, cfg.brightdata_token, null, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'robothub-dispatch', version: '2.0.0' } },
    });
    const sid = init.sessionId;
    try { await mcpSend(cfg.brightdata_mcp_url, cfg.brightdata_token, sid, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }); } catch (_) {}

    const ctx = {
      base, apiKey, mcpUrl: cfg.brightdata_mcp_url, mcpToken: cfg.brightdata_token, sid,
      embedModel: cfg.embed_model || 'openai/text-embedding-3-small',
    };
    const platforms = (Array.isArray(topic.platforms) && topic.platforms.length ? topic.platforms : ['news']).filter((p) => PLATFORM_CFG[p]);
    let articles = [];
    const perPlatform = {};
    for (const p of platforms) {
      try {
        const items = await gatherPlatform(ctx, topic, p);
        perPlatform[p] = items.length;
        articles = articles.concat(items);
      } catch (e) {
        perPlatform[p] = `error: ${String(e?.message || e).slice(0, 120)}`;
      }
    }

    const { data: inserted } = await svc.database.rpc('ingest_articles', { p_secret: secret, p_topic_id: topic.id, p_articles: articles });
    await finish('success', articles.length, inserted || 0, null, { platforms: perPlatform, scraped: articles.length });
    await svc.database.rpc('mark_topic_run', { p_secret: secret, p_topic_id: topic.id, p_status: 'success', p_error: null });
    return { id: topic.id, found: articles.length, inserted: inserted || 0, platforms: perPlatform };
  } catch (e) {
    const msg = String(e?.message || e);
    await finish('error', 0, 0, msg, null);
    await svc.database.rpc('mark_topic_run', { p_secret: secret, p_topic_id: topic.id, p_status: 'error', p_error: msg });
    return { id: topic.id, error: msg };
  }
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const base = Deno.env.get('INSFORGE_BASE_URL');
  const anonKey = Deno.env.get('ANON_KEY');
  const apiKey = Deno.env.get('API_KEY');
  const secret = Deno.env.get('SERVICE_SECRET');
  if (req.headers.get('x-service-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const svc = createClient({ baseUrl: base, anonKey });
  const { data: due, error } = await svc.database.rpc('claim_due_topics', { p_secret: secret });
  if (error) return json({ error: error.message }, 500);
  const ids = (due || []).map((r) => r.id);
  if (ids.length === 0) return json({ ok: true, dispatched: 0 });

  const { data: cfgRow } = await svc.database.rpc('app_get_integration', { p_secret: secret });
  const cfg = Array.isArray(cfgRow) ? cfgRow[0] : cfgRow;

  const results = [];
  for (const id of ids) {
    const { data: trows } = await svc.database.from('topics').select('*').eq('id', id);
    const topic = Array.isArray(trows) ? trows[0] : trows;
    if (!topic) continue;
    if (!cfg?.brightdata_mcp_url || !cfg?.brightdata_token) {
      const { data: logId } = await svc.database.rpc('log_start', { p_secret: secret, p_topic_id: id, p_trigger: 'schedule' });
      await svc.database.rpc('log_finish', { p_secret: secret, p_log_id: logId, p_status: 'error', p_found: 0, p_inserted: 0, p_error: 'Bright Data MCP URL/token not configured in Settings', p_details: null });
      await svc.database.rpc('mark_topic_run', { p_secret: secret, p_topic_id: id, p_status: 'error', p_error: 'Bright Data not configured' });
      results.push({ id, error: 'not configured' });
      continue;
    }
    results.push(await fetchTopic(svc, base, apiKey, secret, topic, cfg));
  }
  return json({ ok: true, dispatched: ids.length, results });
}
