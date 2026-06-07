import { insforge } from './insforge';
import type { Article, FetchLog, SettingsMasked, Source, Topic } from './types';

// ---------------- Public reads ----------------

export async function listTopics(): Promise<Topic[]> {
  const { data, error } = await insforge.database
    .from('topics')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as Topic[];
}

export async function listArticles(opts: { topicId?: string; platform?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 12;
  const page = opts.page ?? 0;
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let q = insforge.database
    .from('articles')
    .select(
      'id,topic_id,title,url,source,author,published_at,summary,image_url,platform,content_type,thumbnail_url,media_url,stats,created_at',
      { count: 'exact' },
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to);
  if (opts.topicId) q = q.eq('topic_id', opts.topicId);
  if (opts.platform) q = q.eq('platform', opts.platform);
  const { data, error, count } = await q;
  if (error) throw error;
  return { articles: (data || []) as Article[], total: count ?? 0 };
}

export async function getArticle(id: string): Promise<Article | null> {
  const { data, error } = await insforge.database.from('articles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Article) ?? null;
}

// ---------------- Chat (RAG) ----------------

export interface ChatResponse {
  answer: string;
  sources: Source[];
  session_id: string;
  model?: string;
}

export async function chat(params: {
  message: string;
  attached_text?: string;
  article_id?: string | null;
  session_id?: string | null;
  history?: { role: string; content: string }[];
}): Promise<ChatResponse> {
  const { data, error } = await insforge.functions.invoke('chat-rag', { body: params });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { detail?: string }).detail || (data as { error: string }).error);
  return data as ChatResponse;
}

// ---------------- Admin ----------------

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await insforge.database.rpc('is_admin');
  if (error) return false;
  return data === true;
}

export async function createTopic(t: Partial<Topic>) {
  const { data, error } = await insforge.database
    .from('topics')
    .insert([
      {
        name: t.name,
        query: t.query,
        interval_minutes: t.interval_minutes ?? 60,
        top_n: t.top_n ?? 10,
        platforms: t.platforms && t.platforms.length ? t.platforms : ['news'],
      },
    ])
    .select();
  if (error) throw error;
  return data;
}

export async function updateTopic(id: string, patch: Partial<Topic>) {
  const { data, error } = await insforge.database.from('topics').update(patch).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function deleteTopic(id: string) {
  const { error } = await insforge.database.from('topics').delete().eq('id', id);
  if (error) throw error;
}

export async function listLogs(topicId?: string): Promise<FetchLog[]> {
  let q = insforge.database.from('fetch_logs').select('*').order('started_at', { ascending: false }).limit(100);
  if (topicId) q = q.eq('topic_id', topicId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as FetchLog[];
}

export async function getSettingsMasked(): Promise<SettingsMasked | null> {
  const { data, error } = await insforge.database.rpc('app_get_settings_masked');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SettingsMasked) ?? null;
}

export async function saveSettings(body: {
  mcpUrl?: string;
  token?: string;
  chatModel?: string;
  embedModel?: string;
}) {
  const { data, error } = await insforge.functions.invoke('save-settings', { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { ok: boolean; settings?: SettingsMasked };
}

export async function fetchTopicNow(topicId: string) {
  const { data, error } = await insforge.functions.invoke('fetch-topic', {
    body: { topic_id: topicId, trigger: 'manual' },
  });
  if (error) throw error;
  return data as { ok?: boolean; error?: string; detail?: string; inserted?: number; found?: number };
}
