// insects.js — 程序化昆蟲模型建構器
// 每個 builder 回傳:{ group, anchors, animate(t, moving), baseLength }
//   group    : THREE.Group,以「頭朝 +X、上為 +Y、翅展於 ±Z」建構,體長 ≈ 1 單位
//   anchors  : { partKey: THREE.Object3D } 供構造標註取世界座標(隨 group 縮放)
//   animate  : 純裝飾動畫(拍翅、擺足、懸停);被節流也不影響任何狀態
//   baseLength: 模型的參考長度(單位),用於相機取景
import * as THREE from 'three';
import * as TX from './textures.js';

// ---------- 共用材質與零件 ----------
const chitinMat = (base, rough = 0.5, opts = {}) => {
  const { map, rough: rmap } = TX.chitin(base, rough);
  return new THREE.MeshPhysicalMaterial({ map, roughnessMap: rmap, roughness: 1, metalness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.5, ...opts });
};
const glossMat = (color, opts = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.2, ...opts });
const eyeMat = (base = '#20303a') => new THREE.MeshStandardMaterial({ map: TX.compoundEye(base), roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(base).multiplyScalar(0.15) });

// 以 SphereGeometry 拉伸成體節
function segment(rx, ry, rz, mat, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, seg);
  g.scale(rx, ry, rz);
  return new THREE.Mesh(g, mat);
}
// 由控制點拉出的管狀肢體(半徑取頭尾平均;TubeGeometry 不支援沿長度漸變)
function tube(points, r0, r1, mat, rad = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 24, (r0 + r1) / 2, rad, false);
  return new THREE.Mesh(g, mat);
}

// 一條分節腿(coxa→femur→tibia),回傳含 pivot 的 group
function makeLeg(attach, dir, len, r, mat, droop = 0.5) {
  const pivot = new THREE.Group();
  pivot.position.set(...attach);
  const sx = dir[0], sz = dir[2];
  const femurEnd = [sx * len * 0.5, -len * 0.25 * droop, sz * len * 0.5];
  const tibiaEnd = [sx * len * 0.95, -len * droop, sz * len * 0.9];
  const foot = [sx * len * 1.05, -len * droop - len * 0.15, sz * len * 1.0];
  const leg = tube([[0, 0, 0], femurEnd, tibiaEnd, foot], r, r * 0.4, mat);
  pivot.add(leg);
  return pivot;
}

// 對稱六足,回傳所有 pivot(供步態動畫)
function addLegs(group, thoraxX, spread, len, r, mat, { droop = 0.5, spanZ = 0.28 } = {}) {
  const pivots = [];
  const xs = [thoraxX + spread, thoraxX, thoraxX - spread];
  xs.forEach((x, i) => {
    [-1, 1].forEach((side) => {
      const back = (i - 1) * 0.18; // 前中後足略微前後張開
      const p = makeLeg([x, -0.02, side * spanZ], [Math.sign(back) || (i - 1) * 0.4, 0, side], len, r, mat, droop);
      group.add(p);
      pivots.push({ p, side, phase: i });
    });
  });
  return pivots;
}

function anchor(group, anchors, key, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  group.add(o);
  anchors[key] = o;
  return o;
}

// 平面翅膀(以 Shape 生成葉形),plane 面朝 +Y
function wingMesh(len, wid, mat, curveBack = 0.35) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.2, wid, len * 0.75, wid, len, wid * curveBack);
  s.bezierCurveTo(len * 1.02, wid * 0.05, len * 0.9, -wid * 0.25, len * 0.55, -wid * 0.35);
  s.bezierCurveTo(len * 0.25, -wid * 0.4, len * 0.08, -wid * 0.2, 0, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  // 產生 UV(0..1)
  g.computeBoundingBox();
  const bb = g.boundingBox, uv = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    uv.push((pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2; // 平躺
  return m;
}

// ================= 各昆蟲 =================

function butterfly() {
  const group = new THREE.Group();
  const anchors = {};
  const body = chitinMat('#241a2e', 0.5);
  // 身體:細長胸腹
  const thorax = segment(0.10, 0.10, 0.12, body); thorax.position.x = 0.05; group.add(thorax);
  const abdomen = segment(0.07, 0.07, 0.26, body); abdomen.position.set(-0.22, 0, 0);
  abdomen.rotation.y = Math.PI / 2; group.add(abdomen);
  const head = segment(0.08, 0.08, 0.08, body); head.position.x = 0.2; group.add(head);
  // 複眼
  [-1, 1].forEach((s) => { const e = segment(0.045, 0.05, 0.045, eyeMat('#12202a')); e.position.set(0.24, 0.02, s * 0.06); group.add(e); });
  // 棒狀觸角
  [-1, 1].forEach((s) => {
    const a = tube([[0.26, 0.05, s * 0.03], [0.34, 0.16, s * 0.08], [0.38, 0.24, s * 0.12]], 0.008, 0.006, body);
    group.add(a);
    const club = segment(0.02, 0.02, 0.02, body); club.position.set(0.39, 0.26, s * 0.13); group.add(club);
  });
  // 虹吸口器(捲曲)
  const prob = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 20, Math.PI * 1.6), glossMat('#2a2018'));
  prob.position.set(0.26, -0.06, 0); prob.rotation.z = Math.PI * 0.5; group.add(prob);
  // 翅膀(結構色 + 白斑)
  const wingMat = new THREE.MeshPhysicalMaterial({ map: TX.butterflyWing(), side: THREE.DoubleSide, roughness: 0.35, metalness: 0.2, iridescence: 1, iridescenceIOR: 1.8, transparent: true });
  const wings = [];
  [-1, 1].forEach((s) => {
    const fore = new THREE.Group();
    const fw = wingMesh(0.5, 0.4, wingMat); fw.position.set(0, 0, 0);
    fore.add(fw); fore.position.set(0.08, 0.02, s * 0.08); fore.scale.z = s;
    group.add(fore);
    const hind = new THREE.Group();
    const hw = wingMesh(0.34, 0.34, wingMat);
    hind.add(hw); hind.position.set(-0.12, 0, s * 0.08); hind.scale.z = s;
    group.add(hind);
    wings.push({ fore, hind, s });
  });
  anchor(group, anchors, 'head', 0.24, 0.1, 0);
  anchor(group, anchors, 'antenna', 0.39, 0.3, 0.13);
  anchor(group, anchors, 'proboscis', 0.28, -0.12, 0);
  anchor(group, anchors, 'thorax', 0.05, 0.14, 0);
  anchor(group, anchors, 'wing', 0.2, 0.05, 0.5);
  anchor(group, anchors, 'abdomen', -0.35, 0, 0);
  anchor(group, anchors, 'leg', 0.0, -0.12, 0.1);
  addLegs(group, 0.05, 0.08, 0.18, 0.012, body, { droop: 0.7, spanZ: 0.1 });
  const animate = (t, moving) => {
    const flap = moving ? Math.sin(t * 6) * 0.9 : Math.sin(t * 1.5) * 0.18 + 0.1;
    wings.forEach(({ fore, hind, s }) => { fore.rotation.x = -flap * s; hind.rotation.x = -flap * 0.8 * s; });
    group.position.y = (moving ? Math.sin(t * 3) * 0.05 : 0);
  };
  return { group, anchors, animate, baseLength: 1.0 };
}

function beetle() {
  const group = new THREE.Group();
  const anchors = {};
  const shell = chitinMat('#3a2412', 0.35, { metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, iridescence: 0.3, iridescenceIOR: 2.0 });
  const dark = chitinMat('#1c130a', 0.4);
  // 鞘翅(半橢球)
  const elytra = segment(0.42, 0.28, 0.34, shell); elytra.position.set(-0.1, 0.08, 0); group.add(elytra);
  // 中央接縫
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.01), dark); seam.position.set(-0.1, 0.36, 0); group.add(seam);
  // 前胸背板
  const pron = segment(0.18, 0.14, 0.24, shell); pron.position.set(0.24, 0.06, 0); group.add(pron);
  // 頭
  const head = segment(0.1, 0.09, 0.14, dark); head.position.set(0.42, 0.02, 0); group.add(head);
  // 頭角(分叉)
  const hornMat = dark;
  const hornBase = tube([[0.46, 0.04, 0], [0.6, 0.16, 0], [0.66, 0.3, 0]], 0.05, 0.03, hornMat);
  group.add(hornBase);
  [-1, 1].forEach((s) => { const tip = tube([[0.66, 0.3, 0], [0.72, 0.42, s * 0.05], [0.74, 0.5, s * 0.09]], 0.025, 0.012, hornMat); group.add(tip); });
  // 前胸小角
  const pronHorn = tube([[0.3, 0.16, 0], [0.42, 0.26, 0], [0.4, 0.34, 0]], 0.04, 0.015, hornMat); group.add(pronHorn);
  // 複眼
  [-1, 1].forEach((s) => { const e = segment(0.04, 0.04, 0.04, eyeMat('#0c0a08')); e.position.set(0.44, 0.06, s * 0.1); group.add(e); });
  // 足(具鉤)
  const legs = addLegs(group, 0.1, 0.24, 0.34, 0.03, dark, { droop: 0.55, spanZ: 0.3 });
  anchor(group, anchors, 'horn', 0.74, 0.54, 0);
  anchor(group, anchors, 'head', 0.46, 0.0, 0.12);
  anchor(group, anchors, 'thorax', 0.24, 0.22, 0);
  anchor(group, anchors, 'elytra', -0.2, 0.36, 0);
  anchor(group, anchors, 'leg', 0.1, -0.18, 0.34);
  anchor(group, anchors, 'abdomen', -0.4, 0.05, 0);
  const animate = (t, moving) => {
    const w = moving ? 0.25 : 0;
    legs.forEach(({ p, side, phase }) => { p.rotation.z = Math.sin(t * 5 + phase * 2 + (side > 0 ? Math.PI : 0)) * w; });
  };
  return { group, anchors, animate, baseLength: 1.2 };
}

function bee() {
  const group = new THREE.Group();
  const anchors = {};
  const fuzz = new THREE.MeshStandardMaterial({ map: TX.fuzzBands(), roughness: 0.85, metalness: 0 });
  const dark = chitinMat('#1a1206', 0.5);
  // 胸(絨毛)
  const thorax = segment(0.13, 0.13, 0.13, fuzz); thorax.position.x = 0.02; group.add(thorax);
  // 腹(黃黑條紋,錐形)
  const abd = segment(0.11, 0.11, 0.2, fuzz); abd.position.set(-0.22, 0, 0); abd.rotation.y = Math.PI / 2; group.add(abd);
  // 頭
  const head = segment(0.1, 0.1, 0.09, dark); head.position.x = 0.17; group.add(head);
  [-1, 1].forEach((s) => { const e = segment(0.055, 0.07, 0.04, eyeMat('#0e0e12')); e.position.set(0.19, 0.02, s * 0.08); group.add(e); });
  // 膝狀觸角
  [-1, 1].forEach((s) => { const a = tube([[0.22, 0.04, s * 0.03], [0.28, 0.02, s * 0.06], [0.3, -0.04, s * 0.08]], 0.01, 0.006, dark); group.add(a); });
  // 膜翅(兩對)
  const wmat = new THREE.MeshPhysicalMaterial({ map: TX.wingMembrane('bee'), transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2, metalness: 0.1, iridescence: 0.8, transmission: 0.3 });
  const wings = [];
  [-1, 1].forEach((s) => {
    const fore = new THREE.Group(); const fw = wingMesh(0.34, 0.16, wmat); fore.add(fw);
    fore.position.set(0.04, 0.12, s * 0.06); fore.scale.z = s; group.add(fore);
    const hind = new THREE.Group(); const hw = wingMesh(0.22, 0.12, wmat); hind.add(hw);
    hind.position.set(-0.08, 0.11, s * 0.05); hind.scale.z = s; group.add(hind);
    wings.push({ fore, hind, s });
  });
  // 足 + 後足花粉籃
  const legs = addLegs(group, 0.02, 0.12, 0.2, 0.016, dark, { droop: 0.7, spanZ: 0.12 });
  [-1, 1].forEach((s) => { const basket = segment(0.03, 0.05, 0.03, new THREE.MeshStandardMaterial({ color: '#e8b62a', roughness: 0.6 })); basket.position.set(-0.14, -0.16, s * 0.14); group.add(basket); anchors['pollen'] = anchors['pollen'] || basket; });
  anchor(group, anchors, 'head', 0.19, 0.12, 0);
  anchor(group, anchors, 'antenna', 0.3, -0.06, 0.08);
  anchor(group, anchors, 'thorax', 0.02, 0.16, 0);
  anchor(group, anchors, 'wing', 0.1, 0.16, 0.3);
  anchor(group, anchors, 'abdomen', -0.34, 0, 0);
  anchor(group, anchors, 'leg', 0.02, -0.16, 0.14);
  const animate = (t, moving) => {
    const flap = moving ? Math.sin(t * 40) * 0.7 : Math.sin(t * 3) * 0.1;
    wings.forEach(({ fore, hind, s }) => { fore.rotation.x = -flap * s; hind.rotation.x = -flap * s; });
    group.position.y = moving ? Math.sin(t * 6) * 0.03 : 0;
  };
  return { group, anchors, animate, baseLength: 0.9 };
}

function dragonfly() {
  const group = new THREE.Group();
  const anchors = {};
  const body = chitinMat('#1f7a5f', 0.4, { metalness: 0.3, clearcoat: 0.6, iridescence: 0.5 });
  // 長腹部(分節)
  for (let i = 0; i < 9; i++) {
    const seg = segment(0.05 - i * 0.003, 0.05 - i * 0.003, 0.075, body);
    seg.position.set(-0.1 - i * 0.13, 0, 0); seg.rotation.y = Math.PI / 2; group.add(seg);
  }
  // 胸
  const thorax = segment(0.11, 0.12, 0.13, body); thorax.position.x = 0.05; group.add(thorax);
  // 頭 + 巨大複眼
  const head = segment(0.09, 0.08, 0.1, body); head.position.x = 0.2; group.add(head);
  const eye = eyeMat('#2b6b55');
  [-1, 1].forEach((s) => { const e = segment(0.09, 0.1, 0.08, eye); e.position.set(0.22, 0.04, s * 0.07); group.add(e); });
  // 四片網翅
  const wmat = new THREE.MeshPhysicalMaterial({ map: TX.wingMembrane('net'), transparent: true, opacity: 0.4, side: THREE.DoubleSide, roughness: 0.15, metalness: 0.1, iridescence: 1, transmission: 0.4 });
  const wings = [];
  [-1, 1].forEach((s) => {
    const fore = new THREE.Group(); const fw = wingMesh(0.62, 0.16, wmat); fore.add(fw);
    fore.position.set(0.08, 0.1, s * 0.05); fore.scale.z = s; group.add(fore);
    const hind = new THREE.Group(); const hw = wingMesh(0.6, 0.2, wmat); hind.add(hw);
    hind.position.set(-0.02, 0.09, s * 0.05); hind.scale.z = s; group.add(hind);
    // 翅痣
    const stig = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.02), new THREE.MeshBasicMaterial({ color: '#2a2a2a' }));
    stig.position.set(0.5, 0.1, s * 0.2); group.add(stig);
    wings.push({ fore, hind, s });
  });
  const legs = addLegs(group, 0.08, 0.06, 0.16, 0.012, body, { droop: 0.9, spanZ: 0.1 });
  anchor(group, anchors, 'eye', 0.24, 0.12, 0.12);
  anchor(group, anchors, 'head', 0.2, -0.06, 0);
  anchor(group, anchors, 'thorax', 0.05, 0.16, 0);
  anchor(group, anchors, 'wing', 0.2, 0.12, 0.5);
  anchor(group, anchors, 'abdomen', -0.7, 0, 0);
  anchor(group, anchors, 'leg', 0.08, -0.14, 0.1);
  const animate = (t, moving) => {
    const f1 = moving ? Math.sin(t * 24) * 0.5 : Math.sin(t * 2) * 0.06;
    const f2 = moving ? Math.sin(t * 24 + Math.PI) * 0.5 : f1; // 前後翅反相
    wings.forEach(({ fore, hind, s }) => { fore.rotation.x = -f1 * s; hind.rotation.x = -f2 * s; });
  };
  return { group, anchors, animate, baseLength: 1.6 };
}

function ladybug() {
  const group = new THREE.Group();
  const anchors = {};
  // 鞘翅半球(貼斑點圖)
  const shellMat = new THREE.MeshPhysicalMaterial({ map: TX.ladybugElytra(), roughness: 0.2, metalness: 0.15, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  dome.scale.set(1, 0.75, 1.05); dome.position.y = 0.02; group.add(dome);
  const belly = segment(0.4, 0.16, 0.42, chitinMat('#1a1010', 0.6)); belly.position.y = 0.0; group.add(belly);
  // 前胸 + 頭
  const dark = chitinMat('#111', 0.4);
  const pron = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  pron.scale.set(1, 0.6, 1.2); pron.position.set(0.34, 0.03, 0); group.add(pron);
  const head = segment(0.1, 0.08, 0.12, dark); head.position.set(0.46, 0.03, 0); group.add(head);
  [-1, 1].forEach((s) => { const e = segment(0.03, 0.035, 0.03, eyeMat('#0a0a0a')); e.position.set(0.5, 0.05, s * 0.08); group.add(e); });
  const legs = addLegs(group, 0.05, 0.22, 0.18, 0.018, dark, { droop: 0.6, spanZ: 0.28 });
  anchor(group, anchors, 'elytra', -0.05, 0.42, 0);
  anchor(group, anchors, 'head', 0.5, 0.02, 0);
  anchor(group, anchors, 'thorax', 0.34, 0.16, 0);
  anchor(group, anchors, 'leg', 0.05, -0.12, 0.26);
  anchor(group, anchors, 'abdomen', -0.2, -0.05, 0);
  const animate = (t, moving) => {
    const w = moving ? 0.3 : 0;
    legs.forEach(({ p, side, phase }) => { p.rotation.z = Math.sin(t * 7 + phase * 2 + (side > 0 ? Math.PI : 0)) * w; });
  };
  return { group, anchors, animate, baseLength: 0.95 };
}

function mantis() {
  const group = new THREE.Group();
  const anchors = {};
  const body = chitinMat('#6f9a3e', 0.55, { metalness: 0.05 });
  // 延長前胸
  const pro = segment(0.06, 0.06, 0.3, body); pro.position.set(0.1, 0.0, 0); pro.rotation.y = Math.PI / 2; group.add(pro);
  // 中後胸 + 腹(上翹)
  const meso = segment(0.09, 0.09, 0.12, body); meso.position.set(-0.18, 0, 0); group.add(meso);
  const abd = new THREE.Group();
  for (let i = 0; i < 5; i++) { const s = segment(0.1 - i * 0.012, 0.08 - i * 0.008, 0.09, body); s.position.set(-0.28 - i * 0.13, i * 0.02, 0); s.rotation.y = Math.PI / 2; abd.add(s); }
  group.add(abd);
  // 三角頭
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), body); head.scale.set(0.7, 0.8, 1.3); head.position.set(0.4, 0.06, 0); group.add(head);
  const eye = eyeMat('#3a5a2a');
  [-1, 1].forEach((s) => { const e = segment(0.05, 0.06, 0.05, eye); e.position.set(0.42, 0.1, s * 0.11); group.add(e); });
  [-1, 1].forEach((s) => { const a = tube([[0.46, 0.1, s * 0.04], [0.56, 0.16, s * 0.07], [0.64, 0.18, s * 0.1]], 0.008, 0.004, body); group.add(a); });
  // 捕捉足(折疊的鐮刀)
  const raptor = [];
  [-1, 1].forEach((s) => {
    const arm = new THREE.Group(); arm.position.set(0.24, 0.02, s * 0.09);
    const coxa = tube([[0, 0, 0], [0.08, 0.12, s * 0.04], [0.14, 0.2, s * 0.06]], 0.03, 0.025, body); arm.add(coxa);
    const femur = tube([[0.14, 0.2, s * 0.06], [0.26, 0.16, s * 0.08], [0.34, 0.06, s * 0.08]], 0.028, 0.02, body);
    // 棘刺
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 6), body); sp.position.set(0.16 + k * 0.04, 0.18 - k * 0.02, s * 0.07); sp.rotation.z = s * 0.6; arm.add(sp); }
    arm.add(femur);
    const tibia = tube([[0.34, 0.06, s * 0.08], [0.4, 0.0, s * 0.07], [0.42, -0.06, s * 0.06]], 0.02, 0.008, body); arm.add(tibia);
    group.add(arm); raptor.push({ arm, s });
  });
  // 四步足
  const legs = [];
  [[-0.05, 0.9], [-0.2, 1.05]].forEach(([x, len], idx) => {
    [-1, 1].forEach((s) => { const p = makeLeg([x, -0.02, s * 0.08], [(-0.3), 0, s], len * 0.34, 0.014, body, 1.1); group.add(p); legs.push({ p, phase: idx, side: s }); });
  });
  // 收摺的翅
  const wmat = new THREE.MeshPhysicalMaterial({ color: '#8fae5a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.4 });
  [-1, 1].forEach((s) => { const w = wingMesh(0.5, 0.12, wmat); const wg = new THREE.Group(); wg.add(w); wg.position.set(-0.1, 0.08, s * 0.03); wg.rotation.x = s * 0.2; wg.scale.z = s; group.add(wg); });
  anchor(group, anchors, 'raptorial', 0.4, 0.16, 0.12);
  anchor(group, anchors, 'head', 0.42, 0.18, 0);
  anchor(group, anchors, 'eye', 0.44, 0.16, 0.14);
  anchor(group, anchors, 'thorax', 0.1, 0.12, 0);
  anchor(group, anchors, 'wing', -0.2, 0.14, 0.2);
  anchor(group, anchors, 'abdomen', -0.5, 0.08, 0);
  const animate = (t, moving) => {
    const sway = Math.sin(t * 1.2) * 0.05;
    raptor.forEach(({ arm }) => { arm.rotation.z = sway; });
    group.rotation.y = sway * 0.3;
    if (moving) legs.forEach(({ p, side, phase }) => { p.rotation.z = Math.sin(t * 4 + phase + (side > 0 ? Math.PI : 0)) * 0.12; });
  };
  return { group, anchors, animate, baseLength: 1.3 };
}

function ant() {
  const group = new THREE.Group();
  const anchors = {};
  const body = new THREE.MeshPhysicalMaterial({ color: '#171719', roughness: 0.25, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  // 頭
  const head = segment(0.13, 0.12, 0.11, body); head.position.set(0.34, 0.02, 0); group.add(head);
  // 大顎
  [-1, 1].forEach((s) => { const m = tube([[0.44, 0, s * 0.06], [0.52, -0.02, s * 0.08], [0.56, 0.02, s * 0.03]], 0.02, 0.008, body); group.add(m); });
  // 複眼
  [-1, 1].forEach((s) => { const e = segment(0.03, 0.04, 0.03, eyeMat('#050505')); e.position.set(0.38, 0.06, s * 0.1); group.add(e); });
  // 膝狀觸角
  [-1, 1].forEach((s) => { const a = tube([[0.4, 0.06, s * 0.05], [0.5, 0.14, s * 0.1], [0.58, 0.1, s * 0.16]], 0.012, 0.006, body); group.add(a); });
  // 胸(併胸腹節)
  const meso = segment(0.12, 0.14, 0.2, body); meso.position.set(0.05, 0.04, 0); meso.rotation.y = Math.PI / 2; group.add(meso);
  // 棘刺(黑棘蟻特徵)
  [-1, 1].forEach((s) => { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 6), body); sp.position.set(0.02, 0.16, s * 0.05); sp.rotation.z = s * -0.4; group.add(sp); });
  // 腹柄結
  const node = segment(0.05, 0.07, 0.05, body); node.position.set(-0.14, 0.03, 0); group.add(node);
  // 後腹(gaster)
  const gaster = segment(0.16, 0.15, 0.2, body); gaster.position.set(-0.34, 0.02, 0); gaster.rotation.y = Math.PI / 2; group.add(gaster);
  const legs = addLegs(group, 0.05, 0.12, 0.28, 0.015, body, { droop: 0.75, spanZ: 0.16 });
  anchor(group, anchors, 'head', 0.4, 0.16, 0);
  anchor(group, anchors, 'antenna', 0.58, 0.14, 0.16);
  anchor(group, anchors, 'thorax', 0.05, 0.2, 0);
  anchor(group, anchors, 'waist', -0.14, 0.12, 0);
  anchor(group, anchors, 'abdomen', -0.4, 0.06, 0);
  anchor(group, anchors, 'leg', 0.05, -0.18, 0.2);
  const animate = (t, moving) => {
    const w = moving ? 0.35 : 0.05;
    legs.forEach(({ p, side, phase }) => { p.rotation.z = Math.sin(t * 9 + phase * 2.1 + (side > 0 ? Math.PI : 0)) * w; });
  };
  return { group, anchors, animate, baseLength: 1.0 };
}

function grasshopper() {
  const group = new THREE.Group();
  const anchors = {};
  const body = chitinMat('#7d8a3a', 0.6, { metalness: 0.05 });
  const light = chitinMat('#98a64a', 0.6);
  // 身體
  const thorax = segment(0.13, 0.14, 0.16, body); thorax.position.set(0.08, 0.02, 0); group.add(thorax);
  const abd = new THREE.Group();
  for (let i = 0; i < 6; i++) { const s = segment(0.12 - i * 0.012, 0.12 - i * 0.012, 0.08, light); s.position.set(-0.1 - i * 0.11, 0, 0); s.rotation.y = Math.PI / 2; abd.add(s); }
  group.add(abd);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), body); head.scale.set(1, 1.3, 1); head.position.set(0.3, 0.06, 0); group.add(head);
  [-1, 1].forEach((s) => { const e = segment(0.04, 0.055, 0.04, eyeMat('#20260e')); e.position.set(0.34, 0.12, s * 0.09); group.add(e); });
  [-1, 1].forEach((s) => { const a = tube([[0.36, 0.14, s * 0.05], [0.46, 0.22, s * 0.08], [0.56, 0.26, s * 0.1]], 0.008, 0.004, body); group.add(a); });
  // 收摺翅
  const wmat = new THREE.MeshPhysicalMaterial({ color: '#8f9a4a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.5 });
  [-1, 1].forEach((s) => { const w = wingMesh(0.55, 0.13, wmat); const wg = new THREE.Group(); wg.add(w); wg.position.set(-0.05, 0.1, s * 0.05); wg.rotation.x = s * 0.15; wg.scale.z = s; group.add(wg); });
  // 前中足
  const legs = [];
  [[0.16], [0.02]].forEach(([x], idx) => { [-1, 1].forEach((s) => { const p = makeLeg([x, -0.05, s * 0.1], [-0.2, 0, s], 0.28, 0.016, body, 1.0); group.add(p); legs.push({ p, phase: idx, side: s }); }); });
  // 跳躍後足(粗腿節 + 長脛節 + 棘刺)
  const hind = [];
  [-1, 1].forEach((s) => {
    const hg = new THREE.Group(); hg.position.set(-0.05, -0.02, s * 0.13);
    const femur = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 6, 12), body);
    femur.rotation.z = Math.PI * 0.34; femur.position.set(-0.06, 0.02, 0); hg.add(femur);
    const tibia = tube([[-0.16, 0.14, 0], [0.02, -0.06, 0], [0.14, -0.24, 0]], 0.02, 0.012, light);
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 5), body); sp.position.set(-0.14 + k * 0.05, 0.12 - k * 0.06, 0); sp.rotation.z = -0.6; hg.add(sp); }
    hg.add(tibia);
    group.add(hg); hind.push({ hg, s });
  });
  anchor(group, anchors, 'hindleg', -0.2, 0.18, 0.28);
  anchor(group, anchors, 'head', 0.34, 0.2, 0);
  anchor(group, anchors, 'thorax', 0.08, 0.2, 0);
  anchor(group, anchors, 'wing', -0.2, 0.16, 0.2);
  anchor(group, anchors, 'abdomen', -0.45, 0, 0);
  anchor(group, anchors, 'leg', 0.16, -0.2, 0.14);
  const animate = (t, moving) => {
    if (moving) {
      const crouch = Math.max(0, Math.sin(t * 1.3));
      hind.forEach(({ hg }) => { hg.rotation.z = crouch * 0.12; });
      group.position.y = crouch * crouch * 0.15;
    } else { group.position.y = 0; }
  };
  return { group, anchors, animate, baseLength: 1.2 };
}

const BUILDERS = { butterfly, beetle, bee, dragonfly, ladybug, mantis, ant, grasshopper };

// 建構並回傳(套用陰影旗標)
export function buildInsect(kind) {
  const b = (BUILDERS[kind] || butterfly)();
  b.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  b.group.userData.kind = kind;
  return b;
}

export const INSECT_KINDS = Object.keys(BUILDERS);
