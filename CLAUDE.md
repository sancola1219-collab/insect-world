# 昆蟲世界(Insect World)

寫實昆蟲教學模擬器:生態全景 ↔ 昆蟲特寫,可切換 9 大世界區域(台灣 12 種 + 世界 32 種 = 44 種)。純前端(Three.js r160 已 vendor,零 npm 零圖檔),繁體中文教學介面。

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

- **加台灣原生種**:`data.js` 的 `INSECTS` 加一筆(新 `builder` 要在 `insects.js` 寫、`LIFE` 補一筆;`anatomy` part key 對得上 anchor)→ `habitat.js` 的 `LAYOUT` 給家。
- **加世界物種(最常見)**:`data.js` 的 `WORLD` 用 `mk(...)` 加一筆——沿用既有 `builder`、給 `region` 與 `tint`(體色),構造/變態自動套 `A`/`M` 模板;不必改模型與 habitat(通用擺放槽 `slotFor`)。
- **加區域**:`data.js` 的 `REGIONS` 加一筆,對應 `WORLD` 裡該 `region` 的物種即可。

驗證:`__IW.switchRegion(id)` 後 `inspect().anchorsOK` 對得上、`bodyColor()` 確認 tint 生效、`lifecycle()` 四階段正常。
