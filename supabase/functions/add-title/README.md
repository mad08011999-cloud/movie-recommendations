# add-title Edge Function
Lets signed-in users add a title. Resolves on IMDb, dedupes against `catalog.json` + `public.user_titles`, enriches
(Wikidata, Wikipedia, JustWatch, YouTube trailer, RT/IMDb), inserts into `public.user_titles` (service role).
Uses only built-in env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). No extra secrets.

Deploy: `supabase functions deploy add-title --project-ref mazrqepjgdtdraxpcptk` (keep "Verify JWT" on),
or Dashboard → Edge Functions → Deploy a new function → name `add-title` → paste index.ts → Deploy.
Requires the SQL in user_titles.sql (table + RLS) to be run first.
