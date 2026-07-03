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
  SUPABASE_URL: '',            // ← paste your Project URL
  SUPABASE_ANON_KEY: '',       // ← paste your anon (publishable) key
  REDIRECT_AFTER_LOGIN: '/four'
};
