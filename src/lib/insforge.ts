import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL as string;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

if (!baseUrl) {
  // Surface misconfiguration early during development.
  console.warn('VITE_INSFORGE_BASE_URL is not set');
}

export const insforge = createClient({ baseUrl, anonKey });
export const INSFORGE_BASE_URL = baseUrl;
