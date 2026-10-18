// Supabase Edge Function: sync-catalog
// Upserts public.catalog_titles from the site's catalog.json + features.json (directors/cast/streaming summary).
// Called daily by pg_cron (see recs.sql) with header  x-sync-secret: <SYNC_SECRET>.  Deploy with "Verify JWT" OFF.
// Rows added by users (from_user = true) are maintained by a DB trigger on public.user_titles and are left alone,
// except when the same title has since been folded into catalog.json (then the base row takes over).
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://mad08011999-cloud.github.io/movie-recommendations/";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
type Rec = Record<string, any>;

export function toRow(t: Rec, f: Rec | undefined) {
  const num = (v: any) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
  return {
    id: t.id, title: t.title || t.id, type: t.type === "series" ? "series" : "movie", year: num(t.year),
    language: t.language || null, genres: t.genres || [], directors: f?.d || [], cast_names: f?.c || [],
    imdb_rating: num(t.imdbRating ?? t.rating), rt_score: num(t.rtScore), popularity: num(t.saves) || 0, poster: t.poster || null,
    streaming: { home: f?.home || [], countries: f?.countries || [], els: f?.els || {} }, source: t.source || null,
    from_user: false, updated_at: new Date().toISOString(),
  };
}

async function handle(req: Request) {
  const secret = Deno.env.get("SYNC_SECRET");
  if (!secret || req.headers.get("x-sync-secret") !== secret) return json({ error: "forbidden" }, 403);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bust = "?t=" + Date.now();
  const [catR, featR] = await Promise.all([fetch(SITE + "catalog.json" + bust), fetch(SITE + "features.json" + bust)]);
  if (!catR.ok) return json({ error: "catalog.json " + catR.status }, 502);
  const cat: Rec[] = await catR.json();
  const feat: Rec = featR.ok ? await featR.json() : {};
  if (!Array.isArray(cat) || cat.length < 100) return json({ error: "catalog looks wrong; aborting" }, 502);

  const rows = cat.filter((t) => /^tt\d{6,10}$/.test(t.id)).map((t) => toRow(t, feat[t.id]));
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("catalog_titles").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) return json({ error: error.message, upserted }, 500);
    upserted += Math.min(500, rows.length - i);
  }
  // Remove base rows that are no longer in catalog.json (user rows are handled by the trigger).
  const ids = new Set(rows.map((r) => r.id));
  const { data: existing } = await db.from("catalog_titles").select("id").eq("from_user", false);
  const stale = (existing || []).map((r: any) => r.id).filter((id: string) => !ids.has(id));
  for (let i = 0; i < stale.length; i += 200) await db.from("catalog_titles").delete().in("id", stale.slice(i, i + 200)).eq("from_user", false);
  return json({ ok: true, upserted, removed: stale.length, features: Object.keys(feat).length });
}

if (!Deno.env.get("SYNC_LOCAL_TEST")) Deno.serve(handle);
