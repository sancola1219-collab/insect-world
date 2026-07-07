# 昆蟲世界 — 交接指南(HANDOFF)

> 給下一個接手的 AI 模型(Codex / Claude Code / 其他)或人類開發者。
> **先讀完這份,再動任何程式碼。** 本文件是唯一完整的交接入口;
> 根目錄的 `CLAUDE.md` 與 `AGENTS.md` 只是指向這裡的精簡摘要。

最後更新:2026-07-06(由 Claude Opus 4.8 建立專案並完成第一版)

---

## 1. 這是什麼

「昆蟲世界」是一個**純前端**的寫實昆蟲教學模擬器(繁體中文介面):

- **兩層視角**:
  - **生態全景**:一片盛夏草地,十二種台灣常見昆蟲在其中活動(空中飛的蝴蝶/蜻蜓/螢火蟲、花上的蜜蜂/瓢蟲、葉間的螳螂/蝗蟲/竹節蟲、地面的螞蟻/鍬形蟲、樹幹上的獨角仙/蟬)。可自由環顧、縮放,遠看整個生態。
  - **昆蟲特寫**:點任一昆蟲,相機飛近做特寫。可近看身體構造。
- **教學功能**:
  - 每種昆蟲有**資料卡**(真實數據、生命週期/變態、趣聞)。
  - **構造標註**:近看時開啟,在 3D 模型上標出頭/胸/腹/複眼/翅/足等部位並解說。
  - **昆蟲導覽**:自動巡覽十二種昆蟲,依「分類故事」順序解說(鱗翅→鞘翅→膜翅→蜻蛉→半翅→…)。
  - **生命週期 3D 演示**:資料卡按「▶ 3D 演示」播放變態過程 —— 完全變態[卵→幼蟲→蛹→成蟲]、不完全變態[卵→若蟲→蛻皮前若蟲→成蟲],相機隨階段自動取景、可自動播放或手動切換。
  - **真實相對比例**:全景中十二種昆蟲以真實體型比例並存(螢火蟲 9mm 遠小於竹節蟲 110mm),建立尺寸感。
- **十二種台灣昆蟲**:大紫蛺蝶、獨角仙、台灣扁鍬形蟲、西方蜜蜂、黑棘蟻、無霸勾蜓、台灣熊蟬、七星瓢蟲、黑翅螢、寬腹螳螂、台灣大蝗、台灣皮竹節蟲(橫跨八大類群)。
- **世界區域(2026-07-06 拓展)**:頂部可切換 9 大區(台灣、日本・東亞、東南亞、南亞・中東、非洲、歐洲、北美洲、中南美洲、大洋洲),各區 4 種代表性真實物種(共 +32 種)。世界物種沿用既有 12 種身體模型(builder),以「體色 tint + 尺寸 + 真實資料」呈現(如藍閃蝶=蝴蝶染藍、長戟大兜蟲=甲蟲放大)。切區只顯示該區昆蟲,圖鑑清單與導覽都隨區域更新。

技術:Three.js r160(已 vendor 到 `vendor/`,**無 npm、無打包器、無外部資產**)。
所有昆蟲都是即時用幾何體 + 程序化貼圖(Canvas)組成,整個 repo 沒有任何圖片檔。

## 2. 如何執行與測試

```
node tools/serve.mjs 8137      # 零依賴靜態伺服器
# 瀏覽器開 http://localhost:8137/
```

(或用 Claude Code 的 preview:`.claude/launch.json` 已設定 `insect-world`。)

### 測試 API(重要)

這台機器的預覽瀏覽器常是 **hidden**:rAF 停、計時器節流、**截圖必逾時、WebGL context 會整個丟失**
(`gl.isContextLost()===true`、`canvas.drawingBufferWidth===0`)。
所以 `main.js` 暴露了 `window.__IW` 除錯 API,**驗證一律走同步模擬,不要依賴截圖,也不要直接讀畫布**:

```js
const IW = window.__IW;
IW.forceSize(1280, 800);   // hidden 下容器是 0×0,先強制給尺寸
IW.focus('ladybug');       // 狀態立即改變
IW.settle(60);             // 假時鐘同步推進 60 幀(不受計時器節流影響)
IW.inspect();              // CPU 端結構檢查(mesh 數、bounding box、anchors)
IW.sampleRT();             // 離屏 render target 取樣像素(繞過 hidden 畫布)
```

**為什麼用 render target 取樣**:hidden 分頁的畫布 drawingBuffer 是 0,直接 `gl.readPixels` 讀不到東西;
但自己建的 `WebGLRenderTarget` 有獨立 FBO,只要 context 活著就能渲染 + 讀回,不受 compositor 影響。
完整可重跑腳本見 [`VERIFICATION.md`](VERIFICATION.md)。

## 3. 檔案地圖

| 檔案 | 職責 |
|---|---|
| `index.html` | DOM 骨架 + importmap(`three` → `vendor/`) |
| `css/style.css` | 全部樣式(深色玻璃面板;美學要求:高級質感、**不要可愛風**) |
| `js/data.js` | 昆蟲資料庫(台灣 12 種 bespoke + `WORLD` 世界 32 種經 `mk()` 工廠);`REGIONS` 區域、`A`/`M` 構造/變態模板、`regionInsects`/`tourForRegion`/`lifeOf` |
| `js/textures.js` | 程序化貼圖引擎(幾丁質外殼、翅膜脈紋、結構色翅面、複眼六角陣列、絨毛、瓢蟲斑點、草地/樹皮/花瓣/天空) |
| `js/insects.js` | 程序化昆蟲模型建構器(十二種);每個回傳 `{group, anchors, animate, baseLength}`;`wingMesh` 會標 `userData.isWing`(供若蟲去翅) |
| `js/lifecycle.js` | 變態階段模型(卵/毛蟲/雞母蟲/蛆/鱷魚狀幼蟲/懸蛹/裸蛹/繭);不完全變態的若蟲由成蟲 clone 去翅縮小 |
| `js/habitat.js` | 生態全景場景(地面、草叢、花、**多棵樹+橫枝+樹冠**、**葉叢植物**、天空、霧)+ 昆蟲擺放 + **散佈複本 `decor`**。**棲位 `STRATUM`**:air 空中/tree 樹上/leaf 葉上/ground 土地——主角(LAYOUT/slotFor)與複本(placeDecor)都依此放到樹枝樹幹、葉子、地面或空中;`animDecor` 依 stratum 動(只有空中飛的漫遊+拍翅,樹/葉/土上原地小幅、翅收摺)。複本 `clone(true)` 共用幾何/材質、依 `decorWeight` 小蟲多大蟲少、可點選→聚焦該種 |
| `js/ui.js` | 全部 DOM 介面(只反映狀態 + 回呼,不持有邏輯)、構造標註 DOM 層 |
| `js/main.js` | 總指揮:狀態機、渲染迴圈、相機飛行、拾取、標註投影、`__IW` 測試 API、context 遺失處理 |
| `tools/serve.mjs` | 開發用零依賴靜態伺服器 |

## 4. 核心架構(改程式碼前必懂)

### 4.1 狀態機(`main.js` 的 `state` 物件 = 唯一事實來源)

```
state.view     'habitat'(生態全景) | 'focus'(昆蟲特寫)
state.focus    昆蟲 id | null
state.anatomy  是否顯示構造標註
state.motion   是否播放動作(拍翅/擺足)
state.tourIdx  null 或 0..7(導覽進度)
```

**鐵律一:狀態與動畫分離。** 使用者點選昆蟲的當下,`state.focus` 立刻改變、資料卡立刻更新、
構造標註立刻重建;相機飛行(`flyTo` tween)只是裝飾層,被節流/中斷/掉幀都不影響任何狀態。
👉 為什麼:過去專案把邏輯綁在動畫回呼上,背景分頁節流時整個遊戲卡死。**不要走回頭路。**
(參考 [[lesson-state-vs-animation]] 的教訓。)

**鐵律二:昆蟲位置是模擬秒 `simT` 的純函數。** `habitat.update(simT)` 每幀用 `idle(station, simT)`
重算每隻昆蟲在草地上的位置(sin/cos 路徑),不做增量累加,任意暫停/快轉都不會累積誤差。

### 4.2 渲染迴圈與 hidden browser 對策

- rAF 主迴圈 + **setInterval(400ms) 看門狗**:超過 500ms 沒跳幀就手動 `tick()`。
- 載入期間的重活(建構所有昆蟲 + 程序化貼圖)用 `setTimeout(build, 30)` 讓載入畫面先繪出。
- `ResizeObserver` 監聽容器;`sizeW/sizeH` 有 `Math.max(1, …)` 保護避免 0×0。
- **WebGL context 遺失處理**:`webglcontextlost` preventDefault + 停迴圈;`webglcontextrestored`
  重啟迴圈(three 會自動重傳 GPU 資源)。hidden 分頁很容易丟 context,沒處理會整個黑掉。

### 4.3 昆蟲模型(`insects.js`)

- 每個 builder 以「頭朝 +X、上為 +Y、翅展於 ±Z」建構,體長 ≈ 1 單位。
- 回傳:
  - `group`:THREE.Group。
  - `anchors`:`{ partKey: Object3D }`,是模型上各構造的定位點;`ui.js` 的標註和 `data.js` 的
    `anatomy[].part` 靠這個 key 對應。**新增構造標註時,data 的 part key 必須在 builder 裡有對應 anchor**
    (`__IW.inspect().anchorsOK` 會檢查)。
  - `animate(t, moving)`:純裝飾動畫(拍翅、擺足、懸停),`moving=false` 時幾乎靜止。
  - `baseLength`:取景用參考長度。
- 共用零件:`chitinMat`(幾丁質)、`eyeMat`(複眼)、`wingMesh`(翅形)、`tube`(分節肢體)、
  `addLegs`(對稱六足)。結構色用 `MeshPhysicalMaterial` 的 `iridescence`(蝴蝶翅、甲蟲殼)。
- **翅膀方向鐵律**:`wingMesh` 產出的翅「翅根在原點、翅端指向 +Z(體側)、弦沿 ±X」,掛在胸部兩側後
  是往**身體兩側**張開。**不要讓翅往 +X(頭前)伸**——那會變成「翅膀長在頭上」(2026-07-06 修過)。
  拍翅一律用外層 group 的 `rotation.x`(上下擺),左右以 `scale.z = ±1` 鏡射、拍翅角 `×s` 對稱。
- **區域外形特徵 `feat`**:`buildInsect(kind, {tint, feat})`。目前 `beetle` 讀 `feat.hornScale`(長戟/南洋大兜
  角特別長,以頭部為支點的 `hornGroup` 縮放、不會與頭脫節)、`butterfly` 讀 `feat.wingScale`(皇蛾/月亮蛾
  巨翅)。要加旗艦外形就擴充對應 builder + `data.js` 的 `FEAT` 表。

### 4.4 真實相對比例(`habitat.js`)

- `MM = 0.03`:世界長度 = `lengthMM × MM`,再除以模型 `baseLength` 得每隻的縮放。
- 所以十二種昆蟲在全景中是**真實體型比**(這是刻意的教學效果:螢火蟲就是比竹節蟲小一大截)。
- 聚焦時相機距離 = `station.radius × 4.4`,不論大小都把該昆蟲框滿畫面。

### 4.5 已踩過的坑(修過的,不要再犯)

1. **hidden 分頁畫布 context 會 lost、drawingBuffer=0**:直接 `gl.readPixels` 讀畫布得到全 0。
   → 驗證改用自建 `WebGLRenderTarget` 離屏渲染 + `readRenderTargetPixels`。
2. **快速飛行的昆蟲(蜻蜓 dart)聚焦時會飄出框**:靠加大「目標跟隨 lerp」(0.06→0.1)
   與 focus 時把待機漫遊幅度 damp 到 0.12 收斂,讓牠停在鏡頭中央。
3. **標註 part key 與 anchor 不對應**會出現「有標題卻不知指向哪」:`inspect().anchorsOK` 專門守這題。
4. **翅膀曾往頭前伸(翅長在頭上)**:`wingMesh` 的長軸原本是 +X → 改成 +Z(體側)。用 `__IW.audit()`
   看 `wingSpreadsSideways`(翅在 ±Z)與 `wingPastHead`(翅前緣是否越過頭)守這題。

### 4.6 手機版面(RWD)

- 手機(≤640px)把面板改成「頂部精簡列 + 底部單一情境抽屜」,中間 3D 畫面永遠看得見:
  - 全景 → 底部水平捲動的**圖鑑條**(固定高 78px);聚焦 → 底部**資料卡抽屜**(≤42vh)。
  - 只有一個抽屜會出現:`main.js` 依情境切 `body` class `focus-mode` / `life-mode` / `tour-mode`,
    CSS 據此隱藏其他抽屜(見 `style.css` 手機 media query)。
- **聚焦取景會被底部卡片擋住** → `main.js` 的 `aimOf(st, radius)` 在 `isMobile()` 時把相機目標下移
  `radius×0.7`,讓昆蟲顯示在卡片上方的可見帶。用 `__IW.project('thorax')` 驗證昆蟲在 `info-panel` 上緣之上。

## 5. 發佈(GitHub Pages)

- 帳號:`sancola1219-collab`(其他專案:space-world、boardgames、drawing-board、pivot-helper 同帳號)。
- PAT 已存在 Windows 認證管理員,`git push` 免輸入;`gh` CLI 與 python **不可用**。
- 需要 GitHub API 時(建 repo、開 Pages),用 Git Bash:
  ```bash
  PAT=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
  curl -s -H "Authorization: token $PAT" https://api.github.com/user/repos -d '{"name":"insect-world"}'
  # 開 Pages:PUT /repos/sancola1219-collab/insect-world/pages  source=main /
  ```
  (PowerShell 5.1 管線餵 secret 會壞,一律用 bash——見 [[lesson-ps51-stdin-pipe]]。)
- **已發佈**:repo `sancola1219-collab/insect-world`,線上 **https://sancola1219-collab.github.io/insect-world/**。
- **部署機制:GitHub Actions**(`.github/workflows/deploy.yml`,用 `upload-pages-artifact` + `deploy-pages` 部署整個根目錄)。push 到 main 即自動重建,約 1 分鐘上線,穩定可靠。
- 發佈時踩到的坑(依序):
  1. 帳號是 **user 非 org** → 建 repo 走 `POST /user/repos`(不是 `/orgs/.../repos`,否則 404)。
  2. 含中文的 repo description 直接放進 bash 的 `-d` 字串會 `400 Problems parsing JSON`(Git Bash 編碼) → 把 JSON 寫成 UTF-8 檔,用 `--data-binary @file` 送。
  3. **legacy(Jekyll)builder 會卡死**:首次成功後,後續每次 build 都卡在 `building` 約 18 分鐘然後 `errored`(error message 為 null,GitHub 狀態頁卻 All Operational),線上一直停在舊版。`.nojekyll` 沒用。**解法:改用 GitHub Actions 部署** —— API `PUT /repos/.../pages` 設 `{"build_type":"workflow"}`,加上上述 workflow 檔,push 後 Actions 一次就綠、`lifecycle.js` 立刻 200。(這台機器的 PAT 有 `workflow` scope,可直接 push `.github/workflows/`。)

## 6. 路線圖(未完成的擴充方向,依價值排序)

- [ ] **更多昆蟲**:蟬、鍬形蟲、椿象、蝸牛(非昆蟲但常見)、竹節蟲——照 `data.js` 一筆 + `insects.js` 一個 builder 的模式加,記得補 anchor。
- [x] **變態動畫**:已完成(`js/lifecycle.js` + `main.js` 的生命週期播放器)。可再延伸:階段之間做真正的形變過場(目前是切換+相機重取景)、幼蟲取食/蛹裂殼等細節動畫。
- [ ] **微距材質升級**:複眼加 env reflection、翅膀加更細的脈紋 normal map、外殼加次表面感。
- [ ] **聲音**:蟬鳴/蟋蟀(注意瀏覽器自動播放政策;目前刻意零資產)。
- [ ] **小測驗模式**:資料都在 `data.js`,出題 UI 照導覽列的模式做。
- [ ] **日夜/季節**:改 `addLights` 的太陽角度與 `sky` 貼圖,夜晚可加螢火蟲。
- [ ] **無障礙**:鍵盤切換昆蟲、標註朗讀。

## 7. 改動守則

1. 改邏輯前先讀本文件 §4 的兩條鐵律。
2. 任何改動用 `__IW` 驗證(`inspect` 結構 + `sampleRT` 像素 + 狀態機煙霧測試),見 `VERIFICATION.md`,**不要只信截圖**(截圖在這台機器會逾時)。
3. 教學文案(`data.js`)是給台灣學生看的:繁體中文、數據要對。
4. 美學:高級質感(深色玻璃、髮絲線、寬字距),**不要可愛風**。
5. 驗證完成後在 `docs/VERIFICATION.md` 底部追加一筆紀錄。
