# AGENTS.md — 昆蟲世界

給 Codex 或其他 agent 模型的入口。**完整交接在 [docs/HANDOFF.md](docs/HANDOFF.md),先讀它。**

## 一句話

純前端(Three.js r160 已 vendor,零 npm、零圖檔)的寫實昆蟲教學模擬器:生態全景 ↔ 昆蟲特寫,八種昆蟲即時程序化生成,繁中教學 UI。

## 動手前務必知道

- **狀態即時、動畫裝飾**:`js/main.js` 的 `state` 是唯一事實來源。別把邏輯綁在動畫回呼上。
- **這台機器 preview 常 hidden**:截圖會逾時、WebGL context 會 lost(畫布 drawingBuffer=0)。**驗證用 `window.__IW`**(`forceSize`→`settle`→`inspect`+`sampleRT`),腳本見 [docs/VERIFICATION.md](docs/VERIFICATION.md)。
- **零資產**:所有貼圖用 Canvas 程序化生成(`js/textures.js`),不要引入圖片檔或 npm 套件。
- **美學**:高級質感、繁體中文、不要可愛風。

## 執行

```
node tools/serve.mjs 8137
```

## 檔案地圖(細節見 HANDOFF §3)

`data.js` 資料/文案 · `textures.js` 程序化貼圖 · `insects.js` 昆蟲模型 · `habitat.js` 生態場景 · `ui.js` 介面 · `main.js` 總指揮+`__IW` API。

## 改完要做

跑 `docs/VERIFICATION.md` 三段腳本(結構/像素/狀態機),在該檔底部追加一筆紀錄。
