// habitat.js — 生態全景場景:草地、花、棲木、天空,以及八種昆蟲的即時擺放與待機動作
// 對外:createHabitat(scene) → { stations, update(t, dt, motionOn), overviewFrame }
//   stations: Map(id → station);station = { id, pivot, insect, home, radius, worldPos() }
//   每個 station 有 idle(t) 決定牠在全景中的漫遊;focused 時漫遊幅度收斂,好停在鏡頭中央。
import * as THREE from 'three';
import * as TX from './textures.js';
import { buildInsect } from './insects.js';
import { INSECTS, byId, regionInsects } from './data.js';

// 真實相對大小:世界長度 = lengthMM * MM,再除以模型 baseLength 得縮放
const MM = 0.03;

// 每種昆蟲的棲位(生態上待的地方):air 空中 / tree 樹上 / leaf 葉子上 / ground 土地
const STRATUM = {
  butterfly: 'air', dragonfly: 'air', bee: 'air', firefly: 'air',
  cicada: 'tree', beetle: 'tree', stagbeetle: 'tree',
  mantis: 'leaf', stickinsect: 'leaf', ladybug: 'leaf', grasshopper: 'leaf',
  ant: 'ground',
};
// 台灣主角的「家」座標與棲息型態(對齊道具:甲蟲/蟬在樹、螳螂/瓢蟲/竹節在葉、螞蟻在土、蝶/蜓在空中)
const LAYOUT = {
  butterfly:  { home: [-6, 3.2, -2],  type: 'flit',  yaw: 0.3 },
  dragonfly:  { home: [5, 3.6, 3],    type: 'dart',  yaw: -0.8 },
  bee:        { home: [-2.5, 1.4, 4], type: 'hover', yaw: 1.2 },
  firefly:    { home: [2.5, 2.4, -5.5], type: 'flit', yaw: -0.5 },
  beetle:     { home: [-6.95, 2.1, 4], type: 'tree', yaw: 1.9 },   // 樹幹上
  cicada:     { home: [-7.4, 3.5, 4.5], type: 'tree', yaw: 2.2 },  // 樹幹高處
  stagbeetle: { home: [8, 2.3, -4.5], type: 'tree', yaw: -2.3 },   // 另一棵樹
  mantis:     { home: [-4.5, 1.1, 5], type: 'leaf', yaw: 2.4 },    // 葉叢上
  ladybug:    { home: [3, 1.0, -3.2], type: 'leaf', yaw: 0.6 },    // 葉子上
  stickinsect:{ home: [-3.5, 1.2, -5.5], type: 'leaf', yaw: 0.9 }, // 葉/莖上
  grasshopper:{ home: [6, 0.5, -4],   type: 'leaf', yaw: -1.6 },   // 草間
  ant:        { home: [1.5, 0.12, 5.5], type: 'walk', yaw: 0 },    // 土地上
};

export function createHabitat(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- 地面 ----
  const groundMat = new THREE.MeshStandardMaterial({ map: TX.ground(), roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'ground'; group.add(ground);

  // ---- 草叢(InstancedMesh 錐形葉片) ----
  const bladeGeo = new THREE.ConeGeometry(0.06, 1.1, 4, 1, true);
  bladeGeo.translate(0, 0.55, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#4c7a30', roughness: 0.9, side: THREE.DoubleSide });
  const N = 1400;
  const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, N);
  const dummy = new THREE.Object3D();
  const rand = mulberry(20260706);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, r = 2 + rand() * 46;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const h = 0.5 + rand() * 1.3; dummy.scale.set(1, h, 1);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
    const shade = 0.7 + rand() * 0.5;
    dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, new THREE.Color(0.28 * shade, 0.5 * shade, 0.18 * shade));
  }
  grass.instanceMatrix.needsUpdate = true; group.add(grass);

  // ---- 幾朵花(蜜蜂/瓢蟲的停駐點) ----
  function flower(x, z, col) {
    const f = new THREE.Group(); f.position.set(x, 0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#3f6a2a', roughness: 0.8 }));
    stem.position.y = 0.6; f.add(stem);
    const petalMat = new THREE.MeshStandardMaterial({ map: TX.petal(col), color: col, roughness: 0.7, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), petalMat);
      const a = k / 6 * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.18, 1.2, Math.sin(a) * 0.18);
      p.rotation.x = -Math.PI / 2 + 0.5; p.rotation.z = a; f.add(p);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshStandardMaterial({ color: '#e8c24a', roughness: 0.6 }));
    core.position.y = 1.24; f.add(core);
    group.add(f); return f;
  }
  flower(-2.4, 4.2, '#e7d6f2'); flower(3.4, -3.1, '#f2d6e0'); flower(-1.2, 3.4, '#fff1c4');
  flower(2.8, -2.4, '#d8e0f2');

  // ---- 棲息道具:樹(樹幹+橫枝+樹冠)與葉叢植物,供昆蟲停在對的位置 ----
  const barkMat = new THREE.MeshStandardMaterial({ map: TX.bark(), roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f7a2e', roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#4a6a2a', roughness: 0.8 });
  const propRnd = mulberry(9091);
  const trees = [];   // { x, z, h, r, perches:[Vector3] }
  const plants = [];  // { tops:[Vector3] }
  // 固定的樹位置(讓主角能穩定停靠)
  const TREES = [[-7.4, 4], [8, -5], [-9.5, -7], [10, 8], [5, 11.5], [-3, -11]];
  TREES.forEach(([x, z]) => {
    const h = 4.6 + propRnd() * 2.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, h, 12), barkMat);
    trunk.position.set(x, h / 2, z); trunk.castShadow = true; group.add(trunk);
    const perches = [];
    const nb = 2 + Math.floor(propRnd() * 2);
    for (let b = 0; b < nb; b++) {
      const by = h * 0.45 + b * 0.95 + propRnd() * 0.3, ba = propRnd() * 6.28, bl = 1.1 + propRnd() * 0.8;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, bl, 8), barkMat);
      br.position.set(x + Math.cos(ba) * bl * 0.5, by, z + Math.sin(ba) * bl * 0.5);
      br.rotation.z = Math.PI / 2; br.rotation.y = -ba; group.add(br);
      const cl = new THREE.Mesh(new THREE.SphereGeometry(0.85 + propRnd() * 0.5, 10, 8), leafMat);
      cl.position.set(x + Math.cos(ba) * bl, by + 0.3, z + Math.sin(ba) * bl); cl.scale.y = 0.68; group.add(cl);
      perches.push(new THREE.Vector3(x + Math.cos(ba) * bl * 0.75, by + 0.12, z + Math.sin(ba) * bl * 0.75));
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.3 + propRnd() * 0.6, 12, 10), leafMat);
    top.position.set(x, h + 0.2, z); top.scale.y = 0.72; group.add(top);
    // 樹幹表面也可停(甲蟲攀附)
    for (let p = 0; p < 3; p++) { const a = propRnd() * 6.28, y = 1 + propRnd() * (h - 1.5); perches.push(new THREE.Vector3(x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5)); }
    trees.push({ x, z, h, r: 0.45, perches });
  });
  // 固定的葉叢植物(讓葉棲昆蟲有葉子可停)
  const PLANTS = [[-4.5, 5], [3, -3.2], [-2.5, 4.2], [6, -4.2], [-3.5, -5.5], [2.5, 6.5], [8.5, 3], [-6, -3], [1, -6.5], [-1.5, 7], [7, 5.5], [-8, 1]];
  PLANTS.forEach(([x, z]) => {
    const ph = 0.7 + propRnd() * 0.9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, ph, 6), stemMat); stem.position.set(x, ph / 2, z); group.add(stem);
    const tops = [];
    const nl = 3 + Math.floor(propRnd() * 3);
    for (let k = 0; k < nl; k++) {
      const a = k / nl * 6.28 + propRnd(), ly = ph - 0.05 - k * 0.05, lr = 0.16;
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.28 + propRnd() * 0.14, 12), leafMat);
      leaf.position.set(x + Math.cos(a) * lr, ly, z + Math.sin(a) * lr); leaf.rotation.set(-1.15, a, 0); group.add(leaf);
      tops.push(new THREE.Vector3(x + Math.cos(a) * lr * 1.25, ly + 0.03, z + Math.sin(a) * lr * 1.25));
    }
    plants.push({ x, z, top: ph, tops });
  });

  // ---- 天空 + 霧 ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 24), new THREE.MeshBasicMaterial({ map: TX.sky(), side: THREE.BackSide, fog: false }));
  sky.name = 'sky'; group.add(sky);
  scene.fog = new THREE.Fog(0xd7ead0, 22, 68);


  // ---- 擺放昆蟲(依區域,惰性建置) ----
  const stations = new Map();       // id → station(所有已建置的)
  const decor = [];                 // 裝飾複本(該區真實物種的多個副本,讓畫面佈滿該區昆蟲)
  const decorRnd = mulberry(1337);
  const builtRegions = new Set();
  let activeRegion = 'taiwan';

  // 非台灣區用通用擺放槽:依身體模型決定棲息型態與高度,扇形分佈
  const TYPE_BY_BUILDER = {
    butterfly: 'flit', firefly: 'flit', dragonfly: 'dart', bee: 'hover',
    cicada: 'tree', beetle: 'perch', stagbeetle: 'perch', mantis: 'perch',
    grasshopper: 'perch', stickinsect: 'perch', ant: 'walk', ladybug: 'crawl',
  };
  function slotFor(sp, i, n) {
    const s = STRATUM[sp.builder] || 'ground';
    const spread = (n <= 1 ? 0 : (i / (n - 1) - 0.5)) * 1.7;
    if (s === 'air') return { home: [Math.sin(spread) * 6, 2.8 + (i % 2) * 1.3, Math.cos(spread) * 6 - 1], type: TYPE_BY_BUILDER[sp.builder] || 'flit', yaw: -spread };
    if (s === 'tree') { const tr = TREES[i % TREES.length]; return { home: [tr[0] + 0.5, 2.3, tr[1]], type: 'tree', yaw: 0 }; }   // 樹上
    if (s === 'leaf') { const pl = PLANTS[i % PLANTS.length]; return { home: [pl[0], 1.05, pl[1]], type: 'leaf', yaw: 0 }; }       // 葉上
    return { home: [Math.sin(spread) * 5, 0.12, Math.cos(spread) * 5], type: 'walk', yaw: -spread };                              // 土地
  }

  function buildStation(sp, place) {
    if (stations.has(sp.id)) return stations.get(sp.id);
    const built = buildInsect(sp.builder, { tint: sp.tint, feat: sp.feat });
    const scale = (sp.lengthMM * MM) / built.baseLength;
    const pivot = new THREE.Group();
    pivot.position.set(...place.home);
    pivot.rotation.y = place.yaw;
    const inner = new THREE.Group();      // 承載縮放與待機位移,pivot 只管家座標
    inner.scale.setScalar(scale);
    inner.add(built.group);
    pivot.add(inner);
    pivot.visible = false;
    group.add(pivot);
    pivot.traverse((o) => (o.userData.stationId = sp.id)); // 供 raycast 反查(含 pivot 本身)
    const radius = built.baseLength * scale; // 取景用半徑
    const st = {
      id: sp.id, region: sp.region, pivot, inner, insect: built, home: new THREE.Vector3(...place.home),
      layout: place, radius, focused: false, life: null,
      worldPos: () => pivot.getWorldPosition(new THREE.Vector3()),
      anchorWorld: (key) => { const a = built.anchors[key]; return a ? a.getWorldPosition(new THREE.Vector3()) : null; },
    };
    stations.set(sp.id, st);
    return st;
  }

  const decorWeight = (sp) => (sp.lengthMM < 15 ? 3 : sp.lengthMM < 50 ? 2 : 1); // 小蟲多、大蟲少
  // 依棲位挑一個「家」:空中散佈 / 停在樹枝樹幹 / 停在葉子 / 走在土地
  function placeDecor(builder) {
    const s = STRATUM[builder] || 'ground';
    if (s === 'air') { const a = decorRnd() * 6.28, r = 3 + decorRnd() * 13; return { stratum: 'air', home: new THREE.Vector3(Math.cos(a) * r, 2 + decorRnd() * 6, Math.sin(a) * r), yaw: decorRnd() * 6.28 }; }
    if (s === 'tree' && trees.length) { const tr = trees[Math.floor(decorRnd() * trees.length)]; const p = tr.perches[Math.floor(decorRnd() * tr.perches.length)]; return { stratum: 'tree', home: p.clone(), yaw: decorRnd() * 6.28 }; }
    if (s === 'leaf' && plants.length) { const pl = plants[Math.floor(decorRnd() * plants.length)]; const p = pl.tops[Math.floor(decorRnd() * pl.tops.length)]; return { stratum: 'leaf', home: p.clone(), yaw: decorRnd() * 6.28 }; }
    const a = decorRnd() * 6.28, r = 2 + decorRnd() * 14; return { stratum: 'ground', home: new THREE.Vector3(Math.cos(a) * r, 0.09, Math.sin(a) * r), yaw: decorRnd() * 6.28 };
  }
  // 散佈該區真實物種的多個複本(共用幾何/材質,只多節點與 draw call)
  function addDecor(sp, built, region, count) {
    const scale = (sp.lengthMM * MM) / built.baseLength;
    for (let k = 0; k < count; k++) {
      const clone = built.group.clone(true);
      // 收集拍翅樞紐(翅膜 mesh 的父群組即 fore/hind),記住基礎角度
      const flappers = [];
      clone.traverse((o) => { if (o.userData && o.userData.isWing && o.parent && !flappers.includes(o.parent)) { o.parent.userData.baseRotX = o.parent.rotation.x; flappers.push(o.parent); } });
      const inner = new THREE.Group(); inner.scale.setScalar(scale); inner.add(clone);
      const pivot = new THREE.Group(); pivot.add(inner); pivot.visible = false;
      group.add(pivot);
      pivot.traverse((o) => (o.userData.stationId = sp.id));   // 點任一複本 → 聚焦該種
      const place = placeDecor(sp.builder);
      pivot.position.copy(place.home); pivot.rotation.y = place.yaw;
      decor.push({ pivot, region, stratum: place.stratum, home: place.home, yaw: place.yaw, flappers, ph: decorRnd() * 6.28, sp: 0.3 + decorRnd() * 0.6, r: 0.8 + decorRnd() * 2.4, bob: 0.2 + decorRnd() * 0.5 });
    }
  }

  function ensureRegion(rid) {
    if (builtRegions.has(rid)) return;
    const list = regionInsects(rid);
    const TARGET = 24;                    // 每區大約散佈這麼多複本,讓畫面佈滿該區昆蟲
    const wsum = list.reduce((a, sp) => a + decorWeight(sp), 0);
    list.forEach((sp, i) => {
      const place = (rid === 'taiwan' && LAYOUT[sp.id]) ? LAYOUT[sp.id] : slotFor(sp, i, list.length);
      const st = buildStation(sp, place);
      const count = Math.max(1, Math.round(TARGET * decorWeight(sp) / wsum));
      addDecor(sp, st.insect, rid, count);
    });
    builtRegions.add(rid);
  }

  function setRegion(rid) {
    ensureRegion(rid);
    activeRegion = rid;
    for (const st of stations.values()) st.pivot.visible = (st.region === rid);
    for (const d of decor) d.pivot.visible = (d.region === rid);
    return regionInsects(rid);
  }
  function activeStations() { return [...stations.values()].filter((s) => s.region === activeRegion); }
  function activeDecor() { return decor.filter((d) => d.region === activeRegion); }
  // 可點選對象:主角站點 + 該區裝飾複本(都會反查到物種 id)
  function pickables() { return [...activeStations().map((s) => s.pivot), ...activeDecor().map((d) => d.pivot)]; }

  // 裝飾複本的動作:依棲位。只有空中飛的會漫遊+拍翅;樹/葉/土上的原地小幅活動、翅收摺
  function animDecor(t) {
    for (const d of decor) {
      if (d.region !== activeRegion) continue;
      const h = d.home;
      if (d.stratum === 'air') {
        const a = t * d.sp + d.ph;
        d.pivot.position.set(h.x + Math.cos(a) * d.r, h.y + Math.sin(a * 1.8) * d.bob, h.z + Math.sin(a) * d.r * 0.8);
        d.pivot.rotation.y = -a + Math.PI / 2;
        if (d.flappers.length) { const flap = Math.sin(t * 8 + d.ph) * 0.7; for (const p of d.flappers) p.rotation.x = (p.userData.baseRotX || 0) + flap; }
      } else if (d.stratum === 'tree') {         // 停/爬在樹幹樹枝:上下微幅
        const a = t * 0.4 + d.ph;
        d.pivot.position.set(h.x, h.y + Math.sin(a) * 0.1, h.z);
        d.pivot.rotation.y = d.yaw + Math.sin(a * 0.5) * 0.2;
      } else if (d.stratum === 'leaf') {         // 停在葉子:輕微搖擺
        const a = t * 0.9 + d.ph;
        d.pivot.position.set(h.x + Math.sin(a) * 0.02, h.y + Math.sin(a * 1.3) * 0.015, h.z);
        d.pivot.rotation.y = d.yaw + Math.sin(a * 0.5) * 0.15;
      } else {                                    // 走在土地:貼地小範圍繞行
        const a = t * d.sp + d.ph;
        d.pivot.position.set(h.x + Math.cos(a) * d.r * 0.5, 0.09, h.z + Math.sin(a) * d.r * 0.5);
        d.pivot.rotation.y = -a;
      }
    }
  }

  // 待機漫遊:依 type 給不同路徑;focused 時 damp→0 收斂到家
  function idle(st, t) {
    const damp = st.focused ? 0.12 : 1;
    const L = st.layout; const h = st.home;
    let ox = 0, oy = 0, oz = 0, yaw = L.yaw;
    switch (L.type) {
      case 'flit': // 蝴蝶:8 字慢飛
        ox = Math.sin(t * 0.6) * 2.2; oz = Math.sin(t * 1.2) * 1.4; oy = Math.sin(t * 0.9) * 0.6;
        yaw = L.yaw + Math.cos(t * 0.6) * 0.8; break;
      case 'dart': // 蜻蜓:快速位移 + 停頓
        ox = Math.sin(t * 0.8) * 3 + Math.sin(t * 2.3) * 0.4; oz = Math.cos(t * 0.7) * 2.4; oy = Math.sin(t * 1.6) * 0.5;
        yaw = L.yaw + Math.atan2(Math.cos(t * 0.7), Math.cos(t * 0.8)) * 0.5; break;
      case 'hover': // 蜜蜂:花間小幅懸停
        ox = Math.sin(t * 1.4) * 0.6; oz = Math.cos(t * 1.1) * 0.5; oy = Math.abs(Math.sin(t * 2.0)) * 0.4; break;
      case 'crawl': // 瓢蟲:葉面慢爬
        ox = Math.sin(t * 0.4) * 0.5; oz = Math.cos(t * 0.4) * 0.5; yaw = L.yaw + t * 0.4; break;
      case 'walk': // 螞蟻:地面來回
        ox = Math.sin(t * 0.5) * 2.5; yaw = L.yaw + (Math.cos(t * 0.5) > 0 ? 0 : Math.PI); break;
      case 'perch': // 草間:微幅擺動
        oy = Math.sin(t * 0.8) * 0.05; yaw = L.yaw + Math.sin(t * 0.5) * 0.1; break;
      case 'leaf': // 葉上:輕微搖擺(不離開葉子)
        oy = Math.sin(t * 0.8) * 0.03; yaw = L.yaw + Math.sin(t * 0.5) * 0.12; break;
      case 'tree': // 樹幹上:上下微幅緩行(不離開樹幹)
        oy = Math.sin(t * 0.3) * 0.12; yaw = L.yaw + Math.sin(t * 0.2) * 0.1; break;
    }
    st.pivot.position.set(h.x + ox * damp, h.y + oy * damp, h.z + oz * damp);
    st.pivot.rotation.y = yaw;
  }

  function update(t, dt, motionOn) {
    for (const st of stations.values()) {
      if (st.region !== activeRegion) continue;
      idle(st, t);
      st.insect.animate(t, motionOn);
    }
    animDecor(t);   // 散佈的同種昆蟲複本(讓該區畫面佈滿該種昆蟲)
  }

  setRegion('taiwan');   // 預設區域

  const overviewFrame = { center: new THREE.Vector3(0, 2.2, 0), distance: 20, height: 8 };
  return {
    group, stations, update, overviewFrame,
    setRegion, activeStations, pickables,
    getRegion: () => activeRegion,
  };
}

// 確定性亂數(免用 Math.random,方便重現)
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
