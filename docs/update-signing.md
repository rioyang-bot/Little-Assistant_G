# 更新簽章

小助手只安裝經 METech 私鑰簽章的自動更新。即使 GitHub 帳號或發布 token 遭盜用，沒有私鑰也無法推送可安裝的更新。

## 運作方式

- `npm run dist` 建置安裝檔後，`postdist` 會執行 `build/sign-update.cjs`：以 Ed25519 私鑰簽署「版本、安裝檔名稱、SHA-512」，並把簽章寫入 `release/latest.yml` 的 `metechSignature`。
- 簽署後會立即以 app 內建的公鑰（`electron/update-signing-public-key.pem`）驗證，金鑰不符時不會修改 `latest.yml`。
- app 下載更新後，先計算安裝檔 SHA-512 並驗證簽章；缺少簽章、內容被替換、版本被改寫或使用其他金鑰時，一律不安裝並顯示錯誤。
- 為避免繞過驗證，已關閉「結束程式時自動安裝」；更新仍依原本的倒數自動安裝，或從設定手動安裝。

## 私鑰保管

- 預設位置：`%USERPROFILE%\METech-update-signing\update-signing-private.pem`，僅目前帳號可讀取。也可用環境變數 `METECH_UPDATE_SIGNING_KEY` 指定其他位置。
- 請立即備份到至少兩個離線位置（例如加密隨身碟、密碼管理器）。不要放進 Git、雲端同步資料夾或建置伺服器。
- 遺失私鑰：已安裝的版本無法再自動更新，需要手動重新安裝含新公鑰的版本。
- 私鑰外洩：攻擊者可簽署更新。請立即產生新金鑰並發布新版本，並請使用者手動重新安裝。
- `build/generate-update-signing-key.cjs` 只用於首次建立金鑰；已有金鑰時會拒絕覆蓋。

## 限制

- 只保護自動更新。首次安裝的安裝檔沒有 Authenticode 簽章，Windows 仍顯示「未知的發行者」。
- 1.7.0 及更早版本沒有此驗證，因此升級到第一個含驗證的版本時不受保護，之後的更新才受保護。
