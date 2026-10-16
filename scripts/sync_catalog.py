#!/usr/bin/env python3
"""Merge titles from poojithmalla8/movie-watchlist into catalog.json, enrich blanks, dedupe.
Usage: python scripts/sync_catalog.py <source_dir>   (run from repo root)"""
import json, re, sys, glob, os, time, urllib.request, urllib.parse
SRC = sys.argv[1] if len(sys.argv) > 1 else "source"
CAT, CACHE = "catalog.json", "scripts/enrich_cache.json"
UA = {"User-Agent": "movie-recommendations-sync/1.0 (github.com/mad08011999-cloud/movie-recommendations)"}
FIELDS = ["id","title","type","year","genres","language","rating","desc","poster","saves"]

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

def main():
    cat = json.load(open(CAT)); before = json.dumps(cat, sort_keys=True)
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
    cat, rm2 = dedupe(cat)
    rm = rm1 + rm2
    print(f"added {len(added)}; existing records updated from source {filled}; enriched fields {nfilled}; duplicates removed {len(rm)}")
    for a in added[:50]: print("  + ", a["id"], a["title"], a.get("year"))
    for r in rm[:30]: print("  dup", *r)
    if json.dumps(cat, sort_keys=True) != before:
        json.dump(cat, open(CAT, "w"), ensure_ascii=False); print("catalog.json updated:", len(cat))
    else: print("no catalog changes")
    json.dump(cache, open(CACHE, "w"), indent=0, sort_keys=True)

if __name__ == "__main__": main()
