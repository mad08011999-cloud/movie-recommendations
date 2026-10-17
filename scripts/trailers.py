#!/usr/bin/env python3
"""Find a verified, embeddable YouTube trailer per title; store in streaming/<id>.json under "trailer".
Sources (no keys): JustWatch clips (YouTube), Wikidata P1651, then YouTube public search page as last resort.
Every candidate is verified with YouTube oEmbed (exists + embeddable). Retries misses after 30 days. TRAILER_MAX caps per run."""
import json, os, re, time, datetime, urllib.request, urllib.parse
DIR, CAT = "streaming", "catalog.json"
UA = {"User-Agent": "Mozilla/5.0 (movie-recommendations-sync; +github.com/mad08011999-cloud/movie-recommendations)", "Accept-Language": "en-US,en;q=0.9"}
MAX = int(os.environ.get("TRAILER_MAX", "150")); DELAY = float(os.environ.get("TRAILER_DELAY", "1.0"))
OFFICIAL = ["netflix","prime video","amazon mgm","amazon studios","hbo","max","warner bros","universal pictures","universal","sony pictures","columbia pictures",
  "paramount","disney","pixar","marvel","lionsgate","a24","focus features","20th century","searchlight","hulu","apple tv","peacock","mgm","neon",
  "stx","bleecker street","magnolia","ifc films","roadside attractions","sony pictures classics","netflix india","primevideoin","t-series","yrf",
  "dharma productions","zee studios","jiostudios","jiocinema","jiohotstar","disney+ hotstar","excel movies","red chillies","tips official","saregama",
  "sun tv","sun pictures","aha","mythri movie makers","geetha arts","bbc","itv","channel 4","sky","fx networks","fx","amc","showtime","starz","cbs",
  "nbc","abc","the cw","fox","adult swim","crunchyroll","toho","studio ghibli","gkids","cj entertainment","tvn","jtbc","viki","mubi","curzon","studiocanal",
  "entertainment one","eone","vertical","shudder","blumhouse","legendary","dreamworks","illumination","new line cinema","miramax","summit entertainment",
  "open road films","screen gems","tristar","orion pictures","united artists","relativity","fox searchlight","warner bros. pictures","warner bros. tv",
  "paramount pictures","paramount+","sony pictures entertainment","universal pictures uk","netflix uk","pathé","gaumont","canal+","zdf","ard"]
AGGREGATOR = ["rotten tomatoes trailers","rotten tomatoes classic trailers","movieclips classic trailers","movieclips trailers","movieclips","rotten tomatoes tv","imdb"]
BAD = re.compile(r"\b(reaction|review|fan[- ]?made|parody|recap|explained|ending|behind the scenes|interview|teaser reaction|concept|ai trailer|full movie|scene|clip|honest)\b", re.I)
norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())

def get(u, js=True):
    for i in range(2):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30)
            return json.load(r) if js else r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404, 400): return None
        except Exception: time.sleep(2)
    return None

def oembed(vid):
    return get("https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}"))

def tier(ch):
    c = (ch or "").lower().strip()
    if any(c == o or c.startswith(o + " ") or c.endswith(" " + o) for o in OFFICIAL): return "official"
    if any(c == a for a in AGGREGATOR): return "aggregator"
    return "other"

def score(t, title, ch, verified=False):
    if not title or BAD.search(title) or "trailer" not in title.lower(): return -1
    nt = norm(t["title"]); 
    if nt and nt not in norm(title) and nt not in norm(re.sub(r"^the ", "", t["title"].lower())): return -1
    nt2 = norm(title); k = nt2.find(nt)
    if k >= 0 and re.match(r"([2-5](?!\d{3})|ii|iii|part2|chapter2|returns|therevenge)", nt2[k+len(nt):]) and not re.search(r"\d$", nt): return -1
    s = {"official": 6, "aggregator": 3, "other": 0}[tier(ch)]
    if re.search(r"official (main |final |us |uk |hindi |telugu )?trailer", title, re.I): s += 3
    if verified: s += 1
    if t.get("year") and str(t["year"]) in title: s += 1
    if re.search(r"\bteaser\b", title, re.I): s -= 1
    if re.search(r"anniversary|re-?release|4k restoration|collection", title, re.I): s -= 2
    if re.search(r"\b(season|part|vol\.?|volume) ?[2-9]\b", title, re.I): s -= 3
    return s

def yt_search(t):
    q = f'{t["title"]} {t.get("year") or ""} {"series" if t["type"]=="series" else ""} official trailer'
    html = get("https://www.youtube.com/results?search_query=" + urllib.parse.quote(q), js=False)
    m = html and re.search(r"var ytInitialData = (\{.*?\});</script>", html)
    if not m: return []
    out = []
    def walk(o):
        if isinstance(o, dict):
            if "videoRenderer" in o:
                v = o["videoRenderer"]
                out.append((v.get("videoId"), "".join(r.get("text", "") for r in v.get("title", {}).get("runs", [])),
                            (v.get("ownerText", {}).get("runs") or [{}])[0].get("text"),
                            any("Verified" in (b.get("metadataBadgeRenderer", {}).get("tooltip") or "") or "Official" in (b.get("metadataBadgeRenderer", {}).get("tooltip") or "") for b in v.get("ownerBadges", []))))
            for x in o.values(): walk(x)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(json.loads(m.group(1)))
    return out[:12]

def wikidata_ids(ids):
    res = {}
    for i in range(0, len(ids), 300):
        v = " ".join(f'"{x}"' for x in ids[i:i+300])
        q = f"SELECT ?imdb ?y WHERE {{ VALUES ?imdb {{{v}}} ?it wdt:P345 ?imdb; wdt:P1651 ?y }}"
        r = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))
        for b in (r or {}).get("results", {}).get("bindings", []): res.setdefault(b["imdb"]["value"], []).append(b["y"]["value"])
    return res

def find(t, wd):
    cands = []  # (score, vid, title, channel)
    for vid in wd.get(t["id"], []):
        o = oembed(vid)
        if o: 
            s = score(t, o.get("title"), o.get("author_name"))
            if s >= 0: cands.append((s + 1, vid, o["title"], o["author_name"]))
    if not cands or max(c[0] for c in cands) < 7:
        time.sleep(DELAY)
        for vid, title, ch, ver in yt_search(t):
            s = score(t, title, ch, ver)
            if s >= 3 or (s >= 0 and ver): cands.append((s, vid, title, ch))
    for s, vid, title, ch in sorted(cands, key=lambda c: -c[0])[:3]:
        o = oembed(vid)  # exists + embeddable
        if o: return {"id": vid, "t": o.get("title") or title, "ch": o.get("author_name") or ch, "off": tier(o.get("author_name") or ch) == "official"}
    return None

def main():
    cat = json.load(open(CAT)); today = datetime.date.today()
    recs = {t["id"]: (json.load(open(f"{DIR}/{t['id']}.json")) if os.path.exists(f"{DIR}/{t['id']}.json") else {}) for t in cat}
    def due(r):
        if r.get("trailer"): return False
        tt = r.get("trailerTried"); return not tt or (today - datetime.date.fromisoformat(tt)).days >= 30
    todo = [t for t in cat if due(recs[t["id"]])]
    sh = os.environ.get("TRAILER_SHARD")  # "i/n" for parallel local runs
    if sh: i_, n_ = map(int, sh.split("/")); todo = todo[i_::n_]
    todo = todo[:MAX]
    print(f"trailers: {len(todo)} to look up")
    wd = wikidata_ids([t["id"] for t in todo]) if todo else {}
    found = 0
    for i, t in enumerate(todo):
        r = recs[t["id"]]
        try: tr = find(t, wd)
        except Exception as e: print("  err", t["id"], e); tr = None
        if tr: r["trailer"] = tr; r.pop("trailerTried", None); found += 1
        else: r["trailerTried"] = today.isoformat()
        r.setdefault("c", {})
        json.dump(r, open(f"{DIR}/{t['id']}.json", "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        if i % 50 == 0: print(f"  {i}/{len(todo)} found {found}")
    recs = {t["id"]: (json.load(open(f"{DIR}/{t['id']}.json")) if os.path.exists(f"{DIR}/{t['id']}.json") else {}) for t in cat}
    tot = [r.get("trailer") for r in recs.values() if r.get("trailer")]
    print(f"found {found} this run; coverage {len(tot)}/{len(cat)}; official channels {sum(1 for x in tot if x.get('off'))}")

if __name__ == "__main__": main()
