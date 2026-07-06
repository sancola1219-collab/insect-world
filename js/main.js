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
import { INSECTS, byId, TOUR_ORDER, OVERVIEW_INTRO } from './data.js';

const state = {
  view: 'habitat',   // 'habitat' | 'focus'
  focus: null,       // 昆蟲 id
  anatomy: false,
  motion: true,
  tourIdx: null,     // null 或 0..n-1
};

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
  });

  // 讓載入畫面先繪出,再做重活(建構所有昆蟲與程序化貼圖)
  setTimeout(build, 30);
}

function build() {
  habitat = createHabitat(scene);
  wireInput();
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.getElementById('scene-root'));

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
  // 狀態即時
  state.view = 'focus'; state.focus = id;
  st.focused = true;
  habitat.stations.forEach((s) => { if (s.id !== id) s.focused = false; });
  ui.setActiveSpecies(id);
  ui.showInfo(id);
  ui.buildLabels(id);
  ui.setView('昆蟲特寫 · ' + sp.name);
  ui.setScaleReadout('實際體長 ' + realLen(sp));
  following = true;
  flyToStation(st, animate);
}

function goOverview(animate) {
  state.view = 'habitat'; state.focus = null;
  habitat && habitat.stations.forEach((s) => (s.focused = false));
  ui.setActiveSpecies(null);
  ui.hideInfo();
  ui.setView('生態全景');
  ui.setScaleReadout('真實相對比例');
  following = false;
  const f = habitat.overviewFrame;
  flyTo(new THREE.Vector3(0, f.height, f.distance), f.center.clone(), animate);
}

function setAnatomy(on) { state.anatomy = on; ui.setAnatomy(on); }
function setMotion(on) { state.motion = on; ui.setMotion(on); }

// ---------- 導覽 ----------
function startTour() { state.tourIdx = 0; applyTour(); }
function stopTour() { state.tourIdx = null; ui.hideTour(); }
function tourNav(d) {
  if (state.tourIdx === null) return;
  state.tourIdx = (state.tourIdx + d + TOUR_ORDER.length) % TOUR_ORDER.length;
  applyTour();
}
function applyTour() {
  const id = TOUR_ORDER[state.tourIdx];
  focusSpecies(id, true);
  ui.showTour(byId(id), state.tourIdx, TOUR_ORDER.length);
}

// ---------- 相機 ----------
function flyToStation(st, animate) {
  const target = st.worldPos();
  const dist = st.radius * 4.4 + 0.35;
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
    if (st) controls.target.lerp(st.worldPos(), 0.1);
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
  updateCamera(dt);
  if (state.anatomy && state.view === 'focus') updateLabels(); else ui.positionLabels([]);
  if (!contextLost) renderer.render(scene, camera);
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
  // 標記每個 pivot 的所有子物件,讓 raycast 命中後能反查是哪一種昆蟲
  habitat.stations.forEach((st) => { st.pivot.traverse((o) => (o.userData.stationId = st.id)); });
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
  const pivots = [...habitat.stations.values()].map((s) => s.pivot);
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
    state: () => JSON.parse(JSON.stringify({ view: state.view, focus: state.focus, anatomy: state.anatomy, motion: state.motion, tourIdx: state.tourIdx, simT })),
    species: () => INSECTS.map((s) => s.id),
    forceSize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); return [w, h]; },
    step(ms = 16) { tick(ms / 1000); return simT; },
    settle(frames = 90, ms = 16) { for (let i = 0; i < frames; i++) tick(ms / 1000); return simT; },
    focus(id) { focusSpecies(id, false); return state.focus; },
    overview() { goOverview(false); return state.view; },
    setAnatomy(on) { setAnatomy(!!on); return state.anatomy; },
    setMotion(on) { setMotion(!!on); return state.motion; },
    tour() { startTour(); return state.tourIdx; },
    tourNav(d) { tourNav(d); return state.tourIdx; },
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
      let lit = 0; const avg = [0, 0, 0];
      const cx = size >> 1, cy = size >> 1, R = size * 0.35;
      let cLit = 0, cN = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4, r = buf[i], g = buf[i + 1], b = buf[i + 2];
        avg[0] += r; avg[1] += g; avg[2] += b;
        const bg = Math.abs(r - 200) + Math.abs(g - 225) + Math.abs(b - 210) > 70;
        if (bg) lit++;
        if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) { cN++; if (bg) cLit++; }
      }
      const n = size * size;
      return { avg: avg.map((v) => Math.round(v / n)), litRatio: +(lit / n).toFixed(3), centerLit: +(cLit / cN).toFixed(3) };
    },
    // CPU 端場景圖檢查(不需 GPU,hidden 分頁也可驗證幾何是否正確建構)
    inspect() {
      const box = new THREE.Box3();
      const rep = {};
      habitat.stations.forEach((st) => {
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
