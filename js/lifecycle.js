// lifecycle.js — 變態生命週期的階段模型
// buildStages(sp, builtAdult, life) → 長度 4 的陣列,對應 meta.stages:
//   完全變態:[卵, 幼蟲, 蛹, {adult:true}]
//   不完全變態:[卵, 若蟲(小·去翅), 蛻皮前若蟲(大·去翅), {adult:true}]
//   幼蟲/蛹用原型模型;若蟲由成蟲 clone 去翅縮小(維持物種辨識度)。
//   每個階段(除成蟲)回傳 { group, baseLength, animate(t) };成蟲階段回傳 { adult:true }。
import * as THREE from 'three';

const cream = () => new THREE.MeshStandardMaterial({ color: '#ece2c8', roughness: 0.55, metalness: 0 });
const soft = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });
const gloss = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3 });

function seg(rx, ry, rz, mat) { const g = new THREE.SphereGeometry(1, 16, 14); g.scale(rx, ry, rz); return new THREE.Mesh(g, mat); }
function tubeAlong(pts, r, mat, rad = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r, rad, false), mat);
}

// ---- 卵(一小簇) ----
function egg(accent) {
  const g = new THREE.Group();
  const m1 = new THREE.MeshPhysicalMaterial({ color: '#efe7d0', roughness: 0.3, metalness: 0, clearcoat: 0.7, transmission: 0.15, thickness: 0.2 });
  const m2 = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.35, metalness: 0, clearcoat: 0.5 });
  const spots = [[0, 0, 0, 1], [0.14, 0.02, 0.05, 0.85], [-0.12, 0.01, -0.06, 0.9], [0.05, 0.03, -0.14, 0.8], [-0.06, 0.0, 0.13, 0.82], [0.16, 0.0, -0.08, 0.7]];
  spots.forEach(([x, y, z, s], i) => {
    const e = seg(0.08 * s, 0.11 * s, 0.08 * s, i % 3 === 0 ? m2 : m1);
    e.position.set(x, y + 0.11 * s, z); g.add(e);
  });
  return { group: g, baseLength: 0.42, animate: (t) => { g.rotation.y = t * 0.2; } };
}

// ---- 毛蟲(蝴蝶) ----
function caterpillar(accent) {
  const g = new THREE.Group();
  const body = soft('#7bbf4a', 0.6);
  const band = soft(accent, 0.55);
  const segs = [];
  for (let i = 0; i < 11; i++) {
    const r = 0.075 * (1 - Math.abs(i - 5) * 0.045);
    const s = seg(r, r * 1.05, r, i % 2 ? band : body);
    s.position.set(0.5 - i * 0.1, Math.sin(i) * 0.005, 0); g.add(s); segs.push(s);
  }
  // 頭
  const head = seg(0.08, 0.08, 0.08, soft('#4a7a2c')); head.position.set(0.58, 0, 0); g.add(head);
  // 小突起(偽足)
  for (let i = 2; i < 10; i += 2) [-1, 1].forEach((sd) => { const p = seg(0.02, 0.03, 0.02, body); p.position.set(0.5 - i * 0.1, -0.06, sd * 0.05); g.add(p); });
  return { group: g, baseLength: 1.05, animate: (t) => { segs.forEach((s, i) => { s.position.y = Math.sin(t * 3 - i * 0.6) * 0.02; }); } };
}

// ---- 雞母蟲(甲蟲類,C 形肥胖乳白) ----
function grub() {
  const g = new THREE.Group();
  const body = cream();
  const curve = [];
  for (let i = 0; i <= 10; i++) { const a = -1.1 + i * 0.22; curve.push([Math.cos(a) * 0.34, Math.sin(a) * 0.34 + 0.34, 0]); }
  const b = tubeAlong(curve, 0.13, body, 12); g.add(b);
  // 分節環
  const ringMat = soft('#d8cba8', 0.6);
  for (let i = 1; i < 10; i++) { const a = -1.1 + i * 0.22; const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16), ringMat); ring.position.set(Math.cos(a) * 0.34, Math.sin(a) * 0.34 + 0.34, 0); ring.rotation.y = Math.PI / 2; ring.rotation.z = a; g.add(ring); }
  // 褐色頭
  const head = seg(0.1, 0.1, 0.1, soft('#8a5a2c', 0.5)); head.position.set(Math.cos(-1.1) * 0.34, Math.sin(-1.1) * 0.34 + 0.34, 0); g.add(head);
  return { group: g, baseLength: 0.95, animate: (t) => { g.rotation.z = Math.sin(t * 1.2) * 0.05; } };
}

// ---- 蛆(蜜蜂/螞蟻,無足乳白) ----
function maggot() {
  const g = new THREE.Group();
  const body = cream();
  for (let i = 0; i < 8; i++) { const r = 0.07 * (1 - Math.abs(i - 2.5) * 0.06); const s = seg(r, r, r * 1.1, body); s.position.set(0.3 - i * 0.085, 0, 0); g.add(s); }
  const head = seg(0.04, 0.04, 0.04, soft('#c8b48a', 0.5)); head.position.set(0.34, 0, 0); g.add(head);
  return { group: g, baseLength: 0.66, animate: (t) => { g.rotation.z = Math.sin(t * 2) * 0.04; } };
}

// ---- 鱷魚狀幼蟲(瓢蟲/螢火蟲,細長多節有足) ----
function alligator(accent, glow) {
  const g = new THREE.Group();
  const body = soft(glow ? '#2a2620' : '#3b4a55', 0.55);
  const seam = glow
    ? new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: new THREE.Color('#c9ff5a'), emissiveIntensity: 1.2, roughness: 0.5 })
    : soft(accent, 0.5);
  const segs = [];
  for (let i = 0; i < 9; i++) {
    const r = 0.075 * (1 - i * 0.05);
    const s = seg(r + 0.01, r, 0.07, i % 2 ? seam : body);
    s.position.set(0.4 - i * 0.1, 0, 0); s.rotation.y = Math.PI / 2; g.add(s); segs.push(s);
    // 側棘
    if (i < 7) [-1, 1].forEach((sd) => { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 5), body); sp.position.set(0.4 - i * 0.1, 0.01, sd * (r + 0.02)); sp.rotation.z = sd * -1.3; g.add(sp); });
  }
  const head = seg(0.08, 0.06, 0.09, body); head.position.set(0.46, 0, 0); g.add(head);
  // 六小足
  [0.34, 0.24, 0.14].forEach((x) => [-1, 1].forEach((sd) => { const l = tubeAlong([[x, -0.02, sd * 0.05], [x - 0.02, -0.1, sd * 0.12], [x - 0.02, -0.16, sd * 0.14]], 0.012, body); g.add(l); }));
  let glowMat = glow ? seam : null;
  return { group: g, baseLength: 1.0, animate: (t) => { segs.forEach((s, i) => { s.position.y = Math.sin(t * 3 - i * 0.5) * 0.015; }); if (glowMat) glowMat.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 2)) * 1.6; } };
}

// ---- 懸蛹(蝴蝶,吊掛的角錐狀) ----
function chrysalis(accent) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#8fae5a', roughness: 0.4, metalness: 0.2, clearcoat: 0.5, iridescence: 0.4 });
  const shape = tubeAlong([[0, 0.5, 0], [0.02, 0.2, 0], [0.09, -0.05, 0], [0.06, -0.3, 0], [0, -0.42, 0]], 0.13, mat, 14);
  shape.scale.set(1, 1, 0.85); g.add(shape);
  // 金點
  for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshStandardMaterial({ color: '#f5d76e', metalness: 0.8, roughness: 0.3 })); d.position.set(0.06, 0.1 - i * 0.08, 0.06); g.add(d); }
  // 懸絲
  const silk = tubeAlong([[0, 0.5, 0], [0, 0.62, 0]], 0.008, soft('#ccc', 0.8)); g.add(silk);
  return { group: g, baseLength: 0.92, animate: (t) => { g.rotation.z = Math.sin(t * 1.1) * 0.06; } };
}

// ---- 裸蛹(甲蟲/蜜蜂,可見肢翅輪廓) ----
function mummy(accent) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 0.5, metalness: 0.05 });
  const b = seg(0.16, 0.16, 0.34, mat); b.rotation.y = Math.PI / 2; g.add(b);
  // 分節環
  for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.02, 0.01, 6, 18), soft('#b89a6a', 0.6)); ring.position.set(-0.05 - i * 0.09, 0, 0); ring.rotation.y = Math.PI / 2; g.add(ring); }
  // 折疊肢/翅輪廓
  [-1, 1].forEach((sd) => {
    const wingLine = tubeAlong([[0.2, 0.02, sd * 0.1], [0.05, 0.04, sd * 0.15], [-0.15, 0.02, sd * 0.12]], 0.012, soft('#c2a878', 0.5)); g.add(wingLine);
    const legLine = tubeAlong([[0.22, -0.05, sd * 0.08], [0.05, -0.08, sd * 0.14], [-0.1, -0.05, sd * 0.1]], 0.01, soft('#c2a878', 0.5)); g.add(legLine);
  });
  const head = seg(0.11, 0.1, 0.1, mat); head.position.set(0.28, 0.02, 0); g.add(head);
  return { group: g, baseLength: 0.85, animate: (t) => { g.position.y = Math.sin(t * 1.5) * 0.01; } };
}

// ---- 繭(螞蟻,絲質橢圓) ----
function cocoon() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#e6dcc0', roughness: 0.85, metalness: 0 });
  const b = seg(0.15, 0.15, 0.3, mat); b.rotation.y = Math.PI / 2; g.add(b);
  // 絲紋
  for (let i = 0; i < 8; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15 * Math.sin((i + 1) / 9 * Math.PI) + 0.02, 0.006, 5, 16), soft('#d8cca8', 0.9)); ring.position.set(0.24 - i * 0.06, 0, 0); ring.rotation.y = Math.PI / 2; g.add(ring); }
  return { group: g, baseLength: 0.78, animate: () => {} };
}

const LARVA = { caterpillar, grub, maggot, alligator };
const PUPA = { chrysalis, mummy, cocoon };

// 由成蟲 clone 去翅縮小 → 若蟲
function nymphFromAdult(builtAdult, scale, tintGreen) {
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
    return [
      egg(accent),
      nymphFromAdult(builtAdult, 0.5, true),   // 若蟲(小)
      nymphFromAdult(builtAdult, 0.82, false),  // 蛻皮前若蟲(大)
      { adult: true },
    ];
  }
  const larva = (LARVA[life.larva] || caterpillar)(accent, life.glow);
  const pupa = (PUPA[life.pupa] || mummy)(accent);
  return [egg(accent), larva, pupa, { adult: true }];
}
