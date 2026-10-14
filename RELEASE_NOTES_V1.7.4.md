# METech小助手 Ver.1.7.4 更新說明

- 更新版本：Ver.1.7.3 → Ver.1.7.4
- 內部版本：1.7.4
- 發布日期：2026-10-14
- 適用平台：Windows x64

## 桌面整理工具

- 系統匣「桌面整理工具」新增「鎖定／解鎖 ▸」子選單：
  - 全部鎖定：所有整理視窗一起鎖定，固定位置並保持在其他視窗下層。
  - 全部解鎖：所有整理視窗一起解鎖。
  - 只切換狀態不同的視窗；全部已鎖定（或已解鎖）時對應項目顯示為灰色。
- 開鎖圖示的鎖環明顯抬高打開，在系統匣與整理視窗右鍵選單中更容易與閉鎖圖示分辨。

## 自動更新

- 自動檢查到新版本時，小助手對話泡泡與總覽設定會顯示「檢測到 Ver.X 版本，即將進行自動更新」，之後照常下載、驗證並自動安裝。
- 自動更新由目前安裝的版本執行，因此這個提示會從 Ver.1.7.4 之後的更新開始顯示；從 Ver.1.7.3 更新到 Ver.1.7.4 時仍是原本的提示。
- 自動更新關閉時，手動檢查維持顯示「已找到 X 版，正在下載」，不會誤稱自動安裝。

## 安裝說明

- 新增 `INSTALL.md`：下載與檔案核對、SmartScreen「仍要執行」、使用者帳戶控制、被「智慧型應用程式控制」封鎖時的處理方式、自動更新流程、檔案總管看不到桌面檔案的常見問題，以及解除安裝。

## 更新

- 已安裝 Ver.1.7.3、Ver.1.7.2、Ver.1.7.1 或 Ver.1.7.0 安全性修訂版的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。
- 開啟「智慧型應用程式控制」的電腦會封鎖未簽章的新版本，請依 `INSTALL.md` 關閉此功能後再開啟小助手。

## 驗證

- 單元測試全部通過，新增全部鎖定／解鎖與新版本提示的測試。
- Electron 測試涵蓋系統匣「鎖定／解鎖」子選單（順序、圖示、灰色狀態與執行）、實際整理視窗的全部鎖定／解鎖，以及小助手與總覽設定的新版本提示和後續自動安裝流程。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- Tray → Desktop organizer → Lock / unlock adds Lock all and Unlock all. Only organizers in the other state change; an item is dimmed when there is nothing to change. The open padlock icon now shows a clearly raised shackle.
- When automatic update finds a new version, the assistant and Settings show "Version X detected. Updating automatically soon." before the usual download, verification and installation. Updates run with the installed version's code, so this appears from updates after 1.7.4. With automatic updates off, a manual check keeps the previous wording.
- Added INSTALL.md: download and checksum, SmartScreen "Run anyway", User Account Control, handling Smart App Control blocks, the automatic update flow, finding collected desktop files, and uninstalling.
- Users of 1.7.3, 1.7.2, 1.7.1 or the 1.7.0 security revision receive this update through signature-verified automatic updates (one Windows administrator confirmation). PCs with Smart App Control on block unsigned new versions; see INSTALL.md.
- Verification: unit tests and the related Electron tests pass. The executable is still not Authenticode-signed.
