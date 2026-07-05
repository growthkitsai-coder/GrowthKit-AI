/* ──────────────────────────────────────────────────────────────────────────
   GrowthKit AI — auth configuration.

   Paste your Supabase project values below to switch sign-in ON. Until both
   are filled, the login/signup pages render but show "sign-in isn't configured
   yet" and the forms are disabled (same pattern as the Advisor before its key).

   WHERE TO GET THESE:  supabase.com → your project → Project Settings → API
     • SUPABASE_URL       = "Project URL"        (e.g. https://abcdefgh.supabase.co)
     • SUPABASE_ANON_KEY  = "anon public" key    (a.k.a. the publishable key)

   ⚠ The anon key is DESIGNED to be public — it is safe to commit and serve to
   browsers (Row Level Security protects your data). It is NOT the same as the
   `service_role` key. NEVER put the service_role key here — it bypasses RLS.

   Full setup (enable Email + Google providers, redirect URLs): docs/auth.md
   ────────────────────────────────────────────────────────────────────────── */
window.GK_AUTH_CONFIG = {
  SUPABASE_URL: 'https://kytvdrzfygjfqmklxfyr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5dHZkcnpmeWdqZnFta2x4ZnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjc2NjMsImV4cCI6MjA5ODg0MzY2M30.yFkObAEd8oMhYHg2q0XSuTzMralAF6d5zTQP57pFrvg',
  REDIRECT_AFTER_LOGIN: '/four'
};
