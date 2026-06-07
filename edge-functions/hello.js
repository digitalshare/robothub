// Probe function: discover runtime export style, env vars, and invocation URL.
export default async function (req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-secret',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let env = {};
  try {
    env = {
      hasOpenRouter: !!Deno.env.get('OPENROUTER_API_KEY'),
      baseUrl: Deno.env.get('INSFORGE_BASE_URL') || null,
      hasAnon: !!Deno.env.get('ANON_KEY'),
    };
  } catch (_) {
    env = { note: 'Deno.env unavailable' };
  }

  return new Response(
    JSON.stringify({ ok: true, method: req.method, url: req.url, env }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
}
