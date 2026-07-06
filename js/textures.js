// textures.js — 程序化貼圖引擎(載入時用 Canvas 即時生成,整個 repo 無任何圖片檔)
// 產出的都是 THREE.CanvasTexture;同一把貼圖只生成一次(cache)。
import * as THREE from 'three';

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---- 小工具 ----
function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
// 便宜的值雜訊(可重複、免亂數種子),用於外殼細紋
function vnoise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(ctx, size, cell, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      const fx = (x / cell) - gx, fy = (y / cell) - gy;
      const n00 = vnoise(gx, gy), n10 = vnoise(gx + 1, gy);
      const n01 = vnoise(gx, gy + 1), n11 = vnoise(gx + 1, gy + 1);
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const n = n00 * (1 - u) * (1 - v) + n10 * u * (1 - v) + n01 * (1 - u) * v + n11 * u * v;
      const i = (y * size + x) * 4;
      const add = (n - 0.5) * 255 * alpha;
      d[i] += add; d[i + 1] += add; d[i + 2] += add;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function tex(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- 幾丁質外殼(甲殼):底色 + 細紋 + 微亮斑,回傳 {map, rough} ----
export function chitin(base = '#3a2a1c', roughBase = 0.45, size = 256) {
  return memo('chitin-' + base + roughBase + size, () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    // 底層漸層增添立體感
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    smoothNoise(ctx, size, 6, 0.35);
    smoothNoise(ctx, size, 22, 0.25);
    // 粗糙度圖:雜訊讓高光不均勻
    const rc = canvas(size), rctx = rc.getContext('2d');
    const rv = Math.round(roughBase * 255);
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`; rctx.fillRect(0, 0, size, size);
    smoothNoise(rctx, size, 8, 0.5);
    return { map: tex(c), rough: tex(rc, { srgb: false }) };
  });
}

// ---- 絨毛條紋(蜜蜂身體):黃黑相間 + 毛絨顆粒 ----
export function fuzzBands(size = 256) {
  return memo('fuzz', () => {
    const c = canvas(size), ctx = c.getContext('2d');
    const bands = ['#e9b21f', '#221a10', '#e9b21f', '#2a2013', '#c98d16'];
    const h = size / bands.length;
    bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * h, size, h + 1); });
    // 毛絨顆粒(沿條紋方向拉出短毛)
    for (let i = 0; i < 9000; i++) {
      const x = vnoise(i, 1) * size, y = vnoise(i, 2) * size;
      const bright = vnoise(i, 3) > 0.5;
      ctx.strokeStyle = bright ? 'rgba(255,230,150,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (vnoise(i, 4) - 0.5) * 3, y - 2 - vnoise(i, 5) * 3); ctx.stroke();
    }
    return tex(c);
  });
}

// ---- 翅膜:透明底 + 翅脈網 + 淡虹彩 ----
// kind: 'net'(蜻蜓/蝗蟲網翅) | 'bee'(蜜蜂膜翅) | 'plain'
export function wingMembrane(kind = 'net', tint = '#bfe9ff', size = 256) {
  return memo('wing-' + kind + tint, () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    // 淡淡的膜色 + 虹彩漸層
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, 'rgba(180,235,255,0.10)');
    g.addColorStop(0.5, 'rgba(220,200,255,0.06)');
    g.addColorStop(1, 'rgba(200,255,235,0.10)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(60,70,80,0.55)';
    if (kind === 'net') {
      // 縱脈
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 7; i++) {
        const x = size * (0.08 + i * 0.13);
        ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + (i - 3) * 6, size - 4); ctx.stroke();
      }
      // 橫脈織成網格
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(70,80,90,0.35)';
      for (let y = 8; y < size; y += 10) {
        for (let i = 0; i < 6; i++) {
          const x = size * (0.14 + i * 0.13);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + size * 0.13, y + (vnoise(i, y) - 0.5) * 6); ctx.stroke();
        }
      }
    } else if (kind === 'bee') {
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const y = size * (0.2 + i * 0.15);
        ctx.beginPath(); ctx.moveTo(4, y); ctx.bezierCurveTo(size * 0.4, y - 10, size * 0.7, y + 8, size - 4, y); ctx.stroke();
      }
    }
    return tex(c, { srgb: false });
  });
}

// ---- 蝴蝶翅面:深色底 + 結構色藍紫 + 白斑 + 邊緣脈紋 ----
export function butterflyWing(size = 256) {
  return memo('bwing', () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1526'; ctx.fillRect(0, 0, size, size);
    // 結構色藍紫:從翅基往外的放射漸層
    const g = ctx.createRadialGradient(size * 0.15, size * 0.5, 10, size * 0.15, size * 0.5, size);
    g.addColorStop(0, '#5b3fd0');
    g.addColorStop(0.35, '#3b2bb0');
    g.addColorStop(0.7, '#241a52');
    g.addColorStop(1, '#120e22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    // 白色斑點帶
    ctx.fillStyle = 'rgba(245,245,255,0.92)';
    for (let i = 0; i < 10; i++) {
      const x = size * (0.45 + vnoise(i, 7) * 0.4);
      const y = size * (0.15 + i * 0.075);
      const r = 5 + vnoise(i, 8) * 7;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 翅脈
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const y = size * (0.1 + i * 0.11);
      ctx.beginPath(); ctx.moveTo(0, size * 0.5); ctx.quadraticCurveTo(size * 0.5, y, size, y); ctx.stroke();
    }
    // 邊緣暗帶
    ctx.strokeStyle = 'rgba(10,8,16,0.9)'; ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, size - 10, size - 10);
    return tex(c);
  });
}

// ---- 複眼:六角小眼陣列 + 高光 ----
export function compoundEye(baseCol = '#20303a', size = 128) {
  return memo('eye-' + baseCol, () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = baseCol; ctx.fillRect(0, 0, size, size);
    const r = 4.4, dx = r * 1.75, dy = r * 1.52;
    for (let j = 0, row = 0; j < size + dy; j += dy, row++) {
      for (let i = (row % 2 ? dx / 2 : 0); i < size + dx; i += dx) {
        const shade = 0.6 + vnoise(i, j) * 0.4;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2 + Math.PI / 6;
          const px = i + Math.cos(a) * r, py = j + Math.sin(a) * r;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(i - r * 0.3, j - r * 0.3, 0.5, i, j, r);
        g.addColorStop(0, `rgba(255,255,255,${0.25 * shade})`);
        g.addColorStop(0.5, `rgba(120,180,200,${0.15 * shade})`);
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g; ctx.fill();
      }
    }
    return tex(c);
  });
}

// ---- 瓢蟲鞘翅:紅底 + 七顆黑斑(貼在半球上,以 UV 定位) ----
export function ladybugElytra(size = 256) {
  return memo('ladybug', () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#cf2f2f'; ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size * 0.4, size * 0.3, 10, size * 0.5, size * 0.5, size * 0.7);
    g.addColorStop(0, 'rgba(255,120,110,0.6)');
    g.addColorStop(1, 'rgba(150,20,20,0.3)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    // 前緣黑色前胸帶 + 中線
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, size, size * 0.06);
    ctx.fillRect(size * 0.485, 0, size * 0.03, size);
    // 斑點(對稱)
    const spots = [[0.30, 0.30], [0.70, 0.30], [0.22, 0.58], [0.78, 0.58], [0.35, 0.80], [0.65, 0.80], [0.50, 0.14]];
    ctx.fillStyle = '#141414';
    spots.forEach(([u, v]) => {
      ctx.beginPath(); ctx.ellipse(u * size, v * size, size * 0.07, size * 0.075, 0, 0, Math.PI * 2); ctx.fill();
    });
    return tex(c);
  });
}

// ---- 環境:草地地面(俯視) ----
export function ground(size = 512) {
  return memo('ground', () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#38602c'; ctx.fillRect(0, 0, size, size);
    // 泥土斑塊
    for (let i = 0; i < 40; i++) {
      const x = vnoise(i, 11) * size, y = vnoise(i, 12) * size, r = 20 + vnoise(i, 13) * 60;
      ctx.fillStyle = `rgba(70,54,34,${0.10 + vnoise(i, 14) * 0.15})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 草色斑駁
    for (let i = 0; i < 4000; i++) {
      const x = vnoise(i, 21) * size, y = vnoise(i, 22) * size;
      const g = 60 + Math.floor(vnoise(i, 23) * 90);
      ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.35},0.5)`;
      ctx.fillRect(x, y, 2, 3 + vnoise(i, 24) * 3);
    }
    smoothNoise(ctx, size, 40, 0.15);
    return tex(c, { repeat: 3 });
  });
}

// ---- 樹皮(獨角仙棲木) ----
export function bark(size = 256) {
  return memo('bark', () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#5a4530'; ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 3) {
      const shade = vnoise(x, 5);
      ctx.strokeStyle = `rgba(30,20,12,${0.2 + shade * 0.3})`;
      ctx.lineWidth = 1 + shade * 2;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y < size; y += 8) ctx.lineTo(x + (vnoise(x, y) - 0.5) * 6, y);
      ctx.stroke();
    }
    smoothNoise(ctx, size, 10, 0.25);
    return tex(c, { repeat: 2 });
  });
}

// ---- 花瓣(供蜜蜂/瓢蟲停駐的花朵) ----
export function petal(col = '#e7d6f2', size = 128) {
  return memo('petal-' + col, () => {
    const c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = col; ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,240,120,0.9)');
    g.addColorStop(0.25, 'rgba(255,240,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return tex(c);
  });
}

// ---- 天空漸層(貼在大球內面) ----
export function sky(size = 256) {
  return memo('sky', () => {
    const c = canvas(2, size), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#afe0f5');
    g.addColorStop(0.45, '#d8eef7');
    g.addColorStop(0.75, '#eaf6ee');
    g.addColorStop(1, '#cfe3c2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function clearTextureCache() { cache.clear(); }
