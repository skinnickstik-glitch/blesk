// Милые 3D-машинки для услуг детейлинга (процедурные, без внешних моделей).
// Один WebGL-рендерер рисует все карточки через scissor — быстро и на телефоне.
import * as THREE from "./vendor/three.module.min.js";

function roundedBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-9) { off.normalize().multiplyScalar(r); v.copy(c).add(off); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const mat = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; }

// Лицо: глаза с бликами, румянец, улыбка. Возвращает группу и функцию моргания.
function face(scale = 1) {
  const g = new THREE.Group();
  const black = mat(0x1d2433, 0.4), white = new THREE.MeshBasicMaterial({ color: 0xffffff }), pink = mat(0xff8fa3, 0.9);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.075 * scale, 20, 16), black, sx * 0.17 * scale, 0.03 * scale, 0);
    e.scale.z = 0.5;
    const hl = mesh(new THREE.SphereGeometry(0.025 * scale, 10, 8), white, 0.022 * scale, 0.028 * scale, 0.03 * scale);
    e.add(hl); g.add(e); eyes.push(e);
    const b = mesh(new THREE.CircleGeometry(0.055 * scale, 20), pink, sx * 0.29 * scale, -0.07 * scale, 0.005);
    b.material = new THREE.MeshBasicMaterial({ color: 0xff9db0, transparent: true, opacity: 0.75 });
    g.add(b);
  }
  const smile = mesh(new THREE.TorusGeometry(0.07 * scale, 0.018 * scale, 8, 24, Math.PI), black, 0, -0.06 * scale, 0.01);
  smile.rotation.z = Math.PI; g.add(smile);
  return { g, eyes, smile };
}
function arm(color, len = 0.32) {
  const pivot = new THREE.Group();
  const a = mesh(new THREE.CapsuleGeometry(0.055, len, 6, 12), mat(color));
  a.position.y = len / 2 + 0.03; pivot.add(a);
  const hand = mesh(new THREE.SphereGeometry(0.075, 16, 12), mat(color)); hand.position.y = len + 0.08; pivot.add(hand);
  return pivot;
}

const glass = () => new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.1, metalness: 0.2 });
function add(g, o, rx = 0, ry = 0, rz = 0) { o.rotation.set(rx, ry, rz); g.add(o); return o; }
// Базовая машинка: кузов, кабина, стёкла, колёса, фары
function car(c, gloss = false) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: gloss ? 0.18 : 0.55, metalness: gloss ? 0.35 : 0.05 });
  const tyre = mat(0x2b2f38, 0.9), rim = mat(0xd9dee8, 0.3), lamp = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), red = new THREE.MeshBasicMaterial({ color: 0xff5a6a });
  g.add(mesh(roundedBox(2.1, 0.5, 1.0, 0.2), m, 0, 0.5, 0));
  g.add(mesh(roundedBox(1.15, 0.5, 0.9, 0.2), m, -0.12, 0.92, 0));
  g.add(mesh(roundedBox(1.0, 0.36, 0.92, 0.12), glass(), -0.12, 0.95, 0));
  for (const x of [-0.68, 0.68]) for (const z of [-0.47, 0.47]) {
    add(g, mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 24), tyre, x, 0.25, z), Math.PI / 2);
    add(g, mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.17, 16), rim, x, 0.25, z), Math.PI / 2);
  }
  for (const z of [-0.3, 0.3]) { g.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), lamp, 1.04, 0.56, z)); g.add(mesh(new THREE.SphereGeometry(0.06, 12, 10), red, -1.05, 0.56, z)); }
  return { g, m };
}
const base = (g, c, extra = {}) => ({ g, faceAt: [-0.12, 0.92, 0.47], faceScale: 1.0, faceFront: true, armAt: [0.55, 1.0, 0], color: c, ...extra });

const BUILDERS = {
  wash(c = 0x5aa8ff) { // мойка: пена и пузыри
    const { g } = car(c); const foam = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.92 });
    for (const [x, y, z, r] of [[-0.6, 1.25, 0.1, 0.2], [-0.3, 1.3, -0.2, 0.24], [0.1, 1.22, 0.15, 0.18], [0.5, 0.82, 0.2, 0.17], [0.8, 0.8, -0.15, 0.14], [-0.9, 0.82, -0.1, 0.15]])
      g.add(mesh(new THREE.SphereGeometry(r, 16, 12), foam, x, y, z));
    const bub = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, transparent: true, opacity: 0.45 });
    for (const [x, y, z, r] of [[1.2, 1.4, 0.2, 0.1], [0.9, 1.65, -0.1, 0.07], [-1.15, 1.5, 0.1, 0.09], [1.4, 1.05, -0.2, 0.06]]) g.add(mesh(new THREE.SphereGeometry(r, 14, 10), bub, x, y, z));
    return base(g, c);
  },
  polish(c = 0xff6b6b) { // полировка: блеск и искорки
    const { g } = car(c, true); const star = new THREE.MeshBasicMaterial({ color: 0xffd34d });
    for (const [x, y, z, s] of [[0.75, 1.05, 0.35, 0.11], [-0.7, 1.35, 0.2, 0.08], [1.25, 0.95, -0.2, 0.07], [0.2, 1.4, -0.3, 0.06]])
      add(g, mesh(new THREE.OctahedronGeometry(s), star, x, y, z), 0, 0.4, 0.3);
    return base(g, c);
  },
  ceramic(c = 0x3d4b66) { // керамика: защитный купол
    const { g } = car(c, true);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8fe3ff, roughness: 0.05, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    dome.scale.set(1.3, 1.3, 0.85); g.add(dome);
    const gem = new THREE.MeshStandardMaterial({ color: 0x6fe7ff, roughness: 0.1, metalness: 0.3 });
    add(g, mesh(new THREE.OctahedronGeometry(0.12), gem, 0.9, 1.15, 0.3), 0, 0.5, 0);
    return base(g, c, { armAt: [0.55, 1.0, -0.1] });
  },
  interior(c = 0x55c38e) { // химчистка салона: кресло-сиденье рядом
    const { g } = car(c); const seat = mat(0xf0a65a), dark = mat(0x8a5a3c, 0.6);
    g.position.x = -0.25;
    g.add(mesh(roundedBox(0.5, 0.16, 0.5, 0.07), seat, 1.55, 0.35, 0.15));
    add(g, mesh(roundedBox(0.5, 0.6, 0.14, 0.07), seat, 1.75, 0.7, 0.15), 0, 0, -0.25);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.27, 10), dark, 1.55, 0.14, 0.15));
    const sp = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, y] of [[1.4, 0.75], [1.95, 1.15]]) add(g, mesh(new THREE.OctahedronGeometry(0.06), sp, x, y, 0.3), 0, 0.4, 0.3);
    return base(g, c, { faceAt: [-0.37, 0.92, 0.47], armAt: [0.3, 1.0, 0] });
  },
  ppf(c = 0xf4f6fa) { // бронеплёнка: прозрачный лист на капоте
    const { g } = car(c, true);
    const film = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.02, 1.05), new THREE.MeshStandardMaterial({ color: 0x9be7ff, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }));
    film.position.set(0.72, 0.86, 0); film.rotation.z = -0.35; g.add(film);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 1.07), new THREE.MeshBasicMaterial({ color: 0x2f7df6 })); edge.position.set(1.12, 0.72, 0); edge.rotation.z = -0.35; g.add(edge);
    return base(g, 0x9fb4d6);
  },
  glass(c = 0xffc15a) { // антидождь: капли
    const { g } = car(c); const drop = new THREE.MeshStandardMaterial({ color: 0x4fb3ff, roughness: 0.1, transparent: true, opacity: 0.85 });
    for (const [x, y, z] of [[-0.5, 1.55, 0.2], [0, 1.7, -0.1], [0.45, 1.5, 0.25], [-0.95, 1.45, -0.2], [0.9, 1.7, 0]]) { const d = mesh(new THREE.SphereGeometry(0.07, 12, 10), drop, x, y, z); d.scale.y = 1.6; g.add(d); }
    return base(g, c);
  },
};

function makeCharacter(type) {
  const b = BUILDERS[type]();
  const root = new THREE.Group(), body = new THREE.Group();
  body.add(b.g); root.add(body);
  const f = face(b.faceScale); f.g.position.set(...b.faceAt);
  if (b.faceUp) f.g.rotation.x = -Math.PI / 2;
  f.g.position.z += 0.16 * (b.faceUp ? 0 : b.faceFront ? 0 : 1);
  if (b.faceUp) f.g.position.y += 0.01;
  body.add(f.g);
  const a = arm(b.color); a.position.set(...b.armAt); a.rotation.z = -0.5; body.add(a);
  if (b.rotY) root.rotation.y = b.rotY;
  return { root, body, face: f, arm: a, t: Math.random() * 10, blink: 2 + Math.random() * 3 };
}

export function initScenes(opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.id = "gl";
  document.body.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { canvas.remove(); return { refresh() {}, ok: false }; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const views = new Map();
  function viewFor(el) {
    if (views.has(el)) return views.get(el);
    const type = el.dataset.model;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d6f0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 }); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ch = makeCharacter(type); scene.add(ch.root);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const big = true;
    const far = type === "interior" ? 5.4 : 5.0; cam.position.set(0, big ? 2.2 + (far - 4.6) * 0.4 : 1.9, far); cam.lookAt(0, 0.75, 0);
    const v = { scene, cam, ch, el }; views.set(el, v); return v;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.floor(W * renderer.getPixelRatio()) || canvas.height !== Math.floor(H * renderer.getPixelRatio())) renderer.setSize(W, H, false);
    renderer.setScissor(0, 0, W, H); renderer.clear();
    const sheet = document.querySelector(".sheet-wrap");
    document.body.classList.toggle("sheet-open", !!sheet);
    const els = (sheet || document).querySelectorAll("[data-model]");
    for (const [el, v] of views) if (!el.isConnected) { v.scene.traverse(o => { o.geometry?.dispose(); }); views.delete(el); }
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W || r.width === 0) continue;
      const v = viewFor(el); const ch = v.ch;
      ch.t += dt;
      const active = el.classList.contains("active") || el.matches(":hover");
      // покачивание и «дыхание»
      const bob = Math.sin(ch.t * 2.2) * 0.03, sq = 1 + Math.sin(ch.t * 4.4) * 0.015;
      ch.body.position.y = bob + (active ? Math.abs(Math.sin(ch.t * 5)) * 0.12 : 0);
      ch.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      ch.root.rotation.y = (v.baseRot ??= ch.root.rotation.y) + Math.sin(ch.t * 0.8) * 0.18;
      // машет ручкой
      ch.arm.rotation.z = active ? -1.9 + Math.sin(ch.t * 10) * 0.55 : -0.5 + Math.sin(ch.t * 1.7) * 0.15;
      // моргание
      ch.blink -= dt; let s = 1;
      if (ch.blink < 0.12) s = 0.1; if (ch.blink < 0) ch.blink = 2 + Math.random() * 3.5;
      for (const e of ch.face.eyes) e.scale.y = s;
      const h = Math.floor(r.height), w = Math.floor(r.width);
      v.cam.aspect = w / h; v.cam.updateProjectionMatrix();
      renderer.setViewport(r.left, H - r.bottom, w, h);
      renderer.setScissor(r.left, H - r.bottom, w, h);
      renderer.render(v.scene, v.cam);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { ok: true };
}
