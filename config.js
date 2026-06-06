/*
  config.js — reads environment variables and exports them.

  In development:  values come from your .env file (loaded by Live Server
                   or a dev server like Vite/Parcel).
  In production:   values are injected by your hosting platform
                   (Netlify, Vercel, etc.) at build/deploy time.

  HOW TO USE:
    import { SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY } from './config.js';

  NEVER hardcode secrets anywhere else in the codebase.
*/

// For plain HTML/JS projects without a bundler, we read from a global
// __ENV__ object that gets populated by env.js (generated at dev time).
// When using Vite/Parcel/Webpack, swap these for import.meta.env.VITE_*
// or process.env.* — see comments below each line.

const env = window.__ENV__ || {};

export const SUPABASE_URL      = env.SUPABASE_URL      || '';
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';
export const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || '';

// --- Vite alternative (uncomment if you migrate to Vite) ---
// export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
// export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// export const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

// Warn loudly in the console if any key is missing
if (!SUPABASE_URL)      console.error('[CareerLog] Missing SUPABASE_URL');
if (!SUPABASE_ANON_KEY) console.error('[CareerLog] Missing SUPABASE_ANON_KEY');
if (!ANTHROPIC_API_KEY) console.error('[CareerLog] Missing ANTHROPIC_API_KEY');
