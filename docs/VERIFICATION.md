# 昆蟲世界 — 驗證腳本(VERIFICATION)

> 每次大改後重跑本頁腳本,並在底部追加一筆紀錄。
> **環境注意**:這台機器的預覽瀏覽器常是 hidden(`document.hidden === true`)——
> `preview_screenshot` 必逾時,而且 **WebGL context 會被瀏覽器丟失**
> (`gl.isContextLost() === true`、`canvas.drawingBufferWidth === 0`)。
> 因此:
> 1. 不要用截圖驗證。
> 2. 不要直接 `gl.readPixels` 讀畫布(hidden 時畫布 drawingBuffer 是 0)。
> 3. 一律用 `window.__IW` 測試 API:`forceSize → step/settle 假時鐘 → sampleRT`(離屏 render target 取樣)。
>    render target 有自有的 FBO,不受 hidden 分頁 compositor 影響,context 只要活著就能讀回像素。

---

## 一、CPU 端結構檢查(不需 GPU,hidden 也能跑)

在 preview console(或 `preview_eval`)貼上:

```js
(() => {
  const IW = window.__IW;
  IW.forceSize(1280, 800);
  IW.overview(); IW.settle(30);
  const out = { inspect: IW.inspect(), sane: IW.sane(), contextLost: IW.contextLost() };
  out.focusErr = {};
  for (const id of IW.species()) { IW.focus(id); IW.settle(60); out.focusErr[id] = +IW.focusError().toFixed(3); }
  IW.focus('butterfly'); IW.setAnatomy(true); IW.settle(30);
  out.labels = { total: IW.labelCount(), visible: IW.visibleLabels() };
  return out;
})()
```

**判讀基準:**
- `inspect[*].meshes` 每種昆蟲 > 10、`badPos === 0`、`boxFinite === true`、`anchorsOK === true`。
- `inspect[*].anchorsOK` 為 true 代表資料卡宣告的每個構造標註都能對到模型上的 anchor(不會有標題卻無指向)。
- `focusErr[*]` 全部 < 0.15(相機聚焦點與昆蟲世界座標的距離,越小代表取景越準)。
- `labels.total === 蝴蝶的 anatomy 數(7)`、`labels.visible` > 0。
- `sane === true`(相機/目標無 NaN)。

## 二、GPU 像素檢查(離屏 render target,hidden 也能跑)

```js
(() => {
  const IW = window.__IW; IW.forceSize(1280, 800);
  const out = { overview: (IW.overview(), IW.settle(30), IW.sampleRT()) };
  out.perInsect = {};
  for (const id of IW.species()) { IW.focus(id); IW.settle(50); out.perInsect[id] = IW.sampleRT().avg; }
  return out;
})()
```

> ⚠️ **sampleRT 在 hidden 分頁下是「機會性」的**:GPU context 若在那一瞬間活著就讀得到真實像素,
> 若剛好在 lost/還原空窗就會回傳一堆 0。**多跑幾次取有非零的那次即可**;
> 真正的決定性驗證閘門是上面第一段的 CPU `inspect()`(不需 GPU,每次都穩定綠)。

**判讀基準(取到非零的那次):**
- 每個 `avg` 都是非零、且各昆蟲彼此不同 → 證明有實際渲染且畫的是不同內容。
- 顏色特徵應吻合真實體色(抽驗):
  - `ladybug` 紅色通道最高(紅色鞘翅)。
  - `ant` 整體最暗(小而黑)。
  - `dragonfly` 最亮偏青(半透明翅 + 青綠身體)。
  - `mantis` / `grasshopper` 綠色通道為主。

## 三、狀態機/導覽煙霧測試

```js
(() => {
  const IW = window.__IW; const log = [];
  IW.overview(); log.push(['overview', IW.state().view]);          // 'habitat'
  IW.focus('bee'); log.push(['focus', IW.state().focus]);          // 'bee'
  IW.setMotion(false); log.push(['motion', IW.state().motion]);    // false
  IW.setMotion(true);
  IW.tour(); log.push(['tour0', IW.state().tourIdx]);              // 0
  IW.tourNav(1); log.push(['tour1', IW.state().tourIdx]);          // 1
  IW.tourNav(-1); IW.tourNav(-1); log.push(['wrap', IW.state().tourIdx]); // 繞回 7
  return { log, sane: IW.sane() };
})()
```

---

## `__IW` API 速查

| 方法 | 用途 |
|---|---|
| `forceSize(w,h)` | hidden 下容器 0×0,先強制給渲染尺寸 |
| `step(ms=16)` / `settle(frames,ms)` | 假時鐘同步推進一/多幀(不碰真計時器) |
| `focus(id)` / `overview()` | 立即切換聚焦/全景(不走飛行動畫) |
| `setAnatomy(b)` / `setMotion(b)` | 切換構造標註/動作 |
| `tour()` / `tourNav(±1)` | 開始導覽 / 前後切換 |
| `state()` | 目前狀態快照 |
| `species()` | 所有昆蟲 id |
| `focusError()` | 相機目標與聚焦昆蟲的距離(取景準度) |
| `inspect()` | CPU 端逐昆蟲結構報告(mesh 數、box、anchors) |
| `sampleRT(size)` | 離屏 render target 取樣,回傳 `{avg, litRatio, centerLit}` |
| `sane()` / `contextLost()` | NaN 檢查 / GPU context 狀態 |
| `labelCount()` / `visibleLabels()` | 構造標註 DOM 數 / 可見數 |

---

## 驗證紀錄

- **2026-07-06 首版(Claude Opus 4.8 建立)**:
  - CPU 檢查:8 種昆蟲全部 meshes 12–34、badPos 0、boxFinite、anchorsOK 全 true;labels 7/7 可見;sane true。
  - 取景:focusErr 全部 ≤ 0.059(dragonfly 由 0.134 調 follow-lerp 後降到 0.059)。
  - 像素:某次完整 sampleRT 取到各昆蟲 avg 非零且互異(ladybug 紅通道最高 58–72、ant 最暗、dragonfly 最亮偏青 —— 與真實體色一致);但 hidden 分頁下 sampleRT 有時整批回 0(context 空窗),屬環境限制非程式缺陷,CPU inspect 才是穩定閘門。
  - context:hidden 分頁下畫布 context 曾 lost;已加 `webglcontextlost/restored` 處理,並改用 render target 取樣。console 無 error/warning。
