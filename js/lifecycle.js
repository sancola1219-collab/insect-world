// lifecycle.js — 變態生命週期的階段模型(卵/幼蟲/蛹),力求形似真實、質感細緻。
// buildStages(sp, builtAdult, life) → 長度 4 的陣列,對應 meta.stages:
//   完全變態:[卵, 幼蟲, 蛹, {adult:true}]
//   不完全變態:[卵, 若蟲(小·去翅), 蛻皮前若蟲(大·去翅), {adult:true}]
//   每個階段(除成蟲)回傳 { group, baseLength, animate(t) };成蟲回傳 { adult:true }。
import * as THREE from 'three';

// ---------- 共用材質與零件 ----------
const soft = (c, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.03 });
const waxy = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.3, ...extra });
const skin = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, metalness: 0.02, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), ...extra });

function seg(rx, ry, rz, mat) { const g = new THREE.SphereGeometry(1, 20, 16); g.scale(rx, ry, rz); return new THREE.Mesh(g, mat); }
function tubeAlong(pts, r, mat, rad = 8) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(c, 26, r, rad, false), mat);
}
// 沿 X 軸的分節溝紋(細環)
function groove(x, y, z, r, mat) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.05, 6, 20), mat);
  ring.position.set(x, y, z); ring.rotation.y = Math.PI / 2; return ring;
}
// 蟲體常見的柔軟豐滿輪廓:中段最粗、兩端漸收
const plump = (u) => Math.pow(Math.sin(Math.PI * (0.14 + 0.72 * u)), 0.5);

// ---- 卵(直立小叢,停在小葉片上) ----
function egg(accent) {
  const g = new THREE.Group();
  const shell = waxy('#f3ecd6', { transmission: 0.28, thickness: 0.3, ior: 1.4, roughness: 0.18, clearcoat: 0.85, clearcoatRoughness: 0.1 });
  const tinted = waxy(accent, { transmission: 0.18, roughness: 0.25 });
  const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ color: '#4f8130', roughness: 0.75, side: THREE.DoubleSide }));
  leaf.rotation.x = -Math.PI / 2; leaf.position.y = -0.005; g.add(leaf);
  const vein = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.002, 0.01), new THREE.MeshStandardMaterial({ color: '#3d6624' })); vein.position.y = 0; g.add(vein);
  const spots = [[0, 0], [0.1, 0.06], [-0.09, 0.05], [0.05, -0.1], [-0.06, -0.08], [0.12, -0.03], [-0.12, -0.02]];
  const eggs = [];
  spots.forEach(([x, z], i) => {
    const r = 0.05 + (i % 3) * 0.006;
    const e = seg(r, r * 1.35, r, i % 4 === 0 ? tinted : shell);
    e.position.set(x, r * 1.35, z); g.add(e); eggs.push(e);
    // 縱稜(butterfly egg 的直紋)
    for (let k = 0; k < 6; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.004, r * 2.2, 0.004), soft('#e6dcc0', 0.6)); const a = k / 6 * Math.PI * 2; rib.position.set(x + Math.cos(a) * r * 0.95, r * 1.35, z + Math.sin(a) * r * 0.95); g.add(rib); }
  });
  return { group: g, baseLength: 0.5, animate: (t) => { g.rotation.y = t * 0.15; eggs.forEach((e, i) => { e.scale.y = 1 + Math.sin(t * 2 + i) * 0.02; }); } };
}

// ---- 毛蟲(蝴蝶):豐滿分節、有頭殼與臉、真足+腹足 ----
function caterpillar(accent) {
  const g = new THREE.Group();
  const bodyMat = skin('#8ec63f');
  const stripeMat = skin('#5f9a2a');
  const grooveMat = soft('#4f7d24', 0.6);
  const n = 12, len = 0.98, x0 = 0.48;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const r = 0.1 * plump(u) + 0.022;
    const x = x0 - u * len;
    const y = Math.sin(u * Math.PI) * 0.05;               // 微拱背
    const s = seg(r * 1.02, r, r * 1.02, bodyMat); s.position.set(x, y, 0); g.add(s); segs.push({ s, x, y, r });
    if (i > 0) g.add(groove(x + len / (n - 1) * 0.5, y, 0, r * 0.96, grooveMat));
    // 背中線斑 + 側氣孔點
    const dot = seg(0.02, 0.014, 0.02, stripeMat); dot.position.set(x, y + r * 0.85, 0); g.add(dot);
    if (i > 1 && i < n - 1) [-1, 1].forEach((sd) => { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), soft('#2f2f2f', 0.4)); sp.position.set(x, y - r * 0.2, sd * r * 0.95); g.add(sp); });
  }
  // 頭殼 + 臉
  const headR = 0.095;
  const head = seg(headR, headR * 0.98, headR, skin('#6aa82e')); head.position.set(x0 + 0.06, 0.04, 0); g.add(head);
  [-1, 1].forEach((sd) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), soft('#141414', 0.25)); e.position.set(x0 + 0.13, 0.05, sd * 0.045); g.add(e); });
  const mand = seg(0.03, 0.02, 0.05, soft('#3a5a1c', 0.5)); mand.position.set(x0 + 0.15, -0.02, 0); g.add(mand);
  // 3 對真足(近頭)
  const trueLegs = soft('#2f4f18', 0.5);
  for (let k = 0; k < 3; k++) [-1, 1].forEach((sd) => { g.add(tubeAlong([[x0 - 0.02 - k * 0.08, -0.02, sd * 0.03], [x0 - 0.02 - k * 0.08, -0.09, sd * 0.07]], 0.011, trueLegs)); });
  // 4 對腹足(肉質短樁)
  const proMat = skin('#7db535');
  for (let k = 0; k < 4; k++) [-1, 1].forEach((sd) => { const pr = seg(0.028, 0.04, 0.03, proMat); pr.position.set(0.06 - k * 0.11, -0.07, sd * 0.06); g.add(pr); });
  // 尾足(anal clasper)
  const clasp = seg(0.04, 0.045, 0.05, proMat); clasp.position.set(x0 - len - 0.01, -0.02, 0); g.add(clasp);
  return { group: g, baseLength: 1.05, animate: (t) => { segs.forEach(({ s, y }, i) => { s.position.y = y + Math.sin(t * 3 - i * 0.55) * 0.02; }); } };
}

// ---- 雞母蟲(甲蟲類):C 形肥胖、褐色頭殼、分節褶、捲曲胸足 ----
function grub() {
  const g = new THREE.Group();
  const bodyMat = skin('#f2e6c9', { transmission: 0.05 });
  const foldMat = soft('#ddceac', 0.6);
  const R = 0.36, n = 11;
  const at = (u) => { const a = -1.3 + u * 2.5; return { a, x: Math.cos(a) * R, y: Math.sin(a) * R + 0.36 }; };
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1); const { a, x, y } = at(u);
    const rr = 0.15 * plump(Math.min(u * 1.15, 1)) + 0.03;   // 尾端略胖
    const s = seg(rr, rr, rr, bodyMat); s.position.set(x, y, 0); g.add(s);
    if (i > 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.96, rr * 0.05, 6, 18), foldMat); ring.position.set(x, y, 0); ring.rotation.z = a; ring.rotation.x = Math.PI / 2; g.add(ring); }
  }
  // 尾端半透(內臟)
  const tail = at(1); const gut = seg(0.15, 0.15, 0.15, waxy('#d8c69a', { transmission: 0.3, roughness: 0.4 })); gut.position.set(tail.x, tail.y, 0); g.add(gut);
  // 褐色硬頭殼 + 大顎
  const h = at(-0.05); const head = seg(0.11, 0.1, 0.11, waxy('#9c6a34', { clearcoat: 0.6 })); head.position.set(h.x + 0.02, h.y, 0); g.add(head);
  [-1, 1].forEach((sd) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), soft('#5a3a1a', 0.4)); m.position.set(h.x + 0.09, h.y - 0.01, sd * 0.04); m.rotation.z = -1.1; g.add(m); });
  // 3 對捲曲胸足(近頭)
  for (let k = 0; k < 3; k++) { const p = at(0.03 + k * 0.06); [-1, 1].forEach((sd) => { g.add(tubeAlong([[p.x, p.y, sd * 0.04], [p.x + 0.05, p.y - 0.07, sd * 0.09], [p.x + 0.03, p.y - 0.13, sd * 0.1]], 0.012, soft('#caa877', 0.5))); }); }
  return { group: g, baseLength: 0.95, animate: (t) => { g.rotation.z = Math.sin(t * 1.1) * 0.04; } };
}

// ---- 蛆(蜜蜂/螞蟻幼蟲):無足、逗點狀、半透乳白 ----
function maggot() {
  const g = new THREE.Group();
  const bodyMat = skin('#efe3c6', { transmission: 0.12, roughness: 0.4 });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const r = 0.075 * plump(u) + 0.015;
    const x = 0.28 - u * 0.56;
    const y = -Math.sin(u * Math.PI) * 0.06;               // 逗點微彎
    const s = seg(r, r, r * 1.08, bodyMat); s.position.set(x, y, 0); g.add(s);
    if (i > 0) g.add(groove(x + 0.03, y, 0, r * 0.95, soft('#e0d3b0', 0.6)));
  }
  const head = seg(0.035, 0.035, 0.04, soft('#caa877', 0.5)); head.position.set(0.3, 0.005, 0); g.add(head);
  return { group: g, baseLength: 0.62, animate: (t) => { g.rotation.z = Math.sin(t * 2) * 0.05; } };
}

// ---- 鱷魚狀幼蟲(瓢蟲/螢火蟲):細長多節、側疣突、六足、頭具大顎 ----
function alligator(accent, glow) {
  const g = new THREE.Group();
  const baseCol = glow ? '#2b2620' : '#39495a';
  const bodyMat = waxy(baseCol, { roughness: 0.5 });
  const wart = glow
    ? new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: new THREE.Color('#c9ff5a'), emissiveIntensity: 1.2, roughness: 0.5 })
    : soft('#e07a2a', 0.45);   // 瓢蟲幼蟲的橙色疣斑
  const segs = [];
  for (let i = 0; i < 10; i++) {
    const u = i / 9;
    const r = 0.085 * (1 - u * 0.55) + 0.02;
    const x = 0.42 - u * 0.86;
    const s = seg(r + 0.008, r, 0.062, bodyMat); s.position.set(x, 0, 0); s.rotation.y = Math.PI / 2; g.add(s); segs.push({ s });
    // 背/側疣突
    if (i > 0 && i < 8) [-1, 1].forEach((sd) => { const w = seg(0.02, 0.024, 0.02, wart); w.position.set(x, r * 0.4, sd * (r + 0.01)); g.add(w); });
    if (i % 3 === 1) { const dn = seg(0.018, 0.022, 0.018, wart); dn.position.set(x, r * 0.9, 0); g.add(dn); }
  }
  // 頭 + 大顎
  const head = seg(0.075, 0.06, 0.088, bodyMat); head.position.set(0.46, 0, 0); g.add(head);
  [-1, 1].forEach((sd) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 6), bodyMat); m.position.set(0.54, 0, sd * 0.04); m.rotation.z = -1.4; m.rotation.y = sd * 0.3; g.add(m); });
  // 六足
  const legMat = soft(glow ? '#20201a' : '#2a3540', 0.5);
  [0.34, 0.24, 0.14].forEach((x) => [-1, 1].forEach((sd) => { g.add(tubeAlong([[x, -0.03, sd * 0.05], [x - 0.02, -0.11, sd * 0.13], [x - 0.03, -0.18, sd * 0.15]], 0.012, legMat)); }));
  const glowMat = glow ? wart : null;
  return { group: g, baseLength: 1.0, animate: (t) => { segs.forEach(({ s }, i) => { s.position.y = Math.sin(t * 3 - i * 0.5) * 0.015; }); if (glowMat) glowMat.emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 2)) * 1.7; } };
}

// ---- 懸蛹(蝴蝶):車床曲面成形的優雅懸垂蛹,金點+懸絲 ----
function chrysalis(accent) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#7fae57', roughness: 0.32, metalness: 0.18, clearcoat: 0.75, clearcoatRoughness: 0.22, iridescence: 0.55, iridescenceIOR: 1.6 });
  // 縱剖輪廓(頂端懸垂柄 → 中段鼓 → 底端頭部尖收)
  const prof = [[0.015, 0.5], [0.05, 0.45], [0.1, 0.37], [0.145, 0.26], [0.162, 0.12], [0.158, -0.04], [0.135, -0.2], [0.095, -0.33], [0.05, -0.43], [0.012, -0.48], [0.001, -0.5]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const shell = new THREE.Mesh(geo, mat); shell.scale.z = 0.82; g.add(shell);
  // 翅芽稜線(前腹兩道微凸弧)
  [-1, 1].forEach((sd) => { g.add(tubeAlong([[0.02, 0.2, sd * 0.02], [0.09, 0.02, sd * 0.1], [0.06, -0.22, sd * 0.09]], 0.01, new THREE.MeshStandardMaterial({ color: '#6f9a48', roughness: 0.4 }))); });
  // 金屬光澤點(帝王蝶蛹特徵)
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd76b', metalness: 0.9, roughness: 0.22, emissive: new THREE.Color('#4a3800'), emissiveIntensity: 0.4 });
  for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), gold); d.position.set(0, 0.22 - i * 0.07, 0.13); g.add(d); }
  [-1, 1].forEach((sd) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), gold); d.position.set(0, 0.28, sd * 0.05); g.add(d); });
  // 懸絲 + 尾柄(cremaster)
  g.add(tubeAlong([[0, 0.5, 0], [0.004, 0.6, 0.004], [-0.008, 0.66, 0]], 0.006, soft('#d8d8d0', 0.8)));
  return { group: g, baseLength: 0.98, animate: (t) => { g.rotation.z = Math.sin(t * 1.05) * 0.05; g.rotation.y = Math.sin(t * 0.7) * 0.12; } };
}

// ---- 裸蛹(甲蟲/蜜蜂):看得出正在成形的成蟲——頭胸膨大、翅芽、折疊足與觸角、彎曲分節腹 ----
function mummy(accent) {
  const g = new THREE.Group();
  const mat = waxy('#e9cfa0', { transmission: 0.04, roughness: 0.38, clearcoat: 0.45 });
  const line = soft('#c39f66', 0.5);
  // 頭胸(前段膨大)
  const thorax = seg(0.17, 0.17, 0.2, mat); thorax.position.set(0.15, 0.03, 0); g.add(thorax);
  // 腹部(向下微彎、漸尖、分節)
  for (let i = 0; i < 6; i++) {
    const u = i / 5; const rr = 0.15 - u * 0.088; const x = -0.02 - i * 0.1; const y = 0.03 - u * u * 0.13;
    const s = seg(rr, rr, rr * 0.95, mat); s.position.set(x, y, 0); g.add(s);
    g.add(groove(x - 0.05, y, 0, rr * 0.96, line));
  }
  // 頭(前端下壓)
  const head = seg(0.1, 0.09, 0.11, mat); head.position.set(0.31, -0.03, 0); g.add(head);
  [-1, 1].forEach((sd) => {
    // 折疊觸角(貼頭往後)
    g.add(tubeAlong([[0.36, -0.01, sd * 0.05], [0.28, -0.06, sd * 0.11], [0.18, -0.09, sd * 0.12]], 0.01, line));
    // 背側翅芽(扁平大片)
    const wp = seg(0.025, 0.1, 0.14, mat); wp.position.set(0.1, 0.07, sd * 0.12); wp.rotation.y = sd * 0.18; g.add(wp);
    // 折疊足(腹側三條)
    for (let k = 0; k < 3; k++) g.add(tubeAlong([[0.27 - k * 0.08, -0.09, sd * 0.06], [0.23 - k * 0.08, -0.14, sd * 0.11], [0.15 - k * 0.08, -0.11, sd * 0.13]], 0.009, line));
  });
  return { group: g, baseLength: 0.85, animate: (t) => { g.position.y = Math.sin(t * 1.4) * 0.008; g.rotation.z = Math.sin(t * 0.9) * 0.02; } };
}

// ---- 繭(螞蟻):絲質橢圓,層層絲紋 ----
function cocoon() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#eae0c6', roughness: 0.85, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color('#fff8e0') });
  const b = seg(0.15, 0.15, 0.3, mat); b.rotation.y = Math.PI / 2; g.add(b);
  const thread = soft('#dccfa8', 0.9);
  for (let i = 0; i < 12; i++) { const rr = 0.15 * Math.sin((i + 0.5) / 12 * Math.PI) + 0.015; const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.006, 5, 18), thread); ring.position.set(0.26 - i * 0.045, 0, 0); ring.rotation.y = Math.PI / 2; ring.rotation.z = i * 0.4; g.add(ring); }
  return { group: g, baseLength: 0.78, animate: () => {} };
}

const LARVA = { caterpillar, grub, maggot, alligator };
const PUPA = { chrysalis, mummy, cocoon };

// 由成蟲 clone 去翅縮小 → 若蟲
function nymphFromAdult(builtAdult, scale) {
  const clone = builtAdult.group.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.traverse((o) => { if (o.userData && o.userData.isWing) o.visible = false; });
  const wrap = new THREE.Group(); wrap.add(clone); wrap.scale.setScalar(scale);
  return { group: wrap, baseLength: builtAdult.baseLength * scale, animate: (t) => { wrap.rotation.y = Math.sin(t * 0.6) * 0.08; } };
}

export function buildStages(sp, builtAdult, life) {
  const accent = sp.accent;
  if (life.kind === 'incomplete') {
    return [egg(accent), nymphFromAdult(builtAdult, 0.5), nymphFromAdult(builtAdult, 0.82), { adult: true }];
  }
  const larva = (LARVA[life.larva] || caterpillar)(accent, life.glow);
  const pupa = (PUPA[life.pupa] || mummy)(accent);
  return [egg(accent), larva, pupa, { adult: true }];
}
