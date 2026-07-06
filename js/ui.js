// ui.js — 全部 DOM 介面。只反映狀態 + 發出回呼,不持有遊戲邏輯。
import { INSECTS, byId } from './data.js';

export function createUI(handlers) {
  const $ = (id) => document.getElementById(id);
  const el = {
    loader: $('loader'), topbar: $('topbar'), viewLabel: $('view-label'),
    speciesList: $('species-list'), infoPanel: $('info-panel'), infoBody: $('info-body'),
    btnClose: $('btn-close-info'), btnOverview: $('btn-overview'),
    btnAnatomy: $('btn-anatomy'), btnMotion: $('btn-motion'), scaleReadout: $('scale-readout'),
    btnTour: $('btn-tour'), tourBar: $('tour-bar'), tourName: $('tour-name'), tourText: $('tour-text'),
    tourPrev: $('tour-prev'), tourNext: $('tour-next'), tourExit: $('tour-exit'),
    btnHelp: $('btn-help'), helpOverlay: $('help-overlay'), btnCloseHelp: $('btn-close-help'),
    sceneRoot: $('scene-root'),
    lifeBar: $('life-bar'), lifeTrack: $('life-track'), lifeKind: $('life-kind'),
    lifeName: $('life-name'), lifeDesc: $('life-desc'),
    lifePrev: $('life-prev'), lifePlay: $('life-play'), lifeNext: $('life-next'), lifeClose: $('life-close'),
  };

  // 標註層(疊在畫布上的 DOM 標籤)
  const labelLayer = document.createElement('div');
  labelLayer.id = 'label-layer';
  document.body.appendChild(labelLayer);
  let labelNodes = new Map();

  // ---- 圖鑑清單 ----
  INSECTS.forEach((sp) => {
    const item = document.createElement('button');
    item.className = 'species-item';
    item.dataset.id = sp.id;
    item.innerHTML = `
      <span class="chip" style="--c:${sp.accent}"></span>
      <span class="si-text"><b>${sp.name}</b><i>${sp.order}</i></span>
      <span class="si-len">${fmtLen(sp.lengthMM)}</span>`;
    item.addEventListener('click', () => handlers.onSelect(sp.id));
    el.speciesList.appendChild(item);
  });

  el.btnOverview.addEventListener('click', () => handlers.onOverview());
  el.btnClose.addEventListener('click', () => handlers.onOverview());
  el.btnAnatomy.addEventListener('click', () => handlers.onToggleAnatomy());
  el.btnMotion.addEventListener('click', () => handlers.onToggleMotion());
  el.btnTour.addEventListener('click', () => handlers.onTour());
  el.tourPrev.addEventListener('click', () => handlers.onTourNav(-1));
  el.tourNext.addEventListener('click', () => handlers.onTourNav(1));
  el.tourExit.addEventListener('click', () => handlers.onTourExit());
  el.btnHelp.addEventListener('click', () => el.helpOverlay.classList.remove('hidden'));
  el.btnCloseHelp.addEventListener('click', () => el.helpOverlay.classList.add('hidden'));
  // 生命週期播放器控制
  el.lifePrev.addEventListener('click', () => handlers.onLifeNav(-1));
  el.lifeNext.addEventListener('click', () => handlers.onLifeNav(1));
  el.lifePlay.addEventListener('click', () => handlers.onLifeToggle());
  el.lifeClose.addEventListener('click', () => handlers.onLifeClose());
  // 資料卡內「播放變態」鈕(infoBody 內容會重建,用事件委派)
  el.infoBody.addEventListener('click', (e) => { if (e.target.closest('[data-life]')) handlers.onLifecycle(); });

  // ---- 對外方法 ----
  function hideLoader() { el.loader.classList.add('gone'); setTimeout(() => (el.loader.style.display = 'none'), 700); }

  function setView(label) { el.viewLabel.textContent = label; }

  function setActiveSpecies(id) {
    el.speciesList.querySelectorAll('.species-item').forEach((n) => n.classList.toggle('active', n.dataset.id === id));
  }

  function showInfo(id) {
    const sp = byId(id); if (!sp) return;
    el.infoBody.innerHTML = infoHTML(sp);
    el.infoPanel.classList.remove('hidden');
  }
  function hideInfo() { el.infoPanel.classList.add('hidden'); }

  function setScaleReadout(text) { el.scaleReadout.textContent = text; }

  function setAnatomy(on) {
    el.btnAnatomy.classList.toggle('on', on);
    el.btnAnatomy.textContent = on ? '開' : '關';
    el.btnAnatomy.setAttribute('aria-pressed', String(on));
    labelLayer.classList.toggle('visible', on);
  }
  function setMotion(on) {
    el.btnMotion.classList.toggle('on', on);
    el.btnMotion.textContent = on ? '開' : '關';
    el.btnMotion.setAttribute('aria-pressed', String(on));
  }

  // 建立/更新標註節點(換昆蟲時重建)
  function buildLabels(id) {
    labelLayer.innerHTML = '';
    labelNodes = new Map();
    const sp = byId(id); if (!sp) return;
    sp.anatomy.forEach(([key, title, note]) => {
      const node = document.createElement('div');
      node.className = 'anno';
      node.innerHTML = `<span class="anno-dot"></span><span class="anno-box"><b>${title}</b><i>${note}</i></span>`;
      labelLayer.appendChild(node);
      labelNodes.set(key, node);
    });
  }
  // main.js 每幀傳入 [{key, x, y, visible, flip}] 定位
  function positionLabels(list) {
    for (const { key, x, y, visible, flip } of list) {
      const n = labelNodes.get(key); if (!n) continue;
      n.style.transform = `translate(${x}px, ${y}px)`;
      n.style.opacity = visible ? '1' : '0';
      n.classList.toggle('flip', !!flip);
    }
  }

  // ---- 導覽列 ----
  function showTour(sp, idx, total) {
    el.tourBar.classList.remove('hidden');
    el.tourName.textContent = `${idx + 1}/${total} · ${sp.name}`;
    el.tourText.textContent = sp.tour;
    el.btnTour.classList.add('on');
  }
  function hideTour() { el.tourBar.classList.add('hidden'); el.btnTour.classList.remove('on'); }

  // ---- 生命週期播放器 ----
  const kindLabel = (metaType) => metaType.indexOf('不完全') >= 0 ? '不完全變態' : '完全變態';
  function showLifecycle(sp) {
    // 建四階段進度軌
    el.lifeTrack.innerHTML = '';
    sp.meta.stages.forEach(([name], i) => {
      const step = document.createElement('div');
      step.className = 'life-step'; step.dataset.i = i;
      step.innerHTML = `<span class="life-dot">${i + 1}</span><span class="life-step-label">${name}</span>`;
      step.addEventListener('click', () => handlers.onLifeGoto(i));
      el.lifeTrack.appendChild(step);
    });
    el.lifeKind.textContent = kindLabel(sp.meta.type);
    el.lifeBar.classList.remove('hidden');
  }
  function setLifeStage(sp, idx) {
    const [name, desc] = sp.meta.stages[idx];
    el.lifeName.textContent = name;
    el.lifeDesc.textContent = desc;
    el.lifeTrack.querySelectorAll('.life-step').forEach((n) => {
      const i = +n.dataset.i;
      n.classList.toggle('active', i === idx);
      n.classList.toggle('done', i < idx);
    });
  }
  function setLifePlaying(on) { el.lifePlay.textContent = on ? '❚❚' : '▶'; el.lifePlay.classList.toggle('on', on); }
  function hideLifecycle() { el.lifeBar.classList.add('hidden'); }

  return {
    hideLoader, setView, setActiveSpecies, showInfo, hideInfo, setScaleReadout,
    setAnatomy, setMotion, buildLabels, positionLabels, showTour, hideTour,
    showLifecycle, setLifeStage, setLifePlaying, hideLifecycle,
    sceneRoot: el.sceneRoot,
  };
}

// ---- HTML 樣板 ----
function infoHTML(sp) {
  const stats = sp.stats.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  const facts = sp.facts.map((f) => `<li>${f}</li>`).join('');
  const stages = sp.meta.stages.map(([name, desc], i) =>
    `<div class="stage"><span class="stage-i">${i + 1}</span><div><b>${name}</b><p>${desc}</p></div></div>`).join('');
  return `
    <div class="info-head">
      <div class="info-name">${sp.name}</div>
      <div class="info-sci">${sp.sci}</div>
      <div class="info-order" style="--c:${sp.accent}">${sp.order}</div>
    </div>
    <p class="info-tag">${sp.tagline}</p>
    <div class="info-stats">${stats}</div>
    <div class="section">
      <div class="section-h">生命週期 · ${sp.meta.type}<button class="mini-btn" data-life>▶ 3D 演示</button></div>
      <div class="stages">${stages}</div>
    </div>
    <div class="section">
      <div class="section-h">你知道嗎</div>
      <ul class="facts">${facts}</ul>
    </div>`;
}

function fmtLen(mm) {
  if (mm >= 10) return (mm / 10).toFixed(mm % 10 ? 1 : 0) + ' cm';
  return mm + ' mm';
}
