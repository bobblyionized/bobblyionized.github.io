/* =====================================================================
   3D WORLD: renderer, rig, lobby (beach house), pads, court, ball, icons
   ===================================================================== */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;      // soft-edged contact shadows rather than hard pixel steps
renderer.shadowMap.autoUpdate = false;                 // refreshed every other frame from the tick
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // filmic roll-off: highlights bloom out softly instead of clipping flat
renderer.toneMappingExposure = 0.85;
const scene = new THREE.Scene();
const SKY = 0x8fd0f5;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 60, 160);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xdff2ff, 0xc9b08a, 0.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 0.7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -26; sun.shadow.camera.right = 26; sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26; sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;   // normalBias keeps the filleted edges free of acne
sun.position.set(14, 26, 10); scene.add(sun); scene.add(sun.target);
const bounce = new THREE.DirectionalLight(0xbcd8ff, 0.2); bounce.castShadow = false; scene.add(bounce);   // cool fill from the shadow side, so shadowed faces stay readable
const SUN_DIR = new THREE.Vector3(0.5, 0.8, -0.3).normalize();
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false })); scene.add(sunMesh);
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false })); scene.add(moonMesh);
function estHours() {   // hours (0-24, fractional) in US Eastern time
  try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date()); const g = t => +(p.find(x => x.type === t) || {}).value || 0; return (g('hour') % 24) + g('minute') / 60 + g('second') / 3600; }
  catch (e) { const d = new Date(); return d.getUTCHours() - 5 + d.getUTCMinutes() / 60; }
}
const DAY_SKY = new THREE.Color(0x8fd0f5), DUSK_SKY = new THREE.Color(0xf3a56b), NIGHT_SKY = new THREE.Color(0x0c1230);
const LIGHT_SCALE = 1.45;   // overall scene shading (balls compensate with emissive so they stay the same brightness)
let isNight = false;
let TOD = 'relative'; try { TOD = localStorage.getItem('vg_tod') || 'relative'; } catch (e) { }
function updateDayNight(force) {
  const h = TOD === 'day' ? 10.5 : TOD === 'night' ? 1 : estHours(); const day = h >= 8 && h < 20; isNight = !day;
  let a, el;
  if (day) { a = (h - 8) / 12 * Math.PI; el = Math.sin(a); }
  else { a = (((h - 20) + 24) % 24) / 12 * Math.PI; el = Math.sin(a); }
  SUN_DIR.set(Math.cos(a) * 0.9, Math.max(0.05, el), -0.35).normalize();   // rises in the east, sets in the west, over the sea side
  bounce.position.set(-SUN_DIR.x * 30, 14, -SUN_DIR.z * 30);                                  // opposite the sun, slightly above
  sunMesh.visible = day; moonMesh.visible = !day; if (typeof applyGymLights === 'function') applyGymLights();
  if (day) {
    sun.intensity = (0.24 + 0.42 * el) * LIGHT_SCALE; sun.color.setHex(el < 0.25 ? 0xffb070 : 0xfff0d0); hemi.intensity = (0.09 + 0.06 * el) * LIGHT_SCALE; hemi.color.setHex(el < 0.25 ? 0xffd0b0 : 0xdff2ff); hemi.groundColor.setHex(0xd8b890);
    bounce.intensity = (0.06 + 0.05 * el) * LIGHT_SCALE; bounce.color.setHex(0xbcd8ff);   // same total light as before, but ~2.2:1 key-to-fill so the new shadows actually read
    const sky = el < 0.25 ? DUSK_SKY.clone().lerp(DAY_SKY, el / 0.25) : DAY_SKY;
    if (S.scene === 'lobby' || (S.match && S.match.map === 'beach')) { scene.background = sky; if (scene.fog) scene.fog.color = sky; }
  } else {
    sun.intensity = 0.07 * LIGHT_SCALE; sun.color.setHex(0x8fa8ff); hemi.intensity = 0.04 * LIGHT_SCALE; bounce.intensity = 0.03 * LIGHT_SCALE; bounce.color.setHex(0x9fb4ff);
    if (S.scene === 'lobby' || (S.match && S.match.map === 'beach')) { scene.background = NIGHT_SKY; if (scene.fog) scene.fog.color = NIGHT_SKY; }
  }
}
setInterval(updateDayNight, 15000);

/* ---- helpers ---- */
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));

/* Rounded box. Same six material groups and UV layout as THREE.BoxGeometry (the jersey number, the face
   and every other per-face texture rely on that), but the edges are filleted and the shoulder normals are
   computed analytically so shading flows across the seams instead of breaking at them.
   Grid lines are placed only where the fillet needs them, so a 12 m wall costs the same as a 20 cm limb. */
const BEVEL = 0.06;                                   // fillet radius as a fraction of the smallest side
function roundedBoxGeo(w, h, d, rr, k = 2) {
  const r = Math.min(rr, w * 0.495, h * 0.495, d * 0.495);
  if (!(r > 1e-4)) return new THREE.BoxGeometry(w, h, d);
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const ax = L => { const lo = -L / 2, hi = L / 2 - r, o = []; for (let i = 0; i <= k; i++) o.push(lo + r * i / k); for (let i = 0; i <= k; i++) o.push(hi + r * i / k); return o; };
  const cx = ax(w), cy = ax(h), cz = ax(d);
  const pos = [], nor = [], uvs = [], idx = [], groups = [], t = [0, 0, 0];
  const plane = (u, v, n, ud, vd, uc, vc, uL, vL, nHalf) => {
    const start = idx.length, base = pos.length / 3, gw = uc.length;
    for (let j = 0; j < vc.length; j++) for (let i = 0; i < gw; i++) {
      t[u] = uc[i] * ud; t[v] = vc[j] * vd; t[n] = nHalf;
      const qx = clamp(t[0], -inner[0], inner[0]), qy = clamp(t[1], -inner[1], inner[1]), qz = clamp(t[2], -inner[2], inner[2]);
      let dx = t[0] - qx, dy = t[1] - qy, dz = t[2] - qz;
      const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
      pos.push(qx + dx * r, qy + dy * r, qz + dz * r); nor.push(dx, dy, dz);
      uvs.push((uc[i] + uL / 2) / uL, 1 - (vc[j] + vL / 2) / vL);
    }
    for (let j = 0; j < vc.length - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = base + i + gw * j, b = base + i + gw * (j + 1), c = base + i + 1 + gw * (j + 1), e = base + i + 1 + gw * j;
      idx.push(a, b, e, b, c, e);
    }
    groups.push([start, idx.length - start]);
  };
  plane(2, 1, 0, -1, -1, cz, cy, d, h, w / 2); plane(2, 1, 0, 1, -1, cz, cy, d, h, -w / 2);    // +x, -x
  plane(0, 2, 1, 1, 1, cx, cz, w, d, h / 2); plane(0, 2, 1, 1, -1, cx, cz, w, d, -h / 2);      // +y, -y
  plane(0, 1, 2, 1, -1, cx, cy, w, h, d / 2); plane(0, 1, 2, -1, -1, cx, cy, w, h, -d / 2);    // +z, -z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); groups.forEach((gr, i) => g.addGroup(gr[0], gr[1], i));
  return g;
}
const GEO_CACHE = new Map();
function boxGeo(w, h, d, rr) {
  const r = rr === undefined ? Math.min(Math.min(w, h, d) * BEVEL, 0.04) : rr;
  const k = Math.min(w, h, d) < 0.7 ? 2 : 1;              // characters and props get a rounder fillet; walls and floors chamfer once
  const key = w + ',' + h + ',' + d + ',' + r.toFixed(4) + ',' + k;
  let g = GEO_CACHE.get(key); if (!g) { g = roundedBoxGeo(w, h, d, r, k); GEO_CACHE.set(key, g); }
  return g;
}
function box(w, h, d, m, x = 0, y = 0, z = 0, parent) { const o = new THREE.Mesh(boxGeo(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || scene).add(o); return o; }
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, parent, seg = 24) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || scene).add(o); return o; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function fitText(g, text, size, maxW, style = '900') { g.font = `${style} ${size}px Montserrat, Arial`; while (g.measureText(text).width > maxW && size > 8) { size -= 2; g.font = `${style} ${size}px Montserrat, Arial`; } return size; }
function textPlane(w, h, text, opts = {}) {
  const tex = canvasTex(opts.pw || 1024, opts.ph || 256, (g, W, H) => {
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, W, H); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, opts.size || 150, W * 0.9);
    g.fillStyle = opts.color || '#fff'; g.fillText(text, W / 2, H / 2);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !opts.bg, side: THREE.DoubleSide }));
}

/* =====================================================================
   RIG  (blocky, Roblox-like, jersey)
   ===================================================================== */
const SKIN = mat(0xf3d1b0), SHOE = mat(0x1a1a1a), HAIR = mat(0xe8cf7a), HAIR_TIP = mat(0x2a5fe0);
const HIP_Y = 0.86, TORSO_H = 0.58, SHOULDER_Y = HIP_Y + TORSO_H - 0.06, HEAD_Y = HIP_Y + TORSO_H;   // human proportions: legs ~half the height
const RIG_SCALE = 0.86;   // ~1.7m tall
const JERSEY = {};
function jerseyTex(variant, face) {
  const dark = variant === 'black'; const base = dark ? '#151515' : '#f5f5f5'; const ink = dark ? '#d9b44a' : '#111'; const trim = dark ? '#7c8f57' : '#d4b45a';
  return canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    if (face === 'front' || face === 'back') {
      g.fillStyle = trim; g.fillRect(0, 0, W, 14); g.fillRect(0, 0, 40, 60); g.fillRect(W - 40, 0, 40, 60);   // collar / shoulders
      g.fillStyle = base; g.beginPath(); g.moveTo(W / 2 - 40, 0); g.lineTo(W / 2 + 40, 0); g.lineTo(W / 2, 34); g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
      g.font = '900 150px Montserrat, Arial'; g.fillText('1', W / 2, H / 2 + 20);
      if (face === 'front') {
        g.font = '800 30px Montserrat, Arial'; g.fillText('vbj', W - 56, 72);
        g.beginPath(); g.arc(52, 74, 20, 0, Math.PI * 2); g.fillStyle = dark ? '#3a4a2a' : '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
        g.beginPath(); g.moveTo(34, 68); g.quadraticCurveTo(52, 60, 70, 68); g.moveTo(40, 88); g.quadraticCurveTo(52, 74, 64, 88); g.stroke();
      }
      g.fillStyle = trim; g.fillRect(0, H - 10, W, 10);
    }
  });
}
let TUX_MATS = null;
function tuxMats() {
  if (TUX_MATS) return TUX_MATS;
  const front = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f7f7f7'; g.beginPath(); g.moveTo(W / 2 - 46, 0); g.lineTo(W / 2 + 46, 0); g.lineTo(W / 2 + 22, H); g.lineTo(W / 2 - 22, H); g.fill();   // shirt front
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(W / 2 - 46, 0); g.lineTo(W / 2 - 10, 60); g.lineTo(W / 2 - 46, 120); g.fill(); g.beginPath(); g.moveTo(W / 2 + 46, 0); g.lineTo(W / 2 + 10, 60); g.lineTo(W / 2 + 46, 120); g.fill();   // lapels
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(W / 2 - 26, 22); g.lineTo(W / 2 - 4, 32); g.lineTo(W / 2 - 26, 42); g.fill(); g.beginPath(); g.moveTo(W / 2 + 26, 22); g.lineTo(W / 2 + 4, 32); g.lineTo(W / 2 + 26, 42); g.fill(); g.fillRect(W / 2 - 5, 27, 10, 10);   // bow tie
    g.fillStyle = '#222'; for (const y of [90, 130, 170, 210]) { g.beginPath(); g.arc(W / 2, y, 4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c9a43a'; g.fillRect(W / 2 - 60, 150, 6, 6);
  });
  const waist = canvasTex(256, 256, (g, W, H) => {                    // the shirt keeps going down the waist, ending in a cummerbund
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f7f7f7'; g.beginPath(); g.moveTo(W / 2 - 22, 0); g.lineTo(W / 2 + 22, 0); g.lineTo(W / 2 + 18, H); g.lineTo(W / 2 - 18, H); g.fill();
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W / 2 - 22, 0); g.lineTo(W / 2 - 18, H); g.lineTo(0, H); g.fill(); g.beginPath(); g.moveTo(W, 0); g.lineTo(W / 2 + 22, 0); g.lineTo(W / 2 + 18, H); g.lineTo(W, H); g.fill();   // jacket fronts
    g.fillStyle = '#222'; for (const y of [30, 80, 130]) { g.beginPath(); g.arc(W / 2, y, 4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#0c0c0c'; g.fillRect(0, 170, W, 60); g.fillStyle = '#1e1e1e'; for (const y of [180, 196, 212]) g.fillRect(0, y, W, 4);   // cummerbund
  });
  const black = mat(0x111111), frontM = mat(0xffffff, { map: front }), waistM = mat(0xffffff, { map: waist });
  return TUX_MATS = { torso: [black, black, black, black, frontM, black], waist: [black, black, black, black, waistM, black], sleeve: black, shorts: mat(0x151515), legs: mat(0x151515), hands: mat(0xf3d1b0) };
}
function jerseyMats(variant) {
  if (JERSEY[variant]) return JERSEY[variant];
  const side = mat(variant === 'black' ? 0x151515 : 0xf5f5f5);
  const front = mat(0xffffff, { map: jerseyTex(variant, 'front') }), back = mat(0xffffff, { map: jerseyTex(variant, 'back') });
  const sleeve = mat(variant === 'black' ? 0x151515 : 0xf5f5f5); const shorts = mat(variant === 'black' ? 0x1c1c1c : 0xffffff);
  return JERSEY[variant] = { torso: [side, side, side, side, front, back], sleeve, shorts };
}
const POSES = {
  idle:        { shL: [0, 0, 3], shR: [0, 0, -3], elL: [-6, 0, 0], elR: [-6, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], knL: [0, 0, 0], knR: [0, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0] },
  jumpUp:      { shL: [-150, 0, 18], shR: [-150, 0, -18], elL: [-40, 0, 0], elR: [-40, 0, 0], hipL: [-10, 0, 0], hipR: [-10, 0, 0], knL: [4, 0, 0], knR: [4, 0, 0], spine: [-6, 0, 0], neck: [-12, 0, 0] },   // take-off: both arms thrown up, legs driven straight
  air:         { shL: [-120, 0, 24], shR: [-168, 0, -28], elL: [-22, 0, 0], elR: [-72, 0, 0], hipL: [34, 0, 0], hipR: [34, 0, 0], knL: [98, 0, 0], knR: [98, 0, 0], spine: [-12, -12, 0], neck: [-6, 8, 0] },   // spike-ready: right arm up with the elbow folded back behind the head, left arm reaching, legs swept back
  airDown:     { shL: [-16, 0, 10], shR: [-22, 0, -8], elL: [-28, 0, 0], elR: [-28, 0, 0], hipL: [12, 0, 0], hipR: [12, 0, 0], knL: [32, 0, 0], knR: [32, 0, 0], spine: [6, 0, 0], neck: [4, 0, 0] },   // falling after the air action is spent: arms down
  land:        { shL: [-38, 0, 14], shR: [-38, 0, -14], elL: [-30, 0, 0], elR: [-30, 0, 0], hipL: [-34, 0, 0], hipR: [-34, 0, 0], knL: [64, 0, 0], knR: [64, 0, 0], spine: [18, 0, 0], neck: [-8, 0, 0] },   // landing crouch
  bump:        { shL: [-60, 0, 3], shR: [-60, 0, -3], elL: [0, 0, 0], elR: [0, 0, 0], hipL: [-28, 0, 0], hipR: [-28, 0, 0], knL: [40, 0, 0], knR: [40, 0, 0], spine: [20, 0, 0], neck: [-12, 0, 0] },
  set:         { shL: [-118, 0, 5], shR: [-118, 0, -5], elL: [-60, 0, 0], elR: [-60, 0, 0], hipL: [-8, 0, 0], hipR: [-8, 0, 0], knL: [14, 0, 0], knR: [14, 0, 0], spine: [-2, 0, 0], neck: [-18, 0, 0] },
  block:       { shL: [-172, 0, 12], shR: [-172, 0, -12], elL: [0, 0, 0], elR: [0, 0, 0], hipL: [-8, 0, 0], hipR: [-8, 0, 0], knL: [16, 0, 0], knR: [16, 0, 0], spine: [-3, 0, 0], neck: [-8, 0, 0] },
  spikeCharge: { shL: [-146, 0, 22], shR: [-178, 0, -26], elL: [-12, 0, 0], elR: [-55, 0, 0], hipL: [42, 0, 0], hipR: [42, 0, 0], knL: [104, 0, 0], knR: [104, 0, 0], spine: [-18, -16, 0], neck: [-14, 6, 0] },   // wind-up: hitting hand drawn further back but still above the shoulder, back arched
  spikeHit:    { shL: [-26, 0, 12], shR: [-52, 0, 20], elL: [-34, 0, 0], elR: [-16, 0, 0], hipL: [-46, 0, 0], hipR: [-46, 0, 0], knL: [22, 0, 0], knR: [22, 0, 0], spine: [26, -6, 0], neck: [12, 0, 0] },   // the swing: hitting arm whipped down and across, torso crunching over it
  tip:         { shL: [-65, 0, 18], shR: [-160, 0, -6], elL: [-25, 0, 0], elR: [-12, 0, 0], hipL: [-18, 0, 0], hipR: [-18, 0, 0], knL: [36, 0, 0], knR: [36, 0, 0], spine: [-3, 0, 0], neck: [-12, 0, 0] },
  dive:        { shL: [-100, 0, 8], shR: [-100, 0, -8], elL: [0, 0, 0], elR: [0, 0, 0], hipL: [6, 0, 0], hipR: [6, 0, 0], knL: [8, 0, 0], knR: [8, 0, 0], spine: [0, 0, 0], neck: [-25, 0, 0] },
  diveL:       { shL: [-20, 0, 95], shR: [-30, 0, 35], elL: [0, 0, 0], elR: [-20, 0, 0], hipL: [-10, 0, 20], hipR: [-25, 0, 5], knL: [20, 0, 0], knR: [45, 0, 0], spine: [0, 0, 12], neck: [0, 0, 20] },
  diveR:       { shL: [-30, 0, -35], shR: [-20, 0, -95], elL: [-20, 0, 0], elR: [0, 0, 0], hipL: [-25, 0, -5], hipR: [-10, 0, -20], knL: [45, 0, 0], knR: [20, 0, 0], spine: [0, 0, -12], neck: [0, 0, -20] },
  diveB:       { shL: [-150, 0, 20], shR: [-150, 0, -20], elL: [-10, 0, 0], elR: [-10, 0, 0], hipL: [-35, 0, 0], hipR: [-35, 0, 0], knL: [55, 0, 0], knR: [55, 0, 0], spine: [-10, 0, 0], neck: [-20, 0, 0] },
  hold:        { shL: [-75, 0, 5], shR: [0, 0, -3], elL: [-12, 0, 0], elR: [-6, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], knL: [0, 0, 0], knR: [0, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0] },
  sit:         { shL: [-28, 0, 12], shR: [-28, 0, -12], elL: [-58, 0, 0], elR: [-58, 0, 0], hipL: [-76, 0, 6], hipR: [-76, 0, -6], knL: [76, 0, 0], knR: [76, 0, 0], spine: [-6, 0, 0], neck: [4, 0, 0] },   // couch sit: thighs forward, shins hanging, hands in the lap
  toss:        { shL: [-160, 0, 8], shR: [-15, 0, -5], elL: [0, 0, 0], elR: [-6, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], knL: [0, 0, 0], knR: [0, 0, 0], spine: [-4, 0, 0], neck: [-16, 0, 0] },
};
const POSE_SNAP = { jumpUp: 22, land: 20, spikeCharge: 26, spikeHit: 32 };   // how hard each pose snaps in; everything else uses the default blend
const faceTex = (skinHex, girl) => canvasTex(128, 128, (g, W, H) => {
  g.fillStyle = skinHex; g.fillRect(0, 0, W, H);
  if (girl) { g.strokeStyle = '#222'; g.lineWidth = 3; g.lineCap = 'round'; for (const cx of [42, 86]) for (const o of [-8, 0, 8]) { g.beginPath(); g.moveTo(cx + o, 44); g.lineTo(cx + o * 1.4, 36); g.stroke(); } g.fillStyle = 'rgba(255,120,150,.35)'; g.beginPath(); g.ellipse(30, 74, 8, 5, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(98, 74, 8, 5, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#222';
  g.beginPath(); g.ellipse(42, 56, 6, 9, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(86, 56, 6, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4c8ce6'; g.beginPath(); g.ellipse(42, 58, 3.5, 5, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(86, 58, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(50, 86); g.quadraticCurveTo(64, 96, 78, 86); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(32, 40); g.lineTo(52, 44); g.moveTo(96, 40); g.lineTo(76, 44); g.stroke();
});
const FACE_TEX = faceTex('#f3d1b0'), FACE_TEX_DARK = faceTex('#6b4a30'), FACE_TEX_GIRL = faceTex('#f3d1b0', true);
const HAIR_BOW = mat(0xff5aa0);
/* ---- emote animations (looping joint overrides) ---- */
function emotePose(id, t, k, tg) {
  const s = Math.sin(t * 10), c = Math.cos(t * 10);
  if (id === 'wave') { if (k === 'shR') tg.set(-160 * D, 0, (-25 + s * 20) * D); if (k === 'elR') tg.set((-20 + c * 15) * D, 0, 0); if (k === 'neck') tg.set(0, -10 * D, 0); }
  else if (id === 'clap') { const o = 0.5 + 0.5 * Math.sin(t * 9); /* 0 = hands apart, 1 = hands together */ if (k === 'shL') tg.set(-72 * D, 0, -(6 + o * 36) * D); if (k === 'shR') tg.set(-72 * D, 0, (6 + o * 36) * D); if (k === 'elL' || k === 'elR') tg.set(-35 * D, 0, 0); if (k === 'neck') tg.set(6 * D, 0, 0); }
  else if (id === 'worm') { const w = Math.sin(t * 6), w2 = Math.sin(t * 6 - 1.2); if (k === 'shL') tg.set((-140 + w * 45) * D, 0, 20 * D); if (k === 'shR') tg.set((-140 - w * 45) * D, 0, -20 * D); if (k === 'elL' || k === 'elR') tg.set((-15 - Math.abs(w) * 40) * D, 0, 0); if (k === 'spine') tg.set(w * 45 * D, 0, 0); if (k === 'hipL' || k === 'hipR') tg.set((20 - w2 * 45) * D, 0, 0); if (k === 'knL' || k === 'knR') tg.set((25 + w2 * 35) * D, 0, 0); if (k === 'neck') tg.set((-40 + w * 30) * D, 0, 0); }
}
function emoteBody(id, t) {
  if (id === 'worm') return { yaw: 0, bob: Math.sin(t * 6) * 0.22, pitch: 1.15 + Math.sin(t * 6 + 0.6) * 0.25 };
  if (id === 'clap') return { yaw: 0, bob: Math.abs(Math.sin(t * 8)) * 0.02, pitch: 0 };
  return { yaw: 0, bob: 0, pitch: 0 };
}
class Rig {
  constructor(variant = 'white', model = 'boy') {
    this.model = model; const girl = model === 'girl';
    this.root = new THREE.Group(); this.root.scale.setScalar(RIG_SCALE);
    this.tilt = new THREE.Group(); this.tilt.position.y = HIP_Y; this.root.add(this.tilt);
    this.body = new THREE.Group(); this.body.position.y = -HIP_Y; this.tilt.add(this.body);
    this.variant = variant; const J = this.j = {};
    const big = variant === 'bigdealer'; const dealer = variant === 'dealer' || big || model === 'dealer'; const tux = model === 'tux';
    const jm = big ? { torso: mat(0xb3242a), sleeve: mat(0xb3242a), shorts: mat(0x1a1a1a) } : dealer ? { torso: mat(0x111111), sleeve: mat(0x111111), shorts: mat(0x1a1a1a) } : tux ? tuxMats() : jerseyMats(variant);
    const joint = (n, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[n] = g; return g; };
    const spine = joint('spine', this.body, 0, HIP_Y, 0);
    const sideM = Array.isArray(jm.torso) ? jm.torso[0] : jm.torso;
    box(girl ? 0.4 : 0.46, 0.3, 0.26, jm.waist || sideM, 0, 0.14, 0, spine);                       // waist / lower torso (the tux shirt continues down it)
    this.torso = box(girl ? 0.52 : 0.6, 0.34, girl ? 0.27 : 0.3, jm.torso, 0, TORSO_H - 0.17, 0, spine);   // chest (jersey front/back)
    const skinM = dealer ? mat(0x6b4a30) : SKIN;
    cyl(0.08, 0.09, 0.1, skinM, 0, TORSO_H + 0.03, 0, spine, 12);                                    // neck
    const neck = joint('neck', spine, 0, TORSO_H + 0.04, 0);
    const skinFace = mat(0xffffff, { map: dealer ? FACE_TEX_DARK : (girl ? FACE_TEX_GIRL : FACE_TEX) });
    const head = new THREE.Mesh(boxGeo(0.36, 0.4, 0.36, 0.025), [skinM, skinM, skinM, skinM, skinFace, skinM]); head.position.y = 0.24; head.castShadow = true; neck.add(head);
    if (dealer) {                                                             // Lil Man Dealer: black cap, shades, hoodie, gold chain
      box(0.4, 0.13, 0.4, mat(0x111111), 0, 0.43, 0, neck); box(0.38, 0.04, 0.2, mat(0x111111), 0, 0.39, 0.27, neck);
      box(0.38, 0.08, 0.05, mat(0x050505), 0, 0.29, 0.19, neck);
      box(big ? 0.34 : 0.28, big ? 0.07 : 0.05, 0.05, mat(0xf5c542), 0, 0.5, 0.15, spine); if (big) box(0.1, 0.1, 0.03, mat(0xf5c542), 0, 0.43, 0.17, spine);   // chain (+ a medallion on the big man)
      box(0.56, 0.14, 0.32, big ? mat(0xb3242a) : mat(0x111111), 0, 0.56, -0.02, spine);          // hood
      if (big) { box(0.3, 0.1, 0.06, mat(0x2a1a10), 0, 0.08, 0.17, neck); box(0.34, 0.06, 0.1, mat(0x2a1a10), 0, 0.12, 0.14, neck); }   // beard
      this.torso.material = jm.torso;
    } else {
    // hair: simple blond cap + bangs, blue tips on the sides (head stays visible)
    const hairM = tux ? mat(0x111111) : HAIR, tipM = tux ? mat(0x111111) : HAIR_TIP;
    box(0.4, 0.12, 0.4, hairM, 0, 0.43, 0, neck);
    box(0.4, 0.1, 0.06, hairM, 0, 0.39, 0.19, neck);
    box(0.06, 0.16, 0.2, tipM, 0.21, 0.32, -0.06, neck); box(0.06, 0.16, 0.2, tipM, -0.21, 0.32, -0.06, neck);
    if (girl) {                                                               // long hair down the back, side strands, bow
      box(0.38, 0.55, 0.12, HAIR, 0, 0.06, -0.22, neck); box(0.26, 0.2, 0.1, HAIR_TIP, 0, -0.26, -0.22, neck);
      box(0.08, 0.42, 0.16, HAIR, 0.22, 0.14, -0.04, neck); box(0.08, 0.42, 0.16, HAIR, -0.22, 0.14, -0.04, neck);
      box(0.08, 0.12, 0.16, HAIR_TIP, 0.22, -0.11, -0.04, neck); box(0.08, 0.12, 0.16, HAIR_TIP, -0.22, -0.11, -0.04, neck);
      box(0.14, 0.1, 0.06, HAIR_BOW, 0.15, 0.47, 0.05, neck); box(0.05, 0.14, 0.06, HAIR_BOW, 0.15, 0.47, 0.05, neck);
    }
    }
    for (const [n, sx] of [['L', 1], ['R', -1]]) {
      const sh = joint('sh' + n, spine, sx * (girl ? 0.32 : 0.36), SHOULDER_Y - HIP_Y, 0);
      box(0.19, 0.13, 0.19, jm.sleeve, 0, -0.03, 0, sh);                                            // shoulder / sleeve cap
      box(0.17, 0.32, 0.17, jm.sleeve, 0, -0.17, 0, sh);                                            // upper arm
      const el = joint('el' + n, sh, 0, -0.33, 0);
      box(0.15, 0.3, 0.15, dealer || tux ? jm.sleeve : SKIN, 0, -0.15, 0, el);                       // forearm
      this['hand' + n] = box(0.13, 0.12, 0.08, skinM, 0, -0.35, 0.01, el);                          // hand
      const hip = joint('hip' + n, this.body, sx * (girl ? 0.14 : 0.13), HIP_Y, 0);
      box(0.23, 0.44, 0.23, jm.shorts, 0, -0.22, 0, hip);                                            // thigh
      const kn = joint('kn' + n, hip, 0, -0.44, 0);
      box(0.19, 0.42, 0.19, dealer || tux ? jm.shorts : SKIN, 0, -0.21, 0, kn);                      // shin
      box(0.21, 0.11, 0.33, SHOE, 0, -0.44, 0.06, kn);                                               // shoe
    }
    this.cur = {}; this.target = {};
    for (const k in J) { this.cur[k] = new THREE.Vector3(); this.target[k] = new THREE.Vector3(); }
    this.anim = 'idle'; this.animUntil = 0; this.base = 'idle'; this.runPhase = 0; this.moveSpeed = 0;
    this.tiltX = 0; this.tiltZ = 0; this.pitch = 0; this.pitchTarget = 0; this.roll = 0; this.rollTarget = 0; this.emote = null; this.emoteT = 0; this.emoteYaw = 0; this.emoteBob = 0;
    this.setPose('idle');
  }
  setPose(name, until = 0) { this.anim = POSES[name] ? name : 'idle'; this.animUntil = until; }
  snap() { for (const k in this.j) { const p = (POSES[this.anim] || POSES.idle)[k] || [0, 0, 0]; this.cur[k].set(p[0] * D, p[1] * D, p[2] * D); this.j[k].rotation.set(this.cur[k].x, this.cur[k].y, this.cur[k].z); } this.pitch = this.pitchTarget; this.roll = this.rollTarget; this.applyTilt(); }
  applyTilt() {
    this.tilt.rotation.x = this.tiltZ * 0.5 + this.pitch;
    this.tilt.rotation.z = this.tiltX * 0.45 + this.roll;                    // lean toward the tilt side (+ dive roll)
    this.tilt.rotation.y = this.emoteYaw;
    const drop = Math.max(Math.sin(Math.abs(this.pitch)), Math.sin(Math.abs(this.roll)));
    this.tilt.position.y = HIP_Y - drop * HIP_Y * 0.7 + this.emoteBob;       // dives: body drops toward the floor
  }
  update(dt, t) {
    if (this.animUntil && t > this.animUntil) { this.anim = this.base; this.animUntil = 0; }
    const pose = POSES[this.anim] || POSES.idle;
    const snap = POSE_SNAP[this.anim] || 14;
    for (const k in this.j) {
      const p = pose[k] || [0, 0, 0]; const tg = this.target[k]; tg.set(p[0] * D, p[1] * D, p[2] * D);
      if (this.anim === 'idle' && this.moveSpeed > 0.5) {         // run cycle: slower, bigger swings
        this.runPhase += dt * 1.7 * Math.min(1, this.moveSpeed / 6);
        const s = Math.sin(this.runPhase), c = -s;
        if (k === 'shL') { tg.x = s * 58 * D; tg.z = 6 * D; } if (k === 'shR') { tg.x = c * 58 * D; tg.z = -6 * D; }
        if (k === 'elL') tg.x = (-35 - Math.max(0, s) * 40) * D; if (k === 'elR') tg.x = (-35 - Math.max(0, c) * 40) * D;
        if (k === 'hipL') tg.x = c * 55 * D; if (k === 'hipR') tg.x = s * 55 * D;
        if (k === 'knL') tg.x = Math.max(0, s) * 75 * D; if (k === 'knR') tg.x = Math.max(0, c) * 75 * D;
        if (k === 'spine') tg.x = 8 * D; if (k === 'neck') tg.x = -6 * D;
      } else if (this.anim === 'idle' && k === 'spine') { tg.x = Math.sin(t * 2) * 1.0 * D; }
      if (this.emote) emotePose(this.emote, this.emoteT, k, tg);
      const cu = this.cur[k]; cu.lerp(tg, Math.min(1, dt * snap));
      this.j[k].rotation.set(cu.x, cu.y, cu.z);
    }
    if (this.emote) { this.emoteT += dt; const e = emoteBody(this.emote, this.emoteT); this.emoteYaw = e.yaw; this.emoteBob = e.bob; this.pitchTarget = e.pitch; } else { this.emoteYaw = 0; this.emoteBob = 0; }
    this.pitch = lerp(this.pitch, this.pitchTarget, Math.min(1, dt * 10)); this.roll = lerp(this.roll, this.rollTarget, Math.min(1, dt * 10));
    this.applyTilt();
  }
  handPos(side, out) { return this['hand' + side].getWorldPosition(out || new THREE.Vector3()); }
}

/* ---- trait boxes (chests) ---- */
const CHEST_TIERS = { 1: { body: 0x8b5a2b, band: 0xcd7f32, glow: 0xffd9a0 }, 2: { body: 0x55636f, band: 0xd0d6dd, glow: 0xd8f0ff }, 3: { body: 0x7a4a10, band: 0xf5c542, glow: 0xfff0a0 } };
function makeChest(tier, open) {
  const c = CHEST_TIERS[tier] || CHEST_TIERS[1]; const g = new THREE.Group();
  const bodyM = mat(c.body), bandM = mat(c.band, { emissive: c.band, emissiveIntensity: tier === 3 ? 0.3 : 0.1 });
  box(1.0, 0.5, 0.64, bodyM, 0, 0.25, 0, g);
  for (const x of [-0.3, 0.3]) box(0.12, 0.52, 0.66, bandM, x, 0.25, 0, g);
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.32); g.add(lid);
  box(1.04, 0.22, 0.66, bodyM, 0, 0.11, 0.32, lid);
  for (const x of [-0.3, 0.3]) box(0.12, 0.24, 0.68, bandM, x, 0.11, 0.32, lid);
  box(0.16, 0.14, 0.05, bandM, 0, 0.06, 0.66, lid);                                              // latch
  if (open) { lid.rotation.x = -1.9; const gl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.55), new THREE.MeshBasicMaterial({ color: c.glow })); gl.position.set(0, 0.49, 0); g.add(gl); }
  g.userData.lid = lid; return g;
}

/* ---- pose icons for the action cards (rendered once) ---- */
const ICONS = {};
function renderPoseIcons() {
  const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r2.setSize(160, 160); r2.outputEncoding = THREE.sRGBEncoding;
  r2.toneMapping = THREE.ACESFilmicToneMapping; r2.toneMappingExposure = 0.95;   // card icons match the world's grade
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, .7); dl.position.set(2, 4, 3); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 20); cam.position.set(1.6, 1.5, 2.9); cam.lookAt(0, 0.85, 0);
  const rig = new Rig('white'); sc.add(rig.root);
  const specs = { bump: {}, set: {}, dive: { pitch: 1.25 }, block: {}, spikeCharge: {}, spikeHit: {}, hold: {}, toss: {}, tip: {} };
  rig.rollTarget = 0;
  for (const name in specs) {
    rig.setPose(name); rig.pitchTarget = specs[name].pitch || 0; rig.pitch = rig.pitchTarget;
    rig.root.position.y = name === 'dive' ? 0.15 : 0; rig.snap();
    r2.render(sc, cam); ICONS[name] = r2.domElement.toDataURL('image/png');
  }
  rig.root.visible = false;
  for (const id of Object.keys(SKINS)) { const bm = makeBallMesh(id); bm.mesh.position.set(0, 0.85, 0); bm.mesh.scale.setScalar(2.2); sc.add(bm.mesh); r2.render(sc, cam); ICONS['skin_' + id] = r2.domElement.toDataURL('image/png'); sc.remove(bm.mesh); }
  ICONS.ball = ICONS.skin_default;
  for (const eid of Object.keys(EMOTES)) { const er = new Rig('white'); er.emote = eid; er.emoteT = eid === 'wave' ? 0.4 : 0.25; er.setPose('idle'); er.update(1, 0); er.snap(); er.update(0.5, 0); sc.add(er.root); r2.render(sc, cam); ICONS['emote_' + eid] = r2.domElement.toDataURL('image/png'); sc.remove(er.root); }
  for (const mid of Object.keys(MODELS)) { const mr = new Rig('white', mid); mr.setPose('idle'); mr.snap(); sc.add(mr.root); r2.render(sc, cam); ICONS['model_' + mid] = r2.domElement.toDataURL('image/png'); sc.remove(mr.root); }
  for (const t of [1, 2, 3]) for (const op of [false, true]) { const ch = makeChest(t, op); ch.position.set(0, 0.42, 0); ch.scale.setScalar(1.2); ch.rotation.y = 0.4; sc.add(ch); r2.render(sc, cam); ICONS[(op ? 'boxopen_' : 'box_') + t] = r2.domElement.toDataURL('image/png'); sc.remove(ch); }
  for (const fid of Object.keys(FXS)) { const g = fxPreview(fid); if (g) sc.add(g); r2.render(sc, cam); ICONS['fx_' + fid] = r2.domElement.toDataURL('image/png'); if (g) sc.remove(g); }
  r2.dispose();
}

/* =====================================================================
   PADS (teleport areas)
   ===================================================================== */
const PADS = {};
function makePad(id, label, cap, x, z, yaw, mode, practice) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
  const redM = mat(0xe23b3b), darkM = mat(0x7a1f1f);
  box(0.8, 3.4, 0.8, redM, 2.6, 1.7, 0, g); box(0.8, 3.4, 0.8, redM, -2.6, 1.7, 0, g);
  box(6.0, 0.7, 0.8, darkM, 0, 3.75, 0, g);
  const tex = canvasTex(1024, 820, () => { });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.7), new THREE.MeshBasicMaterial({ map: tex })); panel.position.set(0, 2.5, -0.2); g.add(panel);
  box(6.0, 5.6, 0.4, mat(0x5a1a1a), 0, 2.7, -0.5, g);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshBasicMaterial({ color: 0xe23b3b, transparent: true, opacity: .3 })); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.02, 2.2); g.add(glow);
  scene.add(g);
  const pad = { id, label, cap, mode, practice, group: g, tex, count: 0, x, z, yaw, panel };
  const fx = Math.sin(yaw), fz = Math.cos(yaw); const cx = x + fx * 2.2, cz = z + fz * 2.2;
  pad.zone = { x1: cx - 2.3, x2: cx + 2.3, z1: cz - 2.3, z2: cz + 2.3 };
  pad.exitPos = new THREE.Vector3(x + fx * 6.2, 0, z + fz * 6.2);
  pad.draw = (count) => {
    pad.count = count;
    const c = tex.image, gg = c.getContext('2d'), W = c.width, H = c.height;
    gg.fillStyle = '#c92f2f'; gg.fillRect(0, 0, W, H); gg.fillStyle = '#e04141'; gg.fillRect(60, 60, W - 120, H - 120);
    gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillStyle = '#fff';
    fitText(gg, label, label.length > 5 ? 150 : 250, W * 0.8); gg.fillText(label, W / 2, H / 2 - 60);
    gg.font = '900 82px Montserrat, Arial'; gg.fillText(`(${count}/${cap} PLAYERS)`, W / 2, H / 2 + 150);
    tex.needsUpdate = true;
  };
  pad.draw(0);
  PADS[id] = pad; return pad;
}

/* =====================================================================
   LOBBY — low-poly beach house
   ===================================================================== */
const lobby = new THREE.Group();
const WALK = []; let INDOOR_COUNT = 0;
const AMBIENT = [];   // little animated things that make the world feel alive
const WIND = new THREE.Vector3();   // m/s, horizontal; identical on every client (derived from server time)
function updateWind() {
  const t = snow() / 1000;
  const ang = t * 0.011 + Math.sin(t * 0.037) * 1.2 + Math.sin(t * 0.0071) * 2.0;
  const str = 1.2 + 1.6 * (0.5 + 0.5 * Math.sin(t * 0.021)) + 0.6 * Math.sin(t * 0.09) + 0.35 * Math.sin(t * 0.6);
  WIND.set(Math.cos(ang) * str, 0, Math.sin(ang) * str);
}
let NPC = null; const NPC_POS = new THREE.Vector3(0, 0.5, 12.2);
let NPC2 = null; const NPC2_POS = new THREE.Vector3(-4.3, 0, 0);   // Big Man Dealer, sitting on the yellow couch
const COLLIDERS = [];   // walls the camera must not pass through
function buildLobby() {
  const wallM = mat(0xf7f1e3), trimM = mat(0xe9dcc3), ceilM = mat(0xfaf6ee);
  const woodM = mat(0xffffff, { map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c9a97c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c4a377' : '#cfae82'; g.fillRect(0, i * 43, w, 41); } }, [10, 10]) });
  const darkWood = mat(0x9c6f45), sandM = mat(0xffffff, { map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f0dfae'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = ['#e6d29c', '#f7e8bd', '#dcc68f', '#fff3cf'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, i * 10 + Math.random() * 6); for (let x = 0; x <= w; x += 12) g.lineTo(x, i * 10 + Math.sin(x / 20 + i) * 3); g.stroke(); } }, [80, 80]) }), waterM = mat(0x3fb4e6, { roughness: .4 }), leafM = mat(0x4fae5b), trunkM = mat(0xa9764f), glassM = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.25, roughness: 0.1 });
  const floor = (x, z, w, d, m) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); f.rotation.x = -Math.PI / 2; f.position.set(x, 0, z); f.receiveShadow = true; lobby.add(f); return f; };
  const wall = (x, z, w, d, h = 5, y = 0, m = wallM) => { const b = box(w, h, d, m, x, y + h / 2, z, lobby); COLLIDERS.push(b); return b; };
  const ceil = (x, z, w, d, h) => { const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilM); c.rotation.x = Math.PI / 2; c.position.set(x, h, z); lobby.add(c); };
  const roof = (x, z, w, d) => { const r = box(w, 0.5, d, trimM, x, 5.2, z, lobby); r.castShadow = false; r.receiveShadow = false; };   // roof slabs don't block the sun
  // outside: sand, sea, palms
  floor(0, 0, 400, 400, sandM).position.y = -0.05;
  const sea = floor(0, -120, 400, 160, waterM); sea.position.y = -0.02;
  const foamTex = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; for (let i = 0; i < 4; i++) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, i * 64 + 20 + Math.sin(x / 18 + i) * 8); g.stroke(); } }, [24, 8]);
  const waves = new THREE.Mesh(new THREE.PlaneGeometry(400, 130), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: .45, depthWrite: false })); waves.rotation.x = -Math.PI / 2; waves.position.set(0, 0.0, -105); lobby.add(waves);
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(400, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false })); shore.rotation.x = -Math.PI / 2; shore.position.set(0, 0.01, -40); lobby.add(shore);
  AMBIENT.push({ update(t) { foamTex.offset.y = t * 0.02; foamTex.offset.x = Math.sin(t * 0.3) * 0.02; shore.position.z = -40 + Math.sin(t * 0.8) * 1.2; shore.material.opacity = 0.35 + Math.sin(t * 0.8) * 0.2; } });
  // drifting clouds
  const cloudM = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: .35 });
  for (let i = 0; i < 9; i++) { const c = new THREE.Group(); const cx = -140 + Math.random() * 280, cz = -160 + Math.random() * 140, cy = 34 + Math.random() * 14; c.position.set(cx, cy, cz); for (let k = 0; k < 4; k++) box(6 + Math.random() * 8, 2.5 + Math.random() * 2, 5 + Math.random() * 4, cloudM, (k - 1.5) * 5 + Math.random() * 2, Math.random() * 1.5, Math.random() * 2, c); lobby.add(c); AMBIENT.push({ update(t, dt) { c.position.x += dt * (0.6 + WIND.x * 0.5); c.position.z += dt * WIND.z * 0.5; if (c.position.x > 160) c.position.x = -160; if (c.position.x < -160) c.position.x = 160; if (c.position.z > 20) c.position.z = -160; if (c.position.z < -160) c.position.z = 20; } }); }
  // seagulls circling over the water
  for (let i = 0; i < 5; i++) { const gull = new THREE.Group(); const wL = box(0.9, 0.05, 0.25, mat(0xf4f4f4), -0.45, 0, 0, gull), wR = box(0.9, 0.05, 0.25, mat(0xf4f4f4), 0.45, 0, 0, gull); box(0.35, 0.12, 0.6, mat(0xdddddd), 0, 0, 0, gull); lobby.add(gull); const cx = -60 + Math.random() * 120, cz = -50 - Math.random() * 40, rad = 10 + Math.random() * 14, h = 9 + Math.random() * 6, ph = Math.random() * 6, spd = 0.25 + Math.random() * 0.2; AMBIENT.push({ update(t) { const a = t * spd + ph; gull.position.set(cx + Math.cos(a) * rad, h + Math.sin(t * 1.3 + ph) * 0.8, cz + Math.sin(a) * rad); gull.rotation.y = -a + Math.PI / 2; const f = Math.sin(t * 9 + ph) * 0.5; wL.rotation.z = f; wR.rotation.z = -f; } }); }
  const palm = (x, z, h = 5) => { const t = cyl(0.18, 0.28, h, trunkM, x, h / 2, z, lobby, 7); t.rotation.z = 0.08; const crown = new THREE.Group(); crown.position.set(x, h - 0.15, z); lobby.add(crown); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const leaf = box(2.6, 0.08, 0.7, leafM, Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3, crown); leaf.rotation.y = -a; leaf.rotation.z = 0.35; } AMBIENT.push({ ph: Math.random() * 6, update(t) { const k = 0.4 + WIND.length() * 0.35; crown.rotation.z = (Math.sin(t * 1.1 + this.ph) * 0.06 - WIND.x * 0.03) * k; crown.rotation.x = (Math.cos(t * 0.9 + this.ph) * 0.05 + WIND.z * 0.03) * k; } }); };
  palm(-16, -16, 6); palm(6, -17, 5); palm(20, -15.5, 6.5); palm(-48, -6, 5); palm(40, 12, 6); palm(-50, 20, 5.5); palm(45, 22, 6);
  for (const [x, z] of [[-6, -16], [14, -16.5], [-24, -15.5], [30, -16]]) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), mat(0xc9c2b4)); r.position.set(x, 0.25, z); r.castShadow = true; lobby.add(r); }
  // --- center room 26x26 ---
  floor(0, 0, 26, 26, woodM); ceil(0, 0, 26, 26, 5);
  roof(0, 0, 30, 30);
  wall(0, 13, 26, 0.4);                                                                  // south wall
  // north wall = window wall with a door in the middle out to the beach
  wall(-7.75, -13, 10.5, 0.4, 1.0); wall(7.75, -13, 10.5, 0.4, 1.0); wall(0, -13, 26, 0.4, 0.8, 4.2);
  for (const x of [-13, -6.5, -2.5, 2.5, 6.5, 13]) box(0.4, 5, 0.4, wallM, x, 2.5, -13, lobby);
  for (const [x, w] of [[-9.75, 6.1], [-4.5, 3.6], [4.5, 3.6], [9.75, 6.1]]) { const gl = box(w, 3.2, 0.06, glassM, x, 2.6, -13, lobby); gl.castShadow = false; }
  box(5.4, 0.3, 0.5, darkWood, 0, 4.05, -13, lobby);                                    // door lintel
  for (const sx of [-1, 1]) { wall(sx * 13, -7.75, 0.4, 10.5); wall(sx * 13, 7.75, 0.4, 10.5); wall(sx * 13, 0, 0.4, 5, 1.6, 3.4); }
  for (const sx of [-1, 1]) { floor(sx * 14, 0, 2.6, 5, woodM); ceil(sx * 14, 0, 2.6, 5, 3.4); wall(sx * 14, -2.5, 2.6, 0.4, 3.4); wall(sx * 14, 2.5, 2.6, 0.4, 3.4); }
  // --- casual room (west) 26x22 ---
  floor(-28, 0, 26, 22, woodM); ceil(-28, 0, 26, 22, 5); roof(-28, 0, 30, 26);
  wall(-41, 0, 0.4, 22); wall(-28, 11, 26, 0.4);
  wall(-28, -11, 26, 0.4, 1.0); wall(-28, -11, 26, 0.4, 0.8, 4.2); for (const x of [-41, -34.5, -28, -21.5, -15]) box(0.4, 5, 0.4, wallM, x, 2.5, -11, lobby);
  for (const x of [-37.75, -31.25, -24.75, -18.25]) { const gl = box(6.1, 3.2, 0.06, glassM, x, 2.6, -11, lobby); gl.castShadow = false; }
  wall(-15, -6.75, 0.4, 8.5); wall(-15, 6.75, 0.4, 8.5); wall(-15, 0, 0.4, 5, 1.6, 3.4);
  // --- practice room (east) 18x18 ---
  floor(24, 0, 18, 18, woodM); ceil(24, 0, 18, 18, 5); roof(24, 0, 22, 22);
  wall(33, 0, 0.4, 18); wall(24, 9, 18, 0.4);
  wall(24, -9, 18, 0.4, 1.0); wall(24, -9, 18, 0.4, 0.8, 4.2); for (const x of [15, 21, 27, 33]) box(0.4, 5, 0.4, wallM, x, 2.5, -9, lobby);
  for (const x of [18, 24, 30]) { const gl = box(5.6, 3.2, 0.06, glassM, x, 2.6, -9, lobby); gl.castShadow = false; }
  wall(15, -5.75, 0.4, 6.5); wall(15, 5.75, 0.4, 6.5); wall(15, 0, 0.4, 5, 1.6, 3.4);
  WALK.push({ x1: -12.5, x2: 12.5, z1: -12.5, z2: 12.5 }, { x1: -16, x2: -11, z1: -2.1, z2: 2.1 }, { x1: -40.5, x2: -15.5, z1: -10.5, z2: 10.5 }, { x1: 11, x2: 16, z1: -2.1, z2: 2.1 }, { x1: 15.5, x2: 32.5, z1: -8.5, z2: 8.5 });
  INDOOR_COUNT = WALK.length;
  // outside: the door, the beach in front, and around the house (water starts at z = -40)
  WALK.push({ x1: -2.1, x2: 2.1, z1: -14.5, z2: -12 }, { x1: -95, x2: 95, z1: -39.2, z2: -13.6 }, { x1: -95, x2: -41.6, z1: -39.2, z2: 45 }, { x1: 33.6, x2: 95, z1: -39.2, z2: 45 }, { x1: -95, x2: 95, z1: 13.6, z2: 45 });
  // beach courts (long axis along X, net across Z)
  const lineM = mat(0xffffff);
  for (const cx of [-34, 0, 34]) {
    const cz = -27.5, hx = COURT_L / 2, hz = COURT_W / 2;
    BEACH_COURTS.push({ cx, cz, hx, hz }); BEACH_NETS.push({ cx, cz, nx: 1, nz: 0, half: NET_HALF });
    for (const [x, z, w, d] of [[cx, cz - hz, hx * 2, 0.12], [cx, cz + hz, hx * 2, 0.12], [cx - hx, cz, 0.12, hz * 2], [cx + hx, cz, 0.12, hz * 2], [cx, cz, 0.12, hz * 2]]) { const l = box(w, 0.03, d, lineM, x, 0.0, z, lobby); l.castShadow = false; }
    buildNet(lobby, cx, cz, Math.PI / 2, NET_HALF, COURT_W / 2);
  }
  // beach life: umbrellas, towels, chairs, boat, pier
  const umbrella = (x, z, color) => { cyl(0.05, 0.05, 2.4, mat(0xf5f5f5), x, 1.2, z, lobby, 6); const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), mat(color)); top.position.set(x, 2.4, z); top.castShadow = true; lobby.add(top); };
  umbrella(-16, -20, 0xe5484d); umbrella(18, -18, 0x3b8ff0); umbrella(-52, -36, 0xf5c542); umbrella(54, -36, 0x3ecf5a); umbrella(-70, -20, 0xe5484d);
  const towel = (x, z, ry, color) => { const t = box(1.0, 0.04, 2.0, mat(color), x, 0.0, z, lobby); t.rotation.y = ry; t.castShadow = false; };
  towel(-14.5, -18.5, 0.3, 0xffd0d0); towel(19.5, -16.5, -0.2, 0xd0e4ff); towel(-50.5, -37.5, 0.5, 0xfff2b0); towel(52.5, -37.5, 0.1, 0xd4ffd9); towel(-68.5, -18.5, -0.4, 0xffd0d0);
  const bchair = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; const m = mat(0xf0f0f0); box(0.6, 0.06, 1.4, m, 0, 0.35, 0, g); const bk = box(0.6, 0.06, 0.8, m, 0, 0.7, -0.9, g); bk.rotation.x = -0.9; for (const [lx, lz] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]]) box(0.05, 0.35, 0.05, m, lx, 0.17, lz, g); lobby.add(g); };
  bchair(-19, -21, 0.4); bchair(21, -19, -0.3); bchair(-55, -38, 0.2); bchair(57, -38, -0.5);
  for (const [x, z] of [[-60, -16], [-24, -18], [12, -19], [44, -17], [70, -26], [-80, -30], [80, -33], [-58, -19], [24, -17]]) palm(x, z, 5 + (Math.abs(x) % 3));
  const boat = box(2.2, 0.8, 5, mat(0xf4f4f4), 40, 0.35, -48, lobby); boat.rotation.y = 0.3; box(1.6, 0.3, 4, mat(0x3b8ff0), 40, 0.75, -48, lobby).rotation.y = 0.3;
  for (let i = 0; i < 8; i++) box(2.4, 0.15, 1.9, darkWood, -60, 0.25, -40.5 - i * 2, lobby);
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) cyl(0.12, 0.12, 1.2, darkWood, -60 + sx * 1.1, 0.0, -40 - i * 2, lobby, 6);
  const ball1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(0xffd000)); ball1.position.set(-20, 0.3, -19); ball1.castShadow = true; lobby.add(ball1);
  // shells, pebbles and dune grass scattered over the beach
  const shellM = mat(0xfff1e0), pebbleM = mat(0xbfb6a6), grassM = mat(0xb9c46a);
  const inCourt = (x, z) => BEACH_COURTS.some(c => Math.abs(x - c.cx) < c.hx + 1.5 && Math.abs(z - c.cz) < c.hz + 1.5);
  for (let i = 0; i < 90; i++) { const x = -90 + Math.random() * 180, z = -39 + Math.random() * 25; if (inCourt(x, z) || (Math.abs(x) < 14 && z > -14)) continue; const r = Math.random(); if (r < 0.4) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), shellM); sh.position.set(x, 0.0, z); sh.rotation.y = Math.random() * 6; sh.scale.set(1, 0.6, 1.2); lobby.add(sh); } else if (r < 0.7) { const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.12), pebbleM); p.position.set(x, 0.08, z); lobby.add(p); } else { const tuft = new THREE.Group(); tuft.position.set(x, 0, z); for (let k = 0; k < 5; k++) { const b = box(0.05, 0.6 + Math.random() * 0.5, 0.05, grassM, (Math.random() - .5) * 0.3, 0.3, (Math.random() - .5) * 0.3, tuft); b.rotation.z = (Math.random() - .5) * 0.5; b.rotation.x = (Math.random() - .5) * 0.5; } lobby.add(tuft); AMBIENT.push({ ph: Math.random() * 6, update(t) { const k = 0.5 + WIND.length() * 0.25; tuft.rotation.x = Math.sin(t * 2.3 + this.ph) * 0.12 * k + WIND.z * 0.04; tuft.rotation.z = -Math.cos(t * 2.1 + this.ph) * 0.1 * k - WIND.x * 0.04; } }); } }
  // wind-blown sand grains around the player
  const N = 700; const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i * 3] = (Math.random() - .5) * 60; pts[i * 3 + 1] = Math.pow(Math.random(), 1.6) * 9; pts[i * 3 + 2] = (Math.random() - .5) * 60; }
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const sand = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0xfff2cc, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false })); lobby.add(sand);
  AMBIENT.push({ update(t, dt) {
    const cx = P.pos.x, cz = P.pos.z; const arr = pgeo.attributes.position.array; const w = WIND;
    for (let i = 0; i < N; i++) {
      let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      x += (w.x * (1.2 + y * 0.25) + Math.sin(t * 3 + i) * 0.6) * dt; z += (w.z * (1.2 + y * 0.25) + Math.cos(t * 2.7 + i * 1.3) * 0.6) * dt; y += (Math.sin(t * 1.5 + i) * 0.5 - 0.15) * dt;
      if (x < cx - 30) x += 60; if (x > cx + 30) x -= 60; if (z < cz - 30) z += 60; if (z > cz + 30) z -= 60; if (y < 0.03) y = Math.pow(Math.random(), 1.6) * 9; if (y > 9.5) y = 0.05;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    pgeo.attributes.position.needsUpdate = true; sand.material.opacity = 0.45 + Math.min(0.4, WIND.length() * 0.12);
  } });
  // flags on the pier and the beach net posts
  const flagTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#e5484d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, h / 3, w, h / 3); });
  const flag = (x, z, h) => { cyl(0.05, 0.05, h, mat(0xdddddd), x, h / 2, z, lobby, 5); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7, 8, 1), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })); f.position.set(x + 0.6, h - 0.4, z); lobby.add(f); const pos = f.geometry.attributes.position; const base = pos.array.slice(); AMBIENT.push({ update(t) { const k = 0.5 + WIND.length() * 0.3; f.rotation.y = -Math.atan2(WIND.z, WIND.x); for (let i = 0; i < pos.count; i++) { const bx = base[i * 3]; pos.setZ(i, Math.sin(t * (4 + WIND.length() * 2) + bx * 3) * 0.12 * (bx + 0.6) * k); } pos.needsUpdate = true; } }); };
  // beach umbrellas sway a little, boat bobs
  AMBIENT.push({ update(t) { boat.position.y = 0.35 + Math.sin(t * 1.4) * 0.12; boat.rotation.x = Math.sin(t * 1.1) * 0.05; } });
  // signs (wood boards)
  const sign = (text, x, z, ry) => { const b = box(5.2, 1.1, 0.12, darkWood, x, 4.2, z, lobby); b.rotation.y = ry; const t = textPlane(4.8, 0.9, text, { size: 120, color: '#fff9ee' }); t.position.set(0, 0, 0.07); b.add(t); const t2 = t.clone(); t2.position.z = -0.07; t2.rotation.y = Math.PI; b.add(t2); };
  sign('CASUAL PLAY', -12.7, 0, Math.PI / 2); sign('PRACTICE MODE', 12.7, 0, -Math.PI / 2);
  const title = textPlane(9, 1.4, 'VOLLEYBALL GAEM', { size: 130, color: '#2b2b2b' }); title.position.set(0, 3.6, 12.75); title.rotation.y = Math.PI; lobby.add(title);
  // furniture (simple)
  const couch = (x, z, ry, color) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; const m = mat(color); box(2.6, 0.5, 1.0, m, 0, 0.35, 0, g); box(2.6, 0.7, 0.25, m, 0, 0.85, -0.4, g); box(0.25, 0.4, 1.0, m, 1.2, 0.75, 0, g); box(0.25, 0.4, 1.0, m, -1.2, 0.75, 0, g); box(2.4, 0.1, 0.9, mat(color), 0, 0.62, 0.02, g); lobby.add(g); };
  couch(0, 4.5, Math.PI, 0x7fb7d6); couch(-4.5, 0, Math.PI / 2, 0xe8b86d); couch(4.5, 0, -Math.PI / 2, 0xe8b86d);
  box(1.8, 0.1, 1.0, darkWood, 0, 0.45, 0.6, lobby); for (const [lx, lz] of [[-0.8, 0.2], [0.8, 0.2], [-0.8, 1.0], [0.8, 1.0]]) box(0.1, 0.45, 0.1, darkWood, lx, 0.22, lz, lobby);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 8), mat(0xe3d3b4)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 1.2); rug.receiveShadow = true; lobby.add(rug);
  box(4, 1.0, 1.0, darkWood, 0, 0.5, 11, lobby); box(4.4, 0.1, 1.3, mat(0xf5ead6), 0, 1.05, 11, lobby);          // front counter
  const counterBlock = box(4.8, 4, 2.6, wallM, 0, 2, 11.8, lobby); counterBlock.visible = false; COLLIDERS.push(counterBlock);   // invisible camera blocker: the camera never goes behind the counter
  box(1.2, 0.5, 0.8, darkWood, 0, 0.25, 12.2, lobby);                                                        // step behind the counter
  NPC = new Rig('dealer'); NPC.root.position.set(0, 0.5, 12.2); NPC.root.rotation.y = Math.PI; lobby.add(NPC.root);
  NPC2 = new Rig('bigdealer'); NPC2.root.scale.set(RIG_SCALE * 1.2 * 1.12, RIG_SCALE * 1.2, RIG_SCALE * 1.2 * 1.12);   // a big man: taller and broader
  NPC2.root.position.set(NPC2_POS.x, -0.22, NPC2_POS.z); NPC2.root.rotation.y = Math.PI / 2; NPC2.setPose('sit'); NPC2.base = 'sit'; NPC2.snap(); lobby.add(NPC2.root);
  AMBIENT.push({ update(t) { NPC2.j.neck.rotation.y = Math.sin(t * 0.6) * 0.3; NPC2.j.spine.rotation.x = (-6 + Math.sin(t * 1.4) * 1.2) * D; } });   // looks around, breathes
  const plant = (x, z) => { cyl(0.32, 0.26, 0.5, mat(0xc98a5b), x, 0.25, z, lobby, 8); for (let i = 0; i < 3; i++) { const l = box(0.12, 1.1, 0.5, leafM, x + (i - 1) * 0.12, 1.0, z, lobby); l.rotation.z = (i - 1) * 0.35; } };
  plant(-11.5, 11.5); plant(11.5, 11.5); plant(-11.5, -4.5); plant(11.5, 4.5); plant(-39.5, 9.5); plant(-17, 9.5); plant(17, 7.5); plant(31.5, 7.5);
  const board = box(0.12, 2.4, 0.6, mat(0xf07a5a), 12.4, 1.25, 9.5, lobby); board.rotation.z = -0.15;                 // surfboard
  const board2 = box(0.12, 2.4, 0.6, mat(0x6fd0c8), -12.4, 1.25, 9.5, lobby); board2.rotation.z = 0.15;
  for (const [x, z] of [[-30, 7], [-22, 7]]) { box(1.2, 0.08, 1.2, darkWood, x, 0.7, z, lobby); cyl(0.05, 0.05, 0.7, darkWood, x, 0.35, z, lobby, 6); for (const [dx, dz] of [[0, 0.9], [0, -0.9], [0.9, 0], [-0.9, 0]]) box(0.45, 0.45, 0.45, mat(0xf2d8a8), x + dx, 0.225, z + dz, lobby); }
  const fan = (x, z) => { cyl(0.1, 0.1, 0.5, darkWood, x, 4.75, z, lobby, 6); const hub = new THREE.Group(); hub.position.set(x, 4.5, z); lobby.add(hub); for (let i = 0; i < 4; i++) { const b = box(1.4, 0.04, 0.3, darkWood, Math.cos(i * Math.PI / 2) * 0.7, 0, -Math.sin(i * Math.PI / 2) * 0.7, hub); b.rotation.y = i * Math.PI / 2; } AMBIENT.push({ update(t, dt) { hub.rotation.y += dt * 2.2; } }); };
  fan(0, 0); fan(-28, 0); fan(24, 0);
  // warm lamps to give the rooms some life
  const lamp = (x, z, y = 4.3, color = 0xffd9a8, inten = 0.7, dist = 20) => { const l = new THREE.PointLight(color, inten, dist, 1.4); l.position.set(x, y, z); lobby.add(l); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1cc })); bulb.position.set(x, y, z); lobby.add(bulb); const shade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xf1d9b0, side: THREE.DoubleSide })); shade.position.set(x, y + 0.25, z); lobby.add(shade); cyl(0.03, 0.03, 5 - y - 0.4, darkWood, x, (5 + y + 0.4) / 2, z, lobby, 4); AMBIENT.push({ ph: Math.random() * 6, update(t) { l.intensity = inten * (0.92 + Math.sin(t * 2.1 + this.ph) * 0.05 + Math.sin(t * 7.3 + this.ph) * 0.03); } }); };
  lamp(-6, -6); lamp(6, -6); lamp(-6, 6); lamp(6, 6); lamp(0, 10.5, 3.6, 0xffe2b8, 0.9, 14);
  lamp(-34, -5); lamp(-22, -5); lamp(-34, 5); lamp(-22, 5); lamp(20, -4); lamp(28, 4);
  for (const [x, z] of [[-12.6, -8], [-12.6, 8], [12.6, -8], [12.6, 8]]) { const s = new THREE.PointLight(0xffc48a, 0.45, 10, 1.6); s.position.set(x, 2.6, z); lobby.add(s); box(0.3, 0.5, 0.18, mat(0xfff0d0, { emissive: 0xffe0a0, emissiveIntensity: .8 }), x + (x < 0 ? 0.1 : -0.1), 2.6, z, lobby); }
  scene.add(lobby);
  makePad('c2v2', '2v2', 2, -38.5, -7, Math.PI / 2, '2v2', false);
  makePad('c3v3', '3v3', 3, -38.5, 0, Math.PI / 2, '3v3', false);
  makePad('c6v6', '6v6', 6, -38.5, 7, Math.PI / 2, '6v6', false);
  makePad('practice', 'Practice Mode', 6, 30.5, 0, -Math.PI / 2, 'practice', true);
  for (const id in PADS) lobby.add(PADS[id].group);
}
function updateAmbient(t, dt) { updateWind(); for (const a of AMBIENT) a.update(t, dt); }
function walkable(x, z) { return WALK.some(r => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2); }
function indoors(x, z) { for (let i = 0; i < INDOOR_COUNT; i++) { const r = WALK[i]; if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return true; } return false; }

/* ---- shared net builder (x,z = center, yaw 0 = net across X) ---- */
let NET_TEX = null;
function buildNet(parent, x, z, yaw, half, antX) {
  NET_TEX = NET_TEX || canvasTex(512, 128, (g, W, H) => { g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; for (let xx = 0; xx < W; xx += 12) { g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H); g.stroke(); } for (let y = 0; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }, [4, 1]);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g);
  const postM = mat(0xd0d0d0);
  box(0.14, 2.6, 0.14, postM, -half, 1.3, 0, g); box(0.14, 2.6, 0.14, postM, half, 1.3, 0, g);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 1.0), new THREE.MeshBasicMaterial({ map: NET_TEX, transparent: true, side: THREE.DoubleSide })); net.position.set(0, NET_H - 0.5, 0); g.add(net);
  box(half * 2, 0.08, 0.02, mat(0xffffff), 0, NET_H, 0, g); box(half * 2, 0.05, 0.02, mat(0xffffff), 0, NET_H - 1, 0, g);
  for (const ax of [-(half - 0.3), half - 0.3]) for (let i = 0; i < 5; i++) box(0.06, 0.36, 0.06, mat(i % 2 ? 0xffffff : 0xe23b3b), ax, NET_H - 0.6 + i * 0.36 + 0.18, 0, g);
  return g;
}
/* ---- score effects (play where a ball you hit lands in on the other side) ---- */
const FX_LIST = [];
function heartGeo() {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.35); sh.bezierCurveTo(0, 0.6, -0.5, 0.6, -0.5, 0.25); sh.bezierCurveTo(-0.5, 0.0, 0, -0.15, 0, -0.45); sh.bezierCurveTo(0, -0.15, 0.5, 0.0, 0.5, 0.25); sh.bezierCurveTo(0.5, 0.6, 0, 0.6, 0, 0.35);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: false });
}
function fxPreview(id) {
  if (id === 'heart') { const m = new THREE.Mesh(heartGeo(), mat(0xff3d8a, { emissive: 0xff2d7a, emissiveIntensity: .6 })); m.position.set(0, 0.6, 0); m.scale.setScalar(1.3); return m; }
  if (id === 'confetti') { const g = new THREE.Group(); const cols = [0xffee33, 0xff3fbf, 0xff8c1a, 0x3eff6a, 0x2ee6ff]; for (let i = 0; i < 40; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), SOLID(cols[i % 5], 1)); c.position.set((Math.random() - .5) * 2.2, 0.2 + Math.random() * 1.8, (Math.random() - .5) * 1.2); c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); g.add(c); } return g; }
  if (id === 'hammock') { const g = buildHammock('boy'); g.scale.setScalar(0.42); g.position.y = 0.1; return g; }
  if (id === 'smite') { const g = new THREE.Group(); const pts = [0.3, -0.25, 0.2, -0.3, 0.1]; let y = 2.2; for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff176 })); seg.position.set(pts[i], y, 0); seg.rotation.z = (i % 2 ? -1 : 1) * 0.5; g.add(seg); y -= 0.45; } const fl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe066 })); fl.position.y = 0.3; g.add(fl); return g; }
  if (id === 'blackhole') { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 })); s.position.y = 0.85; g.add(s); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 32), mat(0x7a2bff, { emissive: 0x7a2bff, emissiveIntensity: 1 })); ring.position.y = 0.85; ring.rotation.x = 1.1; g.add(ring); return g; }
  return null;
}
const ADD = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const SOLID = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
function playScoreFx(id, x, z, model = 'boy') {
  if (id !== 'hammock' && typeof impactFrame === 'function') impactFrame(x, z, id === 'blackhole' || id === 'smite' ? 2 : 1);
  if (id === 'heart') {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const heart = new THREE.Mesh(heartGeo(), mat(0xff3d8a, { emissive: 0xff2d7a, emissiveIntensity: .8, transparent: true })); heart.position.y = 0.6; g.add(heart);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), ADD(0xff4fa0, 0.25)); glow.position.y = 0.9; g.add(glow);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 40), ADD(0xff8ad0, 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const light = new THREE.PointLight(0xff4fa0, 2, 10); light.position.y = 1; g.add(light);
    const sparkM = SOLID(0xffd6ec, 1), pinkM = SOLID(0xff7ac8, 1), magM = SOLID(0xff2d9a, 1); const parts = [];
    for (let i = 0; i < 70; i++) {                               // burst sparkles
      const m = [sparkM, pinkM, magM][i % 3]; const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), m);
      const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 4; p.userData.v = new THREE.Vector3(Math.cos(a) * sp, 3.5 + Math.random() * 4.5, Math.sin(a) * sp); p.userData.spin = (Math.random() - .5) * 12;
      p.position.set(0, 0.4, 0); g.add(p); parts.push(p);
    }
    const minis = []; const mg = heartGeo();
    for (let i = 0; i < 12; i++) { const mh = new THREE.Mesh(mg, mat(0xff5aa8, { emissive: 0xff2d7a, emissiveIntensity: .8, transparent: true })); mh.scale.setScalar(0.28); const a = i / 12 * Math.PI * 2; mh.userData.a = a; mh.userData.r = 0.9 + Math.random() * 0.6; mh.userData.h = Math.random(); g.add(mh); minis.push(mh); }
    FX_LIST.push({ g, t: 0, dur: 2.4, update(dt) {
      this.t += dt; const k = this.t / this.dur; const fade = 1 - Math.max(0, k - 0.65) / 0.35;
      heart.position.y = 0.6 + this.t * 1.3; heart.rotation.y += dt * 3; heart.scale.setScalar(1.3 + Math.sin(this.t * 12) * 0.14); heart.material.opacity = fade;
      glow.position.y = heart.position.y + 0.3; glow.scale.setScalar(1 + Math.sin(this.t * 10) * 0.15); glow.material.opacity = 0.25 * fade;
      ring.scale.setScalar(1 + this.t * 5); ring.material.opacity = Math.max(0, 0.9 - this.t * 1.2);
      light.intensity = 2.5 * fade;
      for (const p of parts) { p.userData.v.y -= 7 * dt; p.position.addScaledVector(p.userData.v, dt); p.rotation.z += p.userData.spin * dt; p.lookAt(camera.position); p.material.opacity = fade; }
      for (const mh of minis) { mh.userData.a += dt * 2.2; mh.position.set(Math.cos(mh.userData.a) * mh.userData.r, 0.3 + this.t * (1.2 + mh.userData.h), Math.sin(mh.userData.a) * mh.userData.r); mh.rotation.y += dt * 4; mh.material.opacity = fade; }
    } });
  } else if (id === 'hammock') { playHammock(x, z, model);
  } else if (id === 'confetti') { playConfetti(x, z);
  } else if (id === 'smite') { playSmite(x, z);
  } else if (id === 'blackhole') {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const R = 1.5;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true })); hole.position.y = -R; g.add(hole);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 32, 24), SOLID(0x6a1fd6, 0.3)); halo.position.y = -R; g.add(halo);
    const rings = [];                                              // accretion rings: different radii, tilts, speeds
    const ringCols = [0x9b4dff, 0x6a1fd6, 0xc07dff, 0x4c0fb0, 0xd94cff];
    for (let i = 0; i < 6; i++) { const rr = R * (1.25 + i * 0.28); const rm = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05 + i * 0.03, 8, 64), SOLID(ringCols[i % ringCols.length], 0.95)); rm.userData = { tilt: 0.3 + Math.random() * 0.5, spd: (i % 2 ? -1 : 1) * (2.5 - i * 0.25), ph: Math.random() * 6 }; g.add(rm); rings.push(rm); }
    const streaks = [];                                            // fiery streaks orbiting and spiralling in
    for (let i = 0; i < 70; i++) { const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + Math.random() * 1.6, 0.07 + Math.random() * 0.07), SOLID(i % 3 === 0 ? 0xe2c4ff : (i % 2 ? 0x9b4dff : 0x5a17c9), 0.9)); sm.userData = { a: Math.random() * Math.PI * 2, r: R * 1.2 + Math.random() * 5, y: (Math.random() - .5) * 1.6, spd: 1.5 + Math.random() * 3, tilt: (Math.random() - .5) * 0.9 }; g.add(sm); streaks.push(sm); }
    const sparks = [];
    for (let i = 0; i < 80; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), SOLID(i % 2 ? 0xf0e0ff : 0xb070ff, 1)); sp.userData = { a: Math.random() * Math.PI * 2, r: 3 + Math.random() * 6, y: Math.random() * 4, spd: 2 + Math.random() * 3 }; g.add(sp); sparks.push(sp); }
    const disc = new THREE.Mesh(new THREE.RingGeometry(R * 0.6, R * 4.2, 64), SOLID(0x3a0a80, 0.5)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; g.add(disc);
    const groundRing = new THREE.Mesh(new THREE.TorusGeometry(R * 3.4, 0.12, 8, 80), new THREE.MeshBasicMaterial({ color: 0x1a0530, transparent: true })); groundRing.rotation.x = Math.PI / 2; groundRing.position.y = 0.05; g.add(groundRing);
    const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 64), SOLID(0xc79bff, 1)); shock.rotation.x = Math.PI / 2; shock.position.y = 0.06; g.add(shock);
    const light = new THREE.PointLight(0x9a4bff, 4, 30); light.position.y = 2; g.add(light);
    FX_LIST.push({ g, t: 0, dur: 5.5, type: 'blackhole', x, z, pull: R * 4.6, core: R * 0.6, update(dt) {
      this.t += dt; const t = this.t; const k = t / this.dur;
      const rise = Math.min(1, t / 1.2); const ease = 1 - Math.pow(1 - rise, 3);
      const collapse = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;            // shrinks away at the end
      const cy = -R + ease * (R + 1.1);
      hole.position.y = halo.position.y = cy; hole.scale.setScalar((1 + Math.sin(t * 9) * 0.03) * collapse); halo.scale.setScalar((1.05 + Math.sin(t * 6) * 0.08) * collapse); halo.material.opacity = 0.3 * collapse;
      for (const rm of rings) { const u = rm.userData; rm.position.y = cy; rm.rotation.set(Math.PI / 2 + Math.sin(t * 0.8 + u.ph) * u.tilt, t * u.spd, Math.cos(t * 0.6 + u.ph) * u.tilt * 0.6); rm.scale.setScalar(ease * collapse); rm.material.opacity = 0.9 * collapse; }
      for (const sm of streaks) { const u = sm.userData; u.a += dt * u.spd * (1 + 3 / Math.max(1, u.r)); u.r -= dt * 1.1; if (u.r < R * 0.9) { u.r = R * 1.2 + Math.random() * 5; u.y = (Math.random() - .5) * 1.6; } sm.position.set(Math.cos(u.a) * u.r, cy + u.y + Math.sin(u.a * 2) * 0.2 * u.tilt, Math.sin(u.a) * u.r); sm.rotation.set(0, -u.a, u.tilt * 0.5); sm.scale.setScalar(ease * collapse); sm.material.opacity = 0.9 * collapse; }
      for (const sp of sparks) { const u = sp.userData; u.a += dt * u.spd; u.r -= dt * 2.2; if (u.r < R) { u.r = 3 + Math.random() * 6; u.y = Math.random() * 4; } sp.position.set(Math.cos(u.a) * u.r, u.y + (cy - u.y) * (1 - u.r / 9), Math.sin(u.a) * u.r); sp.material.opacity = collapse; }
      disc.rotation.z += dt * 1.8; disc.scale.setScalar(ease); disc.material.opacity = 0.5 * collapse;
      groundRing.scale.setScalar(ease); groundRing.material.opacity = collapse;
      shock.scale.setScalar(1 + t * 6); shock.material.opacity = Math.max(0, 1 - t * 0.9);
      light.intensity = 4 * ease * collapse; hole.material.opacity = collapse;
    } });
  }
}
function buildHammock(model) {                  // two palms, a striped hammock and the scorer lying in it
  const g = new THREE.Group();
  const trunkM = mat(0xa9764f), leafM = mat(0x4fae5b), ropeM = mat(0xe8d9a8);
  const palm = (x) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4.2, 7), trunkM); t.position.set(x, 2.1, 0); g.add(t); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.6), leafM); leaf.position.set(x + Math.cos(a) * 1.05, 4.05, Math.sin(a) * 1.05); leaf.rotation.y = -a; leaf.rotation.z = 0.4; g.add(leaf); } for (const [dx, dz] of [[0.2, 0.2], [-0.2, 0.1], [0.05, -0.25]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0x6b4a2a)); c.position.set(x + dx, 3.85, dz); g.add(c); } };
  palm(-2.3); palm(2.3);
  const clothTex = canvasTex(256, 64, (gg, w, h) => { for (let i = 0; i < 8; i++) { gg.fillStyle = i % 2 ? '#e5484d' : '#f7f2ea'; gg.fillRect(i * 32, 0, 32, h); } });
  const geo = new THREE.PlaneGeometry(3.6, 1.3, 24, 4); const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), pz = pos.getY(i); pos.setY(i, -0.55 * (1 - (px / 1.8) * (px / 1.8)) + 0.12 * (pz / 0.65) * (pz / 0.65)); pos.setZ(i, pz); }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, mat(0xffffff, { map: clothTex, side: THREE.DoubleSide })); cloth.position.y = 1.55; g.add(cloth);
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), ropeM); r.position.set(sx * 2.05, 1.62, 0); r.rotation.z = sx * 1.25; g.add(r); const knot = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), ropeM); knot.position.set(sx * 2.3, 1.75, 0); knot.rotation.y = Math.PI / 2; g.add(knot); }
  const lay = new THREE.Group(); lay.position.set(0, 1.12, 0); lay.rotation.z = -Math.PI / 2; g.add(lay);
  const rig = new Rig('white', model); rig.root.rotation.y = -Math.PI / 2; rig.root.position.set(-0.75, 0, 0); lay.add(rig.root);
  rig.setPose('idle'); for (const k in rig.j) { const p = { shL: [-150, 0, 40], shR: [-150, 0, -40], elL: [-125, 0, 0], elR: [-125, 0, 0], hipL: [8, 0, 6], hipR: [-4, 0, -6], knL: [12, 0, 0], knR: [4, 0, 0], neck: [-25, 0, 0], spine: [-6, 0, 0] }[k] || [0, 0, 0]; rig.cur[k].set(p[0] * D, p[1] * D, p[2] * D); rig.j[k].rotation.set(rig.cur[k].x, rig.cur[k].y, rig.cur[k].z); }
  g.userData.rig = rig; g.userData.cloth = cloth; g.userData.lay = lay;
  return g;
}
function playHammock(x, z, model) {
  const g = buildHammock(model); g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
  const { cloth, lay } = g.userData; const cy = cloth.position.y, ly = lay.position.y;
  FX_LIST.push({ g, t: 0, dur: 5.0, update(dt) {
    this.t += dt; const t = this.t;
    const rise = 1 - Math.pow(1 - Math.min(1, t / 0.7), 3); const sink = t > 4.2 ? 1 - (t - 4.2) / 0.8 : 1;
    g.position.y = -4.5 * (1 - rise) - 4.5 * (1 - sink);
    const sway = Math.sin(t * 2.2) * 0.06; cloth.position.y = cy + sway; lay.position.y = ly + sway; lay.rotation.x = Math.sin(t * 2.2) * 0.05;
  } });
}
function playConfetti(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const cols = [0xffee33, 0xff3fbf, 0xff8c1a, 0x3eff6a, 0x2ee6ff, 0xfff176, 0xff5ad0];
  const bits = [];
  for (let i = 0; i < 220; i++) {                                   // confetti pieces
    const long = Math.random() < 0.3;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(long ? 0.08 : 0.22, long ? 0.5 : 0.14), SOLID(cols[i % cols.length], 1));
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
    c.userData = { v: new THREE.Vector3(Math.cos(a) * sp, 7 + Math.random() * 9, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), ph: Math.random() * 6 };
    c.position.set(0, 0.3, 0); c.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(c); bits.push(c);
  }
  const ribbons = [];                                               // streamer ribbons arcing out
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + Math.random() * 0.5, len = 4 + Math.random() * 5, h = 3 + Math.random() * 4;
    const pts = []; for (let s = 0; s <= 8; s++) { const u = s / 8; pts.push(new THREE.Vector3(Math.cos(a) * len * u + Math.sin(u * 9 + i) * 0.4, 0.4 + Math.sin(u * Math.PI) * h + u * 0.5, Math.sin(a) * len * u + Math.cos(u * 7 + i) * 0.4)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.06, 6, false), SOLID(cols[(i + 2) % cols.length], 1)); tube.userData.delay = i * 0.03; tube.scale.setScalar(0.01); g.add(tube); ribbons.push(tube);
  }
  const pop = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), SOLID(0xffffff, 0.9)); pop.position.y = 0.5; g.add(pop);
  FX_LIST.push({ g, t: 0, dur: 3.4, update(dt) {
    this.t += dt; const t = this.t; const fade = 1 - Math.max(0, (t - 2.4) / 1.0);
    pop.scale.setScalar(1 + t * 8); pop.material.opacity = Math.max(0, 0.9 - t * 3);
    for (const c of bits) {
      const u = c.userData; u.v.y -= (u.v.y > 0 ? 14 : 4.5) * dt;    // shoots up fast, flutters down slowly
      if (u.v.y < -1.6) u.v.y = -1.6; u.v.x *= (1 - 1.8 * dt); u.v.z *= (1 - 1.8 * dt);
      c.position.addScaledVector(u.v, dt); c.position.x += Math.sin(t * 6 + u.ph) * dt * 1.2;
      if (c.position.y < 0.03) { c.position.y = 0.03; u.v.set(0, 0, 0); }
      c.rotation.x += u.spin.x * dt; c.rotation.y += u.spin.y * dt; c.rotation.z += u.spin.z * dt; c.material.opacity = fade;
    }
    for (const r of ribbons) { const k = clamp((t - r.userData.delay) / 0.9, 0, 1); r.scale.setScalar(0.01 + k); r.position.y = -k * 0.3 + Math.max(0, t - 1.2) * -1.5; r.material.opacity = fade * (1 - Math.max(0, t - 1.6) / 1.0); }
  } });
}
function playSmite(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const Y = mat(0xfff176, { emissive: 0xffe066, emissiveIntensity: 1.2 }), W = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  // the bolt: a jagged chain of segments from the sky to the ground
  const bolt = new THREE.Group(); g.add(bolt); let px = 0, pz = 0, y = 26;
  while (y > 0) { const nx = px + (Math.random() - .5) * 1.6, nz = pz + (Math.random() - .5) * 1.6, ny = y - (1.2 + Math.random() * 1.8); const len = Math.hypot(nx - px, ny - y, nz - pz); const seg = new THREE.Mesh(new THREE.BoxGeometry(0.22, len, 0.22), Y); seg.position.set((px + nx) / 2, (y + ny) / 2, (pz + pz + nz - pz) / 2); seg.lookAt(nx, ny, nz); seg.rotateX(Math.PI / 2); bolt.add(seg); const core = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.08), W.clone()); core.position.copy(seg.position); core.rotation.copy(seg.rotation); bolt.add(core); px = nx; pz = nz; y = ny; }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), SOLID(0xffffff, 1)); flash.position.y = 0.6; flash.scale.setScalar(0.01); g.add(flash);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), SOLID(0xffe066, 0.75)); glow.position.y = 0.8; glow.scale.setScalar(0.01); g.add(glow);
  const rays = [];                                                    // radial light rays
  for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1), SOLID(i % 2 ? 0xfff59d : 0xffffff, 0.9)); r.geometry.translate(0, 0.5, 0); r.userData = { dir: new THREE.Vector3(Math.random() - .5, Math.random() * 0.9 + 0.1, Math.random() - .5).normalize(), len: 6 + Math.random() * 9, spin: Math.random() * Math.PI }; r.position.y = 0.5; g.add(r); rays.push(r); }
  const cracks = [];                                                  // glowing cracks on the ground
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + Math.random() * 0.3; let cx = 0, cz = 0; for (let s = 0; s < 5; s++) { const l = 0.8 + Math.random() * 1.2; const na = a + (Math.random() - .5) * 0.9; const nx = cx + Math.cos(na) * l, nz = cz + Math.sin(na) * l; const c = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.12 - s * 0.015), SOLID(0xfff176, 1)); c.rotation.x = -Math.PI / 2; c.rotation.z = -na; c.position.set((cx + nx) / 2, 0.03, (cz + nz) / 2); g.add(c); cracks.push(c); cx = nx; cz = nz; } }
  const sparks = [];
  for (let i = 0; i < 60; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), SOLID(i % 2 ? 0xffffff : 0xffe066, 1)); const a = Math.random() * Math.PI * 2, spd = 4 + Math.random() * 7; sp.userData.v = new THREE.Vector3(Math.cos(a) * spd, 3 + Math.random() * 8, Math.sin(a) * spd); sp.position.y = 0.4; g.add(sp); sparks.push(sp); }
  const groundGlow = new THREE.Mesh(new THREE.CircleGeometry(7, 40), SOLID(0xffe066, 0.55)); groundGlow.rotation.x = -Math.PI / 2; groundGlow.position.y = 0.02; groundGlow.scale.setScalar(0.01); g.add(groundGlow);
  const light = new THREE.PointLight(0xffe066, 6, 40); light.position.y = 3; g.add(light);
  FX_LIST.push({ g, t: 0, dur: 2.6, update(dt) {
    this.t += dt; const t = this.t;
    const boltOn = t < 0.35; bolt.visible = boltOn || (t < 0.6 && Math.floor(t * 40) % 2 === 0); bolt.scale.x = bolt.scale.z = boltOn ? 1 : 0.5;
    const e = Math.max(0, t - 0.12); const k = clamp(e / 2.2, 0, 1); const fade = 1 - Math.max(0, (t - 1.4) / 1.2);
    flash.scale.setScalar(0.01 + Math.min(1, e / 0.25) * 4.5); flash.material.opacity = Math.max(0, 1 - e / 0.45);
    glow.scale.setScalar(0.01 + Math.min(1, e / 0.5) * 6.5); glow.material.opacity = 0.75 * fade * (1 - k * 0.4);
    for (const r of rays) { const L = r.userData.len * Math.min(1, e / 0.35); r.scale.set(1 + e, L, 1); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r.userData.dir); r.rotateY(r.userData.spin); r.material.opacity = 0.9 * fade * Math.max(0, 1 - e / 1.6); }
    for (const c of cracks) c.material.opacity = Math.min(1, e / 0.2) * fade;
    for (const sp of sparks) { sp.userData.v.y -= 12 * dt; sp.position.addScaledVector(sp.userData.v, dt); if (sp.position.y < 0.05) { sp.position.y = 0.05; sp.userData.v.y *= -0.4; } sp.material.opacity = fade; }
    groundGlow.scale.setScalar(0.01 + Math.min(1, e / 0.3)); groundGlow.material.opacity = 0.55 * fade;
    light.intensity = (boltOn ? 8 : 6) * fade;
  } });
}
function lightningFx(pos, dir) {                     // Double Spike: jagged electric bolts + blue sparks bursting off the ball
  const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
  const m = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 1, depthWrite: false });
  const bolts = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(); g.add(b); bolts.push(b);
    let p = new THREE.Vector3(); const d = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().addScaledVector(dir, 0.6).normalize();
    for (let k = 0; k < 5; k++) {
      const n = p.clone().addScaledVector(d, 0.28 + Math.random() * 0.2).add(new THREE.Vector3((Math.random() - .5) * 0.25, (Math.random() - .5) * 0.25, (Math.random() - .5) * 0.25));
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, n.distanceTo(p), 0.05), m); seg.position.copy(p).add(n).multiplyScalar(0.5); seg.lookAt(n); seg.rotateX(Math.PI / 2); b.add(seg); p = n;
    }
  }
  const light = new THREE.PointLight(0x9fd4ff, 6, 8, 2); g.add(light);
  FX_LIST.push({ g, t: 0, dur: 0.4, update(dt) { this.t += dt; const k = this.t / this.dur; const on = Math.floor(this.t * 40) % 3 !== 2; for (const b of bolts) b.visible = on; m.opacity = 1 - k; light.intensity = 6 * (1 - k) * (on ? 1 : 0.4); } });
  sparkle(pos, 18, 0x9fd4ff, 1.8, 0.9, 0.45, 0.08, dir);
}
function updateFx(dt) {
  for (let i = FX_LIST.length - 1; i >= 0; i--) { const f = FX_LIST[i]; f.update(dt); if (f.t >= f.dur) { scene.remove(f.g); FX_LIST.splice(i, 1); } }
}
/* ---- movement dust (walking, jumping, landing) ---- */
const DUST = []; let dustMat = null;
const noDustHere = (x, z) => S.scene === 'lobby' && indoors(x, z);
function puff(x, z, n, spread, up, colorHex) {
  if (noDustHere(x, z)) return;
  dustMat = dustMat || new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const m = dustMat.clone(); m.color.setHex(colorHex);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), m); const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random());
    p.position.set(x + (Math.random() - .5) * 0.3, 0.05, z + (Math.random() - .5) * 0.3); p.userData.v = new THREE.Vector3(Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp); p.userData.life = 0.45 + Math.random() * 0.35; p.userData.t = 0;
    scene.add(p); DUST.push(p);
  }
}
function updateDust(dt) {
  for (let i = DUST.length - 1; i >= 0; i--) { const p = DUST[i]; p.userData.t += dt; const k = p.userData.t / p.userData.life; if (k >= 1) { scene.remove(p); DUST.splice(i, 1); continue; } p.userData.v.y -= 4 * dt; p.userData.v.multiplyScalar(1 - 2.5 * dt); p.position.addScaledVector(p.userData.v, dt); if (p.position.y < 0.03) p.position.y = 0.03; p.scale.setScalar(1 + k * 1.5); p.material.opacity = 0.8 * (1 - k); }
}
/* ---- jump / landing effects (separate from the walking puffs) ---- */
function jumpFx(x, z, colorHex) {
  if (noDustHere(x, z)) return;
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.42, 28), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const streaks = [];
  for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4 + Math.random() * 0.4, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })); const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35; s.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); s.userData.vy = 3.5 + Math.random() * 3; g.add(s); streaks.push(s); }
  FX_LIST.push({ g, t: 0, dur: 0.5, update(dt) { this.t += dt; const k = this.t / this.dur; ring.scale.setScalar(1 + k * 3.5); ring.material.opacity = 0.85 * (1 - k); for (const s of streaks) { s.position.y += s.userData.vy * dt; s.userData.vy *= (1 - 3 * dt); s.material.opacity = 0.9 * (1 - k); } } });
}
function landFx(x, z, colorHex) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 6, 28), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const chunks = [];
  for (let i = 0; i < 16; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, depthWrite: false })); const a = i / 16 * Math.PI * 2 + Math.random() * 0.3; c.position.set(Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3); c.userData.v = new THREE.Vector3(Math.cos(a) * (2.5 + Math.random() * 2), 1.5 + Math.random() * 2, Math.sin(a) * (2.5 + Math.random() * 2)); c.rotation.set(Math.random(), Math.random(), 0); g.add(c); chunks.push(c); }
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.45, depthWrite: false })); cloud.scale.set(1, 0.35, 1); cloud.position.y = 0.15; g.add(cloud);
  FX_LIST.push({ g, t: 0, dur: 0.7, update(dt) { this.t += dt; const k = this.t / this.dur; ring.scale.set(1 + k * 4, 1 + k * 4, 1); ring.material.opacity = 0.9 * (1 - k); cloud.scale.set(1 + k * 3, 0.35 + k * 0.4, 1 + k * 3); cloud.material.opacity = 0.45 * (1 - k); for (const c of chunks) { c.userData.v.y -= 9 * dt; c.position.addScaledVector(c.userData.v, dt); if (c.position.y < 0.04) { c.position.y = 0.04; c.userData.v.y = 0; c.userData.v.multiplyScalar(0.6); } c.rotation.x += dt * 6; c.material.opacity = 0.95 * (1 - Math.max(0, k - 0.5) * 2); } } });
}
/* ---- action effects: set / bump / spike / block (small, quick, readable) ---- */
function sparkle(pos, n, colorHex, spread, up, dur = 0.45, size = 0.07, dir = null) {
  const g = new THREE.Group(); g.position.copy(pos); scene.add(g); const parts = [];
  const m = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, depthWrite: false });
  for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), m); const a = Math.random() * Math.PI * 2, sp = spread * (0.3 + Math.random()); p.userData.v = new THREE.Vector3(Math.cos(a) * sp, up * (0.4 + Math.random()), Math.sin(a) * sp); if (dir) p.userData.v.addScaledVector(dir, spread * 1.2); p.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(p); parts.push(p); }
  FX_LIST.push({ g, t: 0, dur, update(dt) { this.t += dt; const k = this.t / this.dur; for (const p of parts) { p.position.addScaledVector(p.userData.v, dt); p.userData.v.multiplyScalar(1 - 2 * dt); p.rotation.y += dt * 6; } m.opacity = 0.95 * (1 - k); } });
}
function actionFx(kind, rig, fwd) {                 // kind: set | bump | block | spike | spikeHit
  if (!rig) return;
  const hl = rig.handPos('L'), hr = rig.handPos('R'); const mid = hl.clone().add(hr).multiplyScalar(0.5);
  if (kind === 'set') sparkle(mid, 10, 0xfff3b0, 0.5, 1.6, 0.5, 0.06);                                   // soft golden specks lifting off the fingertips
  else if (kind === 'bump') sparkle(mid, 8, 0xffffff, 0.7, 0.9, 0.35, 0.06, fwd);                        // a quick forward spray off the forearms
  else if (kind === 'block') {                                                                             // a faint wall flash in front of the hands
    const g = new THREE.Group(); g.position.copy(mid).addScaledVector(fwd, 0.25); g.lookAt(g.position.clone().add(fwd)); scene.add(g);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); g.add(wall);
    FX_LIST.push({ g, t: 0, dur: 0.35, update(dt) { this.t += dt; const k = this.t / this.dur; wall.scale.setScalar(1 + k * 0.4); wall.material.opacity = 0.35 * (1 - k); } });
  } else if (kind === 'spike') {                                                                           // swing trail: three short white arcs at the hitting hand
    const g = new THREE.Group(); g.position.copy(hr); scene.add(g); const arcs = [];
    for (let i = 0; i < 3; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.35 + i * 0.12, 0.025, 6, 20, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })); a.rotation.set(0.4, Math.atan2(fwd.x, fwd.z), -0.6 + i * 0.25); g.add(a); arcs.push(a); }
    FX_LIST.push({ g, t: 0, dur: 0.28, update(dt) { this.t += dt; const k = this.t / this.dur; for (const a of arcs) { a.rotation.z -= dt * 6; a.material.opacity = 0.8 * (1 - k); } } });
  } else if (kind === 'spikeHit') sparkle(mid, 12, 0xffffff, 1.4, 0.6, 0.35, 0.07, fwd);                 // impact sparks when the spike connects
}
/* ---- landing marks ---- */
const MARKS = [];
function landingMark(x, z, inCourt) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(BALL_R, 28), new THREE.MeshBasicMaterial({ color: inCourt ? 0x3ecf5a : 0xe5484d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); scene.add(m); MARKS.push({ m, t0: performance.now() });
}
function updateMarks() {
  const now = performance.now();
  for (let i = MARKS.length - 1; i >= 0; i--) { const k = MARKS[i]; const a = (now - k.t0) / 2500; if (a >= 1) { scene.remove(k.m); k.m.geometry.dispose(); k.m.material.dispose(); MARKS.splice(i, 1); } else { k.m.material.opacity = 0.95 * (1 - a); } }
}

/* =====================================================================
   COURT
   ===================================================================== */
const court = new THREE.Group();
const GYM_LIGHTS = []; const GYM_PANEL_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff }); const COURT_AMBIENT = [];
function applyGymLights() { const on = isNight; for (const l of GYM_LIGHTS) l.intensity = on ? 0.55 : 0; GYM_PANEL_MAT.color.setHex(on ? 0xffffff : 0xc9ced8); }
function updateCourtAmbient(t, dt) { for (const a of COURT_AMBIENT) a.update(t, dt); }
const NET_H = 2.43, COURT_W = 11.25, COURT_L = 22.5, GYM_X = 27, GYM_Z = 34.5, NET_HALF = 6.5;   // beach court is 1.25x regulation; gym is 1.5x
const INDOOR_SCALE = 1.1;                                                                         // the indoor court is 1.1x the beach court
const COURTS_BY_MAP = {
  indoor: { w: COURT_W * INDOOR_SCALE, l: COURT_L * INDOOR_SCALE, half: NET_HALF * INDOOR_SCALE, nets: [{ cx: 0, cz: 0, nx: 0, nz: 1, half: NET_HALF * INDOOR_SCALE }], courts: [{ cx: 0, cz: 0, hx: COURT_W * INDOOR_SCALE / 2, hz: COURT_L * INDOOR_SCALE / 2 }] },
  beach:  { w: COURT_W, l: COURT_L, half: NET_HALF, nets: [{ cx: 0, cz: 0, nx: 0, nz: 1, half: NET_HALF }], courts: [{ cx: 0, cz: 0, hx: COURT_W / 2, hz: COURT_L / 2 }] },
};
const courtDims = () => COURTS_BY_MAP[(S.match && S.match.map) || 'indoor'];
const MATCH_NETS = COURTS_BY_MAP.indoor.nets, MATCH_COURTS = COURTS_BY_MAP.indoor.courts;
const BEACH_NETS = [], BEACH_COURTS = [];
let scoreTex = null;
const TEAM_NAME = { A: 'BLACK', B: 'WHITE' };
function buildCourt() {
  const floorTex = canvasTex(1024, 1280, (g, w, h) => {
    const s = w / (GYM_X * 2);
    g.fillStyle = '#d8b67e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + (i % 3) * .02})`; g.fillRect(0, i * (h / 60), w, 3); }
    const cx = w / 2, cz = h / 2; g.strokeStyle = '#fff'; g.lineWidth = 6;
    const CW = COURT_W * INDOOR_SCALE, CL = COURT_L * INDOOR_SCALE; const hw = CW / 2, hl = CL / 2;
    g.fillStyle = 'rgba(70,130,200,.28)'; g.fillRect(cx - hw * s, cz - hl * s, CW * s, CL * s);
    g.strokeRect(cx - hw * s, cz - hl * s, CW * s, CL * s);
    for (const zz of [0, -3.75 * INDOOR_SCALE, 3.75 * INDOOR_SCALE]) { g.beginPath(); g.moveTo(cx - hw * s, cz + zz * s); g.lineTo(cx + hw * s, cz + zz * s); g.stroke(); }
  });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(GYM_X * 2, GYM_Z * 2), mat(0xffffff, { map: floorTex })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; court.add(fl);
  const wallM = mat(0xf2f4f7), wallTop = mat(0x5670b5);
  const w = (x, z, sx, sz) => { COLLIDERS.push(box(sx, 6, sz, wallM, x, 3, z, court)); box(sx, 5, sz, wallTop, x, 8.5, z, court); };
  w(0, -GYM_Z, GYM_X * 2, 0.5); w(0, GYM_Z, GYM_X * 2, 0.5); w(-GYM_X, 0, 0.5, GYM_Z * 2); w(GYM_X, 0, 0.5, GYM_Z * 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GYM_X * 2, GYM_Z * 2), mat(0xaeb6c6)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 11; court.add(ceil);
  for (const z of [-27, -18, -9, 0, 9, 18, 27]) for (const x of [-16, -5.5, 5.5, 16]) { const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 1.2), GYM_PANEL_MAT); l.position.set(x, 10.9, z); court.add(l); }
  for (const z of [-22, -8, 8, 22]) for (const x of [-11, 11]) { const pl = new THREE.PointLight(0xfff4e0, 0.55, 40, 1.2); pl.position.set(x, 9.5, z); court.add(pl); GYM_LIGHTS.push(pl); }   // gym lights: on at night, off in daylight
  // stands with a cheering crowd on both long sides
  const seatM = mat(0x3f5fc4), stepM = mat(0x33448a);
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) { box(1.3, 0.5 + i * 0.55, GYM_Z * 2 - 2, i % 2 ? seatM : stepM, sx * (GYM_X - 1.0 - (6 - i) * 1.3), (0.5 + i * 0.55) / 2, 0, court); }   // lowest row nearest the court, rising toward the wall
  const shirtCols = [0xe5484d, 0x3b8ff0, 0xf5c542, 0x3ecf5a, 0xffffff, 0x222222, 0xff7ac8, 0xff8c1a, 0xa259ff];
  const skinCols = [0xf3d1b0, 0xd9a878, 0x8d5a3a, 0xf7e0c8];
  const bodies = [], heads = [], seats = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) for (let z = -GYM_Z + 3; z < GYM_Z - 2; z += 1.35) {
    if (Math.random() < 0.42) continue;                                      // plenty of empty seats (keeps the crowd cheap)
    const x = sx * (GYM_X - 1.0 - (6 - i) * 1.3), y = 0.5 + i * 0.55;
    seats.push({ x, y, z, ph: Math.random() * 6, spd: 1.4 + Math.random() * 1.2, sx });
  }
  const bodyGeo = roundedBoxGeo(0.48, 0.62, 0.36, 0.1, 1), headGeo = roundedBoxGeo(0.32, 0.32, 0.32, 0.09, 1), armGeo = roundedBoxGeo(0.12, 0.5, 0.12, 0.05, 1);   // k=1: the crowd is small and far, one fillet segment reads fine
  const bodyIM = new THREE.InstancedMesh(bodyGeo, mat(0xffffff), seats.length), headIM = new THREE.InstancedMesh(headGeo, mat(0xffffff), seats.length), armIM = new THREE.InstancedMesh(armGeo, mat(0xffffff), seats.length * 2);
  const tmp = new THREE.Object3D(); const col = new THREE.Color();
  seats.forEach((s, k) => { bodyIM.setColorAt(k, col.setHex(shirtCols[k % shirtCols.length])); const sk = skinCols[k % skinCols.length]; headIM.setColorAt(k, col.setHex(sk)); armIM.setColorAt(k * 2, col.setHex(sk)); armIM.setColorAt(k * 2 + 1, col.setHex(sk)); });
  court.add(bodyIM); court.add(headIM); court.add(armIM);
  let crowdAcc = 0;
  COURT_AMBIENT.push({ update(t, dt) {
    crowdAcc += dt; if (crowdAcc < 0.05) return; crowdAcc = 0;               // crowd animates at 20 Hz
    const wave = ((t * 9) % (GYM_Z * 2 + 20)) - GYM_Z - 10;                  // a wave rolling along the stands
    seats.forEach((s, k) => {
      const near = Math.max(0, 1 - Math.abs(s.z - wave) / 4); const cheer = 0.5 + 0.5 * Math.sin(t * s.spd * 2 + s.ph);
      const hop = near * 0.45 + cheer * 0.06; const y = s.y + 0.31 + hop;
      tmp.position.set(s.x, y, s.z); tmp.rotation.set(0, s.sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); bodyIM.setMatrixAt(k, tmp.matrix);
      tmp.position.set(s.x, y + 0.5, s.z); tmp.rotation.set(0, (s.sx < 0 ? -Math.PI / 2 : Math.PI / 2) + Math.sin(t * 1.3 + s.ph) * 0.3, 0); tmp.updateMatrix(); headIM.setMatrixAt(k, tmp.matrix);
      const up = Math.max(near, cheer > 0.85 ? 1 : 0);                        // arms up in the wave or on a cheer beat
      for (const side of [-1, 1]) { const ang = up ? -2.6 + Math.sin(t * 8 + s.ph + side) * 0.3 : -0.2; tmp.position.set(s.x, y + 0.15 + (up ? 0.35 : 0), s.z + side * 0.32); tmp.rotation.set(ang, 0, 0); tmp.updateMatrix(); armIM.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), tmp.matrix); }
    });
    bodyIM.instanceMatrix.needsUpdate = true; headIM.instanceMatrix.needsUpdate = true; armIM.instanceMatrix.needsUpdate = true;
  } });
  // banners and pennants
  const bannerTex = (text, bg, fg) => canvasTex(1024, 256, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, 150, W * 0.9); g.fillText(text, W / 2, H / 2); });
  const banner = (text, x, z, ry, bg, fg, w = 12) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: bannerTex(text, bg, fg) })); b.position.set(x, 6.8, z); b.rotation.y = ry; court.add(b); COURT_AMBIENT.push({ ph: Math.random() * 6, update(t) { b.rotation.z = Math.sin(t * 1.6 + this.ph) * 0.02; } }); };
  banner('VOLLEYBALL GAEM', 0, -GYM_Z + 0.3, 0, '#e5484d', '#fff', 16); banner("LET'S GO!", -12, -GYM_Z + 0.3, 0, '#111', '#f5c542', 8); banner('GO GO GO', 12, -GYM_Z + 0.3, 0, '#3b8ff0', '#fff', 8);
  banner('HOME OF THE GAEM', 0, GYM_Z - 0.3, Math.PI, '#3b8ff0', '#fff', 16);
  const penM = [mat(0xe5484d), mat(0x3b8ff0), mat(0xf5c542), mat(0x3ecf5a)];
  for (let i = -24; i <= 24; i += 2) for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 3), penM[((i / 2) + 12) % 4]); p.position.set(sx * (GYM_X - 0.5), 9.6, i); p.rotation.set(Math.PI, 0, 0); court.add(p); COURT_AMBIENT.push({ ph: i, update(t) { p.rotation.z = Math.sin(t * 2 + this.ph) * 0.25; } }); }
  for (let i = -24; i <= 24; i += 2) for (const sx of [-1, 1]) { const st = box(0.03, 0.03, 2, mat(0xdddddd), sx * (GYM_X - 0.5), 9.95, i + 1, court); st.castShadow = false; }
  // a few balloons drifting near the ceiling
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat(shirtCols[i % shirtCols.length], { emissive: shirtCols[i % shirtCols.length], emissiveIntensity: 0.25 })); const bx = -20 + Math.random() * 40, bz = -28 + Math.random() * 56; b.position.set(bx, 9.6, bz); court.add(b); COURT_AMBIENT.push({ ph: Math.random() * 6, update(t) { b.position.set(bx + Math.sin(t * 0.4 + this.ph) * 1.5, 9.3 + Math.sin(t * 0.9 + this.ph) * 0.4, bz + Math.cos(t * 0.35 + this.ph) * 1.5); } }); }
  buildNet(court, 0, 0, 0, NET_HALF * INDOOR_SCALE, COURT_W * INDOOR_SCALE / 2);
  scoreTex = canvasTex(1024, 300, () => { });
  for (const sx of [-1, 1]) { const sb = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), new THREE.MeshBasicMaterial({ map: scoreTex })); sb.position.set(sx * (GYM_X - 0.3), 7.5, 0); sb.rotation.y = -sx * Math.PI / 2; court.add(sb); }
  drawScore(0, 0, '');
}
/* ---- beach practice map: a mini beach with one court and the water ---- */
const beachCourt = new THREE.Group();
function buildBeachCourt() {
  const sandM = mat(0xffffff, { map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f0dfae'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = ['#e6d29c', '#f7e8bd', '#dcc68f', '#fff3cf'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } }, [60, 60]) });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), sandM); sand.rotation.x = -Math.PI / 2; sand.position.y = -0.03; beachCourt.add(sand);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 160), mat(0x3fb4e6, { roughness: .4 })); water.rotation.x = -Math.PI / 2; water.position.set(100 + 30, -0.02, 0); beachCourt.add(water);   // sea along the +x side
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(3, 300), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, depthWrite: false })); shore.rotation.x = -Math.PI / 2; shore.position.set(50, 0.01, 0); beachCourt.add(shore);
  const lineM = mat(0xffffff); const hx = COURT_W / 2, hz = COURT_L / 2;
  for (const [x, z, w, dd] of [[0, -hz, hx * 2, 0.12], [0, hz, hx * 2, 0.12], [-hx, 0, 0.12, hz * 2], [hx, 0, 0.12, hz * 2], [0, 0, hx * 2, 0.12]]) { const l = box(w, 0.03, dd, lineM, x, 0.0, z, beachCourt); l.castShadow = false; }
  buildNet(beachCourt, 0, 0, 0, NET_HALF, COURT_W / 2);
  const trunkM = mat(0xa9764f), leafM = mat(0x4fae5b);
  const palm = (x, z, h = 5) => { const t = cyl(0.18, 0.28, h, trunkM, x, h / 2, z, beachCourt, 7); t.rotation.z = 0.08; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const leaf = box(2.6, 0.08, 0.7, leafM, x + Math.cos(a) * 1.3, h - 0.15, z + Math.sin(a) * 1.3, beachCourt); leaf.rotation.y = -a; leaf.rotation.z = 0.35; } };
  palm(-18, -20, 6); palm(-20, 16, 5); palm(18, -22, 5.5); palm(22, 20, 6); palm(-28, 0, 5); palm(30, -6, 5.5);
  const umbrella = (x, z, color) => { cyl(0.05, 0.05, 2.4, mat(0xf5f5f5), x, 1.2, z, beachCourt, 6); const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), mat(color)); top.position.set(x, 2.4, z); beachCourt.add(top); };
  umbrella(-16, 8, 0xe5484d); umbrella(24, -14, 0x3b8ff0); umbrella(-24, -10, 0xf5c542);
  for (const [x, z] of [[-14, -14], [16, 12], [-22, 6], [26, 4]]) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), mat(0xc9c2b4)); r.position.set(x, 0.25, z); beachCourt.add(r); }
  const scoreBoard = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.4), new THREE.MeshBasicMaterial({ map: scoreTex })); scoreBoard.position.set(-14, 4.5, 0); scoreBoard.rotation.y = Math.PI / 2; beachCourt.add(scoreBoard);
  box(0.2, 5.6, 0.2, mat(0x8a6a4a), -14, 2.8, -4.2, beachCourt); box(0.2, 5.6, 0.2, mat(0x8a6a4a), -14, 2.8, 4.2, beachCourt);
}
function drawScore(a, b, mode) {
  if (!scoreTex) return;
  const c = scoreTex.image, g = c.getContext('2d'); g.fillStyle = '#15161c'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 170px Montserrat, Arial'; g.fillStyle = '#fff';
  g.fillText(a, 260, 150); g.fillText(b, 764, 150); g.fillText('-', 512, 140);
  g.font = '900 40px Montserrat, Arial'; g.fillStyle = '#aaa'; g.fillText(TEAM_NAME.A, 260, 265); g.fillText(TEAM_NAME.B, 764, 265); g.fillText(mode || '', 512, 265);
  scoreTex.needsUpdate = true;
}

/* =====================================================================
   BALL
   ===================================================================== */
const BALL_R = 0.3, BALL_G = 12.5;   // slightly floaty ball gravity
/* ball skins: same radius / hitbox for every skin, looks only */
const SKINS = {
  default:    { name: 'Classic', price: 0, rarity: 'common' },
  black:      { name: 'Black', price: 500, rarity: 'common' },
  beach:      { name: 'Beach', price: 1000, rarity: 'common' },
  lowpoly:    { name: 'Low Poly', price: 1500, rarity: 'rare' },
  basketball: { name: 'Basketball', price: 2000, rarity: 'rare' },
  fire:       { name: 'Fire', price: 2500, rarity: 'epic' },
  gold:       { name: 'Gold', price: 5000, rarity: 'epic' },
  chromatic:  { name: 'Chromatic', price: 10000, rarity: 'legendary' },
};
const MODELS = { boy: { name: 'Boy', price: 0, rarity: 'common' }, girl: { name: 'Girl', price: 0, rarity: 'common' }, dealer: { name: 'Lil Man Dealer', price: 10000, rarity: 'epic' }, tux: { name: 'Tuxedo Man', price: 3000, rarity: 'rare' } };
const EMOTES = { wave: { name: 'Wave', price: 500, rarity: 'common' }, clap: { name: 'Clap', price: 500, rarity: 'common' }, worm: { name: 'Worm', price: 7500, rarity: 'epic' } };
const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const FXS = { none: { name: 'None', price: 0, rarity: 'common' }, confetti: { name: 'Confetti', price: 3000, rarity: 'rare' }, heart: { name: 'Heart', price: 5000, rarity: 'rare' }, smite: { name: 'Smite', price: 10000, rarity: 'legendary' }, hammock: { name: 'Hammock', price: 10000, rarity: 'epic' }, blackhole: { name: 'Black Hole', price: 20000, rarity: 'mythic' } };
const AURAS = [];   // chromatic auras (colour cycles every frame)
const SKIN_CACHE = {}; const BALL_GLOW = 0.32;   // keeps balls at their old brightness under the darker lighting
function skinMaterial(id) {
  if (SKIN_CACHE[id]) return SKIN_CACHE[id];
  let m;
  if (id === 'basketball') {
    const tex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#e8702a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 7;
      for (let i = 0; i < 4; i++) { const x = i * 128; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      for (let i = 0; i < 4; i++) { const x = i * 128 + 64; g.beginPath(); g.moveTo(x - 40, 0); g.quadraticCurveTo(x + 30, h / 2, x - 40, h); g.stroke(); }
    });
    m = mat(0xffffff, { map: tex, roughness: .8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BALL_GLOW });
  } else if (id === 'chromatic') m = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: .35 + BALL_GLOW, roughness: .3 });
  else if (id === 'black') m = mat(0x151515, { roughness: .6, emissive: 0x151515, emissiveIntensity: BALL_GLOW });
  else if (id === 'lowpoly') m = new THREE.MeshStandardMaterial({ color: 0xc4e3ea, roughness: .55, flatShading: true, emissive: 0xc4e3ea, emissiveIntensity: BALL_GLOW });
  else if (id === 'fire') {
    const tex = canvasTex(512, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffdd55'); gr.addColorStop(0.5, '#ff6a1f'); gr.addColorStop(1, '#8a0f0f'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a0a05'; g.lineWidth = 8; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 60, h); g.stroke(); } });
    m = mat(0xffffff, { map: tex, roughness: .5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BALL_GLOW });
  } else if (id === 'gold') m = mat(0xffc63a, { metalness: .9, roughness: .25, emissive: 0xffc63a, emissiveIntensity: BALL_GLOW });
  else if (id === 'beach') {
    const tex = canvasTex(512, 256, (g, w, h) => { const cols = ['#ffffff', '#e5484d', '#f5c542', '#3b8ff0', '#ffffff', '#3ecf5a', '#e5484d', '#f5c542']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i]; g.fillRect(i * 64, 0, 64, h); } });
    m = mat(0xffffff, { map: tex, roughness: .7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BALL_GLOW });
  } else {
    const tex = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { g.fillStyle = '#2f6bff'; g.fillRect(i * 128, 0, 44, h); g.fillStyle = '#ffd000'; g.fillRect(i * 128 + 44, 0, 44, h); } g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 118, w, 20); });
    m = mat(0xffffff, { map: tex, roughness: .7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BALL_GLOW });
  }
  return SKIN_CACHE[id] = m;
}
const BALL_GEO = new THREE.SphereGeometry(BALL_R, 20, 16), BALL_GEO_LP = new THREE.IcosahedronGeometry(BALL_R, 1);
function applySkin(mesh, id) {
  id = SKINS[id] ? id : 'default'; mesh.geometry = id === 'lowpoly' ? BALL_GEO_LP : BALL_GEO; mesh.material = skinMaterial(id); mesh.userData.skin = id;
  // chromatic: glowing rainbow aura around the ball (visual only - hitbox is unchanged)
  const old = mesh.getObjectByName('aura'); if (old) { mesh.remove(old); const i = AURAS.indexOf(old.material); if (i >= 0) AURAS.splice(i, 1); }
  if (id === 'chromatic') {
    const am = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    const aura = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.45, 20, 16), am); aura.name = 'aura'; mesh.add(aura);
    const am2 = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    const aura2 = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.9, 20, 16), am2); aura2.name = 'aura'; aura.add(aura2);
    AURAS.push(am, am2);
  }
}
function updateAuras(t) { if (!AURAS.length) return; for (let i = 0; i < AURAS.length; i++) AURAS[i].color.setHSL((t * 0.35 + i * 0.08) % 1, 1, 0.55); }
function makeBallMesh(skin = 'default') {
  const m = new THREE.Mesh(BALL_GEO, skinMaterial('default')); applySkin(m, skin); m.castShadow = true;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.2, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35 })); shadow.rotation.x = -Math.PI / 2;
  return { mesh: m, shadow };
}
