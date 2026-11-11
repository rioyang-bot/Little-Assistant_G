# METech小助手 Ver.1.7.7 更新說明

- 更新版本：Ver.1.7.6 → Ver.1.7.7
- 內部版本：1.7.7
- 發布日期：2026-11-11
- 適用平台：Windows x64

## 桌面整理工具

- 系統匣「桌面整理工具」選單最上方新增「開啟桌面整理工具」開關（勾選＝開啟）。
- 關閉時：
  - 所有整理視窗收起。
  - 收納在整理視窗的檔案與資料夾回到桌面顯示。
  - 「新增整理視窗」、「顯示整理視窗」、「鎖定／解鎖」與「快照」暫停使用；「疑難排解 → 桌面圖示權限」仍可使用。
- 開啟時：整理視窗回到原本位置，圖示排列不變，收納的項目再次從桌面隱藏。
- 開關狀態會記住：下次開機或重新執行小助手時，維持上次的開啟或關閉。
- 關閉期間，整理視窗、各螢幕的排列與快照都會保留。
- 正在拖曳檔案或設定圖示權限時切換，會提示完成後再試。

## 更新

- 已安裝 Ver.1.7.6 或更早版本的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。
- 從 Ver.1.7.4 以後的版本更新時，小助手會先顯示「檢測到 Ver.1.7.7 版本，即將進行自動更新」。
- 更新後桌面整理工具預設為開啟，與之前相同。
- 開啟「智慧型應用程式控制」的電腦會封鎖未簽章的新版本，請參考 `INSTALL.md`。

## 驗證

- 單元測試全部通過，新增預設開啟、關閉時收起視窗並讓項目回到桌面、重新啟動後維持關閉、關閉期間無法開啟視窗、重新開啟後還原，以及拖曳中不可切換的測試。
- Electron 測試涵蓋系統匣開關的勾選狀態與關閉時停用的項目，以及實際整理視窗關閉後重新開啟回到原位、圖示位置不變。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- The tray menu "Desktop organizer" adds a "Turn on desktop organizer" switch at the top. Off closes every organizer window and shows the collected files and folders on the desktop again; organizer actions are disabled while off, but the icon permission repairs remain available. On brings the organizers back where they were, with the same icon arrangement, and hides the items again.
- The choice is remembered across restarts and reboots. Organizers, per-display layouts and snapshots are kept while off. Switching waits until a file drag or permission change has finished.
- Users of 1.7.6 or earlier receive this update through signature-verified automatic updates (one Windows administrator confirmation); the organizer stays on after updating. PCs with Smart App Control on block unsigned new versions; see INSTALL.md.
- Verification: unit tests and the related Electron tests pass. The executable is still not Authenticode-signed.
