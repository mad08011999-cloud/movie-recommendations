#!/usr/bin/env python3
"""Precompute streaming availability + extra details into streaming.json.
Source: JustWatch public GraphQL (attribution required). Fallback: TMDB watch providers if TMDB_API_KEY is set.
Refreshes never-fetched titles first, then the oldest ~1/7 of the catalog per run (STREAM_MAX overrides)."""
import json, os, time, math, re, urllib.request, urllib.parse, datetime
CAT, DIR = "catalog.json", "streaming"
COUNTRIES = ["US", "GB", "CA", "IN", "AU", "FR"]
JW = "https://apis.justwatch.com/graphql"
UA = {"Content-Type": "application/json", "User-Agent": "movie-recommendations-sync/1.0 (+github.com/mad08011999-cloud/movie-recommendations)"}
TMDB_KEY = os.environ.get("TMDB_API_KEY", "").strip()
DELAY = float(os.environ.get("STREAM_DELAY", "0.6"))
WIDE = ["DE","ES","IT","NL","SE","NO","DK","FI","IE","BR","MX","AR","JP","KR","SG","MY","PH","ID","TH","NZ","ZA","AE","TR","PL","BE","CH","AT","PT"]
def big4(tech):
    t = tech or ""
    if t in ("netflix", "netflixbasicwithads"): return "netflix"
    if t in ("amazonprimevideo", "amazonprime", "amazonprimevideowithads", "amazonimdbtv"): return "prime"
    if t in ("disneyplus", "hotstar", "jiohotstar", "starplus", "disneyplushotstar"): return "disney"
    if "paramountplus" in t: return "paramount"
    return None
def offer_tech(o): return o.get("k") or ((o.get("i") or "").rsplit("/", 1)[-1].split(".")[0])
def local_big4(rec):
    return any(big4(offer_tech(o)) and o.get("t") in ("subscription", "ads", "free") for v in (rec.get("c") or {}).values() for o in v)
WOFF = " ".join(f'{c}:offers(country:{c},platform:WEB){{monetizationType package{{technicalName}}}}' for c in WIDE)
WQ = ('query($q:String!){popularTitles(country:US,first:8,filter:{searchQuery:$q}){edges{node{objectType content(country:US,language:"en"){title originalReleaseYear externalIds{imdbId}} ' + WOFF + '}}}}')
def elsewhere(t):
    """Which of Netflix / Prime Video / Disney+ / Paramount+ carry the title (subscription/ads/free) in the wider country set."""
    d = post(WQ, {"q": t["title"]})
    if d.get("errors"): raise RuntimeError(d["errors"][0].get("message"))
    nodes = [e["node"] for e in d["data"]["popularTitles"]["edges"]]
    want = "SHOW" if t["type"] == "series" else "MOVIE"
    n = next((n for n in nodes if (n.get("content") or {}).get("externalIds", {}).get("imdbId") == t["id"]), None) or \
        next((n for n in nodes if n["objectType"] == want and norm(n["content"]["title"]) == norm(t["title"]) and t.get("year")
              and abs((n["content"].get("originalReleaseYear") or 0) - t["year"]) <= 1), None)
    if not n: return None
    out = {}
    for c in WIDE:
        for o in n.get(c) or []:
            b = big4((o.get("package") or {}).get("technicalName"))
            if b and o.get("monetizationType") in ("FLATRATE", "ADS", "FREE") and c not in out.setdefault(b, []): out[b].append(c)
    return {k: v for k, v in out.items() if v}

TYPES = {"FLATRATE": "subscription", "FREE": "free", "ADS": "ads", "RENT": "rent", "BUY": "buy", "CINEMA": "cinema"}
OFF = " ".join(f'{c}:offers(country:{c},platform:WEB){{monetizationType standardWebURL package{{clearName technicalName icon}}}}' for c in COUNTRIES)
Q = ('query($q:String!){popularTitles(country:US,first:8,filter:{searchQuery:$q}){edges{node{id objectType ... on Show{totalSeasonCount} '
     'content(country:US,language:"en"){title originalReleaseYear fullPath runtime externalIds{imdbId} credits{role name}} ' + OFF + '}}}}')
norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())

def post(q, v):
    r = urllib.request.Request(JW, json.dumps({"query": q, "variables": v}).encode(), UA)
    return json.load(urllib.request.urlopen(r, timeout=40))

def offers(node):
    res = {}
    for c in COUNTRIES:
        seen, lst = set(), []
        for o in node.get(c) or []:
            p = o.get("package") or {}; t = TYPES.get(o.get("monetizationType"), (o.get("monetizationType") or "").lower())
            k = (p.get("technicalName"), t)
            if k in seen or t == "cinema": continue
            seen.add(k)
            ic = p.get("icon"); ic = "https://images.justwatch.com" + ic.replace("{profile}", "s100").replace("{format}", "webp") if ic else None
            lst.append({"p": p.get("clearName"), "i": ic, "t": t, "u": o.get("standardWebURL"), "k": p.get("technicalName")})
        if lst: res[c] = lst
    return res

def jw_lookup(t):
    for q in (t["title"], f'{t["title"]} {t.get("year") or ""}'.strip()):
        d = post(Q, {"q": q})
        if d.get("errors"): raise RuntimeError(d["errors"][0].get("message"))
        edges = [e["node"] for e in d["data"]["popularTitles"]["edges"]]
        hit = [n for n in edges if (n.get("content") or {}).get("externalIds", {}).get("imdbId") == t["id"]]
        if not hit:
            want = "SHOW" if t["type"] == "series" else "MOVIE"
            hit = [n for n in edges if n["objectType"] == want and norm(n["content"]["title"]) == norm(t["title"])
                   and t.get("year") and abs((n["content"].get("originalReleaseYear") or 0) - t["year"]) <= 1]
        if hit:
            n = hit[0]; c = n["content"]; cr = c.get("credits") or []
            return {"jw": "https://www.justwatch.com" + c["fullPath"], "runtime": c.get("runtime"), "seasons": n.get("totalSeasonCount"),
                    "cast": [x["name"] for x in cr if x["role"] == "ACTOR"][:8], "director": [x["name"] for x in cr if x["role"] == "DIRECTOR"][:3],
                    "c": offers(n), "src": "justwatch"}
        time.sleep(DELAY)
    return {"c": {}, "src": "justwatch", "nf": 1}

def tmdb_lookup(t):
    g = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA["User-Agent"]}), timeout=30))
    f = g(f"https://api.themoviedb.org/3/find/{t['id']}?external_source=imdb_id&api_key={urllib.parse.quote(TMDB_KEY)}")
    r = (f.get("movie_results") or [None])[0]; kind = "movie"
    if not r: r = (f.get("tv_results") or [None])[0]; kind = "tv"
    if not r: return {"c": {}, "src": "tmdb", "nf": 1}
    w = g(f"https://api.themoviedb.org/3/{kind}/{r['id']}/watch/providers?api_key={urllib.parse.quote(TMDB_KEY)}").get("results", {})
    res = {}
    for c in COUNTRIES:
        x = w.get(c) or {}; lst = []
        for k, ty in (("flatrate", "subscription"), ("free", "free"), ("ads", "ads"), ("rent", "rent"), ("buy", "buy")):
            for p in x.get(k, []): lst.append({"p": p["provider_name"], "i": "https://image.tmdb.org/t/p/w92" + p["logo_path"] if p.get("logo_path") else None, "t": ty, "u": x.get("link")})
        if lst: res[c] = lst
    return {"c": res, "src": "tmdb"}

def elsewhere_only(cat):
    """Backfill 'els' for titles not on the big 4 in the 6 home countries (ELSEWHERE_ONLY=1)."""
    n = found = 0
    for t in cat:
        f = os.path.join(DIR, t["id"] + ".json")
        rec = json.load(open(f)) if os.path.exists(f) else {"c": {}}
        if local_big4(rec):
            if "els" in rec: rec.pop("els"); rec.pop("elsU", None); json.dump(rec, open(f, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            continue
        if "els" in rec and not os.environ.get("ELSEWHERE_FORCE"): continue
        try: e = elsewhere(t)
        except Exception as ex: print("  elsewhere error", t["id"], ex); time.sleep(DELAY); continue
        rec["els"] = e if e is not None else {}; rec["elsU"] = datetime.date.today().isoformat(); n += 1; found += bool(rec["els"])
        json.dump(rec, open(f, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        if n % 50 == 0: print(f"  elsewhere {n} done, {found} found")
        time.sleep(DELAY)
    print(f"elsewhere: looked up {n}, found on a big-4 platform elsewhere {found}")

def main():
    cat = json.load(open(CAT)); ids = {t["id"] for t in cat}
    if os.environ.get("ELSEWHERE_ONLY"): return elsewhere_only(cat)
    os.makedirs(DIR, exist_ok=True); T = {}
    for f in os.listdir(DIR):
        k = f[:-5]
        if f.endswith(".json") and k.startswith("tt"):
            if k in ids: T[k] = json.load(open(os.path.join(DIR, f)))
            else: os.remove(os.path.join(DIR, f))
    limit = int(os.environ.get("STREAM_MAX", "0")) or math.ceil(len(cat) / 7)
    order = sorted(cat, key=lambda t: T.get(t["id"], {}).get("u", ""))[:limit]
    print(f"refreshing {len(order)} of {len(cat)}"); ok = fail = 0; jw_down = False
    for i, t in enumerate(order):
        rec = None
        if not jw_down:
            try: rec = jw_lookup(t)
            except Exception as e:
                fail += 1; print("  JW error", t["id"], e)
                if fail >= 5 and ok == 0: jw_down = True; print("JustWatch appears unavailable")
        if rec is None and TMDB_KEY:
            try: rec = tmdb_lookup(t)
            except Exception as e: print("  TMDB error", t["id"], e)
        if rec is None:
            if jw_down and not TMDB_KEY: break
            continue
        if not local_big4(rec):
            try:
                time.sleep(DELAY); e = elsewhere(t)
                rec["els"] = e if e is not None else {}; rec["elsU"] = datetime.date.today().isoformat()
            except Exception as ex: print("  elsewhere error", t["id"], ex)
        for k in ("trailer", "trailerTried"):
            if k in T.get(t["id"], {}): rec[k] = T[t["id"]][k]
        rec["u"] = datetime.date.today().isoformat(); T[t["id"]] = rec; ok += 1
        json.dump(rec, open(os.path.join(DIR, t["id"] + ".json"), "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        if i % 100 == 0: print(f"  {i}/{len(order)}")
        time.sleep(DELAY)
    json.dump({"updated": datetime.date.today().isoformat(), "countries": COUNTRIES, "attribution": "Streaming data provided by JustWatch"},
              open(os.path.join(DIR, "_meta.json"), "w"))
    cov = {c: sum(1 for v in T.values() if v.get("c", {}).get(c)) for c in COUNTRIES}
    print(f"done ok={ok} fail={fail}; matched {sum(1 for v in T.values() if v.get('jw'))}/{len(cat)}; coverage {cov}")

if __name__ == "__main__": main()
