# Robotic Data Platform — Implementation Plan (Milestone 1)

## ✅ Status: Milestone 1 shipped & deployed

**Live app:** https://89zya6ii.insforge.site
**Admin login:** `admin@robothub.dev` / `robohub123`

### How to run locally
```bash
npm install
npm run dev               # http://localhost:5173 (env in .env)
python3 scripts/seed.py   # (re)seed sample robotics news + embeddings
```

### To enable scheduled live fetching
1. Sign in as admin → **Settings** → enter the Bright Data **MCP URL**
   (`https://mcp.brightdata.com/mcp`) + **BRIGHTDATA_API_TOKEN**, save.
2. **Topics** → toggle a topic's schedule ON (or click **Fetch now**).
   The InsForge scheduler runs the `dispatch` function every minute; it claims due
   topics, searches+scrapes via Bright Data MCP, embeds, stores, and logs each run
   (visible under **Logs**). Until a token is saved, runs log "not configured".

### As-built notes (differed from original design)
- **AI via InsForge AI proxy**, not a raw OpenRouter key. Edge functions auto-receive
  an admin `API_KEY` env var and call `POST /api/ai/chat/completion` and
  `POST /api/ai/embeddings`. Default chat model `openai/gpt-4o-mini`; embeddings
  `openai/text-embedding-3-small` (1536-d).
- **Scheduling via InsForge managed scheduler** (`POST /api/schedules`, cronJobId 4),
  not direct pg_cron (`project_admin` lacks `cron`/`pg_net`/`schedules.jobs` access).
- **`dispatch` edge function does the fetch work inline** — the platform returns
  HTTP 508 on edge→edge calls, so dispatch cannot call `fetch-topic` over HTTP. The
  per-topic `fetch-topic` function remains for the admin "Fetch now" (browser→edge).
- **Privileged DB writes** go through secret-gated `SECURITY DEFINER` RPCs
  (`ingest_articles`, `log_start/finish`, `claim_due_topics`, `app_*`); `SERVICE_SECRET`
  is an edge-function secret. Bright Data token stored encrypted via `pgcrypto`.
- Email verification disabled (`PUT /api/auth/config`) since SMTP is unconfigured.
- Edge fns: `fetch-topic`, `chat-rag`, `save-settings`, `dispatch` (source in
  `edge-functions/`). SQL applied via MCP `run-raw-sql`.

---

## Context

We are building a **Robotic Data Platform**: a full-stack web app that automatically
gathers the latest news on Robotics / Physical AI, stores it in a vector database, and
lets users explore it and chat with a RAG-grounded LLM assistant.

**Milestone 1** scope (this plan): news fetch → store → semantic search → RAG chat.

- Admins define **topics** (search query + fetch interval + "top N" article count) in a
  backend management UI, and can toggle a per-topic scheduled fetch on/off.
- A **scheduled job** uses **Bright Data** to search + scrape the freshest articles per
  topic, stores them, embeds them, and saves vectors for RAG retrieval.
- Every scheduled run is **logged** so admins can review fetch history.
- Admins enter the **Bright Data MCP URL + `BRIGHTDATA_API_TOKEN`** in the UI.
- A site-wide **AI Chat** panel (RAG over the knowledge base) docks on the right and
  collapses to a floating icon at bottom-right.
- On the **article detail page**, selecting text shows an **"Ask AI"** popup that opens
  the chat with the selection + article attached, so the LLM answers grounded on that
  article (plus the rest of the knowledge base).

**Backend:** InsForge (Postgres + PostgREST, Auth, Edge Functions, pgvector, pg_cron).
**Models via OpenRouter** (InsForge-provisioned `OPENROUTER_API_KEY`, server-side only).
**Web data via Bright Data** — Bright Data MCP tools during development; hosted Bright
Data MCP over SSE from the edge function in production.

### Confirmed decisions
- Frontend: **React + Vite + Tailwind CSS 3.4** (SPA) + InsForge **Edge Functions** for
  all server-side logic (keeps OpenRouter + Bright Data secrets off the client).
- Production scheduled fetch: edge function speaks **Bright Data MCP over SSE** to the
  admin-entered MCP URL + token. (REST `/request` API documented as fallback if SSE
  proves flaky from Deno.)
- Admin model: InsForge email/password auth + **`is_admin` flag** on a `profiles` table;
  admin routes/edge logic gated on it. First admin seeded manually.

### Verified infrastructure (on backend `https://89zya6ii.us-west.insforge.app`)
- `vector` 0.7.4 available (install needed) → embeddings + semantic search.
- `pg_cron` 1.6 already installed → scheduling.
- `pg_net` 0.14 available + `http` 1.7 installed → cron → edge-function invocation.
- `pgcrypto` installed → encrypt the stored Bright Data token at rest.
- DB/functions/buckets currently empty — greenfield.

---

## 0. First execution step
Copy this plan to `PLAN.md` at the repo root (`/Users/cw/work/projects/robothub/PLAN.md`)
so it lives with the project, then proceed.

---

## 1. Database schema (via `run-raw-sql`)

Extensions: `CREATE EXTENSION IF NOT EXISTS vector;` and `pg_net;` (pgcrypto/pg_cron/http already present).

Tables (`public` schema):

| Table | Key columns | Purpose |
|-------|-------------|---------|
| `profiles` | `user_id` PK (FK auth user), `is_admin bool default false`, `display_name`, `created_at` | Role gating |
| `app_settings` | `id` (singleton, check id=1), `brightdata_mcp_url`, `brightdata_token_enc bytea` (pgcrypto), `chat_model text`, `embed_model text`, `updated_at` | Integration config |
| `topics` | `id uuid`, `name`, `query text`, `schedule_enabled bool`, `interval_minutes int`, `top_n int default 10`, `last_run_at timestamptz`, `created_at`, `updated_at` | Topic definitions + schedule |
| `articles` | `id uuid`, `topic_id FK`, `title`, `url text unique`, `source`, `author`, `published_at`, `summary`, `content text`, `image_url`, `raw jsonb`, `created_at` | Stored news |
| `article_chunks` | `id uuid`, `article_id FK`, `chunk_index int`, `content text`, `embedding vector(1536)` | RAG chunks |
| `fetch_logs` | `id uuid`, `topic_id FK`, `status text` (running/success/error), `started_at`, `finished_at`, `articles_found int`, `articles_inserted int`, `error_message`, `details jsonb` | Schedule run history |
| `chat_messages` | `id uuid`, `user_id`, `session_id uuid`, `role`, `content text`, `sources jsonb`, `created_at` | Chat history |

Indexes: HNSW (cosine) on `article_chunks.embedding`; btree on `articles.url`,
`articles.topic_id`, `fetch_logs.topic_id`, `chat_messages.session_id`.

Embedding model `openai/text-embedding-3-small` → **1536 dims**.

### RAG retrieval RPC
`match_article_chunks(query_embedding vector(1536), match_count int, p_article_id uuid default null)`
— returns top chunks by cosine similarity (`<=>`), joined to article title/url; when
`p_article_id` is provided, that article's chunks are always included/boosted (powers the
"Ask AI about this news" flow). Called from the `chat-rag` edge function via `rpc()`.

### Scheduling SQL (pg_cron dispatcher pattern)
- `dispatch_due_topics()` PL/pgSQL: select topics where `schedule_enabled` and
  (`last_run_at IS NULL` or `now() - last_run_at >= interval_minutes`), set `last_run_at`,
  and `net.http_post(<edge fn URL>/fetch-topic, body=jsonb{topic_id}, headers w/ CRON_SECRET)`.
- One pg_cron entry: `cron.schedule('dispatch-topics','* * * * *', $$ SELECT dispatch_due_topics() $$)`.
- Toggling a topic only flips `schedule_enabled` — no per-topic cron churn.

### RLS
- `articles`, `article_chunks`, `topics`: public/anon **read** (public news site); writes
  admin/service only.
- `app_settings`, `fetch_logs`: admin-only read/write.
- `profiles`: user reads own row; admin reads all.
- `chat_messages`: owner-only.

---

## 2. Edge Functions (`create-function`)

Each: CORS + `OPTIONS`, returns `{data,error}`, secrets from `Deno.env`.

1. **`fetch-topic`** (POST `{topic_id}`; protected by `CRON_SECRET` header or admin token)
   - Load topic + `app_settings` (decrypt Bright Data token via pgcrypto RPC).
   - Open `fetch_logs` row (`status=running`).
   - **MCP-over-SSE client** → connect to `brightdata_mcp_url` w/ token, `initialize`, then:
     `search_engine` for `topic.query` (latest news) → take top `top_n` → `scrape_as_markdown`
     each result URL.
   - Parse title/source/author/published/content/image; **dedupe by `url`**; insert `articles`.
   - Chunk content (~800–1000 tokens, overlap) → OpenRouter `embeddings.create`
     (`text-embedding-3-small`) → insert `article_chunks`.
   - Close log (`success`/`error`, counts, error_message).
   - *Risk note:* MCP/SSE from Deno is the trickiest piece; fallback = Bright Data REST
     `POST api.brightdata.com/request` (SERP + unlocker) with the same token.

2. **`chat-rag`** (POST `{message, attached_text?, article_id?, session_id?}`; user token)
   - Embed `message` (+ `attached_text`) → `match_article_chunks(embedding, k, article_id)`.
   - Build grounded prompt (system + retrieved context w/ citations) → OpenRouter chat
     completion (`app_settings.chat_model`, default `anthropic/claude-3.5-sonnet`).
   - Persist user+assistant `chat_messages`; return `{answer, sources:[{title,url}]}`.
   - Start non-streaming; SSE streaming is a later enhancement.

3. **`save-settings`** (POST, admin token) — encrypt token w/ pgcrypto, upsert `app_settings`;
   never return the raw token (return a masked indicator).

Function env vars: `OPENROUTER_API_KEY`, `INSFORGE_BASE_URL`, `ANON_KEY`, service key,
`CRON_SECRET`, `SETTINGS_ENC_KEY`.

---

## 3. Frontend (React + Vite + Tailwind 3.4)

Scaffold via `download-template` (Vite + InsForge wired). SDK client in
`src/lib/insforge.ts` (`VITE_INSFORGE_BASE_URL` + `VITE_INSFORGE_ANON_KEY`). `react-router`.
Add `vercel.json` SPA rewrite for deployment.

**Auth:** InsForge React auth components (login/register); on login ensure a `profiles` row.

**Public pages**
- `News list` (`/`): topic filter chips, article cards (image/title/source/date/summary),
  pagination via `.range()`.
- `Article detail` (`/article/:id`): full content + metadata. **Text-selection handler** →
  floating "Ask AI" menu → opens chat panel prefilled with selection + `article_id`.

**Admin pages** (guarded by `is_admin`, redirect otherwise)
- `Topics` (`/admin/topics`): CRUD; per-row fields query / interval_minutes / top_n;
  **schedule toggle** (flips `schedule_enabled`); "Fetch now" → invoke `fetch-topic`.
- `Integration settings` (`/admin/settings`): Bright Data MCP URL + token (write-only,
  masked) via `save-settings`; chat/embed model selectors.
- `Fetch logs` (`/admin/logs`): table of `fetch_logs` (status/time/counts/errors), filter by topic.

**Global AI Chat widget** (mounted app-wide)
- Right-side dockable panel; collapses to a floating bubble icon at **bottom-right**.
- Calls `chat-rag`; renders answer + clickable source links; keeps session history.
- Accepts an attached snippet/article context (from the "Ask AI" flow) shown as a chip.

---

## 4. Dev-time data seeding (Claude uses Bright Data MCP directly)
During build/test, I'll create 2–3 sample topics (e.g. "humanoid robots", "physical AI",
"robotics funding") and run the Bright Data MCP tools (`search_engine` + `scrape_as_markdown`)
to populate `articles`/`article_chunks` so chat + search are testable before the production
SSE path is fully validated.

---

## 5. Build order (tasks)
1. Copy plan → `PLAN.md`.
2. Scaffold frontend (`download-template`); pin Tailwind 3.4; add SDK client + router.
3. DB: extensions, tables, indexes, `match_article_chunks`, RLS, dispatcher fn + cron.
4. Edge fns: `save-settings`, `fetch-topic`, `chat-rag` (deploy via `create-function`).
5. Seed sample data via Bright Data MCP; verify retrieval RPC.
6. Frontend: auth + profiles; admin Topics/Settings/Logs; public News list + Article detail.
7. Frontend: global Chat widget + "Ask AI" text-selection flow.
8. Wire cron secret; enable dispatcher; verify a scheduled run end-to-end.
9. Deploy via `create-deployment`; smoke-test live URL.

---

## 6. Verification (end-to-end)
- **DB:** re-query `pg_available_extensions`/`information_schema` to confirm `vector`
  installed and all tables/indexes exist.
- **Fetch:** invoke `fetch-topic` for a test topic → confirm rows in `articles`,
  `article_chunks` (non-null embeddings), and a `success` `fetch_logs` row with counts.
- **Semantic search:** call `match_article_chunks` with a sample embedding → relevant chunks.
- **RAG chat:** invoke `chat-rag` → grounded answer + correct `sources`; repeat with
  `article_id` set → answer reflects that article.
- **Schedule:** enable a topic toggle, wait for the minute dispatcher → new `fetch_logs`
  rows appear; disable → runs stop.
- **Frontend (`npm run dev`):** login → admin manage topics/settings/logs; browse news;
  open article, select text → "Ask AI" opens chat with context; chat answers with sources;
  widget collapses to bottom-right bubble and reopens.
- **Deploy:** `create-deployment` → poll `deployments.runs` to `READY` → smoke-test live URL.

---

## Open risks / notes
- **Bright Data MCP-over-SSE in Deno** is the highest-risk component; REST `/request`
  fallback is the contingency (same token, no client changes elsewhere).
- OpenRouter must support `text-embedding-3-small` embeddings on the provisioned key;
  verify early (step 5). If unavailable, switch embed model + adjust `vector(N)` dim.
- Token stored encrypted (`pgcrypto`); raw value never returned to the client.

---
---

# Robotic Data Platform — Implementation Plan (Milestone 2)

## ✅ Status: Milestone 2 shipped & deployed (2026-06-07)
Live: https://89zya6ii.insforge.site — DB migrated, `media` bucket created, `fetch-topic`
+ `dispatch` redeployed, frontend deployed (READY). Data layer verified directly
(`mark_topic_run` advances `last_run_at` only on success; `ingest_articles` stores
`platform`/`content_type`/`thumbnail_url`/`stats`). End-to-end *live* multi-platform fetch
still requires the admin to save a Bright Data MCP token in Settings (pending).

## Goals (this milestone)

Two user-requested capabilities on top of the shipped Milestone 1 pipeline:

1. **Accurate "Last run" timestamp.** After a fetch job *finishes and succeeds*, update
   the topic's `last_run_at`. Today it is stamped at *claim* time (and never for manual
   "Fetch now"), so the column lies about when fresh data actually landed.
2. **Multi-platform topics (beyond news).** Let a topic choose *which platforms* to fetch:
   **News, YouTube, TikTok, Instagram, X (twitter)**. For each item, show the **link** plus
   **short info + a thumbnail**. When fetched data includes **images, download and store
   them** in our own storage (not just hotlink the origin).

Everything stays on the existing stack (InsForge edge fns + Bright Data MCP + pgvector).
No new external services.

---

## 1. The `last_run_at` fix (Requirement 1)

### Problem (as-built)
- `claim_due_topics(p_secret)` does `UPDATE topics SET last_run_at = now()` at the moment a
  topic is *claimed* for dispatch — before any scraping happens. The same column doubles as
  the scheduler's "is it due?" cursor (`now() - last_run_at >= interval`).
- `fetch-topic` (manual "Fetch now", browser→edge) **never** updates `last_run_at`.
- Net: "Last run" reflects claim time on scheduled runs and is stale forever for manual runs.

### Fix — split the scheduling cursor from the user-facing timestamp
Add a dedicated cursor column so the due-check no longer rides on `last_run_at`:

```sql
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS last_claimed_at timestamptz,   -- scheduler cursor (claim time)
  ADD COLUMN IF NOT EXISTS last_status     text,          -- 'success' | 'error' (last run)
  ADD COLUMN IF NOT EXISTS last_error      text;          -- last error message, for the UI

-- migrate existing values so the first post-deploy schedule tick doesn't double-fire
UPDATE public.topics SET last_claimed_at = last_run_at WHERE last_claimed_at IS NULL;
```

Rewrite `claim_due_topics` to claim on `last_claimed_at` and stop touching `last_run_at`:

```sql
CREATE OR REPLACE FUNCTION public.claim_due_topics(p_secret text)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.verify_secret(p_secret) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  UPDATE public.topics t SET last_claimed_at = now()
  WHERE t.schedule_enabled = true
    AND (t.last_claimed_at IS NULL
         OR now() - t.last_claimed_at >= make_interval(mins => t.interval_minutes))
  RETURNING t.id;
END; $$;
```

Add an RPC the edge fns call **only after a successful fetch**:

```sql
CREATE OR REPLACE FUNCTION public.mark_topic_run(
  p_secret text, p_topic_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.verify_secret(p_secret) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.topics
     SET last_status = p_status,
         last_error  = p_error,
         last_run_at = CASE WHEN p_status = 'success' THEN now() ELSE last_run_at END,
         updated_at  = now()
   WHERE id = p_topic_id;
END; $$;
```

> Design choice: `last_run_at` advances **only on success** (matches the literal request —
> "after the fetch job finished and succeed"). `last_status`/`last_error` always update so
> the admin can see a failed attempt without the "Last run" time lying about freshness. If
> we instead want "last attempt" semantics, drop the `CASE` — noted as a 1-line toggle.

### Wire-up
- **`dispatch.js`** — in `fetchTopic(...)`, after `finish('success', …)` call
  `mark_topic_run(secret, topic.id, 'success')`; in the `catch` call
  `mark_topic_run(secret, topic.id, 'error', err)`. (The claim already advanced
  `last_claimed_at`, so a failure still waits a full interval before retry — acceptable;
  alternatively reset `last_claimed_at = NULL` on error to retry next tick — noted.)
- **`fetch-topic.js`** — same two calls around its existing `finish(...)`. This is what makes
  manual "Fetch now" finally stamp `last_run_at`.

### Frontend
- `Topic` type: add `last_claimed_at`, `last_status`, `last_error`.
- `AdminTopics.tsx` "Last run" cell: keep the timestamp; append a small status pill
  (green `success` / red `error` with `last_error` tooltip). No layout change otherwise.

---

## 2. Multi-platform topics (Requirement 2)

### 2.1 Data model
A topic gains a set of platforms to fetch; articles gain a platform + content type +
structured media metadata.

```sql
-- topics: which platforms this topic pulls from (default keeps Milestone-1 behavior)
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT ARRAY['news'];
  -- allowed members: 'news','youtube','tiktok','instagram','x'

-- articles: classify + carry platform-specific short info
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS platform     text NOT NULL DEFAULT 'news',
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'article', -- article|video|post|reel|tweet
  ADD COLUMN IF NOT EXISTS thumbnail_url text,   -- stored (bucket) thumbnail; image_url = stored hero/media image
  ADD COLUMN IF NOT EXISTS media_url    text,    -- canonical watch/post link (often == url)
  ADD COLUMN IF NOT EXISTS stats        jsonb;   -- {views,likes,comments,duration,channel,handle,posted_at}

CREATE INDEX IF NOT EXISTS idx_articles_platform ON public.articles(platform);
```

`ingest_articles` is extended to also write `platform, content_type, thumbnail_url,
media_url, stats` from each article object (all optional, defaulting to news/article so the
existing seed + news path keep working unchanged).

### 2.2 Storage for images (Requirement: "store them")
- Create one **public** bucket `media` (`create-bucket`, public read). Images are non-secret.
- New secret-gated RPC is *not* needed for storage; edge fns already hold `API_KEY` (admin)
  and can upload via the storage REST API.
- **Edge helper `storeImage(remoteUrl) -> publicUrl | null`** (added to both fetch fns):
  1. `fetch(remoteUrl)` the image bytes (best-effort; many CDNs allow hotlink GET).
     If blocked, fall back to Bright Data `scrape_as_markdown`/HTML to resolve a usable
     image URL, else return `null`.
  2. Guard: content-type must be `image/*`, size cap (~5 MB), derive extension.
  3. Upload to `media/<topic_id>/<sha1(url)>.<ext>` via storage API; on 409 (exists) reuse.
  4. Return the bucket's public URL. Store that in `articles.image_url` / `thumbnail_url`.
- Idempotency: key by content hash so re-fetches don't duplicate objects.
- Failure is non-fatal: if storage fails we fall back to the remote thumbnail URL so cards
  still render (logged in `fetch_logs.details`).

### 2.3 Per-platform fetch strategy (shared pipeline)
The fetch pipeline (currently duplicated in `fetch-topic.js` and `dispatch.js`) becomes a
loop over `topic.platforms`. **Refactor the shared MCP + chunk + embed + store logic into
`edge-functions/_lib/pipeline.js`** (or copy-keep in sync — note the edge→edge 508 limit
means we can't centralize at runtime, only at source level) so both fns stay identical.

For each platform, discover item URLs then enrich. Baseline uses tools we already know work
(`search_engine`, `scrape_as_markdown`); richer structured tools are an enhancement with a
graceful fallback.

| Platform | Discover | Enrich → fields | content_type |
|----------|----------|-----------------|--------------|
| **news** | `search_engine` (existing) | `scrape_as_markdown` → title/summary/content; thumbnail from `og:image` | `article` |
| **youtube** | `search_engine` `query site:youtube.com` (or `… youtube`) → watch URLs | `web_data_youtube_videos` → {title, thumbnail, views, likes, channel, duration, description}; **fallback** scrape `og:image`/`og:title` | `video` |
| **tiktok** | `search_engine` `site:tiktok.com` → /video/ URLs | `web_data_tiktok_posts` → {desc, cover/thumbnail, plays, likes, author}; fallback scrape `og:image` | `video` |
| **instagram** | `search_engine` `site:instagram.com` → /p//reel/ URLs | `web_data_instagram_posts` / `web_data_instagram_reels` → {caption, display_url/thumbnail, likes, owner}; fallback `og:image` | `post`/`reel` |
| **x** | `search_engine` `site:x.com OR site:twitter.com` → /status/ URLs | `web_data_x_posts` → {text, photos[], views, likes, author}; fallback `og:image` | `tweet` |

Per-item assembly (all platforms):
- `title` = platform title/caption (truncated); `summary` = short info (caption / description
  / first sentence) capped ~320 chars; `content` = full text/transcript/caption for RAG.
- `thumbnail_url`/`image_url` ← `storeImage(<cover/og:image>)`.
- `stats` ← {views,likes,comments,duration,channel,handle,posted_at} when available.
- `media_url`/`url` ← canonical item link; **dedupe by `url`** (existing unique index).
- Chunk + embed `content` exactly as today (so all platforms are RAG-searchable in chat).

Discovery reuses `extractUrls` but with **per-platform host allow-listing** (the current
regex *blocks* youtube/tiktok/x/facebook — invert that per platform). `top_n` still caps
items per platform; total per run = `top_n × |platforms|`, so keep `MAX_ARTICLES` per
platform and add an overall run cap.

> Risk: the hosted Bright Data MCP may gate `web_data_*` dataset tools differently from
> `search_engine`/`scrape_as_markdown`. The fallback (`scrape_as_markdown` + `og:` meta
> parse) yields link + thumbnail + short info for *every* platform without those tools, so
> the feature degrades gracefully. Probe tool availability once via `tools/list` after
> `initialize` and cache which enrichers are present.

### 2.4 Admin UI (`AdminTopics.tsx`)
- Add-topic form + per-row edit: a **platform multi-select** (checkbox group:
  News / YouTube / TikTok / Instagram / X). Default News. Persist to `topics.platforms`.
- `createTopic`/`updateTopic` in `src/lib/api.ts` accept `platforms: string[]`.
- Show platform chips per topic row.

### 2.5 Public UI
- **`NewsList.tsx` cards**: render `thumbnail_url`/`image_url` (16:9, lazy) when present;
  a **platform badge + icon** (▶ YouTube, TikTok, Instagram, 𝕏, 📰 News); short stats line
  (e.g. "1.2M views · 3:41" for video, "12k likes" for posts). Keep the existing text-only
  layout as fallback when no image.
- **Optional**: extend the topic filter row with platform filter chips (`?platform=youtube`)
  — small `listArticles` change to filter on `platform`.
- **`ArticleDetail.tsx`**: show the hero image, a prominent "Open on <platform>" link to
  `media_url`, the stats, and (for YouTube) an embedded `<iframe>` player when the id parses;
  others link out with thumbnail. RAG "Ask AI" text-selection flow is unchanged.
- `Article` type: add `platform`, `content_type`, `thumbnail_url`, `media_url`, `stats`.

---

## 3. Build order
1. **DB migration** (`run-raw-sql`): topics columns (`last_claimed_at,last_status,last_error,
   platforms`), articles columns (`platform,content_type,thumbnail_url,media_url,stats`),
   index, data backfill. Rewrite `claim_due_topics`; add `mark_topic_run`; extend
   `ingest_articles`.
2. **Storage**: `create-bucket media` (public). 
3. **Edge fns**: extract shared `pipeline.js`; add `storeImage`; per-platform discover/enrich
   loop; call `mark_topic_run` on success/error. Redeploy `fetch-topic` + `dispatch`
   (`update-function`).
4. **Frontend types + api**: `Topic`/`Article` fields; `platforms` in create/update;
   `listArticles` platform filter.
5. **Admin UI**: platform multi-select + status pill on Last run.
6. **Public UI**: thumbnails, platform badges, stats, detail-page media embed/link.
7. **Deploy** (`create-deployment`); smoke-test.

---

## 4. Verification (end-to-end)
- **Req 1:** Click "Fetch now" on a topic → on success, `topics.last_run_at` advances to the
  completion time (query the row); on a forced failure (bad token) `last_run_at` is unchanged
  but `last_status='error'` + `last_error` populate. Enable a schedule → after a dispatch tick,
  `last_claimed_at` moves every interval while `last_run_at` only moves on successful runs.
  Confirm the due-check still fires correctly (no double-dispatch, no permanent skip).
- **Req 2 — fetch:** create a topic with `platforms = {news,youtube,tiktok,instagram,x}`,
  Fetch now → `articles` rows appear with correct `platform`/`content_type`, non-null
  `thumbnail_url` pointing at the **`media` bucket** (verify the object exists + loads), `stats`
  populated where available, and chunks/embeddings present (chat can cite them).
- **Storage:** confirm uploaded objects under `media/<topic>/…`, public URL returns the image,
  re-fetch does not duplicate objects (hash key).
- **UI:** News list shows thumbnails + platform badges + short info; clicking opens detail with
  working "Open on <platform>" link (YouTube embed plays); admin topic row shows platform chips
  + Last-run status pill.
- **Regression:** a news-only topic and `scripts/seed.py` still work unchanged (defaults).

---

## 5. Open risks / notes
- **`web_data_*` availability over hosted MCP** — primary risk; mitigated by the universal
  `scrape_as_markdown` + `og:` fallback (link + thumbnail + short info for every platform).
- **Image hotlink/anti-bot** — some CDNs block direct GET; fall back to remote URL and log;
  optionally route the image fetch through Bright Data.
- **Run cost/time** — N platforms × top_n scrapes per run; cap per-platform items and total,
  and consider lowering default `top_n` when multiple platforms are enabled.
- **Edge source duplication** — `dispatch` can't call `fetch-topic` (508), so the shared
  pipeline lives as copied source; keep the two files in sync (single `_lib` source, deployed
  into both).
- **Platform ToS / personal data** — store public post metadata + thumbnails only; no auth-gated
  or private content.
