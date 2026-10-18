// Walk-in 3D video store (three.js). Mounted by app.js when the "Video store" view is on.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js";

const BW = 0.2, BH = 0.3, BD = 0.04, PITCH = 0.235, ROWS = 5, ROW_Y = [0.28, 0.68, 1.08, 1.48, 1.88], FILL = [2, 3, 1, 4, 0];
const EYE = 1.6, CEIL = 3.3, SPEED = 3.0, LEN = 7.05;
const SVC = { netflix: ["Netflix", "#e50914"], prime: ["Prime Video", "#00a8e1"], disney: ["Disney+", "#1f3fbf"], paramount: ["Paramount+", "#0064ff"] };
const STC = { todo: 0xff3b5c, watching: 0xffb020, watched: 0x22c55e };

export function supported() {
  try { const c = document.createElement("canvas"); return !!(window.WebGL2RenderingContext && c.getContext("webgl2")) || !!c.getContext("webgl"); } catch (_) { return false; }
}

export function mount(api) {
  const S = {}; // public handle
  const $ = (s, r = document) => r.querySelector(s), esc = api.esc;
  // ---------- DOM ----------
  const root = document.createElement("div"); root.id = "s3d"; root.className = "s3d entry";
  root.innerHTML = `<canvas class="s3c" tabindex="0" aria-label="3D video store"></canvas>
  <div class="s3top">
    <button class="btn s3back" data-a="exit" title="Leave the store">▦ Back to grid view</button>
    <button class="btn" data-a="dir" aria-expanded="false">🗺️ Aisles</button>
    <input class="s3q" type="search" placeholder="Search the shelves…" aria-label="Search">
    <select class="s3type" aria-label="Type"><option value="all">All</option><option value="movie">Movies</option><option value="series">Series</option></select>
    <select class="s3lang" aria-label="Language"></select>
    <span class="s3svc"></span><span class="s3fps"></span>
  </div>
  <div class="s3dir" hidden></div>
  <canvas class="s3map" width="170" height="170" title="Store map — click to walk there"></canvas>
  <div class="s3reticle"></div>
  <div class="s3tip" hidden></div>
  <div class="s3help">Click to look around · <b>WASD</b>/arrows to walk · click a box to pick it up · click the floor to walk there · <b>Esc</b> frees the mouse</div>
  <div class="s3joy" aria-hidden="true"><div class="s3knob"></div></div>
  <div class="s3insp" hidden><aside class="s3l"></aside><aside class="s3r"></aside></div>
  <div class="s3enter"><div class="s3card">
    <div class="s3logo"><span>POOJITH'S</span><b>VIDEO STORE</b><i>be kind, rewind</i></div>
    <p class="s3sub"></p>
    <div class="s3pick"><div class="s3lbl">Highlight what you can stream</div><div class="s3svcs">${Object.entries(SVC).map(([k, [n, c]]) => `<button class="svc" data-svc="${k}" style="--c:${c}" aria-pressed="false">${n}</button>`).join("")}</div></div>
    <button class="btn acc s3go" data-a="enter">Enter the store →</button>
    <button class="link" data-a="exit">▦ Back to grid view</button>
  </div></div>
  <div class="s3load">Stocking the shelves…</div>`;
  document.body.appendChild(root);
  const cv = $(".s3c", root), tip = $(".s3tip", root), insp = $(".s3insp", root), mapc = $(".s3map", root), dirEl = $(".s3dir", root);

  // ---------- three ----------
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const mobile = matchMedia("(pointer:coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0816); scene.fog = new THREE.Fog(0x0d0816, 14, 34);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 60); cam.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1840, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 6, 4); scene.add(dl);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const room = new THREE.Group(), stock = new THREE.Group(); scene.add(room, stock);

  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; }
  function neon(text, color = "#ff4fd8", w = 2.4, h = 0.5, sub = "") {
    const tex = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => {
      g.fillStyle = "#14072a"; g.fillRect(0, 0, W, H); g.strokeStyle = color; g.lineWidth = 10; g.shadowColor = color; g.shadowBlur = 30; g.strokeRect(14, 14, W - 28, H - 28);
      let fs = Math.min(H * (sub ? 0.5 : 0.62), 150); g.font = `900 ${fs}px "Arial Black",Impact,sans-serif`; while (g.measureText(text).width > W - 80 && fs > 20) { fs -= 4; g.font = `900 ${fs}px "Arial Black",Impact,sans-serif`; }
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.shadowBlur = 40; const y = sub ? H * 0.42 : H / 2; g.fillText(text, W / 2, y); g.shadowBlur = 18; g.fillText(text, W / 2, y);
      if (sub) { g.font = `700 ${H * 0.2}px sans-serif`; g.fillStyle = color; g.fillText(sub, W / 2, H * 0.78); }
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
  }

  // ---------- data ----------
  let FEAT = {}; fetch("features.json").then(r => r.ok ? r.json() : {}).then(j => { FEAT = j; if (svc.size) recolor(); }).catch(() => {});
  let ATLAS = null; const pageTex = [];
  const atlasReady = fetch("atlas/index.json").then(r => r.ok ? r.json() : null).catch(() => null).then(j => { ATLAS = j; return j; });
  const blank = document.createElement("canvas"); blank.width = blank.height = 4; { const g = blank.getContext("2d"); g.fillStyle = "#2a2238"; g.fillRect(0, 0, 4, 4); }
  function getPage(p) {
    if (pageTex[p]) return pageTex[p];
    const t = new THREE.Texture(blank); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.needsUpdate = true; t.userData = { loaded: false, loading: false, idx: p };
    return pageTex[p] = t;
  }
  function loadPage(p) { const t = getPage(p); if (t.userData.loading) return; t.userData.loading = true; const im = new Image(); im.decoding = "async"; im.onload = () => { t.dispose(); t.image = im; t.needsUpdate = true; t.userData.loaded = true; }; im.src = `atlas/${p}.jpg?v=${ATLAS ? ATLAS.pages + "_" + Object.keys(ATLAS.map).length : 0}`; }
  // dynamic page: titles not in the atlas yet (just added) — drawn into a canvas, poster fetched with CORS
  const DYN = document.createElement("canvas"); DYN.width = DYN.height = 2048; const dg = DYN.getContext("2d"); const dynTex = new THREE.CanvasTexture(DYN); dynTex.colorSpace = THREE.SRGBColorSpace; dynTex.userData = { loaded: true };
  const dynSlot = {}; let dynN = 0;
  function dynCell(t) {
    if (t.id in dynSlot) return dynSlot[t.id]; const s = dynN++ % 294; dynSlot[t.id] = s; const x = (s % 21) * 96, y = Math.floor(s / 21) * 144;
    const hue = [...t.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; dg.fillStyle = `hsl(${hue} 45% 22%)`; dg.fillRect(x, y, 96, 144); dg.fillStyle = "#fff"; dg.font = "bold 13px sans-serif"; dg.textAlign = "center";
    wrap(dg, t.title, x + 48, y + 50, 84, 15, 5); dg.font = "11px sans-serif"; dg.fillText(String(t.year || ""), x + 48, y + 128); dynTex.needsUpdate = true;
    if (t.poster) { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { cover(dg, im, x, y, 96, 144); dynTex.needsUpdate = true; }; im.src = smallPoster(t.poster, 200); }
    return s;
  }
  function wrap(g, text, x, y, w, lh, max) { const words = String(text).split(/\s+/); let line = "", n = 0; for (const wd of words) { const tst = line ? line + " " + wd : wd; if (g.measureText(tst).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; if (++n >= max - 1) { line = line + "…"; break; } } else line = tst; } if (line) g.fillText(line, x, y); return y; }
  function cover(g, im, x, y, w, h) { const a = w / h, ia = im.width / im.height; let sx = 0, sy = 0, sw = im.width, sh = im.height; if (ia > a) { sw = sh * a; sx = (im.width - sw) / 2; } else { sh = sw / a; sy = (im.height - sh) / 2; } g.drawImage(im, sx, sy, sw, sh, x, y, w, h); }
  function smallPoster(u, w) {
    u = u.replace(/\?.*$/, "");
    if (u.includes("m.media-amazon.com")) return u.replace(/\._V1_[^/]*\.(jpg|png)$/, `._V1_SX${w}.$1`);
    const m = u.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/(\w+)\/(\w)\/(\w\w)\/([^/]+)$/);
    if (m) return `https://upload.wikimedia.org/wikipedia/${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${w}px-${m[4]}${/\.svg$/i.test(m[4]) ? ".png" : ""}`;
    return u;
  }

  // ---------- room ----------
  const M = {
    floor: new THREE.MeshLambertMaterial({ map: canvasTex(256, 256, (g, W, H) => { g.fillStyle = "#2b1546"; g.fillRect(0, 0, W, H); const cols = ["#5a2c8a", "#1d7f9a", "#c23b8b", "#e0b33a"]; for (let i = 0; i < 70; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = .55; const x = Math.random() * W, y = Math.random() * H, r = 3 + Math.random() * 9; g.beginPath(); if (i % 3) g.arc(x, y, r, 0, 7); else g.rect(x, y, r * 1.6, r * .5); g.fill(); } }) }),
    wall: new THREE.MeshLambertMaterial({ color: 0x241338 }), ceil: new THREE.MeshLambertMaterial({ color: 0x1a1424 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4426 }), board: new THREE.MeshLambertMaterial({ color: 0x1b1222 }), side: new THREE.MeshLambertMaterial({ color: 0x121016 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false, fog: false }), desk: new THREE.MeshLambertMaterial({ color: 0x3a1f5c }),
  };
  M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping;
  let L = null; // layout
  const colliders = [];
  function buildRoom(W, zBack, zFront) {
    room.clear(); colliders.length = 0;
    const D = zFront - zBack, cz = (zFront + zBack) / 2;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, cz); fl.material.map.repeat.set(W / 2, D / 2); fl.name = "floor"; room.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceil); ce.rotation.x = Math.PI / 2; ce.position.set(0, CEIL, cz); room.add(ce);
    const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, CEIL), M.wall); m.position.set(x, CEIL / 2, z); m.rotation.y = ry; room.add(m); };
    wall(W, 0, zBack, 0); wall(D, -W / 2, cz, Math.PI / 2); wall(D, W / 2, cz, -Math.PI / 2);
    wall(W / 2 - 1.2, -(W / 4 + 0.6), zFront, Math.PI); wall(W / 2 - 1.2, W / 4 + 0.6, zFront, Math.PI);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .35 })); door.position.set(0, 1.3, zFront - .01); door.rotation.y = Math.PI; door.name = "door"; room.add(door);
    const ex = neon("EXIT ▸ GRID", "#43f0b5", 1.6, .34); ex.position.set(0, 2.85, zFront - .03); ex.rotation.y = Math.PI; ex.name = "door"; room.add(ex);
    const lg = new THREE.PlaneGeometry(1.2, .6), lights = new THREE.InstancedMesh(lg, M.light, Math.ceil(W / 3) * Math.ceil(D / 3)); let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let x = -W / 2 + 1.5; x < W / 2; x += 3) for (let z = zBack + 1.5; z < zFront; z += 3) lights.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, CEIL - .01, z), q, new THREE.Vector3(1, 1, 1)));
    lights.count = n; room.add(lights);
  }

  // ---------- stock / layout ----------
  let placements = [], meshes = [], stickers = null, units = [], dirEntries = [];
  const boxGeo = new THREE.BoxGeometry(BW, BH, BD);
  function frontMat(tex) {
    const m = new THREE.MeshBasicMaterial({ map: tex });
    m.onBeforeCompile = s => {
      s.uniforms.uCS = { value: new THREE.Vector2(96 / 2048, 144 / 2048) };
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aCell;\nuniform vec2 uCS;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * uCS + aCell;\n#endif");
    };
    return m;
  }
  function aisleSets(list, recs) {
    const yr = new Date().getFullYear(), A = {};
    A.staff = list.filter(t => t.source && /pick/i.test(t.source));
    A.newr = list.filter(t => t.year && t.year >= yr - 2).sort((a, b) => (b.year || 0) - (a.year || 0));
    A.rent = list.filter(t => ["todo", "watching"].includes(api.stOf(t.id)));
    A.ret = list.filter(t => api.stOf(t.id) === "watched").sort((a, b) => (api.ST()[a.id]?.rating ? 1 : 0) - (api.ST()[b.id]?.rating ? 1 : 0));
    A.tv = list.filter(t => t.type === "series");
    const ok = new Set(list.map(t => t.id)); A.fy = (recs || []).map(r => api.BY[r.id]).filter(t => t && ok.has(t.id));
    const gc = {}; list.forEach(t => t.genres.forEach(g => (gc[g] = gc[g] || []).push(t)));
    const rank = (a, b) => (b.saves || 0) - (a.saves || 0) || (b.imdbRating || 0) - (a.imdbRating || 0);
    A.genres = Object.keys(gc).filter(g => gc[g].length >= 6).sort((a, b) => gc[b].length - gc[a].length).slice(0, 10).map(g => [g, gc[g].sort(rank)]);
    return A;
  }
  const GCOL = ["#ff4fd8", "#43f0b5", "#ffd23f", "#4fc3ff", "#ff6b3d", "#b388ff", "#7dff6b", "#ff4f6d", "#3dffe7", "#ffa63d"];
  function build(list, recs) {
    const A = aisleSets(list, recs), NG = A.genres.length;
    const W = Math.max(16, NG * 3.1 + 4), zBack = -(LEN + 5), zFront = 7; buildRoom(W, zBack, zFront);
    stock.clear(); meshes.forEach(m => m.geometry.dispose()); meshes = []; placements = []; units = []; dirEntries = [];
    const planks = [], boards = [];
    // unit: centre (x,z), yaw so that the shelf faces +z of its local frame
    const addUnit = (key, name, items, x, z, yaw, len, color, sub, opts = {}) => {
      const cols = Math.max(1, Math.floor((len - 0.1) / PITCH)), cap = cols * ROWS, it = items.slice(0, cap); if (items.length > cap && !opts.noCapNote) sub = (sub ? sub + " · " : "") + `top ${cap} on this shelf`;
      const U = new THREE.Object3D(); U.position.set(x, 0, z); U.rotation.y = yaw; U.updateMatrixWorld(); const mw = U.matrixWorld;
      const u = { key, name, x, z, yaw, len, items, shown: it.length, color, mw }; units.push(u);
      boards.push(new THREE.Matrix4().multiplyMatrices(mw, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.1, -0.06), new THREE.Quaternion(), new THREE.Vector3(len, 2.2, 0.04))));
      ROW_Y.forEach(y => planks.push(new THREE.Matrix4().multiplyMatrices(mw, new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0.06), new THREE.Quaternion(), new THREE.Vector3(len, 0.03, 0.28)))));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)), sv = new THREE.Vector3(1, 1, 1);
      it.forEach((t, i) => {
        const row = FILL[Math.floor(i / cols) % ROWS], col = i % cols, lx = -((cols - 1) * PITCH) / 2 + col * PITCH;
        const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ROW_Y[row] + 0.015 + BH / 2, 0.04), tilt, sv);
        const m = new THREE.Matrix4().multiplyMatrices(mw, local), pos = new THREE.Vector3().setFromMatrixPosition(m);
        placements.push({ t, m, pos, unit: u, nrm: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)) });
      });
      const sign = neon(opts.signText || name.toUpperCase(), color, Math.min(len * 0.8, 3.2), 0.5, sub); sign.position.copy(new THREE.Vector3(0, opts.signY || 2.55, 0.05).applyMatrix4(mw)); sign.rotation.y = yaw; stock.add(sign);
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), stand = new THREE.Vector3(x, EYE, z).addScaledVector(fwd, opts.standDist || 1.7);
      dirEntries.push({ key, name, n: items.length, color, stand, look: new THREE.Vector3(x, 1.15, z) });
      if (opts.collide !== false) { const half = new THREE.Vector3(len / 2, 0, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw); colliders.push({ x0: x - Math.abs(half.x) - .15, x1: x + Math.abs(half.x) + .15, z0: z - Math.abs(half.z) - .15, z1: z + Math.abs(half.z) + .15 }); }
      return u;
    };
    // genre gondolas: two faces back to back, running along z
    const zMid = zBack + 2 + LEN / 2 + 0.6;
    A.genres.forEach(([g, items], i) => {
      const x = -((NG - 1) * 3.1) / 2 + i * 3.1, c = GCOL[i % GCOL.length], half = Math.ceil(items.length / 2);
      const a = addUnit("g-" + g + "-L", g, items.filter((_, k) => k % 2 === 0), x - 0.32, zMid, -Math.PI / 2, LEN, c, `${items.length} titles`, { collide: false, standDist: 1.25 });
      const b = addUnit("g-" + g + "-R", g, items.filter((_, k) => k % 2 === 1), x + 0.32, zMid, Math.PI / 2, LEN, c, `${items.length} titles`, { collide: false, standDist: 1.25 });
      colliders.push({ x0: x - 0.62, x1: x + 0.62, z0: zMid - LEN / 2 - .1, z1: zMid + LEN / 2 + .1 });
      dirEntries.splice(dirEntries.length - 2, 2, { key: "g-" + g, name: g, n: items.length, color: c, stand: new THREE.Vector3(x + 1.5, EYE, zMid + LEN / 2 + 1.2), look: new THREE.Vector3(x + 1.5, 1.2, zMid - LEN / 2) });
      const hang = neon(g.toUpperCase(), c, 2.2, 0.48, `${items.length} titles`); hang.position.set(x, 2.85, zMid + LEN / 2 + 0.2); const hb = hang.clone(); hb.rotation.y = Math.PI; hb.position.z -= 0.01; stock.add(hang, hb); half;
    });
    const wl = Math.min(W - 2, 24);
    addUnit("newr", "New Releases", A.newr, 0, zBack + 0.12, 0, wl, "#ffd23f", `${A.newr.length} titles`, { standDist: 2.6 });
    addUnit("staff", "Staff Picks", A.staff, -W / 2 + 0.12, zMid, Math.PI / 2, LEN, "#43f0b5", "Poojith & friends recommend", { standDist: 1.6 });
    addUnit("tv", "TV Box Sets", A.tv, W / 2 - 0.12, zMid, -Math.PI / 2, LEN, "#4fc3ff", `${A.tv.length} series`, { standDist: 1.6 });
    addUnit("rent", "Your Rentals", A.rent, -W / 2 + 0.12, zFront - 3.2, Math.PI / 2, 4.6, "#ff4f6d", A.rent.length ? "to watch & watching" : "mark titles To watch", { standDist: 1.6 });
    const nUnr = A.ret.filter(t => !api.ST()[t.id]?.rating).length;
    addUnit("ret", "Returns", A.ret, W / 2 - 0.12, zFront - 3.2, -Math.PI / 2, 4.6, "#ffa63d", A.ret.length ? (nUnr ? `${nUnr} waiting for your rating` : "all rated — thanks!") : "watched titles land here", { standDist: 2.4 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 3.2), M.desk); desk.position.set(W / 2 - 1.6, 0.5, zFront - 3.2); stock.add(desk); colliders.push({ x0: W / 2 - 2.15, x1: W / 2, z0: zFront - 4.95, z1: zFront - 1.45 });
    const dtop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 3.3), M.wood); dtop.position.set(W / 2 - 1.6, 1.02, zFront - 3.2); stock.add(dtop);
    const fyItems = A.fy.length ? A.fy : list.filter(t => t.imdbRating).sort((a, b) => (b.imdbRating * Math.log(2 + (b.saves || 0))) - (a.imdbRating * Math.log(2 + (a.saves || 0)))).slice(0, 40);
    const fyText = api.user() ? (A.fy.length ? "based on your ratings" : (recs === null ? "loading your picks…" : "crowd favourites — rate titles to personalise")) : "crowd favourites — sign in & rate for yours";
    addUnit("fy", "Picked for you", fyItems, 0, zMid + LEN / 2 + 2.6, 0, 4.4, "#b388ff", fyText, { signText: "✨ PICKED FOR YOU", standDist: 2.2 });
    colliders.push({ x0: -W / 2 - 1, x1: -W / 2 + 0.35, z0: zBack, z1: zFront }, { x0: W / 2 - 0.35, x1: W / 2 + 1, z0: zBack, z1: zFront }, { x0: -W, x1: W, z0: zBack - 1, z1: zBack + 0.35 });
    // shelves
    const plankIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.wood, planks.length); planks.forEach((m, i) => plankIM.setMatrixAt(i, m)); stock.add(plankIM); meshes.push(plankIM);
    const boardIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.board, boards.length); boards.forEach((m, i) => boardIM.setMatrixAt(i, m)); stock.add(boardIM); meshes.push(boardIM);
    // boxes: one InstancedMesh per atlas page (+1 dynamic page)
    const groups = {};
    placements.forEach(p => { const c = ATLAS && ATLAS.map[p.t.id]; const pg = c ? c[0] : "dyn", slot = c ? c[1] : dynCell(p.t); (groups[pg] = groups[pg] || []).push(p); p.page = pg; p.slot = slot; });
    const white = new THREE.Color(1, 1, 1);
    Object.entries(groups).forEach(([pg, ps]) => {
      const tex = pg === "dyn" ? dynTex : getPage(+pg), geo = boxGeo.clone(), cell = new Float32Array(ps.length * 2);
      ps.forEach((p, i) => { const cs = p.page === "dyn" ? 21 : ATLAS.cols, col = p.slot % cs, row = Math.floor(p.slot / cs); cell[i * 2] = col * 96 / 2048; cell[i * 2 + 1] = 1 - (row + 1) * 144 / 2048; });
      geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
      const im = new THREE.InstancedMesh(geo, [M.side, M.side, M.side, M.side, frontMat(tex), M.side], ps.length);
      ps.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, white); p.im = im; p.ii = i; });
      im.userData = { ps, page: pg }; stock.add(im); meshes.push(im);
    });
    // status stickers
    const stPs = placements.filter(p => api.stOf(p.t.id) !== "none");
    stickers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.035), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(1, stPs.length));
    const off = new THREE.Matrix4().makeTranslation(BW / 2 - 0.05, BH / 2 - 0.03, BD / 2 + 0.002), c = new THREE.Color();
    stPs.forEach((p, i) => { stickers.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(p.m, off)); stickers.setColorAt(i, c.setHex(STC[api.stOf(p.t.id)])); }); stickers.count = stPs.length; stock.add(stickers);
    L = { W, zBack, zFront, A, nUnr };
    recolor(); drawDir(); hiresClear();
    $(".s3sub", root).textContent = `${list.length} titles on ${units.length} shelves · ${NG} genre aisles${api.user() ? "" : " · sign in for “Picked for you”"}`;
  }
  // streaming highlight
  const svc = new Set(JSON.parse(localStorage.getItem("store3dSvc") || "[]"));
  const onSvc = id => { const h = FEAT[id] && FEAT[id].home; return !!(h && h.some(k => svc.has(k))); };
  function recolor() {
    const c = new THREE.Color();
    meshes.forEach(im => { if (!im.userData.ps) return; im.userData.ps.forEach((p, i) => im.setColorAt(i, c.setScalar(!svc.size || onSvc(p.t.id) ? 1 : 0.28))); if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    $(".s3svc", root).innerHTML = svc.size ? "Highlighting: " + [...svc].map(k => `<b style="color:${SVC[k][1]}">${SVC[k][0]}</b>`).join(", ") : "";
    root.querySelectorAll("[data-svc]").forEach(b => b.setAttribute("aria-pressed", svc.has(b.dataset.svc)));
  }

  // ---------- lazy textures + LOD ----------
  const hiPool = [], hiCache = new Map(), texLoader = new THREE.TextureLoader(); texLoader.setCrossOrigin("anonymous");
  for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ transparent: false })); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); hiPool.push(m); }
  function hiresClear() { hiPool.forEach(m => { m.visible = false; m.userData.id = null; }); }
  function hiTex(t) {
    if (hiCache.has(t.id)) { const v = hiCache.get(t.id); hiCache.delete(t.id); hiCache.set(t.id, v); return v.ok ? v.tex : null; }
    if (!t.poster) return null; const v = { ok: false, tex: null }; hiCache.set(t.id, v);
    const ok = tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAniso; v.tex = tx; v.ok = true; }, src = smallPoster(t.poster, 300);
    v.tex = texLoader.load(src, ok, undefined, () => { if (src !== t.poster) v.tex = texLoader.load(t.poster, ok); });
    if (hiCache.size > 60) { const [k, o] = hiCache.entries().next().value; hiCache.delete(k); if (o.tex) o.tex.dispose(); }
    return null;
  }
  const tmpV = new THREE.Vector3(), fwdV = new THREE.Vector3(); let lastLod = 0;
  function lodTick(now) {
    if (now - lastLod < 250 || !placements.length) return; lastLod = now;
    cam.getWorldDirection(fwdV); const near = [], need = new Set();
    for (const p of placements) {
      const d = tmpV.copy(p.pos).sub(cam.position), dist = d.length();
      if (dist < 16 && p.page !== "dyn") need.add(p.page);
      if (dist < 3.2 && d.dot(fwdV) > 0 && p.nrm.dot(d) < 0) near.push([dist, p]);
    }
    need.forEach(pg => { if (!getPage(pg).userData.loading) loadPage(pg); });
    near.sort((a, b) => a[0] - b[0]); const sel = near.slice(0, hiPool.length).map(x => x[1]), ids = new Set(sel.map(p => p.t.id + "@" + p.ii + p.page));
    hiPool.forEach(m => { if (m.userData.key && !ids.has(m.userData.key)) { m.visible = false; m.userData.key = null; } });
    sel.forEach(p => {
      const key = p.t.id + "@" + p.ii + p.page; if (hiPool.some(m => m.userData.key === key)) return;
      const tex = hiTex(p.t); if (!tex) return; const m = hiPool.find(m => !m.userData.key); if (!m) return;
      m.material.map = tex; m.material.needsUpdate = true; m.matrix.multiplyMatrices(p.m, new THREE.Matrix4().makeTranslation(0, 0, BD / 2 + 0.0015)); m.matrixWorldNeedsUpdate = true; m.visible = !(held && held.p === p); m.userData.key = key; m.userData.p = p;
    });
  }

  // ---------- controls ----------
  let yaw = 0, pitch = -0.05, keys = {}, joy = { x: 0, y: 0 }, walkTo = null, tween = null, entered = false, held = null, visible = false;
  const locked = () => document.pointerLockElement === cv;
  addEventListener("keydown", e => { if (!visible || !entered || e.target.closest("input,select,textarea")) return; keys[e.code] = true; if (/^(Arrow|Key[WASD]|Space)/.test(e.code)) e.preventDefault(); if (e.code === "Escape" && held) putBack(); });
  addEventListener("keyup", e => { keys[e.code] = false; });
  addEventListener("blur", () => keys = {});
  let drag = null;
  cv.addEventListener("pointerdown", e => { if (!entered || held) return; drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, t: performance.now(), moved: 0 }; });
  addEventListener("pointermove", e => {
    if (!visible || !entered) return;
    if (locked()) { yaw -= e.movementX * 0.0022; pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.0022)); return; }
    if (drag && e.pointerId === drag.id) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; yaw += dx * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.004)); }
    else if (!mobile && !held) hoverAt(e.clientX, e.clientY);
  });
  addEventListener("pointerup", e => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null;
    if (d.moved > 8) return;
    if (locked()) { clickAt(innerWidth / 2, innerHeight / 2); return; }
    if (!mobile && !clickAt(d.sx, d.sy, true)) { try { cv.requestPointerLock(); } catch (_) {} return; }
    if (mobile) clickAt(d.sx, d.sy);
  });
  // mobile joystick
  const joyEl = $(".s3joy", root), knob = $(".s3knob", root); let joyId = null;
  joyEl.addEventListener("pointerdown", e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.stopPropagation(); });
  joyEl.addEventListener("pointermove", e => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = () => { joyId = null; joy = { x: 0, y: 0 }; knob.style.transform = ""; }; joyEl.addEventListener("pointerup", joyEnd); joyEl.addEventListener("pointercancel", joyEnd);
  function joyMove(e) { const r = joyEl.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2), l = Math.min(1, Math.hypot(x, y)) / (Math.hypot(x, y) || 1); joy = { x: x * l, y: y * l }; knob.style.transform = `translate(${joy.x * 34}px,${joy.y * 34}px)`; }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); ray.far = 9;
    const boxes = meshes.filter(m => m.userData.ps), hits = ray.intersectObjects(boxes.concat(room.children.filter(o => o.name === "floor" || o.name === "door")), false);
    for (const h of hits) { if (h.object.userData.ps) return h.distance < 5.5 ? { p: h.object.userData.ps[h.instanceId] } : { far: h.point }; if (h.object.name === "door") return { door: true, d: h.distance }; if (h.object.name === "floor") return { floor: h.point }; }
    return null;
  }
  function clickAt(cx, cy, quiet) {
    const h = pick(cx, cy); if (!h) return false;
    if (h.p) { pickUp(h.p); return true; }
    if (h.door) { if (h.d < 4) { api.exit(); return true; } }
    if (quiet && !mobile) return false;
    const pt = h.floor || h.far; if (pt) { walkTo = new THREE.Vector3(pt.x, EYE, pt.z); return true; }
    return false;
  }
  let lastHover = 0;
  function hoverAt(cx, cy) {
    const now = performance.now(); if (now - lastHover < 90) return; lastHover = now; const h = pick(cx, cy);
    if (h && h.p) { const t = h.p.t, f = FEAT[t.id], on = f && f.home && f.home.filter(k => SVC[k]).map(k => SVC[k][0]); tip.innerHTML = `<b>${esc(t.title)}</b> <span>${t.year || ""}${t.imdbRating ? ` · ★ ${t.imdbRating.toFixed(1)}` : ""}${on && on.length ? ` · on ${esc(on.join(", "))}` : ""}</span>`; tip.hidden = false; cv.style.cursor = "pointer"; }
    else { tip.hidden = true; cv.style.cursor = h && h.door ? "pointer" : "grab"; }
  }
  document.addEventListener("pointerlockchange", () => root.classList.toggle("locked", locked()));

  function blocked(x, z) { for (const c of colliders) if (x > c.x0 - .25 && x < c.x1 + .25 && z > c.z0 - .25 && z < c.z1 + .25) return true; return L ? (x < -L.W / 2 + .4 || x > L.W / 2 - .4 || z < L.zBack + .4 || z > L.zFront - .5) : false; }
  function move(dt) {
    if (tween) { tween.t = Math.min(1, tween.t + dt / tween.dur); const k = 1 - Math.pow(1 - tween.t, 3); cam.position.lerpVectors(tween.a, tween.b, k); yaw = tween.ya + (tween.yb - tween.ya) * k; pitch = tween.pa + (tween.pb - tween.pa) * k; if (tween.t >= 1) tween = null; return; }
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyA) s -= 1; if (keys.KeyD) s += 1;
    if (keys.ArrowLeft) yaw += dt * 1.8; if (keys.ArrowRight) yaw -= dt * 1.8;
    f -= joy.y; s += joy.x;
    const sp = SPEED * (keys.ShiftLeft || keys.ShiftRight ? 1.8 : 1);
    let dx = 0, dz = 0;
    if (f || s) { walkTo = null; const l = Math.min(1, Math.hypot(f, s)) / (Math.hypot(f, s) || 1); f *= l; s *= l; dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp * dt; dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp * dt; }
    else if (walkTo) { const v = tmpV.copy(walkTo).sub(cam.position); v.y = 0; const d = v.length(); if (d < 0.08) walkTo = null; else { const st = Math.min(d, sp * dt); dx = v.x / d * st; dz = v.z / d * st; const ty = Math.atan2(-v.x, -v.z); let dy = ((ty - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw += dy * Math.min(1, dt * 3); } }
    if (dx || dz) { const p = cam.position; if (!blocked(p.x + dx, p.z)) p.x += dx; else if (walkTo) walkTo = null; if (!blocked(p.x, p.z + dz)) p.z += dz; else if (walkTo) walkTo = null; }
  }
  function teleport(stand, look) {
    const v = new THREE.Vector3().subVectors(look, stand), yb0 = Math.atan2(-v.x, -v.z); let yb = yb0; while (yb - yaw > Math.PI) yb -= Math.PI * 2; while (yb - yaw < -Math.PI) yb += Math.PI * 2;
    tween = { a: cam.position.clone(), b: stand.clone(), ya: yaw, yb, pa: pitch, pb: Math.atan2(look.y - stand.y, Math.hypot(v.x, v.z)) * 0.8, t: 0, dur: Math.min(1.6, 0.5 + cam.position.distanceTo(stand) / 12) }; walkTo = null;
  }

  // ---------- pick up / inspect ----------
  const backCanvas = t => canvasTex(512, 768, (g, W, H) => {
    g.fillStyle = "#f4efe6"; g.fillRect(0, 0, W, H); g.fillStyle = "#1a1030"; g.fillRect(0, 0, W, 90); g.fillStyle = "#fff"; g.font = "bold 34px sans-serif"; g.textAlign = "left"; wrap(g, t.title, 24, 55, W - 48, 36, 1);
    g.fillStyle = "#333"; g.font = "22px sans-serif"; g.fillText(`${t.year || "—"} · ${t.type === "series" ? "Series" : "Movie"} · ${t.language}`, 24, 130); g.fillText(t.genres.slice(0, 3).join(" · "), 24, 160);
    g.font = "bold 24px sans-serif"; g.fillText([t.imdbRating ? `IMDb ${t.imdbRating.toFixed(1)}` : "", t.rtScore != null ? `RT ${t.rtScore}%` : ""].filter(Boolean).join("   "), 24, 200);
    g.font = "21px Georgia,serif"; g.fillStyle = "#222"; wrap(g, t.desc || "No description on the back of this box.", 24, 250, W - 48, 28, 15);
    const f = FEAT[t.id]; if (f && f.c && f.c.length) { g.font = "bold 19px sans-serif"; g.fillText("STARRING " + f.c.slice(0, 4).join(", ").toUpperCase(), 24, H - 70, W - 48); }
    g.fillStyle = "#1a1030"; g.fillRect(0, H - 40, W, 40); g.fillStyle = "#ffd23f"; g.font = "bold 18px sans-serif"; g.fillText("BE KIND, REWIND", 24, H - 14);
  });
  function frontTexFor(p) {
    const hv = hiCache.get(p.t.id); if (hv && hv.ok) return hv.tex;
    return canvasTex(192, 288, (g, W, H) => { const src = p.page === "dyn" ? DYN : (pageTex[p.page] && pageTex[p.page].userData.loaded ? pageTex[p.page].image : null); const cs = p.page === "dyn" ? 21 : ATLAS.cols;
      if (src) g.drawImage(src, (p.slot % cs) * 96, Math.floor(p.slot / cs) * 144, 96, 144, 0, 0, W, H); else { g.fillStyle = "#333"; g.fillRect(0, 0, W, H); g.fillStyle = "#fff"; g.font = "bold 20px sans-serif"; g.textAlign = "center"; wrap(g, p.t.title, W / 2, 100, W - 20, 24, 4); } });
  }
  function pickUp(p) {
    if (held) return; if (locked()) document.exitPointerLock(); keys = {}; walkTo = null; tip.hidden = true;
    const front = frontTexFor(p), mats = [M.side, M.side, M.side, M.side, new THREE.MeshBasicMaterial({ map: front }), new THREE.MeshBasicMaterial({ map: backCanvas(p.t) })];
    const mesh = new THREE.Mesh(boxGeo, mats); p.m.decompose(mesh.position, mesh.quaternion, mesh.scale); scene.add(mesh);
    const hide = new THREE.Matrix4().makeScale(0, 0, 0); p.im.setMatrixAt(p.ii, hide); p.im.instanceMatrix.needsUpdate = true; hiPool.forEach(m => { if (m.userData.p === p) m.visible = false; });
    held = { p, mesh, t: 0, dir: 1, flip: 0, flipT: 0, from: { pos: mesh.position.clone(), q: mesh.quaternion.clone() } };
    if (!front.isCanvasTexture) {} else if (p.t.poster) { const v = hiCache.get(p.t.id); if (!v) hiTex(p.t); }
    root.classList.add("inspecting"); renderInsp(); api.getStream(p.t.id).then(() => { if (held && held.p === p) renderInsp(); });
  }
  function putBack() { if (!held || held.dir < 0) return; held.dir = -1; insp.hidden = true; root.classList.remove("inspecting"); }
  function heldTick(dt) {
    if (!held) return; const h = held; h.t = Math.max(0, Math.min(1, h.t + h.dir * dt / 0.45)); const k = h.t < .5 ? 2 * h.t * h.t : 1 - Math.pow(-2 * h.t + 2, 2) / 2;
    const v = hiCache.get(h.p.t.id); if (v && v.ok && h.mesh.material[4].map !== v.tex) { h.mesh.material[4].map = v.tex; h.mesh.material[4].needsUpdate = true; }
    const target = new THREE.Vector3(0, mobile && innerWidth < 700 ? 0.07 : 0, -0.5).applyQuaternion(cam.quaternion).add(cam.position);
    h.flipT += ((h.flip ? 1 : 0) - h.flipT) * Math.min(1, dt * 7);
    const tq = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.flipT * Math.PI + Math.sin(performance.now() / 900) * 0.06 * (1 - h.flipT), 0)));
    h.mesh.position.lerpVectors(h.from.pos, target, k); h.mesh.quaternion.slerpQuaternions(h.from.q, tq, k);
    if (h.t === 1 && insp.hidden && h.dir > 0) insp.hidden = false;
    if (h.t === 0 && h.dir < 0) { scene.remove(h.mesh); h.mesh.material[4].map.isCanvasTexture && h.mesh.material[4].map.dispose(); h.mesh.material[5].map.dispose(); h.p.im.setMatrixAt(h.p.ii, h.p.m); h.p.im.instanceMatrix.needsUpdate = true; held = null; lastLod = 0; if (dirty) { dirty = false; update(lastList); } }
  }
  function renderInsp() {
    if (!held) return; const t = held.p.t, s = api.stOf(t.id), st = api.ST()[t.id], x = api.SCACHE[t.id] || null, f = FEAT[t.id] || {};
    const on = (f.home || []).filter(k => SVC[k]).map(k => `<span class="s3chip" style="--c:${SVC[k][1]}">${SVC[k][0]}</span>`).join("");
    const cast = (x && x.cast && x.cast.length ? x.cast : f.c || []).slice(0, 6);
    $(".s3l", insp).innerHTML = `<h3>${esc(t.title)}</h3><div class="s">${t.year || "—"} · ${t.type === "series" ? "Series" : "Movie"} · ${esc(t.language)}${x && x.runtime ? ` · ${x.runtime} min` : ""}</div><div class="s">${esc(t.genres.join(" · "))}</div>${api.scores(t)}
      <p class="bd">${esc((t.desc || "No description on the back of this box.").slice(0, 520))}${(t.desc || "").length > 520 ? "…" : ""}</p>
      ${f.d && f.d.length ? `<p class="s"><b>Directed by</b> ${esc(f.d.join(", "))}</p>` : ""}${cast.length ? `<p class="s"><b>Starring</b> ${esc(cast.join(", "))}</p>` : ""}${t.source ? `<p class="s"><b>Shelf tag</b> ${esc(t.source)}</p>` : ""}`;
    const askRate = s === "watched" && !(st && st.rating);
    $(".s3r", insp).innerHTML = `<div data-id="${t.id}">${askRate ? `<div class="s3ask">↩️ <b>Returning this one?</b> How was it?</div>` : ""}
      <div class="st">${[["todo", "To watch"], ["watching", "Watching"], ["watched", "Watched ✓"]].map(([k, n]) => `<button data-s="${k}" class="${s === k ? "on" : ""}">${n}</button>`).join("")}</div>
      ${s === "watched" ? `<div class="rate">${Object.entries(api.RT).map(([k, [e, n]]) => `<button data-r="${k}" class="${st && st.rating === k ? "on" : ""}">${e} ${n}</button>`).join("")}</div>` : ""}</div>
      ${on ? `<div class="s3on"><span class="s">Streams on</span> ${on}</div>` : ""}
      <button class="btn acc" data-a="trailer">▶ Trailer</button><button class="btn" data-a="where">📺 Where to stream</button>
      <button class="btn" data-a="flip">↻ ${held.flip ? "Front cover" : "Back cover"}</button><button class="btn" data-a="back">Put it back</button>`;
  }
  insp.addEventListener("click", e => {
    if (e.target.closest(".st button,.rate button")) { api.onCardClick(e); renderInsp(); markDirty(); return; }
    const a = e.target.closest("[data-a]"); if (!a || !held) return; const id = held.p.t.id;
    if (a.dataset.a === "flip") { held.flip = !held.flip; renderInsp(); }
    else if (a.dataset.a === "back") putBack();
    else if (a.dataset.a === "where") api.openDetail(id);
    else if (a.dataset.a === "trailer") api.playTrailer(id);
  });

  // ---------- directory + minimap ----------
  function drawDir() {
    dirEl.innerHTML = `<b>Store directory</b>` + dirEntries.map((d, i) => `<button data-go="${i}"><i style="background:${d.color}"></i>${esc(d.name)} <small>${d.n}</small></button>`).join("") + `<button data-go="door"><i style="background:#43f0b5"></i>Entrance</button>`;
  }
  dirEl.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (!b) return; if (b.dataset.go === "door") teleport(new THREE.Vector3(0, EYE, L.zFront - 1.5), new THREE.Vector3(0, EYE, L.zBack)); else { const d = dirEntries[+b.dataset.go]; teleport(d.stand, d.look); } toggleDir(false); });
  function toggleDir(on) { dirEl.hidden = on === undefined ? !dirEl.hidden : !on; $('[data-a="dir"]', root).setAttribute("aria-expanded", !dirEl.hidden); }
  const mg = mapc.getContext("2d");
  const toMap = (x, z) => { const s = 150 / Math.max(L.W, L.zFront - L.zBack); return [85 + x * s, 85 + (z - (L.zFront + L.zBack) / 2) * s, s]; };
  function drawMap() {
    if (!L) return; mg.clearRect(0, 0 , 170, 170); const [x0, y0, s] = toMap(-L.W / 2, L.zBack), [x1, y1] = toMap(L.W / 2, L.zFront);
    mg.fillStyle = "rgba(20,8,40,.82)"; mg.fillRect(x0, y0, x1 - x0, y1 - y0); mg.strokeStyle = "#7b5cff"; mg.strokeRect(x0, y0, x1 - x0, y1 - y0);
    units.forEach(u => { const dx = Math.cos(u.yaw) * u.len / 2, dz = -Math.sin(u.yaw) * u.len / 2, [a, b] = toMap(u.x - dx, u.z - dz), [c, d] = toMap(u.x + dx, u.z + dz); mg.strokeStyle = u.color; mg.lineWidth = 3; mg.beginPath(); mg.moveTo(a, b); mg.lineTo(c, d); mg.stroke(); });
    const [px, py] = toMap(cam.position.x, cam.position.z); mg.fillStyle = "#fff"; mg.beginPath(); mg.moveTo(px - Math.sin(yaw) * 9, py - Math.cos(yaw) * 9); mg.lineTo(px - Math.sin(yaw + 2.5) * 5, py - Math.cos(yaw + 2.5) * 5); mg.lineTo(px - Math.sin(yaw - 2.5) * 5, py - Math.cos(yaw - 2.5) * 5); mg.fill();
  }
  mapc.addEventListener("click", e => { if (!L) return; const r = mapc.getBoundingClientRect(), mx = (e.clientX - r.left) * 170 / r.width, my = (e.clientY - r.top) * 170 / r.height, [, , s] = toMap(0, 0); const x = (mx - 85) / s, z = (my - 85) / s + (L.zFront + L.zBack) / 2; if (!blocked(x, z)) teleport(new THREE.Vector3(x, EYE, z), new THREE.Vector3(x - Math.sin(yaw), EYE, z - Math.cos(yaw))); else toast("Can't stand inside a shelf — try an aisle"); });
  const toast = m => api.toast(m);

  // ---------- top bar (mirrors the page filters) ----------
  const qEl = $(".s3q", root), tyEl = $(".s3type", root), lgEl = $(".s3lang", root);
  function syncFilters() { qEl.value = $("#q").value; tyEl.value = $("#type").value; lgEl.innerHTML = $("#lang").innerHTML; lgEl.value = $("#lang").value; }
  const mirror = (el, id) => { let h; el.addEventListener("input", () => { clearTimeout(h); h = setTimeout(() => { const t = document.getElementById(id); t.value = el.value; t.dispatchEvent(new Event("input")); }, 350); }); };
  mirror(qEl, "q"); mirror(tyEl, "type"); mirror(lgEl, "lang");
  root.addEventListener("click", e => {
    const sv = e.target.closest("[data-svc]"); if (sv) { const k = sv.dataset.svc; svc.has(k) ? svc.delete(k) : svc.add(k); localStorage.setItem("store3dSvc", JSON.stringify([...svc])); recolor(); return; }
    const a = e.target.closest("[data-a]"); if (!a || a.closest(".s3insp")) return;
    if (a.dataset.a === "exit") api.exit(); else if (a.dataset.a === "enter") enter(); else if (a.dataset.a === "dir") toggleDir();
  });
  function enter() { entered = true; root.classList.remove("entry"); teleport(new THREE.Vector3(0, EYE, L.zFront - 1.6), new THREE.Vector3(0, 1.3, L.zFront - 6)); if (!mobile) setTimeout(() => cv.focus(), 50); }

  // ---------- loop ----------
  let last = performance.now(), frames = 0, fpsT = last, fps = 0, idleA = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!entered && L) { idleA += dt * 0.08; cam.position.set(Math.sin(idleA) * 2.5, EYE, L.zFront - 2.2); yaw = Math.sin(idleA) * 0.35; pitch = 0.02; } else move(dt);
    cam.rotation.set(pitch, yaw, 0); heldTick(dt); lodTick(now); renderer.render(scene, cam);
    if (++frames && now - fpsT > 1000) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; S.fps = fps; if (S.showFps) $(".s3fps", root).textContent = fps + " fps"; drawMap(); } else if (frames % 6 === 0) drawMap();
  }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener("resize", resize);

  // ---------- public ----------
  let lastList = [], lastKey = "", dirty = false, recs = null;
  function markDirty() { dirty = true; }
  function update(list) {
    lastList = list; const key = list.map(t => t.id + api.stOf(t.id)).join(",") + "|" + (recs ? recs.length : "n") + (api.user() ? 1 : 0);
    if (key === lastKey && placements.length) return; if (held) { dirty = true; return; }
    lastKey = key; build(list, recs);
  }
  S.show = async list => {
    if (!visible) { visible = true; root.hidden = false; document.body.classList.add("s3on"); resize(); syncFilters(); renderer.setAnimationLoop(frame); }
    await atlasReady; update(list); root.classList.add("ready");
    if (api.user() && recs === null) api.recs().then(r => { recs = r || []; lastKey = ""; if (visible) update(lastList); });
  };
  S.hide = () => { if (!visible) return; visible = false; if (locked()) document.exitPointerLock(); if (held) { held.dir = -1; held.t = 0.0001; } renderer.setAnimationLoop(null); root.hidden = true; document.body.classList.remove("s3on"); };
  S.refreshRecs = () => { recs = null; };
  S.debug = { cam, scene, renderer, get placements() { return placements; }, pickUp: i => pickUp(placements[i]), enter, teleport: k => { const d = dirEntries.find(e => e.key === k); if (d) { tween = null; cam.position.copy(d.stand); const v = new THREE.Vector3().subVectors(d.look, d.stand); yaw = Math.atan2(-v.x, -v.z); pitch = -0.1; } }, get held() { return held; }, units: () => units };
  S.showFps = /[?&]fps=1/.test(location.search);
  return S;
}
