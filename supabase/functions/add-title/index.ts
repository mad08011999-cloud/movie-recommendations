// Supabase Edge Function: add-title
// POST JSON, Authorization: Bearer <user access token>
//   { action: "ping" }                                         -> { status:"ok", version:2 }  (no auth needed)
//   { action: "search", query, year?, type?, language? }      -> { status:"candidates", candidates:[{id,title,year,type,poster,cast,exists,big4:{home,els}}] } (saves nothing)
//   { action: "add", id: "tt…", language?, display_name? }    -> { status:"added"|"exists"|"not_found"|"error", ... }
//   { action: "remove", id: "tt…" }                           -> { status:"removed" } | 403 if not the caller's pick / base catalog
//   legacy (no action): { query, year?, type?, language? }    -> resolve + add (v1 behaviour)
// Resolves the title on IMDb, dedupes against the site catalog + public.user_titles, enriches it
// (Wikidata, Wikipedia, JustWatch streaming, YouTube trailer, RT/IMDb ratings) and inserts into public.user_titles.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://mad08011999-cloud.github.io/movie-recommendations/";
const COUNTRIES = ["US", "GB", "CA", "IN", "AU", "FR"];
const UA = "movie-recommendations-add-title/1.0 (+https://github.com/mad08011999-cloud/movie-recommendations)";
const DAILY_LIMIT = 25;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const norm = (s?: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
type Rec = Record<string, any>;

async function getJSON(url: string, init: RequestInit = {}, ms = 20000): Promise<any> {
  try {
    const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ---------- resolve ----------
export async function suggest(q: string): Promise<any[]> {
  const d = await getJSON("https://v3.sg.media-imdb.com/suggestion/x/" + encodeURIComponent(q.toLowerCase()) + ".json");
  return (d?.d || []).filter((x: any) => String(x.id || "").startsWith("tt"));
}
export async function resolve(query: string, year?: number, type?: string) {
  const name = query.trim();
  if (/^tt\d{6,10}$/.test(name)) return (await suggest(name)).find((x) => x.id === name) || null;
  const want = type === "movie" ? ["movie", "tvMovie"] : type === "series" ? ["tvSeries", "tvMiniSeries"] : ["movie", "tvMovie", "tvSeries", "tvMiniSeries"];
  let c = (await suggest(`${name} ${year || ""}`.trim())).filter((x) => want.includes(x.qid));
  if (year) { const y = c.filter((x) => x.y && Math.abs(x.y - year) <= 1); c = y.length ? y : []; }
  const exact = c.filter((x) => norm(x.l) === norm(name));
  return exact[0] || c[0] || null;
}

// ---------- Wikidata / Wikipedia ----------
const GENRE_MAP: [string, string[]][] = [["romantic comedy", ["Comedy", "Romance"]], ["romance", ["Romance"]], ["romantic", ["Romance"]], ["comedy", ["Comedy"]],
  ["drama", ["Drama"]], ["musical", ["Musical"]], ["music", ["Music"]], ["sport", ["Sport"]], ["fantasy", ["Fantasy"]], ["crime", ["Crime"]], ["thriller", ["Thriller"]],
  ["horror", ["Horror"]], ["family", ["Family"]], ["biograph", ["Biography"]], ["action", ["Action"]], ["adventure", ["Adventure"]], ["science fiction", ["Sci-Fi"]],
  ["animat", ["Animation"]], ["mystery", ["Mystery"]], ["documentary", ["Documentary"]], ["war film", ["War"]], ["histor", ["History"]], ["western", ["Western"]]];

export async function wikidata(id: string) {
  const q = `SELECT ?art (GROUP_CONCAT(DISTINCT ?gl;separator="|") AS ?g) (SAMPLE(?ll) AS ?l) (SAMPLE(?dur) AS ?runtime) (SAMPLE(?seas) AS ?seasons)
    (GROUP_CONCAT(DISTINCT ?dl;separator="|") AS ?dirs) WHERE { ?it wdt:P345 "${id}".
    OPTIONAL{?it wdt:P136 ?ge. ?ge rdfs:label ?gl FILTER(lang(?gl)="en")} OPTIONAL{?it wdt:P364 ?la. ?la rdfs:label ?ll FILTER(lang(?ll)="en")}
    OPTIONAL{?it wdt:P2047 ?dur} OPTIONAL{?it wdt:P2437 ?seas} OPTIONAL{?it wdt:P57 ?d. ?d rdfs:label ?dl FILTER(lang(?dl)="en")}
    OPTIONAL{?art schema:about ?it; schema:isPartOf <https://en.wikipedia.org/>} } GROUP BY ?art LIMIT 1`;
  const cq = `SELECT ?cl WHERE { ?it wdt:P345 "${id}"; p:P161 ?st. ?st ps:P161 ?c. ?c rdfs:label ?cl FILTER(lang(?cl)="en") OPTIONAL{?st pq:P1545 ?o} } ORDER BY xsd:integer(?o) LIMIT 8`;
  const rq = `SELECT ?s ?by ?m ?d WHERE { VALUES ?by {wd:Q105584 wd:Q37312} ?it wdt:P345 "${id}"; p:P444 ?st. ?st ps:P444 ?s; pq:P447 ?by. OPTIONAL{?st pq:P459 ?m} OPTIONAL{?st pq:P585 ?d} }`;
  const tq = `SELECT ?y WHERE { ?it wdt:P345 "${id}"; wdt:P1651 ?y }`;
  const sp = (q: string) => getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: { Accept: "application/sparql-results+json" } });
  const [a, c, r, t] = await Promise.all([sp(q), sp(cq), sp(rq), sp(tq)]);
  const b = a?.results?.bindings?.[0] || {};
  const v = (k: string) => b[k]?.value;
  const gs = (v("g") || "").toLowerCase(); const genres: string[] = [];
  for (const [k, g] of GENRE_MAP) if (gs.includes(k)) for (const x of g) if (!genres.includes(x)) genres.push(x);
  let rt: number | null = null, rtd = "", imdb: number | null = null, imd = "";
  for (const x of r?.results?.bindings || []) {
    const s = x.s.value, by = x.by.value.split("/").pop(), m = (x.m?.value || "").split("/").pop(), d = x.d?.value || "";
    if (by === "Q105584" && /^\d{1,3}%$/.test(s) && (!m || m === "Q108403393") && d >= rtd) { rt = parseInt(s); rtd = d; }
    const mm = s.match(/^(\d(?:\.\d)?)\/10$/);
    if (by === "Q37312" && mm && d >= imd) { imdb = parseFloat(mm[1]); imd = d; }
  }
  return {
    article: v("art"), genres: genres.sort(), language: v("l") || null,
    runtime: v("runtime") ? Math.round(parseFloat(v("runtime")!)) : null, seasons: v("seasons") ? parseInt(v("seasons")!) : null,
    director: (v("dirs") || "").split("|").filter(Boolean).slice(0, 3), cast: (c?.results?.bindings || []).map((x: any) => x.cl.value),
    rt, imdb, youtube: (t?.results?.bindings || []).map((x: any) => x.y.value) as string[],
  };
}
export async function wikipedia(article?: string) {
  if (!article) return "";
  const d = await getJSON("https://en.wikipedia.org/api/rest_v1/page/summary/" + article.split("/").pop());
  return d?.extract || "";
}

// ---------- JustWatch ----------
const WIDE = ["DE","ES","IT","NL","SE","NO","DK","FI","IE","BR","MX","AR","JP","KR","SG","MY","PH","ID","TH","NZ","ZA","AE","TR","PL","BE","CH","AT","PT"];
export function big4(tech?: string): string | null {
  const t = tech || "";
  if (["netflix", "netflixbasicwithads"].includes(t)) return "netflix";
  if (["amazonprimevideo", "amazonprime", "amazonprimevideowithads", "amazonimdbtv"].includes(t)) return "prime";
  if (["disneyplus", "hotstar", "jiohotstar", "starplus", "disneyplushotstar"].includes(t)) return "disney";
  if (t.includes("paramountplus")) return "paramount";
  return null;
}
const STREAMY = ["FLATRATE", "ADS", "FREE"];
function big4Map(node: any, countries: string[]) {
  const out: Record<string, string[]> = {};
  for (const c of countries) for (const o of node[c] || []) {
    const b = big4(o.package?.technicalName);
    if (b && STREAMY.includes(o.monetizationType)) { out[b] = out[b] || []; if (!out[b].includes(c)) out[b].push(c); }
  }
  return out;
}
// Light lookup for search hints: big-4 availability at home (6 countries) and elsewhere (wider set). Cached 6h.
const HINTS = new Map<string, { at: number; v: any }>();
export async function big4Hint(id: string, title: string, type: string, year?: number) {
  const hit = HINTS.get(id); if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v;
  const all = [...COUNTRIES, ...WIDE];
  const off = all.map((c) => `${c}:offers(country:${c},platform:WEB){monetizationType package{technicalName}}`).join(" ");
  const Q = `query($q:String!){popularTitles(country:US,first:6,filter:{searchQuery:$q}){edges{node{objectType content(country:US,language:"en"){title originalReleaseYear externalIds{imdbId}} ${off}}}}}`;
  const d = await getJSON("https://apis.justwatch.com/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: Q, variables: { q: title } }) }, 8000);
  const nodes = (d?.data?.popularTitles?.edges || []).map((e: any) => e.node);
  const want = type === "series" ? "SHOW" : "MOVIE";
  const n = nodes.find((n: any) => n.content?.externalIds?.imdbId === id) ||
    nodes.find((n: any) => n.objectType === want && norm(n.content?.title) === norm(title) && year && Math.abs((n.content?.originalReleaseYear || 0) - year) <= 1);
  const v = n ? { home: big4Map(n, COUNTRIES), els: big4Map(n, WIDE) } : null;
  if (d) HINTS.set(id, { at: Date.now(), v });
  return v;
}
const TYPES: Rec = { FLATRATE: "subscription", FREE: "free", ADS: "ads", RENT: "rent", BUY: "buy" };
export async function justwatch(rec: Rec) {
  const off = COUNTRIES.map((c) => `${c}:offers(country:${c},platform:WEB){monetizationType standardWebURL package{clearName technicalName icon}}`).join(" ") + " " +
    WIDE.map((c) => `${c}:offers(country:${c},platform:WEB){monetizationType package{technicalName}}`).join(" ");
  const Q = `query($q:String!){popularTitles(country:US,first:8,filter:{searchQuery:$q}){edges{node{id objectType ... on Show{totalSeasonCount} content(country:US,language:"en"){title originalReleaseYear fullPath runtime externalIds{imdbId} credits{role name}} ${off}}}}}`;
  const d = await getJSON("https://apis.justwatch.com/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: Q, variables: { q: rec.title } }) });
  const nodes = (d?.data?.popularTitles?.edges || []).map((e: any) => e.node);
  const want = rec.type === "series" ? "SHOW" : "MOVIE";
  const n = nodes.find((n: any) => n.content?.externalIds?.imdbId === rec.id) ||
    nodes.find((n: any) => n.objectType === want && norm(n.content?.title) === norm(rec.title) && rec.year && Math.abs((n.content?.originalReleaseYear || 0) - rec.year) <= 1);
  if (!n) return null;
  const c: Rec = {};
  for (const k of COUNTRIES) {
    const seen = new Set<string>(), lst: Rec[] = [];
    for (const o of n[k] || []) {
      const t = TYPES[o.monetizationType]; const p = o.package || {};
      if (!t || seen.has(p.technicalName + t)) continue; seen.add(p.technicalName + t);
      lst.push({ p: p.clearName, t, u: o.standardWebURL, k: p.technicalName, i: p.icon ? "https://images.justwatch.com" + p.icon.replace("{profile}", "s100").replace("{format}", "webp") : null });
    }
    if (lst.length) c[k] = lst;
  }
  const cr = n.content?.credits || [];
  const home = big4Map(n, COUNTRIES);
  const extra = Object.keys(home).length ? {} : { els: big4Map(n, WIDE), elsU: new Date().toISOString().slice(0, 10) };
  return { ...extra, jw: "https://www.justwatch.com" + n.content.fullPath, runtime: n.content.runtime || null, seasons: n.totalSeasonCount || null,
    cast: cr.filter((x: any) => x.role === "ACTOR").slice(0, 8).map((x: any) => x.name), director: cr.filter((x: any) => x.role === "DIRECTOR").slice(0, 3).map((x: any) => x.name), c, src: "justwatch" };
}

// ---------- YouTube trailer ----------
const OFFICIAL = ["netflix", "prime video", "amazon mgm", "hbo", "max", "warner bros", "universal pictures", "sony pictures", "paramount", "disney", "pixar", "marvel",
  "lionsgate", "a24", "focus features", "20th century", "searchlight", "hulu", "apple tv", "peacock", "mgm", "neon", "netflix india", "t-series", "yrf", "dharma productions",
  "zee studios", "jiostudios", "jiohotstar", "sun tv", "sun pictures", "aha", "mythri movie makers", "geetha arts", "sithara entertainments", "bbc", "itv", "amc", "fx",
  "crunchyroll", "toho", "studio ghibli", "gkids", "legendary", "dreamworks", "illumination", "new line cinema", "miramax", "studiocanal", "lyca productions"];
const AGG = ["rotten tomatoes trailers", "rotten tomatoes classic trailers", "movieclips classic trailers", "movieclips trailers", "movieclips", "imdb"];
const BAD = /\b(reaction|review|fan[- ]?made|parody|recap|explained|ending|behind the scenes|interview|concept|ai trailer|full movie|scene|clip|honest)\b/i;
const tier = (ch?: string) => { const c = (ch || "").toLowerCase().trim();
  if (OFFICIAL.some((o) => c === o || c.startsWith(o + " ") || c.endsWith(" " + o))) return "official"; return AGG.includes(c) ? "aggregator" : "other"; };
function score(rec: Rec, title?: string, ch?: string, verified = false) {
  if (!title || BAD.test(title) || !/trailer/i.test(title)) return -1;
  const nt = norm(rec.title), n2 = norm(title), k = n2.indexOf(nt);
  if (nt && k < 0) return -1;
  if (/^([2-5](?!\d{3})|ii|iii|part2|chapter2|returns|therevenge)/.test(n2.slice(k + nt.length)) && !/\d$/.test(nt)) return -1;
  let s = { official: 6, aggregator: 3, other: 0 }[tier(ch)]!;
  if (/official (main |final |us |uk |hindi |telugu |tamil )?trailer/i.test(title)) s += 3;
  if (verified) s += 1;
  if (rec.year && title.includes(String(rec.year))) s += 1;
  if (/\bteaser\b/i.test(title)) s -= 1;
  if (/anniversary|re-?release|4k restoration|collection/i.test(title)) s -= 2;
  if (/\b(season|part|vol\.?|volume) ?[2-9]\b/i.test(title)) s -= 3;
  return s;
}
const oembed = (vid: string) => getJSON("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + vid));
async function ytSearch(rec: Rec) {
  const q = `${rec.title} ${rec.year || ""} ${rec.type === "series" ? "series" : ""} official trailer`;
  try {
    const r = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(q), { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(15000) });
    const m = (await r.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) return [];
    const out: [string, string, string, boolean][] = [];
    const walk = (o: any) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") {
        if (o.videoRenderer) { const v = o.videoRenderer;
          out.push([v.videoId, (v.title?.runs || []).map((x: any) => x.text).join(""), v.ownerText?.runs?.[0]?.text,
            (v.ownerBadges || []).some((b: any) => /Verified|Official/.test(b.metadataBadgeRenderer?.tooltip || ""))]); }
        Object.values(o).forEach(walk);
      }
    };
    walk(JSON.parse(m[1]));
    return out.slice(0, 12);
  } catch { return []; }
}
export async function trailer(rec: Rec, wdIds: string[]) {
  const cands: [number, string, string, string][] = [];
  for (const vid of wdIds) { const o = await oembed(vid); if (o) { const s = score(rec, o.title, o.author_name); if (s >= 0) cands.push([s + 1, vid, o.title, o.author_name]); } }
  if (!cands.length || Math.max(...cands.map((c) => c[0])) < 7)
    for (const [vid, t, ch, ver] of await ytSearch(rec)) { const s = score(rec, t, ch, ver); if (s >= 3 || (s >= 0 && ver)) cands.push([s, vid, t, ch]); }
  cands.sort((a, b) => b[0] - a[0]);
  for (const [, vid, t, ch] of cands.slice(0, 3)) {
    const o = await oembed(vid);
    if (o) return { id: vid, t: o.title || t, ch: o.author_name || ch, off: tier(o.author_name || ch) === "official" };
  }
  return null;
}

// ---------- full enrichment ----------
export async function enrich(x: any, opts: { language?: string; tag: string }) {
  const rec: Rec = { id: x.id, title: x.l, type: ["tvSeries", "tvMiniSeries"].includes(x.qid) ? "series" : "movie", year: x.y || null, genres: [],
    language: opts.language || null, imdbRating: null, rtScore: null, desc: "", poster: x.i?.imageUrl || null, saves: 0, source: opts.tag };
  const [w, jw] = await Promise.all([wikidata(rec.id), justwatch(rec)]);
  const [desc, tr] = await Promise.all([wikipedia(w.article), trailer(rec, w.youtube)]);
  rec.genres = w.genres; rec.language = rec.language || w.language; rec.desc = desc; rec.rtScore = w.rt; rec.imdbRating = w.imdb;
  const today = new Date().toISOString().slice(0, 10);
  rec.stream = { ...(jw || { c: {} }), runtime: jw?.runtime || w.runtime, seasons: jw?.seasons || w.seasons,
    cast: jw?.cast?.length ? jw.cast : w.cast, director: jw?.director?.length ? jw.director : w.director, u: today, ...(tr ? { trailer: tr } : {}) };
  return rec;
}

// ---------- catalog cache ----------
let CATALOG: Set<string> | null = null, CAT_AT = 0;
async function catalogIds() {
  if (!CATALOG || Date.now() - CAT_AT > 5 * 60_000) {
    const d = await getJSON(SITE + "catalog.json?t=" + Date.now(), {}, 20000);
    if (Array.isArray(d)) { CATALOG = new Set(d.map((r: any) => r.id)); CAT_AT = Date.now(); }
  }
  return CATALOG || new Set<string>();
}

// ---------- handler ----------
const TYPE_OF = (qid?: string) => (["tvSeries", "tvMiniSeries"].includes(qid || "") ? "series" : "movie");
export async function candidates(query: string, year?: number, type?: string) {
  const name = query.trim();
  const want = type === "movie" ? ["movie", "tvMovie"] : type === "series" ? ["tvSeries", "tvMiniSeries"] : ["movie", "tvMovie", "tvSeries", "tvMiniSeries"];
  let c = /^tt\d{6,10}$/.test(name) ? (await suggest(name)).filter((x) => x.id === name)
    : (await suggest(`${name} ${year || ""}`.trim())).filter((x) => want.includes(x.qid));
  if (year && !/^tt/.test(name)) { const y = c.filter((x) => x.y && Math.abs(x.y - year) <= 1); if (y.length) c = y; }
  c.sort((a, b) => Number(norm(b.l) === norm(name)) - Number(norm(a.l) === norm(name)));
  return c.slice(0, 5).map((x) => ({ id: x.id, title: x.l, year: x.y || null, type: TYPE_OF(x.qid), poster: x.i?.imageUrl || null, cast: x.s || "" }));
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "error", message: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let body: Rec;
  try { body = await req.json(); } catch { return json({ status: "error", message: "Invalid request." }, 400); }
  const action = ["search", "add", "remove", "ping"].includes(body.action) ? body.action : "legacy";
  if (action === "ping") return json({ status: "ok", version: 2, actions: ["search", "add", "remove"] });

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ status: "error", message: "Please sign in to add titles." }, 401);
  const db = createClient(url, service);

  const year = body.year ? parseInt(body.year) : undefined;
  const type = ["movie", "series"].includes(body.type) ? body.type : undefined;
  const language = body.language ? String(body.language).slice(0, 60) : undefined;
  const md = user.user_metadata || {};
  const name = String(body.display_name || md.display_name || md.full_name || md.name || (user.email || "Someone").split("@")[0]).trim().slice(0, 40);

  // ---- remove: only the user's own pick ----
  if (action === "remove") {
    const id = String(body.id || "");
    if (!/^tt\d{6,10}$/.test(id)) return json({ status: "error", message: "Invalid id." }, 400);
    const { data: row } = await db.from("user_titles").select("id,added_by").eq("id", id).maybeSingle();
    if (!row) return json({ status: "error", message: (await catalogIds()).has(id) ? "Titles from the original list can't be removed." : "Not found." }, (await catalogIds()).has(id) ? 403 : 404);
    if (row.added_by !== user.id) return json({ status: "error", message: "You can only remove titles you added." }, 403);
    const { error } = await db.from("user_titles").delete().eq("id", id).eq("added_by", user.id);
    if (error) return json({ status: "error", message: "Couldn't remove: " + error.message }, 500);
    return json({ status: "removed", id });
  }

  // ---- search: candidates only, nothing saved ----
  if (action === "search") {
    const query = String(body.query || "").trim().slice(0, 200);
    if (!query) return json({ status: "error", message: "Enter a title." }, 400);
    const list = await candidates(query, year, type);
    if (!list.length) return json({ status: "not_found", message: `Couldn't find “${query}”${year ? ` (${year})` : ""} on IMDb. Check the spelling or add the year.` });
    const cat = await catalogIds();
    const { data: rows } = await db.from("user_titles").select("id").in("id", list.map((c) => c.id));
    const ut = new Set((rows || []).map((r: any) => r.id));
    const hints = await Promise.all(list.map((c) => big4Hint(c.id, c.title, c.type, c.year || undefined).catch(() => null)));
    return json({ status: "candidates", candidates: list.map((c, i) => ({ ...c, exists: cat.has(c.id) || ut.has(c.id), big4: hints[i] })) });
  }

  // ---- add (by chosen id) / legacy (by query) ----
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from("user_titles").select("id", { count: "exact", head: true }).eq("added_by", user.id).gte("created_at", since);
  if ((count || 0) >= DAILY_LIMIT) return json({ status: "error", message: `Daily limit reached (${DAILY_LIMIT} titles). Try again tomorrow.` }, 429);
  let x: any = null;
  if (action === "add") {
    const id = String(body.id || "");
    if (!/^tt\d{6,10}$/.test(id)) return json({ status: "error", message: "Invalid id." }, 400);
    x = (await suggest(id)).find((s) => s.id === id) || null;
  } else {
    const query = String(body.query || "").trim().slice(0, 200);
    if (!query) return json({ status: "error", message: "Enter a title." }, 400);
    x = await resolve(query, year, type);
  }
  if (!x) return json({ status: "not_found", message: "Couldn't find that title on IMDb." });
  if ((await catalogIds()).has(x.id)) return json({ status: "exists", id: x.id, title: x.l, year: x.y });
  const { data: dup } = await db.from("user_titles").select("id,record,display_name").eq("id", x.id).maybeSingle();
  if (dup) return json({ status: "exists", id: x.id, title: x.l, year: x.y, record: dup.record, display_name: dup.display_name });

  const rec = await enrich(x, { language, tag: `${name}'s pick` });
  const { error } = await db.from("user_titles").insert({ id: rec.id, record: rec, added_by: user.id, display_name: name });
  if (error) {
    if (error.code === "23505") return json({ status: "exists", id: rec.id, title: rec.title, year: rec.year });
    return json({ status: "error", message: "Couldn't save the title: " + error.message }, 500);
  }
  return json({ status: "added", id: rec.id, record: rec, display_name: name });
}

if (!Deno.env.get("ADD_TITLE_LOCAL_TEST")) Deno.serve(handle);
