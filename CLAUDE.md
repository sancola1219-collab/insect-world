# 昆蟲世界(Insect World)

寫實昆蟲教學模擬器:生態全景 ↔ 昆蟲特寫,八種台灣常見昆蟲。純前端(Three.js r160 已 vendor,零 npm 零圖檔),繁體中文教學介面。

**接手必讀:[docs/HANDOFF.md](docs/HANDOFF.md)** — 完整架構、測試方法、已踩的坑、發佈流程都在那裡。

## 最重要的三件事

1. **狀態與動畫分離**:`state`(main.js)是唯一事實來源,使用者操作立即改狀態;相機飛行、拍翅只是裝飾。昆蟲位置是模擬秒 `simT` 的純函數。
2. **這台機器的預覽瀏覽器常是 hidden**:rAF 停、截圖必逾時、**WebGL context 會整個丟失(畫布 drawingBuffer=0)**。驗證一律用 `window.__IW`:`forceSize → settle 假時鐘 → inspect(結構) + sampleRT(離屏 render target 取樣)`,不要截圖、不要直接讀畫布。腳本在 [docs/VERIFICATION.md](docs/VERIFICATION.md)。
3. **美學**:高級質感(深色玻璃、髮絲線、寬字距),不要可愛風。文案繁體中文、數據要對。

## 執行

```
node tools/serve.mjs 8137   →  http://localhost:8137/
```

## 加一種昆蟲

`data.js` 加一筆(含 `builder` 名、`anatomy` 的 part key)→ `insects.js` 寫對應 builder(回傳 `{group, anchors, animate, baseLength}`,anchor key 要對得上 anatomy)→ `habitat.js` 的 `LAYOUT` 給牠一個家與棲息型態。用 `__IW.inspect().anchorsOK` 確認標註對得上。
