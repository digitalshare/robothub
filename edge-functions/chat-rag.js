// chat-rag: RAG chat over the news knowledge base.
// Body: { message, attached_text?, article_id?, session_id?, history? }
// Anonymous users may chat; history is persisted only for authenticated users.
import { createClient } from 'npm:@insforge/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DEFAULT_CHAT = 'openai/gpt-4o-mini';
const DEFAULT_EMBED = 'openai/text-embedding-3-small';

async function embed(base, apiKey, model, text) {
  const r = await fetch(`${base}/api/ai/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding;
}

async function chat(base, apiKey, model, messages) {
  const r = await fetch(`${base}/api/ai/chat/completion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  if (!r.ok) throw new Error(`chat ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.text ?? j.choices?.[0]?.message?.content ?? '';
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const base = Deno.env.get('INSFORGE_BASE_URL');
  const anonKey = Deno.env.get('ANON_KEY');
  const apiKey = Deno.env.get('API_KEY'); // admin key -> AI proxy

  let body = {};
  try { body = await req.json(); } catch (_) {}
  const message = (body.message || '').toString().trim();
  const attached = (body.attached_text || '').toString().trim();
  const articleId = body.article_id || null;
  const sessionId = body.session_id || crypto.randomUUID();
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!message) return json({ error: 'message required' }, 400);

  const authHeader = req.headers.get('Authorization') || '';
  const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    // Resolve models (non-secret RPC, anon-callable).
    let chatModel = DEFAULT_CHAT, embedModel = DEFAULT_EMBED;
    const svc = createClient({ baseUrl: base, anonKey });
    const { data: models } = await svc.database.rpc('app_get_models');
    const m = Array.isArray(models) ? models[0] : models;
    if (m?.chat_model) chatModel = m.chat_model;
    if (m?.embed_model) embedModel = m.embed_model;

    // Embed the query (message + any attached selection).
    const queryText = attached ? `${message}\n\nSelected text: ${attached}` : message;
    const vector = await embed(base, apiKey, embedModel, queryText);
    const vecLiteral = `[${vector.join(',')}]`;

    // Retrieve relevant chunks (boosting the attached article when provided).
    const { data: matches, error: matchErr } = await svc.database.rpc('rag_search', {
      p_embedding: vecLiteral,
      p_match_count: 6,
      p_article_id: articleId,
    });
    if (matchErr) throw new Error(`rag_search: ${matchErr.message}`);

    const chunks = matches || [];
    const context = chunks
      .map((c, i) => `[${i + 1}] ${c.title} (${c.source || 'unknown'})\n${c.content}`)
      .join('\n\n---\n\n');

    // Dedupe sources by url.
    const seen = new Set();
    const sources = [];
    for (const c of chunks) {
      if (c.url && !seen.has(c.url)) { seen.add(c.url); sources.push({ title: c.title, url: c.url, source: c.source }); }
    }

    const system = `You are the assistant for a Robotics & Physical AI news platform.
Answer using ONLY the provided context articles when possible. Cite sources inline as [1], [2] matching the context items.
If the context does not contain the answer, say so briefly and answer from general knowledge, clearly noting it is not from the knowledge base.
Be concise and factual.`;

    const messages = [
      { role: 'system', content: system },
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '') })),
      { role: 'user', content: `Context:\n${context || '(no relevant articles found)'}\n\nQuestion: ${message}${attached ? `\n\n(User selected this text: "${attached}")` : ''}` },
    ];

    const answer = await chat(base, apiKey, chatModel, messages);

    // Persist history for authenticated users (best-effort).
    if (userToken) {
      try {
        const uc = createClient({ baseUrl: base, edgeFunctionToken: userToken });
        const { data: me } = await uc.auth.getCurrentUser();
        const uid = me?.user?.id;
        if (uid) {
          await uc.database.from('chat_messages').insert([
            { user_id: uid, session_id: sessionId, role: 'user', content: message },
            { user_id: uid, session_id: sessionId, role: 'assistant', content: answer, sources },
          ]);
        }
      } catch (_) { /* ignore history errors */ }
    }

    return json({ answer, sources, session_id: sessionId, model: chatModel });
  } catch (e) {
    return json({ error: 'chat failed', detail: String(e?.message || e) }, 500);
  }
}
