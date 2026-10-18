#!/usr/bin/env python3
"""Pack small poster thumbnails into JPEG texture atlases for the 3D video store.
atlas/index.json = {"cw":96,"ch":144,"cols":21,"rows":14,"size":2048,"pages":N,"map":{id:[page,slot]}}
Incremental: cells already in the previous atlas are reused (cropped), only new posters are downloaded."""
import json, os, re, io, sys, concurrent.futures as cf, urllib.request
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "atlas"); os.makedirs(OUT, exist_ok=True)
CW, CH, SIZE = 96, 144, 2048
COLS, ROWS = SIZE // CW, SIZE // CH
PER = COLS * ROWS
UA = "movie-recommendations-atlas/1.0 (https://github.com/mad08011999-cloud/movie-recommendations)"

def small(u):
    u = re.sub(r"\?.*$", "", u)
    if "m.media-amazon.com" in u:
        return [re.sub(r"\._V1_[^/]*\.(jpg|png)$", r"._V1_SX200.\1", u), u]
    m = re.match(r"https://upload\.wikimedia\.org/wikipedia/(\w+)/(\w)/(\w\w)/([^/]+)$", u)
    if m:
        f = m.group(4); ext = ".png" if f.lower().endswith(".svg") else ""
        return [f"https://upload.wikimedia.org/wikipedia/{m.group(1)}/thumb/{m.group(2)}/{m.group(3)}/{f}/200px-{f}{ext}", u]
    return [u]

def fetch(t):
    for u in small(t["poster"]):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25)
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
            return t["id"], fit(im)
        except Exception:
            continue
    return t["id"], None

def fit(im):  # cover-crop to the cell aspect
    w, h = im.size; a = CW / CH
    if w / h > a: nw = int(h * a); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = int(w / a); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((CW, CH), Image.LANCZOS)

def main():
    cat = json.load(open(os.path.join(ROOT, "catalog.json")))
    want = [t for t in cat if t.get("poster")]
    old, pages = {}, {}
    try:
        idx = json.load(open(os.path.join(OUT, "index.json")))
        if idx.get("cw") == CW and idx.get("ch") == CH:
            for i, (p, s) in idx["map"].items():
                if p not in pages: pages[p] = Image.open(os.path.join(OUT, f"{p}.jpg")).convert("RGB")
                x, y = (s % COLS) * CW, (s // COLS) * CH
                old[i] = pages[p].crop((x, y, x + CW, y + CH))
    except Exception as e:
        print("no previous atlas:", e)
    if old and all(t["id"] in old for t in want) and len(old) == len(want):
        print("atlas up to date"); return
    cells = {i: old[i] for i in (t["id"] for t in want) if i in old}
    need = [t for t in want if t["id"] not in cells]
    print(f"reuse {len(cells)}, download {len(need)}")
    with cf.ThreadPoolExecutor(6) as ex:
        for n, (i, im) in enumerate(ex.map(fetch, need)):
            if im is not None: cells[i] = im
            if n % 100 == 0: print(n, "/", len(need), flush=True)
    ids = [t["id"] for t in want if t["id"] in cells]
    if not ids and not old: sys.exit("nothing fetched")
    mp, npg = {}, (len(ids) + PER - 1) // PER
    for p in range(npg):
        page = Image.new("RGB", (SIZE, SIZE), (20, 16, 28))
        for s, i in enumerate(ids[p * PER:(p + 1) * PER]):
            page.paste(cells[i], ((s % COLS) * CW, (s // COLS) * CH)); mp[i] = [p, s]
        page.save(os.path.join(OUT, f"{p}.jpg"), quality=70, optimize=True, progressive=True)
    for f in os.listdir(OUT):
        if re.fullmatch(r"\d+\.jpg", f) and int(f[:-4]) >= npg: os.remove(os.path.join(OUT, f))
    json.dump({"cw": CW, "ch": CH, "cols": COLS, "rows": ROWS, "size": SIZE, "pages": npg, "map": mp}, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"))
    print(f"{len(ids)} covers in {npg} pages; {len(want) - len(ids)} failed")

if __name__ == "__main__": main()
