// Walk-in 3D video store (three.js). Mounted by app.js when the "Video store" view is on.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js";

const BW = 0.2, BH = 0.3, BD = 0.04, PITCH = 0.235, ROWS = 5, ROW_Y = [0.28, 0.68, 1.08, 1.48, 1.88], FILL = [2, 3, 1, 4, 0];
const EYE = 1.6, CEIL = 3.3, SPEED = 3.0, LEN = 7.05, HOLD_D = 0.5, HOLD_S = 1.3;
const MINE = ["netflix", "prime", "disney", "paramount"];
const SCOL = { netflix: "#e50914", prime: "#00a8e1", disney: "#113ccf", paramount: "#0064ff", max: "#002be7", hulu: "#1ce783", peacock: "#111111", appletv: "#222222", tubi: "#fa382f", jiohotstar: "#0f1b6b", youtube: "#ff0000", plex: "#e5a00d", roku: "#6f1ab1", crave: "#0057b8", stan: "#0072ce", skygo: "#0a4fd0", nowtvcinema: "#00818a", mubi: "#001489", sonyliv: "#e4002b" };
const CTRY = { US: ["🇺🇸", "United States"], GB: ["🇬🇧", "United Kingdom"], CA: ["🇨🇦", "Canada"], IN: ["🇮🇳", "India"], AU: ["🇦🇺", "Australia"], FR: ["🇫🇷", "France"] };
const ARR = [["popular", "Most popular"], ["rating", "IMDb rating"], ["rt", "Rotten Tomatoes"], ["new", "Newest first"], ["old", "Oldest first"], ["az", "A – Z"]];
const STC = { todo: 0xff3b5c, watching: 0xffb020, watched: 0x22c55e };
const I = { // inline icons
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  view: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke-width="2.8"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c.8-4.5 4.3-7 8.5-7s7.7 2.5 8.5 7z"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="13" rx="2"/><path d="M8 21h8" stroke-width="2.4"/></svg>',
  cursor: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.6L10 19z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="5.5" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" stroke-width="2" fill="none"/></svg>',
};

export function supported() {
  try { const c = document.createElement("canvas"); return !!(window.WebGL2RenderingContext && c.getContext("webgl2")) || !!c.getContext("webgl"); } catch (_) { return false; }
}

export function mount(api) {
  const S = {}, $ = (s, r = document) => r.querySelector(s), esc = api.esc;
  const mobile = matchMedia("(pointer:coarse)").matches;
  // ---------- settings ----------
  const guessCC = () => { const r = (navigator.language || "").split("-")[1]; const m = { UK: "GB" }[r] || r; return CTRY[m] ? m : "US"; };
  let CFG = (() => { try { return JSON.parse(localStorage.getItem("store3dCfg")); } catch (_) { return null; } })() || { cc: guessCC(), svc: JSON.parse(localStorage.getItem("store3dSvc") || "[]"), arrange: "popular" };
  const saveCfg = () => localStorage.setItem("store3dCfg", JSON.stringify(CFG));
  // "chosen" = the user has restocked at least once (saved on this device, or in user_prefs when signed in) -> don't prompt again
  let chosen = !!localStorage.getItem("store3dCfg"), decided = false;
  const cleanCfg = c => ({ cc: CTRY[c.cc] ? c.cc : "US", svc: (c.svc || []).filter(k => typeof k === "string"), arrange: ARR.some(a => a[0] === c.arrange) ? c.arrange : "popular" });
  CFG = cleanCfg(CFG);
  const svcSummary = () => { const n = CFG.svc.map(k => svcName(k)); return (n.length ? (n.length > 3 ? n.slice(0, 3).join(", ") + ` +${n.length - 3}` : n.join(", ")) : "all services") + " · " + CTRY[CFG.cc][1]; };
  let draft = null; // modal edits before RESTOCK

  // ---------- DOM ----------
  const root = document.createElement("div"); root.id = "s3d"; root.className = "s3d entry";
  root.innerHTML = `<canvas class="s3c" tabindex="0" aria-label="3D video store"></canvas>
  <div class="s3top">
    <button class="btn s3back" data-a="exit" title="Leave the store">▦ Back to grid view</button>
    <button class="btn" data-a="dir" aria-expanded="false">🗺️ Aisles</button>
    <select class="s3type" aria-label="Type"><option value="all">All</option><option value="movie">Movies</option><option value="series">Series</option></select>
    <select class="s3lang" aria-label="Language"></select>
  </div>
  <nav class="s3icons" aria-label="Store controls">
    <button data-a="exit" title="Home — back to grid view" aria-label="Home">${I.home}</button>
    <button data-a="to2d" title="Switch to the flat shelf view" aria-label="Flat shelf view">${I.view}</button>
    <button data-a="search" title="Find a title" aria-label="Search" aria-expanded="false">${I.search}</button>
    <button data-a="rentals" title="Your rentals (to watch)" aria-label="Watchlist" class="s3wl">${I.list}<b class="s3badge" hidden>0</b></button>
    <button data-a="profile" title="Profile" aria-label="Profile">${I.user}</button>
    <button data-a="services" title="Your services" aria-label="Your services">${I.tv}</button>
  </nav>
  <div class="s3pop s3find" hidden><input type="search" placeholder="Find a title on the shelves…" aria-label="Find a title"><div class="s3res"></div></div>
  <div class="s3pop s3prof" hidden></div>
  <div class="s3dir" hidden></div>
  <canvas class="s3map" width="170" height="170" title="Store map — click to walk there"></canvas>
  <div class="s3ctx" hidden>${I.cursor}<span></span></div>
  <div class="s3reticle"></div>
  <div class="s3hc" hidden></div>
  <div class="s3help">Drag to look · click the floor to walk · <b>WASD</b>/arrows · click a case to pick it up · <b>L</b> locks the mouse</div>
  <div class="s3joy" aria-hidden="true"><div class="s3knob"></div></div>
  <div class="s3float" hidden></div>
  <button class="s3chev l" data-a="prev" aria-label="Previous case on the shelf" hidden>‹</button><button class="s3chev r" data-a="next" aria-label="Next case on the shelf" hidden>›</button>
  <aside class="s3watch" hidden></aside>
  <div class="s3info" hidden></div>
  <div class="s3modal"><div class="bbx" role="dialog" aria-modal="true" aria-label="Your services">
    <button class="bbx-x" data-a="mclose" aria-label="Close">×</button>
    <h2>YOUR SERVICES</h2><p class="bb-sub">Pick what you subscribe to and we'll stock the shelves with what you can watch.</p>
    <label class="bb-cc"><span class="bb-flag"></span><select class="s3cc" aria-label="Country">${Object.entries(CTRY).map(([k, [f, n]]) => `<option value="${k}">${f} ${n}</option>`).join("")}</select></label>
    <div class="bb-grid"></div><div class="bb-note"></div>
    <div class="bb-pills"><button class="pill out" data-a="arrange" aria-expanded="false">ARRANGE ▾</button><button class="pill gold" data-a="restock">RESTOCK</button></div>
    <div class="bb-arr" hidden>${ARR.map(([k, n]) => `<button data-arr="${k}">${n}</button>`).join("")}</div>
    <button class="link" data-a="exit">▦ Back to grid view</button>
  </div></div>
  <div class="s3load">Stocking the shelves…</div>`;
  document.body.appendChild(root);
  const cv = $(".s3c", root), ctx = $(".s3ctx", root), hc = $(".s3hc", root), mapc = $(".s3map", root), dirEl = $(".s3dir", root);
  const watchEl = $(".s3watch", root), infoEl = $(".s3info", root), floatEl = $(".s3float", root);

  // ---------- three ----------
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0816); scene.fog = new THREE.Fog(0x0d0816, 14, 34);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 60); cam.rotation.order = "YXZ"; scene.add(cam);
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1840, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 6, 4); scene.add(dl);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const room = new THREE.Group(), stock = new THREE.Group(); scene.add(room, stock);
  // dimmer behind a held case
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x05030a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  dim.position.z = -0.95; dim.renderOrder = 5; dim.visible = false; cam.add(dim);

  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // yellow sign with blue lettering (video-store style)
  function sign(text, w = 2.4, h = 0.5, sub = "", icon = "") {
    const tex = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#ffe14d"); gr.addColorStop(1, "#f2b900");
      rr(g, 6, 6, W - 12, H - 12, H * 0.16); g.fillStyle = gr; g.fill(); g.lineWidth = Math.max(10, H * 0.07); g.strokeStyle = "#0f2f9e"; g.stroke();
      rr(g, 6 + H * .1, 6 + H * .1, W - 12 - H * .2, H - 12 - H * .2, H * 0.1); g.lineWidth = 3; g.strokeStyle = "#1d4fd8"; g.stroke();
      let fs = Math.min(H * (sub ? 0.46 : 0.58), 160); const font = s => `900 ${s}px "Arial Black",Impact,sans-serif`; g.font = font(fs);
      const full = (icon ? icon + " " : "") + text; while (g.measureText(full).width > W - H * 0.5 && fs > 18) { fs -= 4; g.font = font(fs); }
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#0f2f9e"; g.fillText(full, W / 2, sub ? H * 0.42 : H * 0.53);
      if (sub) { g.font = `800 ${H * 0.17}px system-ui,sans-serif`; g.fillStyle = "#1d3fae"; g.fillText(sub.toUpperCase(), W / 2, H * 0.76); }
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
  }
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  function hang(mesh, x, y, z, ry, w) { // sign + its back + 2 wires to the ceiling
    mesh.position.set(x, y, z); mesh.rotation.y = ry; const b = mesh.clone(); b.rotation.y = ry + Math.PI; stock.add(mesh, b);
    const len = CEIL - y - mesh.geometry.parameters.height / 2; [-1, 1].forEach(s => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.012), wireMat); c.position.set(x + Math.cos(ry) * s * w * 0.4, CEIL - len / 2, z - Math.sin(ry) * s * w * 0.4); stock.add(c); });
  }

  // ---------- data ----------
  let FEAT = {}; const featReady = fetch("features.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => FEAT = j);
  let SERV = { keys: [], svc: {}, alias: {}, t: {} }; const servReady = fetch("services.json").then(r => r.ok ? r.json() : null).catch(() => null).then(j => { if (j) SERV = j; });
  const svcOf = (id, cc = CFG.cc) => { const m = SERV.t[id]; return m && m[cc] ? m[cc].map(i => SERV.keys[i]) : []; };
  const svcName = k => (SERV.svc[k] && SERV.svc[k].n) || k, svcIcon = k => (SERV.svc[k] && SERV.svc[k].i) || "", svcCol = k => SCOL[k] || "#3b4a8f";
  const logo = (k, cls = "lg") => svcIcon(k) ? `<img class="${cls}" src="${esc(svcIcon(k))}" alt="${esc(svcName(k))}" title="${esc(svcName(k))}" loading="lazy">` : `<span class="${cls} txt" style="background:${svcCol(k)}" title="${esc(svcName(k))}">${esc(svcName(k)[0])}</span>`;
  const mySvcFirst = ks => ks.slice().sort((a, b) => (CFG.svc.includes(b) - CFG.svc.includes(a)) || (MINE.indexOf(a) + 1 || 99) - (MINE.indexOf(b) + 1 || 99));
  const logos = (id, max = 3) => { const ks = mySvcFirst(svcOf(id)); return ks.slice(0, max).map(k => logo(k)).join("") + (ks.length > max ? `<span class="lg more">+${ks.length - max}</span>` : ""); };
  const director = t => { const f = FEAT[t.id], x = api.SCACHE[t.id]; return (x && x.director && x.director[0]) || (f && f.d && f.d[0]) || ""; };
  const metaLine = t => [director(t), t.year, t.language].filter(Boolean).map(v => esc(String(v).toUpperCase())).join(" · ");
  let ATLAS = null; const pageTex = [];
  const atlasReady = fetch("atlas/index.json").then(r => r.ok ? r.json() : null).catch(() => null).then(j => { ATLAS = j; return j; });
  const blank = document.createElement("canvas"); blank.width = blank.height = 4; { const g = blank.getContext("2d"); g.fillStyle = "#2a2238"; g.fillRect(0, 0, 4, 4); }
  function getPage(p) {
    if (pageTex[p]) return pageTex[p];
    const t = new THREE.Texture(blank); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.needsUpdate = true; t.userData = { loaded: false, loading: false, idx: p };
    return pageTex[p] = t;
  }
  function loadPage(p) { const t = getPage(p); if (t.userData.loading) return; t.userData.loading = true; const im = new Image(); im.decoding = "async"; im.onload = () => { t.dispose(); t.image = im; t.needsUpdate = true; t.userData.loaded = true; }; im.src = `atlas/${p}.jpg?v=${ATLAS ? ATLAS.pages + "_" + Object.keys(ATLAS.map).length : 0}`; }
  const DYN = document.createElement("canvas"); DYN.width = DYN.height = 2048; const dg = DYN.getContext("2d"); const dynTex = new THREE.CanvasTexture(DYN); dynTex.colorSpace = THREE.SRGBColorSpace;
  const dynSlot = {}; let dynN = 0;
  function dynCell(t) {
    if (t.id in dynSlot) return dynSlot[t.id]; const s = dynN++ % 294; dynSlot[t.id] = s; const x = (s % 21) * 96, y = Math.floor(s / 21) * 144;
    const hue = [...t.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; dg.fillStyle = `hsl(${hue} 45% 22%)`; dg.fillRect(x, y, 96, 144); dg.fillStyle = "#fff"; dg.font = "bold 13px sans-serif"; dg.textAlign = "center";
    wrap(dg, t.title, x + 48, y + 50, 84, 15, 5); dg.font = "11px sans-serif"; dg.fillText(String(t.year || ""), x + 48, y + 128); dynTex.needsUpdate = true;
    if (t.poster) { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { cover(dg, im, x, y, 96, 144); dynTex.needsUpdate = true; }; im.src = smallPoster(t.poster, 200); }
    return s;
  }
  function wrap(g, text, x, y, w, lh, max) { const words = String(text).split(/\s+/); let line = "", n = 0; for (const wd of words) { const tst = line ? line + " " + wd : wd; if (g.measureText(tst).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; if (++n >= max - 1) { line = line + "…"; break; } } else line = tst; } if (line) g.fillText(line, x, y); return y + lh; }
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
    floor: new THREE.MeshLambertMaterial({ map: canvasTex(256, 256, (g, W, H) => { g.fillStyle = "#1b2a6b"; g.fillRect(0, 0, W, H); const cols = ["#f2c200", "#2e6bff", "#c23b8b", "#3fd0c9"]; for (let i = 0; i < 70; i++) { g.fillStyle = cols[i % 4]; g.globalAlpha = .5; const x = Math.random() * W, y = Math.random() * H, r = 3 + Math.random() * 9; g.beginPath(); if (i % 3) g.arc(x, y, r, 0, 7); else g.rect(x, y, r * 1.6, r * .5); g.fill(); } }) }),
    wall: new THREE.MeshLambertMaterial({ color: 0x1a2350 }), ceil: new THREE.MeshLambertMaterial({ color: 0x1a1a24 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4426 }), board: new THREE.MeshLambertMaterial({ color: 0x141a33 }), side: new THREE.MeshLambertMaterial({ color: 0x121016 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false, fog: false }), desk: new THREE.MeshLambertMaterial({ color: 0x0f2f9e }), endcap: new THREE.MeshLambertMaterial({ color: 0x0f2f9e }),
  };
  M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping;
  let L = null; const colliders = [];
  function buildRoom(W, zBack, zFront) {
    room.clear(); colliders.length = 0;
    const D = zFront - zBack, cz = (zFront + zBack) / 2;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, cz); fl.material.map.repeat.set(W / 2, D / 2); fl.name = "floor"; room.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceil); ce.rotation.x = Math.PI / 2; ce.position.set(0, CEIL, cz); room.add(ce);
    const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, CEIL), M.wall); m.position.set(x, CEIL / 2, z); m.rotation.y = ry; room.add(m); };
    wall(W, 0, zBack, 0); wall(D, -W / 2, cz, Math.PI / 2); wall(D, W / 2, cz, -Math.PI / 2);
    wall(W / 2 - 1.2, -(W / 4 + 0.6), zFront, Math.PI); wall(W / 2 - 1.2, W / 4 + 0.6, zFront, Math.PI);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .35 })); door.position.set(0, 1.3, zFront - .01); door.rotation.y = Math.PI; door.name = "door"; room.add(door);
    const ex = sign("EXIT ▸ GRID VIEW", 1.7, .34); ex.position.set(0, 2.85, zFront - .03); ex.rotation.y = Math.PI; ex.name = "door"; room.add(ex);
    // BE KIND / PLEASE REWIND by the doors
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(600, 380, (g, Wc, Hc) => {
      rr(g, 8, 8, Wc - 16, Hc - 16, 40); g.fillStyle = "#0f2f9e"; g.fill(); g.lineWidth = 16; g.strokeStyle = "#ffd21f"; g.stroke();
      g.fillStyle = "#ffd21f"; g.textAlign = "center"; g.font = '900 64px "Arial Black",Impact,sans-serif'; g.fillText("BE KIND", Wc / 2, 112);
      g.font = '900 46px "Arial Black",Impact,sans-serif'; g.fillText("PLEASE REWIND", Wc / 2, 330);
      const cx = Wc / 2, cy = 200; g.beginPath(); g.moveTo(cx - 10, cy - 48); g.lineTo(cx - 10, cy + 48); g.lineTo(cx - 92, cy); g.closePath(); g.fill(); g.beginPath(); g.moveTo(cx + 82, cy - 48); g.lineTo(cx + 82, cy + 48); g.lineTo(cx, cy); g.closePath(); g.fill();
    }) }));
    rw.position.set(-2.6, 2.05, zFront - 0.03); rw.rotation.y = Math.PI; room.add(rw);
    const rw2 = rw.clone(); rw2.position.x = 2.6; room.add(rw2);
    const lg = new THREE.PlaneGeometry(1.2, .6), lights = new THREE.InstancedMesh(lg, M.light, Math.ceil(W / 3) * Math.ceil(D / 3)); let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let x = -W / 2 + 1.5; x < W / 2; x += 3) for (let z = zBack + 1.5; z < zFront; z += 3) lights.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, CEIL - .01, z), q, new THREE.Vector3(1, 1, 1)));
    lights.count = n; room.add(lights);
  }
  // floor waypoint marker: translucent square, 4 arrows, yellow centre dot
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: canvasTex(256, 256, (g, W) => {
    rr(g, 18, 18, W - 36, W - 36, 26); g.fillStyle = "rgba(160,190,255,.16)"; g.fill(); g.lineWidth = 7; g.strokeStyle = "rgba(225,235,255,.85)"; g.stroke();
    g.fillStyle = "rgba(235,240,255,.9)"; const c = W / 2; [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => { g.save(); g.translate(c + dx * 70, c + dy * 70); g.rotate(Math.atan2(dy, dx)); g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -14); g.lineTo(-8, 14); g.closePath(); g.fill(); g.restore(); });
    g.beginPath(); g.arc(c, c, 17, 0, 7); g.fillStyle = "#ffd21f"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#7a5b00"; g.stroke();
  }) }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 2; scene.add(marker);

  // ---------- stock / layout ----------
  let placements = [], meshes = [], stickers = null, units = [], dirEntries = [], featured = [], stockList = [];
  const boxGeo = new THREE.BoxGeometry(BW, BH, BD);
  function frontMat(tex) {
    const m = new THREE.MeshBasicMaterial({ map: tex });
    m.onBeforeCompile = s => {
      s.uniforms.uCS = { value: new THREE.Vector2(96 / 2048, 144 / 2048) };
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aCell;\nuniform vec2 uCS;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * uCS + aCell;\n#endif");
    };
    return m;
  }
  const SORT = { popular: (a, b) => (b.saves || 0) - (a.saves || 0) || (b.imdbRating || 0) - (a.imdbRating || 0), rating: (a, b) => (b.imdbRating || 0) - (a.imdbRating || 0), rt: (a, b) => (b.rtScore ?? -1) - (a.rtScore ?? -1), new: (a, b) => (b.year || 0) - (a.year || 0), old: (a, b) => (a.year || 9999) - (b.year || 9999), az: (a, b) => a.title.localeCompare(b.title) };
  function restockList(list) {
    if (!CFG.svc.length) return { list, note: "" };
    const on = list.filter(t => svcOf(t.id).some(k => CFG.svc.includes(k)));
    if (!on.length) return { list, note: "Nothing on those services here — showing everything" };
    return { list: on, note: "" };
  }
  function aisleSets(list, recs) {
    const yr = new Date().getFullYear(), A = {}, srt = SORT[CFG.arrange] || SORT.popular, by = a => a.slice().sort(srt);
    A.staff = by(list.filter(t => t.source && /pick/i.test(t.source)));
    A.newr = list.filter(t => t.year && t.year >= yr - 2).sort((a, b) => (b.year || 0) - (a.year || 0) || srt(a, b));
    A.rent = by(list.filter(t => ["todo", "watching"].includes(api.stOf(t.id))));
    A.ret = list.filter(t => api.stOf(t.id) === "watched").sort((a, b) => (api.ST()[a.id]?.rating ? 1 : 0) - (api.ST()[b.id]?.rating ? 1 : 0));
    A.tv = by(list.filter(t => t.type === "series"));
    const ok = new Set(list.map(t => t.id)); A.fy = (recs || []).map(r => api.BY[r.id]).filter(t => t && ok.has(t.id));
    const gc = {}; list.forEach(t => t.genres.forEach(g => (gc[g] = gc[g] || []).push(t)));
    const bays = Object.keys(gc).filter(g => gc[g].length >= 8).sort((a, b) => gc[b].length - gc[a].length).slice(0, 10).map(g => [g, by(gc[g])]);
    const foreign = list.filter(t => t.language && t.language !== "English" && t.language !== "Unknown");
    if (foreign.length >= 12) bays.push(["Foreign", by(foreign)]);
    const cult = list.filter(t => t.year && t.year <= 2005 && (t.imdbRating || 0) >= 7.2);
    if (cult.length >= 12) bays.push(["Cult Classics", by(cult)]);
    A.genres = bays;
    return A;
  }
  function featTex(t, w = 400) { // large poster for endcaps (lazy, CORS)
    const mat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const set = tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAniso; mat.map = tx; mat.color.set(0xffffff); mat.needsUpdate = true; };
    if (t.poster) { const src = smallPoster(t.poster, w); texLoader.load(src, set, undefined, () => { if (src !== t.poster) texLoader.load(t.poster, set); }); }
    return mat;
  }
  function build(listIn, recs) {
    const rs = restockList(listIn), list = rs.list; stockList = list;
    const A = aisleSets(list, recs), NG = A.genres.length;
    const W = Math.max(16, NG * 3.1 + 4), zBack = -(LEN + 5), zFront = 7; buildRoom(W, zBack, zFront);
    stock.clear(); meshes.forEach(m => m.geometry.dispose()); meshes = []; placements = []; units = []; dirEntries = []; featured = [];
    const planks = [], boards = [];
    const addUnit = (key, name, items, x, z, yaw, len, sub, opts = {}) => {
      const cols = Math.max(1, Math.floor((len - 0.1) / PITCH)), cap = cols * ROWS, it = items.slice(0, cap); if (items.length > cap && !opts.noCapNote) sub = (sub ? sub + " · " : "") + `top ${cap} here`;
      const U = new THREE.Object3D(); U.position.set(x, 0, z); U.rotation.y = yaw; U.updateMatrixWorld(); const mw = U.matrixWorld;
      const u = { key, name, bay: opts.bay || name.toUpperCase(), x, z, yaw, len, items, shown: it.length, mw, ps: [] }; units.push(u);
      boards.push(new THREE.Matrix4().multiplyMatrices(mw, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.1, -0.06), new THREE.Quaternion(), new THREE.Vector3(len, 2.2, 0.04))));
      ROW_Y.forEach(y => planks.push(new THREE.Matrix4().multiplyMatrices(mw, new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0.06), new THREE.Quaternion(), new THREE.Vector3(len, 0.03, 0.28)))));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)), sv = new THREE.Vector3(1, 1, 1);
      it.forEach((t, i) => {
        const row = FILL[Math.floor(i / cols) % ROWS], col = i % cols, lx = -((cols - 1) * PITCH) / 2 + col * PITCH;
        const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ROW_Y[row] + 0.015 + BH / 2, 0.04), tilt, sv);
        const m = new THREE.Matrix4().multiplyMatrices(mw, local), pos = new THREE.Vector3().setFromMatrixPosition(m);
        const p = { t, m, pos, unit: u, nrm: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), row, col }; placements.push(p); u.ps.push(p);
      });
      u.ps.sort((a, b) => (ROW_Y[b.row] - ROW_Y[a.row]) || a.col - b.col); u.ps.forEach((p, i) => p.ui = i);
      if (!opts.noSign) { const s = sign(opts.signText || name.toUpperCase(), Math.min(len * 0.8, 3.2), 0.5, sub); s.position.copy(new THREE.Vector3(0, opts.signY || 2.55, 0.05).applyMatrix4(mw)); s.rotation.y = yaw; stock.add(s); }
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), stand = new THREE.Vector3(x, EYE, z).addScaledVector(fwd, opts.standDist || 1.7);
      if (!opts.noDir) dirEntries.push({ key, name, n: items.length, stand, look: new THREE.Vector3(x, 1.15, z) });
      if (opts.collide !== false) { const half = new THREE.Vector3(len / 2, 0, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw); colliders.push({ x0: x - Math.abs(half.x) - .15, x1: x + Math.abs(half.x) + .15, z0: z - Math.abs(half.z) - .15, z1: z + Math.abs(half.z) + .15 }); }
      return u;
    };
    const zMid = zBack + 2 + LEN / 2 + 0.6;
    const usedF = new Set();
    A.genres.forEach(([g, items], i) => {
      const x = -((NG - 1) * 3.1) / 2 + i * 3.1, bay = g.toUpperCase() + " BAY", sub = `${items.length} titles`;
      const a = addUnit("g-" + g + "-L", g, items.filter((_, k) => k % 2 === 0), x - 0.32, zMid, -Math.PI / 2, LEN, sub, { collide: false, noDir: true, bay });
      addUnit("g-" + g + "-R", g, items.filter((_, k) => k % 2 === 1), x + 0.32, zMid, Math.PI / 2, LEN, sub, { collide: false, noDir: true, bay });
      colliders.push({ x0: x - 0.62, x1: x + 0.62, z0: zMid - LEN / 2 - .45, z1: zMid + LEN / 2 + .45 });
      dirEntries.push({ key: "g-" + g, name: g, n: items.length, stand: new THREE.Vector3(x + 1.5, EYE, zMid + LEN / 2 + 1.2), look: new THREE.Vector3(x + 1.5, 1.2, zMid - LEN / 2) });
      hang(sign(g.toUpperCase(), 2.2, 0.5, sub), x, 2.75, zMid + LEN / 2 + 0.25, 0, 2.2);
      // endcaps with large featured posters (front & back)
      const fp = () => { const t = items.find(t => !usedF.has(t.id)) || items[0]; if (t) usedF.add(t.id); return t; };
      [[1, fp()], [-1, fp()]].forEach(([s, t]) => {
        if (!t) return; const zc = zMid + s * (LEN / 2 + 0.17);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.24, 2.15, 0.3), M.endcap); cap.position.set(x, 1.075, zc); stock.add(cap);
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.38), featTex(t)); pm.position.set(x, 1.22, zc + s * 0.152); pm.rotation.y = s > 0 ? 0 : Math.PI; stock.add(pm);
        const lab = sign("FEATURED", 0.92, 0.2); lab.position.set(x, 0.32, zc + s * 0.153); lab.rotation.y = pm.rotation.y; stock.add(lab);
        const m = new THREE.Matrix4().compose(pm.position.clone().add(new THREE.Vector3(0, 0, s * 0.03)), pm.quaternion.clone(), new THREE.Vector3(1, 1, 1));
        featured.push({ mesh: pm, p: { t, m, pos: pm.position.clone(), unit: a, nrm: new THREE.Vector3(0, 0, s), ui: -1, feat: true } });
      });
    });
    const wl = Math.min(W - 2, 24);
    addUnit("newr", "New Releases", A.newr, 0, zBack + 0.12, 0, wl, `${A.newr.length} titles`, { standDist: 2.6, noSign: true, bay: "NEW RELEASES WALL" });
    hang(sign("NEW RELEASES", 3.2, 0.62, `${A.newr.length} titles`), 0, 2.6, zBack + 0.9, 0, 3.2);
    addUnit("staff", "Staff Picks", A.staff, -W / 2 + 0.12, zMid, Math.PI / 2, LEN, "Poojith & friends recommend", { standDist: 1.6 });
    addUnit("tv", "TV Box Sets", A.tv, W / 2 - 0.12, zMid, -Math.PI / 2, LEN, `${A.tv.length} series`, { standDist: 1.6 });
    addUnit("rent", "Your Rentals", A.rent, -W / 2 + 0.12, zFront - 3.2, Math.PI / 2, 4.6, A.rent.length ? "to watch & watching" : "mark titles To watch", { standDist: 1.6 });
    const nUnr = A.ret.filter(t => !api.ST()[t.id]?.rating).length;
    addUnit("ret", "Returns", A.ret, W / 2 - 0.12, zFront - 3.2, -Math.PI / 2, 4.6, A.ret.length ? (nUnr ? `${nUnr} waiting for your rating` : "all rated — thanks!") : "watched titles land here", { standDist: 2.4, bay: "RETURNS COUNTER" });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 3.2), M.desk); desk.position.set(W / 2 - 1.6, 0.5, zFront - 3.2); stock.add(desk); colliders.push({ x0: W / 2 - 2.15, x1: W / 2, z0: zFront - 4.95, z1: zFront - 1.45 });
    const dtop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 3.3), M.wood); dtop.position.set(W / 2 - 1.6, 1.02, zFront - 3.2); stock.add(dtop);
    const fyItems = A.fy.length ? A.fy : list.filter(t => t.imdbRating).sort((a, b) => (b.imdbRating * Math.log(2 + (b.saves || 0))) - (a.imdbRating * Math.log(2 + (a.saves || 0)))).slice(0, 40);
    const fyText = api.user() ? (A.fy.length ? "based on your ratings" : (recs === null ? "loading your picks…" : "crowd favourites — rate titles to personalise")) : "crowd favourites — sign in & rate for yours";
    addUnit("fy", "Picked for you", fyItems, 0, zMid + LEN / 2 + 2.6, 0, 4.4, fyText, { signText: "★ PICKED FOR YOU", standDist: 2.2 });
    colliders.push({ x0: -W / 2 - 1, x1: -W / 2 + 0.35, z0: zBack, z1: zFront }, { x0: W / 2 - 0.35, x1: W / 2 + 1, z0: zBack, z1: zFront }, { x0: -W, x1: W, z0: zBack - 1, z1: zBack + 0.35 });
    const plankIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.wood, planks.length); planks.forEach((m, i) => plankIM.setMatrixAt(i, m)); stock.add(plankIM); meshes.push(plankIM);
    const boardIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.board, boards.length); boards.forEach((m, i) => boardIM.setMatrixAt(i, m)); stock.add(boardIM); meshes.push(boardIM);
    const groups = {};
    placements.forEach(p => { const c = ATLAS && ATLAS.map[p.t.id]; const pg = c ? c[0] : "dyn", slot = c ? c[1] : dynCell(p.t); (groups[pg] = groups[pg] || []).push(p); p.page = pg; p.slot = slot; });
    Object.entries(groups).forEach(([pg, ps]) => {
      const tex = pg === "dyn" ? dynTex : getPage(+pg), geo = boxGeo.clone(), cell = new Float32Array(ps.length * 2);
      ps.forEach((p, i) => { const cs = p.page === "dyn" ? 21 : ATLAS.cols, col = p.slot % cs, row = Math.floor(p.slot / cs); cell[i * 2] = col * 96 / 2048; cell[i * 2 + 1] = 1 - (row + 1) * 144 / 2048; });
      geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
      const im = new THREE.InstancedMesh(geo, [M.side, M.side, M.side, M.side, frontMat(tex), M.side], ps.length);
      ps.forEach((p, i) => { im.setMatrixAt(i, p.m); p.im = im; p.ii = i; });
      im.userData = { ps, page: pg }; stock.add(im); meshes.push(im);
    });
    const stPs = placements.filter(p => api.stOf(p.t.id) !== "none");
    stickers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.035), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(1, stPs.length));
    const off = new THREE.Matrix4().makeTranslation(BW / 2 - 0.05, BH / 2 - 0.03, BD / 2 + 0.002), c = new THREE.Color();
    stPs.forEach((p, i) => { stickers.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(p.m, off)); stickers.setColorAt(i, c.setHex(STC[api.stOf(p.t.id)])); }); stickers.count = stPs.length; stock.add(stickers);
    L = { W, zBack, zFront, A, nUnr };
    drawDir(); hiresClear(); badge();
    const svcTxt = CFG.svc.length ? ` on ${CFG.svc.length} service${CFG.svc.length > 1 ? "s" : ""} in ${CTRY[CFG.cc][1]}` : "";
    S.stockNote = `${list.length} titles${svcTxt} · ${NG} bays`;
    if (rs.note) api.toast(rs.note);
  }

  // ---------- lazy textures + LOD ----------
  const hiPool = [], hiCache = new Map(), texLoader = new THREE.TextureLoader(); texLoader.setCrossOrigin("anonymous");
  for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial()); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); hiPool.push(m); }
  function hiresClear() { hiPool.forEach(m => { m.visible = false; m.userData.key = null; }); }
  function hiTex(t) {
    if (hiCache.has(t.id)) { const v = hiCache.get(t.id); hiCache.delete(t.id); hiCache.set(t.id, v); return v.ok ? v.tex : null; }
    if (!t.poster) return null; const v = { ok: false, tex: null }; hiCache.set(t.id, v);
    const ok = tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAniso; v.tex = tx; v.ok = true; }, src = smallPoster(t.poster, 300);
    v.tex = texLoader.load(src, ok, undefined, () => { if (src !== t.poster) v.tex = texLoader.load(t.poster, ok); });
    if (hiCache.size > 60) { const [k, o] = hiCache.entries().next().value; hiCache.delete(k); if (o.tex && !(held && held.p.t.id === k)) o.tex.dispose(); }
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
  let yaw = 0, pitch = -0.05, keys = {}, joy = { x: 0, y: 0 }, walkTo = null, walkName = "", tween = null, entered = false, held = null, visible = false, afterTween = null;
  const locked = () => document.pointerLockElement === cv;
  const typing = e => e.target.closest && e.target.closest("input,select,textarea");
  addEventListener("keydown", e => {
    if (!visible || !entered || typing(e) || document.querySelector("dialog[open]")) return; keys[e.code] = true; if (/^(Arrow|Key[WASD]|Space)/.test(e.code)) e.preventDefault();
    if (e.code === "Escape" && held) putBack(); if (e.code === "KeyL" && !held) { try { cv.requestPointerLock(); } catch (_) {} }
    if (held && e.code === "ArrowLeft") cycle(-1); if (held && e.code === "ArrowRight") cycle(1);
  });
  addEventListener("keyup", e => { keys[e.code] = false; });
  addEventListener("blur", () => keys = {});
  let drag = null, mouse = { x: innerWidth / 2, y: innerHeight / 2, in: false };
  cv.addEventListener("pointerdown", e => { if (!entered) return; drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, moved: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
  cv.addEventListener("pointerleave", () => { mouse.in = false; if (!locked() && !held) { marker.visible = false; setCtx(""); hc.hidden = true; } });
  addEventListener("pointermove", e => {
    if (!visible || !entered) return;
    if (locked()) { yaw -= e.movementX * 0.0022; pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.0022)); return; }
    if (e.target === cv) { mouse = { x: e.clientX, y: e.clientY, in: true }; }
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (held) { held.rotY += dx * 0.011; held.rotX = Math.max(-0.6, Math.min(0.6, held.rotX + dy * 0.006)); }
      else { yaw += dx * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.004)); }
    }
  });
  addEventListener("pointerup", e => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null;
    if (d.moved > 8) return;
    if (held) { if (held.t > 0.5) putBack(); return; }
    if (locked()) { clickAt(innerWidth / 2, innerHeight / 2); return; }
    if (!clickAt(d.sx, d.sy) && !mobile) { try { cv.requestPointerLock(); } catch (_) {} }
  });
  const joyEl = $(".s3joy", root), knob = $(".s3knob", root); let joyId = null;
  joyEl.addEventListener("pointerdown", e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.stopPropagation(); });
  joyEl.addEventListener("pointermove", e => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = () => { joyId = null; joy = { x: 0, y: 0 }; knob.style.transform = ""; }; joyEl.addEventListener("pointerup", joyEnd); joyEl.addEventListener("pointercancel", joyEnd);
  function joyMove(e) { const r = joyEl.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2), l = Math.min(1, Math.hypot(x, y)) / (Math.hypot(x, y) || 1); joy = { x: x * l, y: y * l }; knob.style.transform = `translate(${joy.x * 34}px,${joy.y * 34}px)`; }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); ray.far = 14;
    const boxes = meshes.filter(m => m.userData.ps), fm = featured.map(f => f.mesh);
    const hits = ray.intersectObjects(boxes.concat(fm, room.children.filter(o => o.name === "floor" || o.name === "door"), stock.children.filter(o => o.isMesh && !o.userData.ps && !fm.includes(o))), false);
    for (const h of hits) {
      if (h.object.userData.ps) return h.distance < 5.5 ? { p: h.object.userData.ps[h.instanceId] } : { far: h.point, unit: h.object.userData.ps[h.instanceId].unit };
      const f = featured.find(f => f.mesh === h.object); if (f) return h.distance < 6 ? { p: f.p } : { far: h.point, unit: f.p.unit };
      if (h.object.name === "door") return { door: true, d: h.distance };
      if (h.object.name === "floor") return { floor: h.point };
      if (h.distance > 2.2) { const u = nearestUnit(h.point); if (u && Math.hypot(h.point.x - u.x, h.point.z - u.z) < u.len / 2 + 1) return { far: h.point, unit: u }; }
      return { wall: h.point };
    }
    return null;
  }
  function nearestUnit(pt) {
    let best = null, bd = 1e9; for (const u of units) { const ax = Math.cos(u.yaw), az = -Math.sin(u.yaw), dx = pt.x - u.x, dz = pt.z - u.z, t = Math.max(-u.len / 2, Math.min(u.len / 2, dx * ax + dz * az)), ex = dx - t * ax, ez = dz - t * az, d = ex * ex + ez * ez; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  const walkPoint = pt => { const u = nearestUnit(pt); return { pt: new THREE.Vector3(pt.x, EYE, pt.z), name: u ? u.bay : "" }; };
  function clickAt(cx, cy) {
    const h = pick(cx, cy); if (!h) return false;
    if (h.p) { pickUp(h.p); return true; }
    if (h.door) { if (h.d < 4.5) { api.exit(); return true; } return false; }
    if (h.floor) { const w = walkPoint(h.floor); if (blocked(w.pt.x, w.pt.z)) return true; walkTo = w.pt; walkName = w.name; return true; }
    if (h.far && h.unit) { const d = dirFor(h.unit); teleport(d.stand, d.look, h.unit.bay); return true; }
    return false;
  }
  function dirFor(u) { const fwd = new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw)); const st = new THREE.Vector3(u.x, EYE, u.z).addScaledVector(fwd, 1.3); return { stand: st, look: new THREE.Vector3(u.x, 1.15, u.z) }; }
  function setCtx(text) { if (!text) { ctx.hidden = true; return; } $("span", ctx).textContent = text; ctx.hidden = false; }
  let lastHover = 0;
  function aimTick(now) {
    if (!entered || held) { marker.visible = false; return; }
    if (walkTo || tween) { marker.visible = !!walkTo; if (walkTo) marker.position.set(walkTo.x, 0.012, walkTo.z); setCtx(walkName ? `Walking to ${walkName}` : "Walking…"); hc.hidden = true; return; }
    if (now - lastHover < 80) return; lastHover = now;
    const lk = locked(); if (!lk && (!mouse.in || mobile)) { marker.visible = false; setCtx(""); return; }
    const h = pick(lk ? innerWidth / 2 : mouse.x, lk ? innerHeight / 2 : mouse.y);
    marker.visible = false; cv.style.cursor = "grab";
    if (h && h.p) { const t = h.p.t; setCtx(`Click to look at ${t.title}`); showHover(t); cv.style.cursor = "pointer"; return; }
    hc.hidden = true;
    if (h && h.floor) { const w = walkPoint(h.floor); if (!blocked(w.pt.x, w.pt.z)) { marker.position.set(h.floor.x, 0.012, h.floor.z); marker.visible = true; setCtx(w.name ? `Click to walk to ${w.name}` : "Click to walk here"); cv.style.cursor = "pointer"; return; } }
    if (h && h.far && h.unit) { setCtx(`Click to walk to ${h.unit.bay}`); cv.style.cursor = "pointer"; return; }
    if (h && h.door) { setCtx("Click the doors to leave (back to grid view)"); cv.style.cursor = "pointer"; return; }
    setCtx(lk ? "" : "Drag to look around");
  }
  function showHover(t) {
    hc.innerHTML = `<div class="hcl">${logos(t.id, 3) || `<span class="lg none">not streaming in ${esc(CFG.cc)}</span>`}</div><div class="hct"><b>${esc(t.title.toUpperCase())}</b><span>${metaLine(t)}</span></div>`; hc.hidden = false;
  }
  document.addEventListener("pointerlockchange", () => root.classList.toggle("locked", locked()));

  function blocked(x, z) { for (const c of colliders) if (x > c.x0 - .25 && x < c.x1 + .25 && z > c.z0 - .25 && z < c.z1 + .25) return true; return L ? (x < -L.W / 2 + .4 || x > L.W / 2 - .4 || z < L.zBack + .4 || z > L.zFront - .5) : false; }
  function move(dt) {
    if (tween) { tween.t = Math.min(1, tween.t + dt / tween.dur); const k = tween.t < .5 ? 4 * tween.t ** 3 : 1 - Math.pow(-2 * tween.t + 2, 3) / 2; cam.position.lerpVectors(tween.a, tween.b, k); yaw = tween.ya + (tween.yb - tween.ya) * k; pitch = tween.pa + (tween.pb - tween.pa) * k; if (tween.t >= 1) { tween = null; walkName = ""; const f = afterTween; afterTween = null; if (f) f(); } return; }
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyA) s -= 1; if (keys.KeyD) s += 1;
    if (keys.ArrowLeft) yaw += dt * 1.8; if (keys.ArrowRight) yaw -= dt * 1.8;
    f -= joy.y; s += joy.x;
    const sp = SPEED * (keys.ShiftLeft || keys.ShiftRight ? 1.8 : 1);
    let dx = 0, dz = 0;
    if (f || s) { walkTo = null; walkName = ""; const l = Math.min(1, Math.hypot(f, s)) / (Math.hypot(f, s) || 1); f *= l; s *= l; dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp * dt; dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp * dt; }
    else if (walkTo) { // eased glide: accelerate, then slow down near the waypoint
      const v = tmpV.copy(walkTo).sub(cam.position); v.y = 0; const d = v.length();
      if (d < 0.04) { walkTo = null; walkName = ""; } else { walkTo.v = Math.min((walkTo.v || 0) + dt * 6, sp * 1.4, 0.35 + d * 2.4); const st = Math.min(d, walkTo.v * dt); dx = v.x / d * st; dz = v.z / d * st; }
    }
    if (dx || dz) { const p = cam.position, free = blocked(p.x, p.z); // if we're somehow inside a collider, let us walk out
      if (dx) { if (free || !blocked(p.x + dx, p.z)) p.x += dx; else if (walkTo) walkTo = null; }
      if (dz) { if (free || !blocked(p.x, p.z + dz)) p.z += dz; else if (walkTo) walkTo = null; } }
  }
  function teleport(stand, look, name = "", then = null) {
    const v = new THREE.Vector3().subVectors(look, stand), yb0 = Math.atan2(-v.x, -v.z); let yb = yb0; while (yb - yaw > Math.PI) yb -= Math.PI * 2; while (yb - yaw < -Math.PI) yb += Math.PI * 2;
    tween = { a: cam.position.clone(), b: stand.clone(), ya: yaw, yb, pa: pitch, pb: Math.atan2(look.y - stand.y, Math.hypot(v.x, v.z)) * 0.8, t: 0, dur: Math.min(2.2, 0.7 + cam.position.distanceTo(stand) / 9) }; walkTo = null; walkName = name; afterTween = then;
  }

  // ---------- pick up / inspect ----------
  function barcode(g, x, y, w, h, seed) { let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); g.fillStyle = "#fff"; g.fillRect(x - 8, y - 8, w + 16, h + 34); g.fillStyle = "#000"; let cx = x; while (cx < x + w) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const bw = 1 + (s >>> 28) % 4; if ((s >>> 8) & 1) g.fillRect(cx, y, bw, h); cx += bw + 1; } g.font = "15px monospace"; g.textAlign = "center"; g.fillText(seed.replace(/\D/g, "").padStart(10, "0").replace(/(\d)(\d{5})(\d+)/, "$1 $2 $3"), x + w / 2, y + h + 18); }
  const backCanvas = t => canvasTex(640, 960, (g, W, H) => {
    g.fillStyle = "#f3efe4"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#0f2f9e"; g.fillRect(0, 0, W, 104); g.fillStyle = "#ffd21f"; g.fillRect(0, 104, W, 10);
    g.font = '900 46px "Arial Black",Impact,sans-serif'; g.textAlign = "center"; g.fillText("POOJITH'S VIDEO", W / 2, 70);
    g.textAlign = "left"; g.fillStyle = "#111"; g.font = '900 38px "Arial Black",Impact,sans-serif'; let y = wrap(g, t.title.toUpperCase(), 32, 170, W - 64, 42, 2);
    g.font = "bold 22px system-ui,sans-serif"; g.fillStyle = "#444"; g.fillText(`${t.year || "—"} · ${t.type === "series" ? "SERIES" : "MOVIE"} · ${t.language.toUpperCase()}`, 32, y); y += 30; g.fillText(t.genres.slice(0, 3).join(" / ").toUpperCase(), 32, y); y += 44;
    g.fillStyle = "#0f2f9e"; g.font = '900 24px "Arial Black",Impact,sans-serif'; g.fillText("SYNOPSIS", 32, y); y += 34;
    g.fillStyle = "#222"; g.font = "22px Georgia,serif"; y = wrap(g, t.desc || "No synopsis on the back of this box.", 32, y, W - 64, 29, 11) + 14;
    const f = FEAT[t.id] || {}, x = api.SCACHE[t.id] || {}, cast = (x.cast && x.cast.length ? x.cast : f.c || []).slice(0, 5), dir = (x.director || f.d || [])[0];
    if (cast.length) { g.fillStyle = "#0f2f9e"; g.font = '900 22px "Arial Black",Impact,sans-serif'; g.fillText("STARRING", 32, y); y += 30; g.fillStyle = "#222"; g.font = "bold 20px system-ui,sans-serif"; y = wrap(g, cast.join(" · ").toUpperCase(), 32, y, W - 64, 26, 3) + 8; }
    if (dir) { g.fillStyle = "#555"; g.font = "bold 19px system-ui,sans-serif"; g.fillText("DIRECTED BY " + dir.toUpperCase(), 32, Math.min(y, H - 190)); }
    g.strokeStyle = "#111"; g.lineWidth = 3; g.strokeRect(32, H - 150, 150, 92); g.fillStyle = "#111"; g.font = '900 20px "Arial Black",sans-serif'; g.fillText("IMDb", 48, H - 120); g.font = '900 40px "Arial Black",sans-serif'; g.fillText(t.imdbRating ? t.imdbRating.toFixed(1) : "—", 48, H - 74);
    barcode(g, W - 250, H - 150, 210, 70, t.id);
    g.fillStyle = "#0f2f9e"; g.fillRect(0, H - 42, W, 42); g.fillStyle = "#ffd21f"; g.font = '900 20px "Arial Black",sans-serif'; g.textAlign = "center"; g.fillText("BE KIND · PLEASE REWIND", W / 2, H - 14);
  });
  function frontTexFor(p) {
    const hv = hiCache.get(p.t.id); if (hv && hv.ok) return hv.tex;
    return canvasTex(192, 288, (g, W, H) => { const src = p.page === "dyn" ? DYN : (p.page !== undefined && pageTex[p.page] && pageTex[p.page].userData.loaded ? pageTex[p.page].image : null); const cs = p.page === "dyn" ? 21 : (ATLAS ? ATLAS.cols : 21);
      if (src && p.slot !== undefined) g.drawImage(src, (p.slot % cs) * 96, Math.floor(p.slot / cs) * 144, 96, 144, 0, 0, W, H); else { g.fillStyle = "#333"; g.fillRect(0, 0, W, H); g.fillStyle = "#fff"; g.font = "bold 20px sans-serif"; g.textAlign = "center"; wrap(g, p.t.title, W / 2, 100, W - 20, 24, 4); } });
  }
  const hideInst = p => { if (!p.im) return; p.im.setMatrixAt(p.ii, new THREE.Matrix4().makeScale(0, 0, 0)); p.im.instanceMatrix.needsUpdate = true; hiPool.forEach(m => { if (m.userData.p === p) m.visible = false; }); };
  const showInst = p => { if (!p.im) return; p.im.setMatrixAt(p.ii, p.m); p.im.instanceMatrix.needsUpdate = true; };
  function setHeldTextures(p) { const m = held.mesh.material; if (m[4].map && m[4].map.isCanvasTexture) m[4].map.dispose(); if (m[5].map) m[5].map.dispose(); m[4].map = frontTexFor(p); m[5].map = backCanvas(p.t); m[4].needsUpdate = m[5].needsUpdate = true; if (p.t.poster) hiTex(p.t); }
  function pickUp(p) {
    if (held) return; if (locked()) document.exitPointerLock(); keys = {}; walkTo = null; marker.visible = false; hc.hidden = true; closePops();
    const mats = [M.side, M.side, M.side, M.side, new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const mesh = new THREE.Mesh(boxGeo, mats); mesh.renderOrder = 6; p.m.decompose(mesh.position, mesh.quaternion, mesh.scale); scene.add(mesh);
    held = { p, mesh, t: 0, dir: 1, rotY: 0, rotX: 0, spin: 0, from: { pos: mesh.position.clone(), q: mesh.quaternion.clone() } };
    setHeldTextures(p); hideInst(p); dim.visible = true;
    root.classList.add("inspecting"); setCtx(mobile ? "Drag to turn it around · Tap to put it back" : "Move in 3D  |  Hold + drag to turn it around  |  Click to put it back");
    renderHeld(); api.getStream(p.t.id).then(() => { if (held && held.p === p) { renderHeld(); setHeldTextures(p); } }); api.lists.load().then(() => { if (held && held.p === p) renderWatch(); });
  }
  function cycle(dir) {
    if (!held || held.t < 1) return; const u = held.p.unit; if (!u || !u.ps.length) return;
    const i = held.p.ui < 0 ? (dir > 0 ? 0 : u.ps.length - 1) : (held.p.ui + dir + u.ps.length) % u.ps.length, np = u.ps[i]; if (np === held.p) return;
    showInst(held.p); held.p = np; hideInst(np); held.rotY = 0; held.rotX = 0; held.spin = dir; setHeldTextures(np); renderHeld();
    api.getStream(np.t.id).then(() => { if (held && held.p === np) { renderHeld(); setHeldTextures(np); } });
  }
  function putBack() { if (!held || held.dir < 0) return; held.dir = -1; held.rotY = 0; held.rotX = 0; [watchEl, infoEl, floatEl].forEach(e => e.hidden = true); root.querySelectorAll(".s3chev").forEach(b => b.hidden = true); root.classList.remove("inspecting"); setCtx(""); }
  function heldTick(dt) {
    if (!held) return; const h = held; h.t = Math.max(0, Math.min(1, h.t + h.dir * dt / 0.5)); const k = h.t < .5 ? 2 * h.t * h.t : 1 - Math.pow(-2 * h.t + 2, 2) / 2;
    const v = hiCache.get(h.p.t.id); if (v && v.ok && h.mesh.material[4].map !== v.tex) { if (h.mesh.material[4].map && h.mesh.material[4].map.isCanvasTexture) h.mesh.material[4].map.dispose(); h.mesh.material[4].map = v.tex; h.mesh.material[4].needsUpdate = true; }
    const small = innerWidth < 760, target = new THREE.Vector3(small ? 0 : -0.03, small ? 0.1 : 0.01, small ? -0.66 : -HOLD_D).applyQuaternion(cam.quaternion).add(cam.position);
    h.spin *= Math.pow(0.02, dt); const mx = drag || mobile ? 0 : (mouse.x / innerWidth - 0.5), my = drag || mobile ? 0 : (mouse.y / innerHeight - 0.5);
    h.ry = (h.ry ?? 0) + ((h.rotY + mx * 0.5 + h.spin * 1.2) - (h.ry ?? 0)) * Math.min(1, dt * 10); h.rx = (h.rx ?? 0) + ((h.rotX + my * 0.3) - (h.rx ?? 0)) * Math.min(1, dt * 10);
    const tq = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(h.rx, h.ry, 0)));
    h.mesh.position.lerpVectors(h.from.pos, target, k); h.mesh.quaternion.slerpQuaternions(h.from.q, tq, k); h.mesh.scale.setScalar(1 + (HOLD_S - 1) * k);
    dim.material.opacity = 0.62 * k;
    if (h.t === 1 && h.dir > 0 && watchEl.hidden) { [watchEl, infoEl].forEach(e => e.hidden = false); root.querySelectorAll(".s3chev").forEach(b => b.hidden = false); }
    if (h.t === 1 && h.dir > 0) placeFloat();
    if (h.t === 0 && h.dir < 0) { scene.remove(h.mesh); const m = h.mesh.material; if (m[4].map && m[4].map.isCanvasTexture) m[4].map.dispose(); m[5].map && m[5].map.dispose(); showInst(h.p); held = null; dim.visible = false; lastLod = 0; if (dirty) { dirty = false; update(lastList); } }
  }
  const pv = new THREE.Vector3();
  function placeFloat() { // service icons floating by the case's left edge
    if (!held || !floatEl.innerHTML) { floatEl.hidden = true; return; }
    // anchor to the case's unrotated left edge (camera-space), so the icons don't slide over the box while it spins
    const sc = held.mesh.scale.x, right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    pv.copy(held.mesh.position).addScaledVector(right, -BW / 2 * sc * 1.04).addScaledVector(up, BH / 2 * sc * 0.92).project(cam);
    const x = (pv.x + 1) / 2 * innerWidth, y = (1 - pv.y) / 2 * innerHeight; floatEl.style.transform = `translate(${Math.max(6, Math.round(x - 58))}px,${Math.max(64, Math.round(y))}px)`; floatEl.hidden = false;
  }
  function offersFor(id) { // stream pills for the chosen country, from streaming/<id>.json
    const x = api.SCACHE[id]; if (!x || !x.c) return { ok: id in api.SCACHE, list: [], jw: x && x.jw };
    const m = new Map(); (x.c[CFG.cc] || []).forEach(o => { if (!["subscription", "free", "ads"].includes(o.t)) return; const k = SERV.alias[o.p]; if (!k || m.has(k)) return; m.set(k, o.u || x.jw); });
    return { ok: true, list: mySvcFirst([...m.keys()]).map(k => [k, m.get(k)]), jw: x.jw, rent: (x.c[CFG.cc] || []).some(o => o.t === "rent" || o.t === "buy") };
  }
  function renderHeld() { const ks = mySvcFirst(svcOf(held.p.t.id)); renderWatch(); renderInfo(); floatEl.innerHTML = ks.slice(0, 4).map(k => logo(k, "fl")).join("") + (ks.length > 4 ? `<span class="fl more">+${ks.length - 4}</span>` : ""); }
  function renderInfo() {
    const t = held.p.t; infoEl.innerHTML = `<div class="ib-l">${logos(t.id, 4)}</div><div class="ib-m"><b>${esc(t.title.toUpperCase())}</b><span>${metaLine(t)}</span></div>
      <button class="ib-b" data-a="share" title="Share" aria-label="Share">${I.share}</button><button class="ib-b txt" data-a="details" title="Details & where to stream" aria-label="Details">ⓘ</button>`;
  }
  function renderWatch() {
    if (!held) return; const t = held.p.t, s = api.stOf(t.id), st = api.ST()[t.id], o = offersFor(t.id), ls = api.lists.state();
    const askRate = s === "watched" && !(st && st.rating), ctry = CTRY[CFG.cc][1];
    const pills = o.list.map(([k, u]) => `<a class="wpill" href="${esc(u || o.jw || "#")}" target="_blank" rel="noopener" style="--c:${svcCol(k)}">${logo(k, "wl")}<span>Stream on ${esc(svcName(k))}</span></a>`).join("");
    let listsHtml;
    if (!ls.signedIn) listsHtml = `<p class="s">Sign in to save titles to your own named lists.</p><button class="btn wide" data-a="signin">Sign in</button>`;
    else if (ls.off) listsHtml = `<p class="s note">Lists aren't switched on yet — they'll appear here once the lists table is set up.</p><button class="btn wide" disabled>+ New list…</button>`;
    else if (ls.lists === null) listsHtml = `<p class="s">Loading your lists…</p>`;
    else listsHtml = (ls.lists.length ? `<div class="lrows">${ls.lists.map(l => `<label class="lrow"><input type="checkbox" data-list="${esc(l.id)}" ${l.items.has(t.id) ? "checked" : ""}><span>${esc(l.name)}</span><small>${l.items.size}</small></label>`).join("")}</div>` : `<p class="s">No lists yet.</p>`) +
      `<form class="lnew" hidden><input maxlength="60" placeholder="List name, e.g. Date night" aria-label="New list name" required><button class="btn acc">Create</button></form><button class="btn wide" data-a="newlist">+ New list…</button>`;
    watchEl.innerHTML = `<h4>WATCH IT</h4>
      ${o.ok ? (pills || `<p class="s">Not on a streaming service in ${esc(ctry)}${o.rent ? " — rent or buy options available" : ""}.</p>${o.jw ? `<a class="wpill jw" href="${esc(o.jw)}" target="_blank" rel="noopener"><span>See options on JustWatch ↗</span></a>` : ""}`) : `<p class="s">Checking where to stream…</p>`}
      <button class="wpill tr" data-a="trailer"><span>▶ Watch trailer</span></button>
      <h4>YOUR STATUS</h4>
      <div data-id="${t.id}">${askRate ? `<div class="s3ask">↩️ <b>Returning this one?</b> How was it?</div>` : ""}
      <div class="st">${[["todo", "To watch"], ["watching", "Watching"], ["watched", "Watched ✓"]].map(([k, n]) => `<button data-s="${k}" class="${s === k ? "on" : ""}">${n}</button>`).join("")}</div>
      ${s === "watched" ? `<div class="rate">${Object.entries(api.RT).map(([k, [e, n]]) => `<button data-r="${k}" class="${st && st.rating === k ? "on" : ""}">${e} ${n}</button>`).join("")}</div>` : ""}</div>
      <h4>ADD TO A LIST</h4>${listsHtml}`;
  }
  async function share(t) {
    const url = api.SITE + "?title=" + encodeURIComponent(t.id), data = { title: t.title, text: `${t.title} (${t.year || ""}) — from Poojith's Video Store`, url };
    S.lastShare = url;
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); api.toast("Link copied: " + url); } catch (_) { prompt("Copy this link", url); }
  }
  root.addEventListener("click", async e => {
    if (e.target.closest(".s3watch .st button,.s3watch .rate button")) { api.onCardClick(e); renderWatch(); markDirty(); badge(); return; }
    const cb = e.target.closest("[data-list]"); if (cb && held) { cb.disabled = true; await api.lists.toggle(cb.dataset.list, held.p.t.id, cb.checked); renderWatch(); return; }
    const sv = e.target.closest("[data-svc]"); if (sv) { const k = sv.dataset.svc, s = new Set(draft.svc); s.has(k) ? s.delete(k) : s.add(k); draft.svc = [...s]; drawModal(); return; }
    const ar = e.target.closest("[data-arr]"); if (ar) { draft.arrange = ar.dataset.arr; $(".bb-arr", root).hidden = true; drawModal(); return; }
    const rs = e.target.closest("[data-go-title]"); if (rs) { goToTitle(rs.dataset.goTitle); return; }
    const a = e.target.closest("[data-a]"); if (!a) return; const act = a.dataset.a, t = held && held.p.t;
    if (act === "exit") { closePops(); api.exit(); }
    else if (act === "dir") toggleDir();
    else if (act === "restock") restock();
    else if (act === "mclose") closeModal();
    else if (act === "arrange") { const el = $(".bb-arr", root); el.hidden = !el.hidden; a.setAttribute("aria-expanded", !el.hidden); }
    else if (act === "services") openModal();
    else if (act === "to2d") { closePops(); api.to2D(); }
    else if (act === "search") togglePop($(".s3find", root), a, () => { findIn.value = ""; findRender(""); setTimeout(() => findIn.focus(), 30); });
    else if (act === "profile") { if (!api.user()) { closePops(); api.openAuth(); } else togglePop($(".s3prof", root), a, () => { $(".s3prof", root).innerHTML = `<b>${esc(api.userName())}</b><p class="s">Your statuses, ratings and lists sync to your account.</p><button class="btn wide" data-a="signout">Sign out</button>`; }); }
    else if (act === "signout") { closePops(); await api.signOut(); }
    else if (act === "rentals") { closePops(); if (held) putBack(); const u = units.find(u => u.key === "rent"); if (u) { const d = dirFor(u); teleport(d.stand, d.look, "YOUR RENTALS"); } }
    else if (act === "prev") cycle(-1); else if (act === "next") cycle(1);
    else if (!t) return;
    else if (act === "trailer") api.playTrailer(t.id);
    else if (act === "details") api.openDetail(t.id);
    else if (act === "share") share(t);
    else if (act === "signin") api.openAuth();
    else if (act === "newlist") { const f = $(".lnew", watchEl); f.hidden = false; a.hidden = true; $("input", f).focus(); }
  });
  root.addEventListener("submit", async e => {
    const f = e.target.closest(".lnew"); if (!f || !held) return; e.preventDefault(); const name = $("input", f).value.trim(); if (!name) return;
    $("button", f).disabled = true; const l = await api.lists.create(name, held.p.t.id); if (l) api.toast(`Created “${l.name}” and added ${held.p.t.title}`); renderWatch();
  });

  // ---------- popovers: search / profile ----------
  function closePops() { root.querySelectorAll(".s3pop").forEach(p => p.hidden = true); root.querySelectorAll(".s3icons [aria-expanded]").forEach(b => b.setAttribute("aria-expanded", "false")); }
  function togglePop(el, btn, onOpen) { const open = el.hidden; closePops(); if (open) { el.hidden = false; btn.setAttribute("aria-expanded", "true"); onOpen && onOpen(); } }
  const findIn = $(".s3find input", root), findRes = $(".s3res", root);
  function findRender(q) {
    q = q.trim().toLowerCase(); if (!q) { findRes.innerHTML = `<p class="s">Type a title, actor or genre — we'll walk you to the case.</p>`; return; }
    const seen = new Set(), hits = placements.filter(p => { if (seen.has(p.t.id) || !p.t.blob.includes(q)) return false; seen.add(p.t.id); return true; }).sort((a, b) => (b.t.title.toLowerCase().startsWith(q)) - (a.t.title.toLowerCase().startsWith(q))).slice(0, 8);
    findRes.innerHTML = hits.length ? hits.map(p => `<button data-go-title="${esc(p.t.id)}"><b>${esc(p.t.title)}</b> <small>${p.t.year || ""} · ${esc(p.unit.bay)}</small></button>`).join("") : `<p class="s">Not on the shelves${CFG.svc.length ? " for your services — open Your services and clear them to stock everything" : ""}.</p>`;
  }
  findIn.addEventListener("input", () => findRender(findIn.value));
  findIn.addEventListener("keydown", e => { if (e.key === "Enter") { const b = $("[data-go-title]", findRes); if (b) goToTitle(b.dataset.goTitle); } });
  function goToTitle(id) {
    closePops(); const p = placements.find(q => q.t.id === id); if (!p) return;
    const stand = p.pos.clone().addScaledVector(p.nrm, 1.15); stand.y = EYE; teleport(stand, p.pos, p.t.title.toUpperCase(), () => pickUp(p));
  }

  // ---------- services modal ----------
  function drawModal() {
    const cc = draft.cc, f = CTRY[cc]; $(".bb-flag", root).textContent = f[0]; $(".s3cc", root).value = cc;
    const present = SERV.keys.filter(k => (SERV.svc[k].cnt[cc] || 0) >= 3);
    const head = [...new Set(MINE.concat(draft.svc.filter(k => SERV.svc[k])))], order = head.concat(present.filter(k => !head.includes(k)).sort((a, b) => SERV.svc[b].cnt[cc] - SERV.svc[a].cnt[cc])).slice(0, 24);
    $(".bb-grid", root).innerHTML = order.map(k => { const n = (SERV.svc[k] && SERV.svc[k].cnt[cc]) || 0; return `<button class="bb-s ${draft.svc.includes(k) ? "on" : ""}" data-svc="${k}" aria-pressed="${draft.svc.includes(k)}" title="${esc(svcName(k))} — ${n} titles in ${esc(f[1])}">${logo(k, "bl")}<span>${esc(svcName(k))}</span><small>${n}</small></button>`; }).join("");
    const all = api.list(), n = draft.svc.length ? all.filter(t => (SERV.t[t.id] && SERV.t[t.id][cc] || []).some(i => draft.svc.includes(SERV.keys[i]))).length : all.length;
    const where = api.user() ? (api.prefs.off() ? "Saved on this device (account sync isn't switched on yet)" : "Saved to your account — we won't ask again") : "Saved on this device — sign in to keep them everywhere";
    $(".bb-note", root).innerHTML = `<span class="bb-where">${esc(where)}</span><br>` + (draft.svc.length ? `<b>${n}</b> titles on your services in ${esc(f[1])}` : `No services picked — we'll stock all <b>${n}</b> titles`) + ` · arranged by <b>${esc(ARR.find(a => a[0] === draft.arrange)[1])}</b>`;
    root.querySelectorAll("[data-arr]").forEach(b => b.classList.toggle("on", b.dataset.arr === draft.arrange));
  }
  $(".s3cc", root).addEventListener("change", e => { draft.cc = e.target.value; draft.svc = draft.svc.filter(k => (SERV.svc[k] && SERV.svc[k].cnt[draft.cc]) || MINE.includes(k)); drawModal(); });
  function openModal() { if (held) putBack(); closePops(); if (locked()) document.exitPointerLock(); draft = JSON.parse(JSON.stringify(CFG)); drawModal(); $(".bb-arr", root).hidden = true; root.classList.add("modal"); }
  function closeModal() { root.classList.remove("modal"); if (!entered) enter(); }
  function restock() { CFG = cleanCfg(draft); saveCfg(); chosen = true; api.prefs.save(CFG); root.classList.remove("modal"); lastKey = ""; update(lastList); api.toast(`Restocked: ${S.stockNote}`); if (!entered) enter(); }

  // ---------- directory + minimap + badge ----------
  function badge() { const n = api.todoCount(), b = $(".s3badge", root); b.textContent = n > 99 ? "99+" : n; b.hidden = !n; }
  function drawDir() {
    dirEl.innerHTML = `<b>Store directory</b>` + dirEntries.map((d, i) => `<button data-go="${i}"><i></i>${esc(d.name)} <small>${d.n}</small></button>`).join("") + `<button data-go="door"><i></i>Entrance</button>`;
  }
  dirEl.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (!b) return; if (b.dataset.go === "door") teleport(new THREE.Vector3(0, EYE, L.zFront - 1.5), new THREE.Vector3(0, EYE, L.zBack), "THE ENTRANCE"); else { const d = dirEntries[+b.dataset.go]; teleport(d.stand, d.look, d.name.toUpperCase()); } toggleDir(false); });
  function toggleDir(on) { dirEl.hidden = on === undefined ? !dirEl.hidden : !on; $('[data-a="dir"]', root).setAttribute("aria-expanded", !dirEl.hidden); }
  const mg = mapc.getContext("2d");
  const toMap = (x, z) => { const s = 150 / Math.max(L.W, L.zFront - L.zBack); return [85 + x * s, 85 + (z - (L.zFront + L.zBack) / 2) * s, s]; };
  function drawMap() {
    if (!L) return; mg.clearRect(0, 0, 170, 170); const [x0, y0] = toMap(-L.W / 2, L.zBack), [x1, y1] = toMap(L.W / 2, L.zFront);
    mg.fillStyle = "rgba(10,20,70,.85)"; mg.fillRect(x0, y0, x1 - x0, y1 - y0); mg.strokeStyle = "#ffd21f"; mg.lineWidth = 2; mg.strokeRect(x0, y0, x1 - x0, y1 - y0);
    units.forEach(u => { const dx = Math.cos(u.yaw) * u.len / 2, dz = -Math.sin(u.yaw) * u.len / 2, [a, b] = toMap(u.x - dx, u.z - dz), [c, d] = toMap(u.x + dx, u.z + dz); mg.strokeStyle = u.key.startsWith("g-") ? "#ffd21f" : "#6fa0ff"; mg.lineWidth = 3; mg.beginPath(); mg.moveTo(a, b); mg.lineTo(c, d); mg.stroke(); });
    const [px, py] = toMap(cam.position.x, cam.position.z); mg.fillStyle = "#fff"; mg.beginPath(); mg.moveTo(px - Math.sin(yaw) * 9, py - Math.cos(yaw) * 9); mg.lineTo(px - Math.sin(yaw + 2.5) * 5, py - Math.cos(yaw + 2.5) * 5); mg.lineTo(px - Math.sin(yaw - 2.5) * 5, py - Math.cos(yaw - 2.5) * 5); mg.fill();
  }
  mapc.addEventListener("click", e => { if (!L) return; const r = mapc.getBoundingClientRect(), mx = (e.clientX - r.left) * 170 / r.width, my = (e.clientY - r.top) * 170 / r.height, [, , s] = toMap(0, 0); const x = (mx - 85) / s, z = (my - 85) / s + (L.zFront + L.zBack) / 2; if (!blocked(x, z)) { const w = walkPoint({ x, z }); teleport(w.pt, new THREE.Vector3(x - Math.sin(yaw), EYE, z - Math.cos(yaw)), w.name); } else api.toast("Can't stand inside a shelf — try an aisle"); });

  // ---------- top bar filters (mirror the page filters) ----------
  const tyEl = $(".s3type", root), lgEl = $(".s3lang", root);
  function syncFilters() { tyEl.value = $("#type").value; lgEl.innerHTML = $("#lang").innerHTML; lgEl.value = $("#lang").value; }
  const mirror = (el, id) => el.addEventListener("input", () => { const t = document.getElementById(id); t.value = el.value; t.dispatchEvent(new Event("input")); });
  mirror(tyEl, "type"); mirror(lgEl, "lang");
  function enter() { entered = true; root.classList.remove("entry", "modal"); teleport(new THREE.Vector3(0, EYE, L.zFront - 1.6), new THREE.Vector3(0, 1.3, L.zFront - 6), "THE STORE"); if (!mobile) setTimeout(() => cv.focus(), 50); }

  // ---------- loop ----------
  let last = performance.now(), frames = 0, fpsT = last, idleA = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!entered && L) { idleA += dt * 0.08; cam.position.set(Math.sin(idleA) * 2.5, EYE, L.zFront - 2.2); yaw = Math.sin(idleA) * 0.35; pitch = 0.02; } else move(dt);
    cam.rotation.set(pitch, yaw, 0); cam.updateMatrixWorld(); heldTick(dt); lodTick(now); aimTick(now); renderer.render(scene, cam);
    frames++; if (now - fpsT > 1000) { S.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; if (S.showFps) $(".s3help", root).textContent = S.fps + " fps"; }
    if (frames % 4 === 0) drawMap();
  }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener("resize", resize);

  // ---------- public ----------
  let lastList = [], lastKey = "", dirty = false, recs = null;
  function markDirty() { dirty = true; }
  function update(list) {
    lastList = list; const key = list.map(t => t.id + api.stOf(t.id)).join(",") + "|" + (recs ? recs.length : "n") + (api.user() ? 1 : 0) + JSON.stringify(CFG);
    badge(); if (key === lastKey && placements.length) return; if (held) { dirty = true; return; }
    lastKey = key; build(list, recs);
  }
  S.show = async list => {
    if (!visible) { visible = true; root.hidden = false; document.body.classList.add("s3on"); resize(); syncFilters(); renderer.setAnimationLoop(frame); }
    const decide = !entered && !decided; if (decide) decided = true;
    // signed in: the account's saved services win over this device's (and skip the window if they exist)
    const pp = decide && api.user() ? api.prefs.load() : null;
    await Promise.all([atlasReady, servReady, featReady, pp]);
    if (pp) { const p = await pp; if (p) { CFG = cleanCfg(p); saveCfg(); chosen = true; } }
    update(list); root.classList.add("ready");
    if (decide) { if (chosen && !entered) { enter(); api.toast(`Shelves stocked for ${svcSummary()} — change them with the services icon (top right)`); } else if (!entered) openModal(); }
    else if (root.classList.contains("modal")) drawModal();
    if (api.user() && recs === null) api.recs().then(r => { recs = r || []; lastKey = ""; if (visible) update(lastList); });
  };
  S.hide = () => { if (!visible) return; visible = false; closePops(); if (locked()) document.exitPointerLock(); if (held) putBack(); renderer.setAnimationLoop(null); root.hidden = true; document.body.classList.remove("s3on"); };
  S.refreshRecs = () => { recs = null; };
  S.authChanged = () => { if (held) renderWatch(); badge(); if (root.classList.contains("modal")) drawModal(); };
  S.prefsChanged = p => { // saved services arrived from the account (e.g. signed in while in the store)
    const c = cleanCfg(p), same = JSON.stringify(c) === JSON.stringify(CFG); CFG = c; saveCfg(); chosen = true; if (!visible || !decided) return;
    if (!entered) { if (root.classList.contains("modal")) { root.classList.remove("modal"); lastKey = ""; update(lastList); enter(); api.toast(`Welcome back — shelves stocked for ${svcSummary()}`); } return; }
    if (!same) { if (held) putBack(); lastKey = ""; update(lastList); api.toast(`Restocked with your saved services: ${svcSummary()}`); }
  };
  S.debug = {
    cam, scene, renderer, get placements() { return placements; }, get featured() { return featured; }, pickUp: i => pickUp(typeof i === "number" ? placements[i] : i), enter, units: () => units, cfg: () => CFG, get held() { return held; }, cycle, project: v => v.clone().project(cam),
    teleport: k => { const d = dirEntries.find(e => e.key === k); if (d) { tween = null; cam.position.copy(d.stand); const v = new THREE.Vector3().subVectors(d.look, d.stand); yaw = Math.atan2(-v.x, -v.z); pitch = -0.1; } },
    look: (x, z, y, p) => { tween = null; walkTo = null; cam.position.set(x, EYE, z); yaw = y; pitch = p; }, get chosen() { return chosen; }, get entered() { return entered; }, get walking() { return !!walkTo || !!tween; }, get pos() { return cam.position.clone(); },
  };
  S.showFps = /[?&]fps=1/.test(location.search);
  return S;
}
