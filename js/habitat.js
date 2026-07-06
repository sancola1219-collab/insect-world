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

// 每種昆蟲在草地上的「家」座標與棲息型態
const LAYOUT = {
  butterfly:  { home: [-6, 3.2, -2], type: 'flit',   yaw: 0.3 },
  dragonfly:  { home: [5, 3.6, 3],   type: 'dart',   yaw: -0.8 },
  bee:        { home: [-2.5, 1.4, 4], type: 'hover', yaw: 1.2 },
  ladybug:    { home: [3, 1.0, -3],  type: 'crawl',  yaw: 0.6 },
  mantis:     { home: [-4.5, 0.9, 5], type: 'perch', yaw: 2.4 },
  ant:        { home: [1.5, 0.12, 5.5], type: 'walk', yaw: 0 },
  grasshopper:{ home: [6, 0.5, -4],  type: 'perch',  yaw: -1.6 },
  beetle:     { home: [-7, 1.6, 4],  type: 'tree',   yaw: 1.9 },
  cicada:     { home: [-8.2, 3.4, 2.2], type: 'tree', yaw: 2.2 },
  stagbeetle: { home: [8, 0.7, 1.5],  type: 'perch',  yaw: -2.3 },
  stickinsect:{ home: [-3.5, 1.3, -5.5], type: 'perch', yaw: 0.9 },
  firefly:    { home: [2.5, 2.4, -5.5], type: 'flit',  yaw: -0.5 },
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

  // ---- 棲木(獨角仙) ----
  const barkMat = new THREE.MeshStandardMaterial({ map: TX.bark(), roughness: 0.95 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6, 16), barkMat);
  trunk.position.set(-7.4, 3, 4); trunk.rotation.z = 0.12; trunk.castShadow = true; group.add(trunk);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 3, 12), barkMat);
  branch.position.set(-6.6, 3.4, 4); branch.rotation.z = -1.0; group.add(branch);

  // ---- 天空 + 霧 ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 24), new THREE.MeshBasicMaterial({ map: TX.sky(), side: THREE.BackSide, fog: false }));
  sky.name = 'sky'; group.add(sky);
  scene.fog = new THREE.Fog(0xd7ead0, 22, 68);

  // ---- 環境昆蟲群(讓畫面熱鬧;純裝飾、不可點選、不進 stations) ----
  const ambient = (() => {
    const ag = new THREE.Group(); group.add(ag);
    const rnd = mulberry(70701);
    const TINTS = ['#e08a3a', '#6b6bd8', '#e0c040', '#d85050', '#6fae5a', '#5aa0d0', '#eae6dc', '#c060a0'];
    // 飛舞的小蝴蝶
    const flyers = [];
    for (let i = 0; i < 18; i++) {
      const g2 = new THREE.Group();
      const col = TINTS[Math.floor(rnd() * TINTS.length)];
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 6), new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.6 }));
      body.rotation.z = Math.PI / 2; g2.add(body);
      const wmat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
      const wings = [];
      [-1, 1].forEach((s) => {
        const geom = new THREE.CircleGeometry(0.12, 14); geom.rotateX(-Math.PI / 2); geom.translate(0, 0, 0.11);
        const wm = new THREE.Mesh(geom, wmat);
        const w = new THREE.Group(); w.add(wm); w.scale.z = s; g2.add(w); wings.push({ w, s });
      });
      g2.scale.setScalar(0.7 + rnd() * 1.0);
      ag.add(g2);
      flyers.push({ g2, wings, hx: (rnd() - 0.5) * 30, hz: (rnd() - 0.5) * 30, r: 2 + rnd() * 5, y: 1.4 + rnd() * 7, sp: 0.3 + rnd() * 0.5, ph: rnd() * 6.28, bob: 0.3 + rnd() * 0.6 });
    }
    // 空中飄浮的小蟲塵(Points)
    const N = 280; const pos = new Float32Array(N * 3); const base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const x = (rnd() - 0.5) * 46, y = 0.4 + rnd() * 9, z = (rnd() - 0.5) * 46; base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z; pos.set([x, y, z], i * 3); }
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: '#3b3a2c', size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false }));
    pts.frustumCulled = false; ag.add(pts);
    // 地面爬行的小蟲(螞蟻列)
    const crawlers = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#20201e', roughness: 0.5 }));
      m.scale.set(1.9, 0.7, 0.9); ag.add(m);
      crawlers.push({ m, cx: (rnd() - 0.5) * 26, cz: (rnd() - 0.5) * 26, r: 1.5 + rnd() * 4, sp: 0.4 + rnd() * 0.7, ph: rnd() * 6.28 });
    }
    function update(t) {
      for (let i = 0; i < flyers.length; i++) {
        const f = flyers[i]; const a = t * f.sp + f.ph;
        f.g2.position.set(f.hx + Math.cos(a) * f.r + Math.sin(a * 1.7) * 0.5, f.y + Math.sin(a * 2.1) * f.bob, f.hz + Math.sin(a) * f.r * 0.72);
        f.g2.rotation.y = -a + Math.PI / 2;
        const flap = Math.sin(t * 8 + i) * 0.95;
        f.wings.forEach(({ w, s }) => { w.rotation.x = -flap * s; });
      }
      const p = pgeo.attributes.position;
      for (let i = 0; i < N; i++) { p.array[i * 3] = base[i * 3] + Math.sin(t * 0.5 + i * 1.3) * 0.3; p.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + i) * 0.25; }
      p.needsUpdate = true;
      for (const c of crawlers) { const a = t * c.sp + c.ph; c.m.position.set(c.cx + Math.cos(a) * c.r, 0.06, c.cz + Math.sin(a) * c.r); c.m.rotation.y = -a; }
    }
    return { update };
  })();

  // ---- 擺放昆蟲(依區域,惰性建置) ----
  const stations = new Map();       // id → station(所有已建置的)
  const builtRegions = new Set();
  let activeRegion = 'taiwan';

  // 非台灣區用通用擺放槽:依身體模型決定棲息型態與高度,扇形分佈
  const TYPE_BY_BUILDER = {
    butterfly: 'flit', firefly: 'flit', dragonfly: 'dart', bee: 'hover',
    cicada: 'tree', beetle: 'perch', stagbeetle: 'perch', mantis: 'perch',
    grasshopper: 'perch', stickinsect: 'perch', ant: 'walk', ladybug: 'crawl',
  };
  function slotFor(sp, i, n) {
    const ang = (n <= 1 ? 0 : (i / (n - 1) - 0.5)) * 1.7;
    const r = 5.6;
    const type = TYPE_BY_BUILDER[sp.builder] || 'perch';
    const air = type === 'flit' || type === 'dart' || type === 'hover' || type === 'tree';
    const y = type === 'walk' ? 0.12 : type === 'crawl' ? 1.0 : air ? (2.6 + (i % 2) * 0.9) : 0.7;
    return { home: [Math.sin(ang) * r, y, Math.cos(ang) * r - 0.5], type, yaw: -ang };
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

  function ensureRegion(rid) {
    if (builtRegions.has(rid)) return;
    const list = regionInsects(rid);
    list.forEach((sp, i) => {
      const place = (rid === 'taiwan' && LAYOUT[sp.id]) ? LAYOUT[sp.id] : slotFor(sp, i, list.length);
      buildStation(sp, place);
    });
    builtRegions.add(rid);
  }

  function setRegion(rid) {
    ensureRegion(rid);
    activeRegion = rid;
    for (const st of stations.values()) st.pivot.visible = (st.region === rid);
    return regionInsects(rid);
  }
  function activeStations() { return [...stations.values()].filter((s) => s.region === activeRegion); }

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
      case 'perch': // 螳螂/蝗蟲:微幅擺動
        oy = Math.sin(t * 0.8) * 0.05; yaw = L.yaw + Math.sin(t * 0.5) * 0.1; break;
      case 'tree': // 獨角仙:樹幹緩行
        oy = Math.sin(t * 0.3) * 0.8; yaw = L.yaw + Math.sin(t * 0.2) * 0.15; break;
    }
    st.pivot.position.set(h.x + ox * damp, h.y + oy * damp, h.z + oz * damp);
    st.pivot.rotation.y = yaw;
  }

  function update(t, dt, motionOn) {
    ambient.update(t);   // 環境昆蟲群(不受區域影響,永遠讓畫面熱鬧)
    for (const st of stations.values()) {
      if (st.region !== activeRegion) continue;
      idle(st, t);
      st.insect.animate(t, motionOn);
    }
  }

  setRegion('taiwan');   // 預設區域

  const overviewFrame = { center: new THREE.Vector3(0, 2.2, 0), distance: 20, height: 8 };
  return {
    group, stations, update, overviewFrame,
    setRegion, activeStations,
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
