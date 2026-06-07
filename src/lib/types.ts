export type Platform = 'news' | 'youtube' | 'tiktok' | 'instagram' | 'x';

export interface Topic {
  id: string;
  name: string;
  query: string;
  schedule_enabled: boolean;
  interval_minutes: number;
  top_n: number;
  platforms: Platform[];
  last_run_at: string | null;
  last_claimed_at: string | null;
  last_status: 'success' | 'error' | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleStats {
  views?: number;
  likes?: number;
  comments?: number;
  duration?: string;
  channel?: string;
  handle?: string;
  posted_at?: string;
}

export interface Article {
  id: string;
  topic_id: string | null;
  title: string;
  url: string;
  source: string | null;
  author: string | null;
  published_at: string | null;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  platform: Platform;
  content_type: 'article' | 'video' | 'post' | 'reel' | 'tweet';
  thumbnail_url: string | null;
  media_url: string | null;
  stats: ArticleStats | null;
  created_at: string;
}

export interface FetchLog {
  id: string;
  topic_id: string | null;
  status: 'running' | 'success' | 'error';
  trigger: 'schedule' | 'manual';
  started_at: string;
  finished_at: string | null;
  articles_found: number;
  articles_inserted: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

export interface Source {
  title: string;
  url: string;
  source?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

export interface SettingsMasked {
  brightdata_mcp_url: string | null;
  token_set: boolean;
  chat_model: string;
  embed_model: string;
  updated_at: string;
}
