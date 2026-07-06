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

## 四、生命週期(變態)播放器

```js
(() => {
  const IW = window.__IW; IW.forceSize(1000,700);
  const out = {};
  IW.focus('butterfly'); IW.settle(20); out.complete = IW.lifecycle();   // 完全變態
  IW.focus('grasshopper'); IW.settle(10); out.incomplete = IW.lifecycle(); // 不完全變態
  // 逐階段實際取景(要 settle)
  IW.focus('beetle'); IW.settle(10); IW.openLifecycle();
  out.frame = [];
  for (let i=0;i<4;i++){ IW.setLifeStage(i); IW.settle(80); out.frame.push(+IW.focusError().toFixed(3)); }
  IW.closeLifecycle();
  return out;
})()
```

**判讀基準:**
- `lifecycle().stages` 四階段 `meshes` 都 > 0;`isAdult` 只有第 4 階段為 true;`sane === true`。
- `complete.kind === 'complete'`、`incomplete.kind === 'incomplete'`。
- `adultVisibleAfterClose === true`(關閉後成蟲模型還原)。
- `frame[*]`(有 settle)相機取景誤差 < 0.15。
- 切換昆蟲或回全景會自動關閉播放器(`state().lifeStage` 回 null、`#life-bar` 加 `hidden`)。

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
| `openLifecycle()` / `setLifeStage(i)` / `closeLifecycle()` | 開啟/切換/關閉變態播放器 |
| `lifecycle()` | 走過四階段的結構報告(mesh 數、isAdult、取景半徑) |
| `strata()` | 分層射線檢查(上/中/下命中什麼,抓單一物件蓋滿全畫面) |
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

- **2026-07-06 擴充至 12 種(Claude Opus 4.8)**:新增台灣熊蟬、台灣扁鍬形蟲、台灣皮竹節蟲、黑翅螢。
  - CPU 檢查:12 種全部 meshes 12–34、badPos 0、boxFinite、anchorsOK 全 true(新昆蟲的 anatomy part key 都對得上 builder anchor);sane true;console 無 error。
  - 取景:新四種 focusErr ≤ 0.05(cicada 0.006、stagbeetle 0.001、stickinsect 0、firefly 0.05);標註 firefly 6/6、stagbeetle 6/6 可見。
  - 導覽:12 站依分類故事順序走完並正確 wrap 回蝴蝶。
  - 像素:本次驗證時 hidden 分頁 context 持續 lost(`ext WEBGL_lose_context` 不可用、無法強制還原),故 sampleRT 全 0——**屬環境限制**;新四種沿用與已驗證 8 種相同的材質/幾何 helper,渲染路徑一致。決定性閘門 CPU inspect 全綠。

- **2026-07-06 生命週期播放器(Claude Opus 4.8)**:新增 `js/lifecycle.js` + 播放器。
  - `lifecycle()`:complete(蝴蝶/獨角仙/螢火蟲)四階段卵→幼蟲→蛹→成蟲,幼蟲/蛹 mesh 數各異(毛蟲 20、雞母蟲 11、螢火蟲發光幼蟲 30、懸蛹 7、裸蛹 10);incomplete(蜻蜓/蝗蟲)卵→若蟲→若蟲→成蟲,若蟲由成蟲 clone 去翅;`isAdult` 僅末階段、`sane` true、關閉後成蟲還原 true。
  - 取景(有 settle):四階段 focusError 0.059–0.096。UI:life-bar 顯示、4 進度點、active/kind 標籤正確、播放鈕切 ❚❚。自動播放 2.6s 進一階段(0→1 驗證通過)。
  - 清理:播放中切換昆蟲、回全景都會自動關閉(lifeStage→null、life-bar hidden)。
  - 注意:reload 時 console 出現多筆 `THREE.WebGLProgram: VALIDATE_STATUS false`(空 info log)——是 hidden 分頁 context lost 時編譯 shader 的假象(GL 1282),非 GLSL 錯誤;context 活著時不再出現。
