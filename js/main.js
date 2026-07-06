// main.js — 總指揮:狀態機、渲染迴圈、相機、互動,以及 __IW 測試 API。
//
// 鐵律一:狀態即時、動畫裝飾。使用者點選昆蟲的當下,state.focus 立刻改變、資料卡立刻更新;
//         相機飛行(flyTo)只是好看,被節流/中斷也不影響任何狀態。
// 鐵律二:昆蟲位置由 habitat 的 idle(t) 純函數決定(t = 模擬秒),不做增量累加,
//         任意暫停/快轉都不會累積誤差。
// 這台機器的預覽瀏覽器常是 hidden:rAF 停、計時器節流、截圖逾時、容器 0×0。
// 因此:載入讓步用 setTimeout(0);setInterval 看門狗補幀;__IW 測試走同步 step()+readPixels。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHabitat } from './habitat.js';
import { createUI } from './ui.js';
import { buildStages } from './lifecycle.js';
import { INSECTS, byId, OVERVIEW_INTRO, REGIONS, regionInsects, tourForRegion, regionById, lifeOf } from './data.js';

const state = {
  view: 'habitat',   // 'habitat' | 'focus'
  region: 'taiwan',  // 目前區域
  focus: null,       // 昆蟲 id
  anatomy: false,
  motion: true,
  tourIdx: null,     // null 或 0..n-1
  lifeStage: null,   // null 或 0..3(變態階段)
  lifePlaying: false,
};
const currentTour = () => tourForRegion(state.region);
const LIFE_INTERVAL = 2.6;   // 自動播放每階段秒數
let lifeTimer = 0;

let renderer, scene, camera, controls, habitat, ui;
let simT = 0;                       // 模擬秒(idle 動畫的純函數輸入)
let lastNow = 0, lastFrame = 0;
const tween = { active: false, t: 0, dur: 1, camFrom: new THREE.Vector3(), camTo: new THREE.Vector3(), tgtFrom: new THREE.Vector3(), tgtTo: new THREE.Vector3() };
let following = false;             // focus 模式下相機目標跟隨昆蟲
let contextLost = false;
const tmpV = new THREE.Vector3();

init();

function init() {
  const root = document.getElementById('scene-root');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(sizeW(), sizeH());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  // WebGL context 遺失/還原:這台機器背景分頁常丟失 GPU context;
  // preventDefault 保留還原機會,還原後 three 會自動重傳資源,續跑迴圈即可。
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; lastNow = now(); requestAnimationFrame(frame); }, false);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe3d4);

  camera = new THREE.PerspectiveCamera(52, sizeW() / sizeH(), 0.05, 400);
  camera.position.set(0, 9, 22);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.25;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.495; // 不穿到地底
  controls.target.set(0, 2.2, 0);

  addLights();

  ui = createUI({
    onSelect: (id) => focusSpecies(id, true),
    onOverview: () => goOverview(true),
    onToggleAnatomy: () => setAnatomy(!state.anatomy),
    onToggleMotion: () => setMotion(!state.motion),
    onTour: () => (state.tourIdx === null ? startTour() : stopTour()),
    onTourNav: (d) => tourNav(d),
    onTourExit: () => stopTour(),
    onLifecycle: () => openLifecycle(),
    onLifeNav: (d) => gotoLifeStage((state.lifeStage ?? 0) + d),
    onLifeGoto: (i) => gotoLifeStage(i),
    onLifeToggle: () => setLifePlaying(!state.lifePlaying),
    onLifeClose: () => closeLifecycle(true),
    onRegion: (id) => switchRegion(id),
  });

  // 讓載入畫面先繪出,再做重活(建構所有昆蟲與程序化貼圖)
  setTimeout(build, 30);
}

function build() {
  habitat = createHabitat(scene);
  wireInput();
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.getElementById('scene-root'));

  ui.setSpeciesList(regionInsects(state.region));
  ui.setActiveRegion(state.region);
  goOverview(false);
  ui.setMotion(state.motion);
  ui.setAnatomy(state.anatomy);

  lastNow = now();
  requestAnimationFrame(frame);
  // 看門狗:hidden 分頁 rAF 會停,每 400ms 檢查是否需補幀
  setInterval(() => { if (now() - lastFrame > 500) tick(0.016); }, 400);

  ui.hideLoader();
  exposeTestAPI();
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x4a6a3a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
  const d = 18; Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa9c8ff, 0.5);
  fill.position.set(-10, 8, -6); scene.add(fill);
  const rim = new THREE.PointLight(0xffffff, 0.4, 60); rim.position.set(0, 6, -14); scene.add(rim);
}

// ---------- 狀態切換 ----------
function focusSpecies(id, animate) {
  const sp = byId(id); const st = habitat.stations.get(id); if (!sp || !st) return;
  if (state.lifeStage !== null) closeLifecycle(false); // 切換昆蟲前先收掉生命週期
  // 狀態即時
  state.view = 'focus'; state.focus = id;
  st.focused = true;
  habitat.stations.forEach((s) => { if (s.id !== id) s.focused = false; });
  ui.setActiveSpecies(id);
  ui.showInfo(id);
  ui.buildLabels(id);
  ui.setView('昆蟲特寫 · ' + sp.name);
  ui.setScaleReadout('實際體長 ' + realLen(sp));
  document.body.classList.add('focus-mode');
  following = true;
  flyToStation(st, animate);
}

function goOverview(animate) {
  if (state.lifeStage !== null) closeLifecycle(false);
  state.view = 'habitat'; state.focus = null;
  habitat && habitat.stations.forEach((s) => (s.focused = false));
  ui.setActiveSpecies(null);
  ui.hideInfo();
  ui.setView('生態全景');
  ui.setScaleReadout('真實相對比例');
  document.body.classList.remove('focus-mode');
  following = false;
  const f = habitat.overviewFrame;
  flyTo(new THREE.Vector3(0, f.height, f.distance), f.center.clone(), animate);
}

function setAnatomy(on) { state.anatomy = on; ui.setAnatomy(on); }
function setMotion(on) { state.motion = on; ui.setMotion(on); }

// ---------- 導覽 ----------
function startTour() { state.tourIdx = 0; document.body.classList.add('tour-mode'); applyTour(); }
function stopTour() { state.tourIdx = null; document.body.classList.remove('tour-mode'); ui.hideTour(); }
function tourNav(d) {
  if (state.tourIdx === null) return;
  const tour = currentTour();
  state.tourIdx = (state.tourIdx + d + tour.length) % tour.length;
  applyTour();
}
function applyTour() {
  const tour = currentTour();
  const id = tour[state.tourIdx];
  focusSpecies(id, true);
  ui.showTour(byId(id), state.tourIdx, tour.length);
}

// ---------- 區域切換 ----------
function switchRegion(id) {
  if (!regionById(id) || id === state.region) { if (id === state.region) return; }
  stopTour();
  if (state.lifeStage !== null) closeLifecycle(false);
  state.region = id;
  habitat.setRegion(id);
  ui.setSpeciesList(regionInsects(id));
  ui.setActiveRegion(id);
  goOverview(false);     // 切區後回全景重新取景
}

// ---------- 生命週期(變態)播放器 ----------
function ensureStages(st, sp) {
  if (st.life) return st.life;
  const stages = buildStages(sp, st.insect, lifeOf(sp));   // [卵,幼/若,蛹/若,{adult}]
  const s = st.inner.scale.x;                               // 站點真實比例
  const radii = stages.map((e) => (e.adult ? st.radius : e.baseLength * s));
  stages.forEach((e) => { if (e.group) { e.group.visible = false; e.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); st.inner.add(e.group); } });
  st.life = { stages, radii };
  return st.life;
}
function openLifecycle() {
  if (!state.focus) return;
  const sp = byId(state.focus); const st = habitat.stations.get(state.focus);
  ensureStages(st, sp);
  ui.showLifecycle(sp);
  document.body.classList.add('life-mode');
  state.lifePlaying = true; ui.setLifePlaying(true);
  lifeTimer = 0;
  gotoLifeStage(0);
}
function gotoLifeStage(i) {
  if (!state.focus) return;
  const sp = byId(state.focus); const st = habitat.stations.get(state.focus);
  const life = ensureStages(st, sp);
  const idx = ((i % 4) + 4) % 4;
  state.lifeStage = idx;
  // 顯示對應階段:props 只留當前;成蟲階段顯示真正的成蟲模型
  life.stages.forEach((e, k) => { if (e.group) e.group.visible = (k === idx); });
  st.insect.group.visible = life.stages[idx].adult === true;
  ui.setLifeStage(sp, idx);
  flyToStageRadius(st, life.radii[idx], true);
  lifeTimer = 0;
}
function setLifePlaying(on) { state.lifePlaying = on; ui.setLifePlaying(on); }
function closeLifecycle(reframe) {
  if (state.focus) {
    const st = habitat.stations.get(state.focus);
    if (st && st.life) st.life.stages.forEach((e) => { if (e.group) e.group.visible = false; });
    if (st) st.insect.group.visible = true;
    if (reframe && st) flyToStation(st, true);
  }
  state.lifeStage = null; state.lifePlaying = false;
  document.body.classList.remove('life-mode');
  ui.hideLifecycle();
}

// ---------- 相機 ----------
// 手機時底部有資料卡抽屜,把聚焦目標下移,讓昆蟲顯示在可見帶(卡片上方)
const isMobile = () => window.innerWidth <= 640;
function aimOf(st, radius) {
  const p = st.worldPos();
  if (isMobile()) p.y -= radius * 0.7;   // 目標下移 → 昆蟲在畫面上方
  return p;
}
function flyToStation(st, animate) { flyToStageRadius(st, st.radius, animate); }
function flyToStageRadius(st, radius, animate) {
  const target = aimOf(st, radius);
  const dist = radius * 4.4 + 0.3;
  const dir = new THREE.Vector3(0.9, 0.55, 1.15).normalize();
  const camPos = target.clone().add(dir.multiplyScalar(dist));
  flyTo(camPos, target, animate);
}
function flyTo(camPos, target, animate) {
  if (!animate) {
    camera.position.copy(camPos); controls.target.copy(target);
    controls.update(); tween.active = false; return;
  }
  tween.camFrom.copy(camera.position); tween.camTo.copy(camPos);
  tween.tgtFrom.copy(controls.target); tween.tgtTo.copy(target);
  tween.t = 0; tween.dur = 1.1; tween.active = true;
  controls.enabled = false;
}
function updateCamera(dt) {
  if (tween.active) {
    tween.t = Math.min(1, tween.t + dt / tween.dur);
    const e = easeInOut(tween.t);
    camera.position.lerpVectors(tween.camFrom, tween.camTo, e);
    controls.target.lerpVectors(tween.tgtFrom, tween.tgtTo, e);
    if (tween.t >= 1) { tween.active = false; controls.enabled = true; }
  } else if (following && state.focus) {
    // 目標平滑跟隨(昆蟲在 focus 時漫遊幅度已收斂,微幅跟即可)
    const st = habitat.stations.get(state.focus);
    if (st) { const r = (state.lifeStage !== null && st.life) ? st.life.radii[state.lifeStage] : st.radius; controls.target.lerp(aimOf(st, r), 0.1); }
  }
  controls.update();
}

// ---------- 主迴圈 ----------
function frame() {
  const t = now();
  let dt = (t - lastNow) / 1000; lastNow = t;
  if (dt > 0.1) dt = 0.1;           // 分頁回前景時避免大跳
  tick(dt);
  if (!contextLost) requestAnimationFrame(frame); // 還原後由事件重啟迴圈
}
function tick(dt) {
  lastFrame = now();
  simT += (state.motion ? dt : dt * 0.15); // 停動作時仍讓相機/微動運作
  if (habitat) habitat.update(simT, dt, state.motion);
  updateLifecycle(dt);
  updateCamera(dt);
  const showLabels = state.anatomy && state.view === 'focus' && state.lifeStage === null;
  if (showLabels) updateLabels(); else ui.positionLabels([]);
  if (!contextLost) renderer.render(scene, camera);
}

function updateLifecycle(dt) {
  if (state.lifeStage === null || !state.focus) return;
  const st = habitat.stations.get(state.focus);
  const entry = st && st.life && st.life.stages[state.lifeStage];
  if (entry && entry.animate) entry.animate(simT);   // 階段模型的裝飾動畫
  if (state.lifePlaying) {
    lifeTimer += dt;
    if (lifeTimer >= LIFE_INTERVAL) gotoLifeStage(state.lifeStage + 1); // gotoLifeStage 會歸零 lifeTimer
  }
}

// ---------- 構造標註投影 ----------
function updateLabels() {
  const sp = byId(state.focus); if (!sp) return;
  const st = habitat.stations.get(state.focus); if (!st) return;
  const w = renderer.domElement.clientWidth || sizeW();
  const h = renderer.domElement.clientHeight || sizeH();
  const camDir = camera.getWorldDirection(tmpV).clone();
  const list = sp.anatomy.map(([key]) => {
    const wp = st.anchorWorld(key);
    if (!wp) return { key, visible: false };
    const toPt = wp.clone().sub(camera.position);
    const front = toPt.dot(camDir) > 0;
    const p = wp.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * w;
    const y = (-p.y * 0.5 + 0.5) * h;
    const onScreen = front && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
    const flip = x > w * 0.58;
    return { key, x: Math.round(x), y: Math.round(y), visible: onScreen, flip };
  });
  ui.positionLabels(list);
}

// ---------- 互動:點選拾取 ----------
function wireInput() {
  const dom = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downX = 0, downY = 0, downT = 0;
  dom.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = now(); });
  dom.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 6 || now() - downT > 500) return; // 拖曳/長按不算點選
    const rect = dom.getBoundingClientRect();
    ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const id = pick(ray);
    if (id) focusSpecies(id, true);
  });
}
function pick(ray) {
  const pivots = habitat.pickables(); // 目前區域的主角站點 + 散佈複本(皆反查到物種)
  const hits = ray.intersectObjects(pivots, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o) { if (o.userData && o.userData.stationId) return o.userData.stationId; o = o.parent; }
  return null;
}

// ---------- 尺寸 / resize ----------
function sizeW() { return Math.max(1, window.innerWidth); }
function sizeH() { return Math.max(1, window.innerHeight); }
function onResize() {
  const w = sizeW(), h = sizeH();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ---------- 小工具 ----------
function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
function realLen(sp) {
  const mm = sp.lengthMM;
  return mm >= 10 ? (mm / 10) + ' 公分' : mm + ' 公釐';
}

// ---------- 測試 API(hidden browser 下的驗證入口) ----------
function exposeTestAPI() {
  window.__IW = {
    state: () => JSON.parse(JSON.stringify({ view: state.view, region: state.region, focus: state.focus, anatomy: state.anatomy, motion: state.motion, tourIdx: state.tourIdx, lifeStage: state.lifeStage, lifePlaying: state.lifePlaying, simT })),
    species: () => regionInsects(state.region).map((s) => s.id),   // 目前區域的昆蟲
    allSpecies: () => INSECTS.map((s) => s.id),
    forceSize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); return [w, h]; },
    step(ms = 16) { tick(ms / 1000); return simT; },
    settle(frames = 90, ms = 16) { for (let i = 0; i < frames; i++) tick(ms / 1000); return simT; },
    focus(id) { focusSpecies(id, false); return state.focus; },
    overview() { goOverview(false); return state.view; },
    setAnatomy(on) { setAnatomy(!!on); return state.anatomy; },
    setMotion(on) { setMotion(!!on); return state.motion; },
    tour() { startTour(); return state.tourIdx; },
    tourNav(d) { tourNav(d); return state.tourIdx; },
    regions() { return REGIONS.map((r) => r.id); },
    region() { return state.region; },
    switchRegion(id) { switchRegion(id); return state.region; },
    openLifecycle() { openLifecycle(); return state.lifeStage; },
    setLifeStage(i) { gotoLifeStage(i); return state.lifeStage; },
    closeLifecycle() { closeLifecycle(true); return state.lifeStage; },
    // 生命週期檢查:走過四階段,回報每階段顯示的模型 mesh 數、取景半徑、是否為成蟲
    lifecycle() {
      if (!state.focus) return { error: 'not focused' };
      const sp = byId(state.focus); const st = habitat.stations.get(state.focus);
      openLifecycle();
      const kind = lifeOf(sp).kind;
      const stages = [];
      for (let i = 0; i < 4; i++) {
        gotoLifeStage(i);
        const e = st.life.stages[i];
        let meshes = 0;
        if (e.adult) { st.insect.group.traverse((o) => { if (o.isMesh && o.visible) meshes++; }); }
        else e.group.traverse((o) => { if (o.isMesh) meshes++; });
        stages.push({ name: sp.meta.stages[i][0], isAdult: !!e.adult, meshes, radius: +st.life.radii[i].toFixed(3), camErr: +controls.target.distanceTo(st.worldPos()).toFixed(3) });
      }
      const sane = Number.isFinite(camera.position.x + controls.target.x);
      closeLifecycle(false);
      return { kind, adultVisibleAfterClose: st.insect.group.visible, stages, sane };
    },
    // 相機聚焦點與昆蟲世界座標的距離(驗證取景是否對準)
    focusError() {
      if (!state.focus) return null;
      const st = habitat.stations.get(state.focus);
      return st ? controls.target.distanceTo(st.worldPos()) : null;
    },
    // 同一 task 內取樣中央像素(免截圖):回傳 [r,g,b,a] 與非背景比例
    sample(sx = 24, sy = 24) {
      const gl = renderer.getContext();
      const w = renderer.domElement.width, h = renderer.domElement.height;
      const px = new Uint8Array(sx * sy * 4);
      gl.readPixels((w - sx) >> 1, (h - sy) >> 1, sx, sy, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0; const avg = [0, 0, 0];
      for (let i = 0; i < sx * sy; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        avg[0] += r; avg[1] += g; avg[2] += b;
        // 背景為淡綠灰(約 200,225,210);偏離即視為有昆蟲/物件
        if (Math.abs(r - 200) + Math.abs(g - 225) + Math.abs(b - 210) > 90) lit++;
      }
      const n = sx * sy;
      return { avg: avg.map((v) => Math.round(v / n)), litRatio: +(lit / n).toFixed(3) };
    },
    // 檢查場景是否含 NaN(相機/目標)
    sane() {
      const v = [camera.position, controls.target];
      return v.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    },
    labelCount() { return document.querySelectorAll('#label-layer .anno').length; },
    visibleLabels() { return [...document.querySelectorAll('#label-layer .anno')].filter((n) => n.style.opacity === '1').length; },
    contextLost: () => contextLost,
    // 可點選對象數(主角站點 + 散佈複本)與畫面覆蓋(在 NDC 網格打射線,看命中幾種昆蟲)
    pickCount: () => habitat.pickables().length,
    probePicks(n = 11) {
      const ray = new THREE.Raycaster(); const hitIds = new Set(); let hits = 0;
      for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
        const x = (ix / (n - 1)) * 2 - 1, y = (iy / (n - 1)) * 2 - 1;
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const id = pick(ray); if (id) { hits++; hitIds.add(id); }
      }
      return { rays: n * n, insectHits: hits, distinctSpecies: [...hitIds] };
    },
    // 構造審查:回傳聚焦昆蟲在「模型本地座標」下的翅/身體/頭部範圍(驗證翅膀著生正確)
    audit() {
      if (!state.focus) return null;
      const st = habitat.stations.get(state.focus); const g = st.insect.group;
      g.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const wing = new THREE.Box3(); wing.makeEmpty();
      const body = new THREE.Box3(); body.makeEmpty();
      const v = new THREE.Vector3();
      g.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const pos = o.geometry.attributes.position; if (!pos) return;
        o.updateWorldMatrix(true, false);
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const target = o.userData.isWing ? wing : body;
        for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(m); target.expandByPoint(v); }
      });
      const A = st.insect.anchors;
      const local = (k) => { const a = A[k]; if (!a) return null; a.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(a.matrixWorld).applyMatrix4(inv); };
      const rnd = (b) => b.isEmpty() ? null : { min: [b.min.x, b.min.y, b.min.z].map((n) => +n.toFixed(2)), max: [b.max.x, b.max.y, b.max.z].map((n) => +n.toFixed(2)) };
      const head = local('head');
      return { wing: rnd(wing), body: rnd(body), headX: head ? +head.x.toFixed(2) : null,
        wingSpreadsSideways: wing.isEmpty() ? null : (wing.max.z - wing.min.z) > (wing.max.x - wing.min.x),
        wingPastHead: (wing.isEmpty() || !head) ? null : (wing.max.x > head.x + 0.03) };
    },
    // 聚焦昆蟲所有構造 anchor 的模型本地座標(驗證著生位置合理)
    anchorsLocal() {
      if (!state.focus) return null;
      const st = habitat.stations.get(state.focus); const g = st.insect.group;
      g.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const out = {};
      for (const k in st.insect.anchors) {
        const a = st.insect.anchors[k]; a.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld).applyMatrix4(inv);
        out[k] = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      }
      return out;
    },
    // 聚焦昆蟲某部位投影到畫面的座標(驗證手機取景是否在可見帶)
    project(key = 'thorax') {
      if (!state.focus) return null;
      const st = habitat.stations.get(state.focus);
      const wp = st.anchorWorld(key) || st.worldPos();
      const p = wp.clone().project(camera);
      const w = renderer.domElement.clientWidth || sizeW();
      const h = renderer.domElement.clientHeight || sizeH();
      return { x: Math.round((p.x * 0.5 + 0.5) * w), y: Math.round((-p.y * 0.5 + 0.5) * h), inFront: p.z < 1 };
    },
    // 目前聚焦昆蟲最主要的身體材質顏色(驗證區域染色 tint 是否生效,免 GPU)
    bodyColor() {
      if (!state.focus) return null;
      const st = habitat.stations.get(state.focus);
      const counts = new Map();
      st.insect.group.traverse((o) => {
        const m = o.isMesh && o.material;
        if (m && m.color && !(m.userData && m.userData.noTint)) {
          const k = '#' + m.color.getHexString();
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      });
      let best = null, bc = 0;
      counts.forEach((v, k) => { if (v > bc) { bc = v; best = k; } });
      return best;
    },
    // 分層射線檢查(GPU 無關):從目前相機朝畫面上/中/下三點打射線,回報各自命中什麼。
    // 用來抓「單一物件蓋滿全畫面」的錯誤(例如天球內面外翻)——正常全景應是 上=sky、下=ground。
    strata() {
      const ray = new THREE.Raycaster();
      const hitName = (ndcY) => {
        ray.setFromCamera(new THREE.Vector2(0, ndcY), camera);
        const hits = ray.intersectObjects(scene.children, true);
        if (!hits.length) return 'none(sky)';
        let o = hits[0].object;
        while (o) { if (o.userData && o.userData.stationId) return 'insect:' + o.userData.stationId; if (o.name) return o.name; o = o.parent; }
        return hits[0].object.type;
      };
      const top = hitName(0.85), mid = hitName(0), bot = hitName(-0.85);
      return { top, mid, bot, oneObjectCoversAll: (top === mid && mid === bot && top !== 'none(sky)') };
    },
    // 離屏取樣:渲染到自有的 WebGLRenderTarget(獨立 FBO,不受 hidden 分頁 compositor 影響)
    sampleRT(size = 256) {
      const rt = new THREE.WebGLRenderTarget(size, size);
      const oldAspect = camera.aspect;
      camera.aspect = 1; camera.updateProjectionMatrix();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      const buf = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      renderer.setRenderTarget(null);
      camera.aspect = oldAspect; camera.updateProjectionMatrix();
      rt.dispose();
      let lit = 0; const avg = [0, 0, 0], cAvg = [0, 0, 0];
      const cx = size >> 1, cy = size >> 1, R = size * 0.35, Rc = size * 0.14;
      let cLit = 0, cN = 0, ccN = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4, r = buf[i], g = buf[i + 1], b = buf[i + 2];
        avg[0] += r; avg[1] += g; avg[2] += b;
        const bg = Math.abs(r - 200) + Math.abs(g - 225) + Math.abs(b - 210) > 70;
        if (bg) lit++;
        const dd = (x - cx) ** 2 + (y - cy) ** 2;
        if (dd < R * R) { cN++; if (bg) cLit++; }
        if (dd < Rc * Rc) { ccN++; cAvg[0] += r; cAvg[1] += g; cAvg[2] += b; }
      }
      const n = size * size;
      return { avg: avg.map((v) => Math.round(v / n)), centerAvg: cAvg.map((v) => Math.round(v / ccN)), litRatio: +(lit / n).toFixed(3), centerLit: +(cLit / cN).toFixed(3) };
    },
    // CPU 端場景圖檢查(不需 GPU,hidden 分頁也可驗證幾何是否正確建構)
    inspect() {
      const box = new THREE.Box3();
      const rep = {};
      habitat.activeStations().forEach((st) => {   // 只檢查目前區域(已建置)
        let meshes = 0, badPos = 0;
        st.pivot.traverse((o) => { if (o.isMesh) { meshes++; if (!Number.isFinite(o.position.x)) badPos++; } });
        box.setFromObject(st.pivot);
        const size = box.getSize(new THREE.Vector3());
        const sp = byId(st.id);
        const anchorsOK = sp.anatomy.every(([k]) => !!st.insect.anchors[k]);
        rep[st.id] = {
          meshes, badPos,
          worldLenCm: +(size.length() / 0.03 / 1.732).toFixed(1), // 概估
          boxFinite: Number.isFinite(size.x + size.y + size.z) && size.length() > 0,
          anchorsOK, anatomyCount: sp.anatomy.length,
          worldY: +st.worldPos().y.toFixed(2),
        };
      });
      return rep;
    },
  };
}
