// Lead desk settings. Fill these in from Supabase → Project Settings → API Keys.
//
// The anon (publishable) key is public by design: Row Level Security in the database decides what
// it may do (supabase/migrations). Put the same URL and key at the top of the page-view beacon in
// assets/site.js, so visits to the public pages are recorded.

export const SUPABASE_URL = '';       // https://<project-ref>.supabase.co
export const SUPABASE_ANON_KEY = '';  // the publishable key (sb_publishable_…) or the legacy anon key

// The lock. Keep false until you've run supabase/migrations/later/0004_policies_locked.sql.
// With true, the dashboard asks for a sign-in link, sent only to OWNER_EMAIL.
export const REQUIRE_AUTH = false;
export const OWNER_EMAIL = '';
