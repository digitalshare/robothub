import type { Platform } from './types';

export interface PlatformMeta {
  key: Platform;
  label: string;
  icon: string; // emoji/glyph badge
  badgeClass: string;
}

export const PLATFORMS: PlatformMeta[] = [
  { key: 'news', label: 'News', icon: '📰', badgeClass: 'bg-slate-100 text-slate-700' },
  { key: 'youtube', label: 'YouTube', icon: '▶', badgeClass: 'bg-red-100 text-red-700' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', badgeClass: 'bg-slate-900 text-white' },
  { key: 'instagram', label: 'Instagram', icon: '📸', badgeClass: 'bg-pink-100 text-pink-700' },
  { key: 'x', label: 'X', icon: '𝕏', badgeClass: 'bg-slate-100 text-slate-900' },
];

const BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p])) as Record<Platform, PlatformMeta>;

export function platformMeta(key: string | null | undefined): PlatformMeta {
  return BY_KEY[(key || 'news') as Platform] ?? BY_KEY.news;
}

export function formatCount(n?: number): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

// Short one-line stats string for cards/detail (e.g. "1.2M views · 3:41").
export function statsLine(stats: Record<string, unknown> | null): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  const views = formatCount(stats.views as number | undefined);
  const likes = formatCount(stats.likes as number | undefined);
  if (views) parts.push(`${views} views`);
  if (likes) parts.push(`${likes} likes`);
  if (typeof stats.duration === 'string') parts.push(stats.duration);
  if (typeof stats.channel === 'string') parts.push(stats.channel);
  else if (typeof stats.handle === 'string') parts.push(stats.handle);
  return parts.length ? parts.join(' · ') : null;
}
