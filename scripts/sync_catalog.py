#!/usr/bin/env python3
"""Merge titles from poojithmalla8/movie-watchlist into catalog.json, enrich blanks, dedupe.
Usage: python scripts/sync_catalog.py <source_dir>   (run from repo root)"""
import json, re, sys, glob, os, time, urllib.request, urllib.parse
SRC = sys.argv[1] if len(sys.argv) > 1 else "source"
CAT, CACHE = "catalog.json", "scripts/enrich_cache.json"
UA = {"User-Agent": "movie-recommendations-sync/1.0 (github.com/mad08011999-cloud/movie-recommendations)"}
FIELDS = ["id","title","type","year","genres","language","imdbRating","rtScore","desc","poster","saves"]
OMDB_KEY = os.environ.get("OMDB_API_KEY", "").strip()
OMDB_MAX = int(os.environ.get("OMDB_DAILY_LIMIT", "900"))
OMDB_CACHE = "scripts/omdb_cache.json"

def get(u, tries=3):
    for i in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
        except Exception as e:
            if i == tries-1: print("  fetch failed:", u[:100], e); return None
            time.sleep(2*(i+1))

def norm(s): return re.sub(r"[^a-z0-9]", "", re.sub(r"\b(the|a|an|and)\b", "", (s or "").lower().replace("&", "and")))
def blank(v): return v is None or v == "" or v == []
def strict(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("&", "and"))
def key(c): return (strict(c.get("title")), c.get("year"), c.get("type"))

def merge_into(a, b):
    """Fill a's blank fields from b; combine saves/source."""
    for f in FIELDS:
        if f not in ("id","saves") and blank(a.get(f)) and not blank(b.get(f)): a[f] = b[f]
    a["saves"] = max(a.get("saves") or 0, b.get("saves") or 0)
    tags = sorted({t for c in (a, b) for t in (c.get("source") or "").split(" / ") if t})
    if tags: a["source"] = " / ".join(tags)
    if len(b.get("genres") or []) > len(a.get("genres") or []) and set(a.get("genres") or []) <= set(b["genres"]): a["genres"] = b["genres"]

def dedupe(cat):
    out, by_id, by_key, removed = [], {}, {}, []
    for c in cat:
        hit = by_id.get(c.get("id")) or by_key.get(key(c))
        if hit is not None:
            merge_into(hit, c); removed.append((c.get("id"), c.get("title"), c.get("year"), "->", hit["id"])); continue
        out.append(c); by_id[c.get("id")] = c; by_key[key(c)] = c
    return out, removed

MAP = [("romantic comedy",["Comedy","Romance"]),("romance",["Romance"]),("romantic",["Romance"]),("comedy",["Comedy"]),("drama",["Drama"]),
       ("musical",["Musical"]),("music",["Music"]),("sport",["Sport"]),("fantasy",["Fantasy"]),("crime",["Crime"]),("thriller",["Thriller"]),
       ("horror",["Horror"]),("family",["Family"]),("biograph",["Biography"]),("action",["Action"]),("adventure",["Adventure"]),
       ("science fiction",["Sci-Fi"]),("animat",["Animation"]),("mystery",["Mystery"]),("documentary",["Documentary"]),("war film",["War"]),
       ("histor",["History"]),("western",["Western"])]

def wikidata(ids):
    res = {}
    for i in range(0, len(ids), 60):
        vals = " ".join(f'"{x}"' for x in ids[i:i+60])
        q = f'''SELECT ?imdb ?art (GROUP_CONCAT(DISTINCT ?gl;separator="|") AS ?g) (SAMPLE(?ll) AS ?l) WHERE {{ VALUES ?imdb {{{vals}}} ?it wdt:P345 ?imdb.
        OPTIONAL{{?it wdt:P136 ?ge. ?ge rdfs:label ?gl FILTER(lang(?gl)="en")}} OPTIONAL{{?it wdt:P364 ?la. ?la rdfs:label ?ll FILTER(lang(?ll)="en")}}
        OPTIONAL{{?art schema:about ?it; schema:isPartOf <https://en.wikipedia.org/>}} }} GROUP BY ?imdb ?art'''
        r = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))
        for b in (r or {}).get("results", {}).get("bindings", []):
            res[b["imdb"]["value"]] = {k: b[k]["value"] for k in b}
    return res

def suggest(q):
    d = get("https://v3.sg.media-imdb.com/suggestion/x/" + urllib.parse.quote(q.lower()) + ".json") or {}
    return [x for x in d.get("d", []) if str(x.get("id","")).startswith("tt")]

def wikidata_ratings(ids):
    """Rotten Tomatoes tomatometer (P444 by Q105584, method Q108403393) and IMDb (P444 by Q37312) from Wikidata."""
    out = {}
    for i in range(0, len(ids), 200):
        vals = " ".join(f'"{x}"' for x in ids[i:i+200])
        q = f'''SELECT ?imdb ?s ?by ?m ?d WHERE {{ VALUES ?imdb {{{vals}}} VALUES ?by {{wd:Q105584 wd:Q37312}} ?it wdt:P345 ?imdb; p:P444 ?st.
        ?st ps:P444 ?s; pq:P447 ?by. OPTIONAL{{?st pq:P459 ?m}} OPTIONAL{{?st pq:P585 ?d}} }}'''
        r = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))
        for b in (r or {}).get("results", {}).get("bindings", []):
            by = b["by"]["value"].rsplit("/", 1)[1]; s = b["s"]["value"]; m = b.get("m", {}).get("value", "").rsplit("/", 1)[-1]; d = b.get("d", {}).get("value", "")
            o = out.setdefault(b["imdb"]["value"], {})
            if by == "Q105584" and re.fullmatch(r"\d{1,3}%", s) and m in ("", "Q108403393"):
                if d >= o.get("rtd", ""): o["rt"] = int(s[:-1]); o["rtd"] = d
            if by == "Q37312":
                mm = re.fullmatch(r"(\d(?:\.\d)?)/10", s)
                if mm and d >= o.get("imd", ""): o["imdb"] = float(mm.group(1)); o["imd"] = d
    return out

def omdb(cat):
    if not OMDB_KEY: print("OMDB_API_KEY not set; skipping OMDb"); return
    cache = json.load(open(OMDB_CACHE)) if os.path.exists(OMDB_CACHE) else {}
    order = sorted(cat, key=lambda c: cache.get(c["id"], 0))[:OMDB_MAX]  # never-fetched / oldest first
    n = ni = nr = 0
    for c in order:
        r = get("https://www.omdbapi.com/?i=%s&apikey=%s" % (c["id"], urllib.parse.quote(OMDB_KEY)), tries=2)
        if r is None: continue
        if r.get("Error", "").lower().startswith("request limit"): print("OMDb daily limit reached"); break
        if r.get("Error", "").lower().startswith("invalid api key"): print("OMDb key invalid"); break
        n += 1; cache[c["id"]] = int(time.time())
        if r.get("Response") != "True": continue
        v = r.get("imdbRating")
        if v and v != "N/A":
            try: c["imdbRating"] = float(v); ni += 1
            except ValueError: pass
        for x in r.get("Ratings", []):
            if x.get("Source") == "Rotten Tomatoes" and x.get("Value", "").endswith("%"):
                c["rtScore"] = int(x["Value"][:-1]); nr += 1
        for f, k in (("poster", "Poster"), ("desc", "Plot"), ("language", "Language")):
            if blank(c.get(f)) and r.get(k) and r[k] != "N/A": c[f] = r[k].split(",")[0].strip() if f == "language" else r[k]
        time.sleep(0.1)
    json.dump(cache, open(OMDB_CACHE, "w"), indent=0, sort_keys=True)
    print(f"OMDb: {n} calls, imdbRating set {ni}, rtScore set {nr}")

def ratings(cat):
    wr = wikidata_ratings([c["id"] for c in cat]); ri = rt = 0
    for c in cat:
        w = wr.get(c["id"], {})
        if w.get("rt") is not None and c.get("rtScore") is None: c["rtScore"] = w["rt"]; rt += 1
        if w.get("imdb") is not None and c.get("imdbRating") is None: c["imdbRating"] = w["imdb"]; ri += 1
    print(f"Wikidata ratings: rtScore filled {rt}, imdbRating filled {ri}")
    omdb(cat)
    print("coverage: imdbRating", sum(c.get("imdbRating") is not None for c in cat), "rtScore", sum(c.get("rtScore") is not None for c in cat), "of", len(cat))

SB_URL = "https://mazrqepjgdtdraxpcptk.supabase.co"; SB_KEY = "sb_publishable_-2do3uyVQ4kcl7PfnBeDpw_mWEc7TXN"  # public key, read-only via RLS
def fold_user_titles(cat):
    """Copy titles users added via the add-title Edge Function (public.user_titles) into catalog.json + streaming/."""
    try:
        r = urllib.request.urlopen(urllib.request.Request(SB_URL + "/rest/v1/user_titles?select=id,record,display_name&order=created_at.asc",
                                   headers={"apikey": SB_KEY, **UA}), timeout=30)
        rows = json.load(r)
    except Exception as e: print("user_titles not available:", e); return 0
    have = {c["id"] for c in cat}; n = 0
    for row in rows:
        rec = dict(row.get("record") or {}); rid = row.get("id")
        if not rid or rid in have or not re.fullmatch(r"tt\d{6,10}", rid): continue
        st = rec.pop("stream", None)
        rec = {k: rec.get(k) for k in FIELDS} | {"source": rec.get("source") or f"{row.get('display_name') or 'Someone'}'s pick"}
        rec["id"] = rid; rec["genres"] = rec["genres"] or []; rec["saves"] = rec["saves"] or 0; rec["desc"] = rec["desc"] or ""
        if st and not os.path.exists(f"streaming/{rid}.json"):
            os.makedirs("streaming", exist_ok=True); json.dump(st, open(f"streaming/{rid}.json", "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        cat.append(rec); have.add(rid); n += 1
    print("user-added titles folded in:", n); return n

def main():
    cat = json.load(open(CAT))
    for c in cat:
        if "rating" in c: c.setdefault("imdbRating", c.pop("rating"))
        c.setdefault("imdbRating", None); c.setdefault("rtScore", None)
    before0 = None; before = json.dumps(cat, sort_keys=True)
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    src = []
    for f in sorted(glob.glob(os.path.join(SRC, "movies-*.json"))): src += json.load(open(f))
    print("source titles:", len(src), "catalog:", len(cat))
    cat, rm1 = dedupe(cat)
    by_id = {c["id"]: c for c in cat}; by_key = {key(c): c for c in cat}
    by_ty = {}
    for c in cat: by_ty.setdefault((norm(c["title"]), c.get("year")), c)
    added, filled = [], 0
    for s in src:
        if "rating" in s and "imdbRating" not in s: s["imdbRating"] = s.pop("rating")
        s = {k: s.get(k) for k in FIELDS if k in s}
        if not s.get("id") and s.get("title"):  # resolve id
            c = suggest(f'{s["title"]} {s.get("year") or ""}'.strip())
            c = [x for x in c if norm(x.get("l")) == norm(s["title"])] or c
            if c: s["id"] = c[0]["id"]; s.setdefault("year", c[0].get("y")); s["poster"] = s.get("poster") or (c[0].get("i") or {}).get("imageUrl")
        if not s.get("id"): continue
        hit = by_id.get(s["id"]) or by_key.get(key(s)) or by_ty.get((norm(s.get("title")), s.get("year")))
        if hit:
            b = json.dumps(hit, sort_keys=True); merge_into(hit, s); filled += b != json.dumps(hit, sort_keys=True)
        else:
            rec = {k: s.get(k) for k in FIELDS}; rec["genres"] = rec["genres"] or []; rec["saves"] = rec["saves"] or 0; rec["desc"] = rec["desc"] or ""
            cat.append(rec); by_id[rec["id"]] = rec; by_key[key(rec)] = rec; added.append(rec)
    # enrich blanks (cached so unresolvable ids aren't re-fetched daily)
    need = [c for c in cat if any(blank(c.get(f)) for f in ("language","poster","desc","genres","year")) and c["id"] not in cache]
    print("records needing enrichment:", len(need))
    wd = wikidata([c["id"] for c in need]) if need else {}
    nfilled = {f: 0 for f in ("language","poster","desc","genres","year")}
    for c in need:
        w = wd.get(c["id"], {})
        if blank(c.get("language")) and w.get("l"): c["language"] = w["l"]; nfilled["language"] += 1
        if blank(c.get("genres")) and w.get("g"):
            gs, G = w["g"].lower(), []
            for k, v in MAP:
                if k in gs: G += [x for x in v if x not in G]
            if G: c["genres"] = sorted(G); nfilled["genres"] += 1
        if blank(c.get("desc")) and w.get("art"):
            r = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + w["art"].rsplit("/", 1)[1])
            if r and r.get("extract"): c["desc"] = r["extract"]; nfilled["desc"] += 1
        if blank(c.get("poster")) or blank(c.get("year")):
            x = [y for y in suggest(c["id"]) if y["id"] == c["id"]]
            if x:
                if blank(c.get("poster")) and (x[0].get("i") or {}).get("imageUrl"): c["poster"] = x[0]["i"]["imageUrl"]; nfilled["poster"] += 1
                if blank(c.get("year")) and x[0].get("y"): c["year"] = x[0]["y"]; nfilled["year"] += 1
        cache[c["id"]] = int(time.time())
    cache = {k: v for k, v in cache.items() if k in by_id and any(blank(by_id[k].get(f)) for f in ("language","poster","desc","genres","year"))}
    fold_user_titles(cat)
    cat, rm2 = dedupe(cat)
    ratings(cat)
    rm = rm1 + rm2
    print(f"added {len(added)}; existing records updated from source {filled}; enriched fields {nfilled}; duplicates removed {len(rm)}")
    for a in added[:50]: print("  + ", a["id"], a["title"], a.get("year"))
    for r in rm[:30]: print("  dup", *r)
    if json.dumps(cat, sort_keys=True) != before:
        json.dump(cat, open(CAT, "w"), ensure_ascii=False); print("catalog.json updated:", len(cat))
    else: print("no catalog changes")
    json.dump(cache, open(CACHE, "w"), indent=0, sort_keys=True)

if __name__ == "__main__": main()

