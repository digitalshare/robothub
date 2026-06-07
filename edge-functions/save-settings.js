// save-settings: admin-only. Stores Bright Data MCP URL + token (encrypted) and model config.
// Token is never returned. Caller must be an authenticated admin user.
import { createClient } from 'npm:@insforge/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const anonKey = Deno.env.get('ANON_KEY');
  const serviceSecret = Deno.env.get('SERVICE_SECRET');

  const authHeader = req.headers.get('Authorization') || '';
  const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json({ error: 'Unauthorized' }, 401);

  // Verify the caller is an admin (is_admin() uses auth.uid()).
  const userClient = createClient({ baseUrl, edgeFunctionToken: userToken });
  const { data: admin, error: adminErr } = await userClient.database.rpc('is_admin');
  if (adminErr) return json({ error: 'Auth check failed', detail: adminErr.message }, 401);
  if (admin !== true) return json({ error: 'Forbidden: admin only' }, 403);

  let body = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const mcpUrl = typeof body.mcpUrl === 'string' ? body.mcpUrl.trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const chatModel = typeof body.chatModel === 'string' ? body.chatModel.trim() : '';
  const embedModel = typeof body.embedModel === 'string' ? body.embedModel.trim() : '';

  // Write via the secret-gated SECURITY DEFINER RPC (anon client + service secret).
  const svc = createClient({ baseUrl, anonKey });
  const { error: saveErr } = await svc.database.rpc('app_save_settings', {
    p_secret: serviceSecret,
    p_mcp_url: mcpUrl,
    p_token: token,
    p_chat_model: chatModel,
    p_embed_model: embedModel,
  });
  if (saveErr) return json({ error: 'Save failed', detail: saveErr.message }, 500);

  // Return masked view.
  const { data: masked, error: getErr } = await userClient.database.rpc('app_get_settings_masked');
  if (getErr) return json({ ok: true });
  return json({ ok: true, settings: Array.isArray(masked) ? masked[0] : masked });
}
