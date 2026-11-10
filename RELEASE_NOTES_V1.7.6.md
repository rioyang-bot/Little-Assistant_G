# METech小助手 Ver.1.7.6 更新說明

- 更新版本：Ver.1.7.5 → Ver.1.7.6
- 內部版本：1.7.6
- 發布日期：2026-11-10
- 適用平台：Windows x64

## 待辦便利貼

- 便利貼較多時，每張卡片維持完整高度，不再被壓扁而截掉主旨。
- 看板不再固定最高 440px（小 340／大 500px），改為隨便利貼數量長高，最多用到小熊上方的螢幕空間；超出螢幕時才以捲軸往下捲。「新增便利貼」表單打開時也一樣。
- 新增便利貼後小熊說話時，看板不再被固定在 400px。
- 滑鼠停在便利貼主旨上時，浮動提示除了主旨，也會列出事項（☐ 未完成／☑ 已完成），不用展開就能查看內容；最多列出 20 項。

## 更新

- 已安裝 Ver.1.7.5 或更早版本的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。
- 從 Ver.1.7.4 以後的版本更新時，小助手會先顯示「檢測到 Ver.1.7.6 版本，即將進行自動更新」。
- 開啟「智慧型應用程式控制」的電腦會封鎖未簽章的新版本，請參考 `INSTALL.md`。

## 驗證

- 單元測試全部通過。
- Electron 測試涵蓋 20 張便利貼加上展開的表單：高螢幕全部顯示不需捲動、一般螢幕看板頂到螢幕上方才捲動、矮視窗以捲軸捲動且卡片不被壓扁，以及主旨浮動提示列出事項；對話泡泡與面板排列、停靠、重新啟動、拖曳等測試也通過。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- With many sticky notes, each card keeps its full height, so subjects are no longer cut off.
- The board no longer has a fixed maximum height. It grows with its notes up to the space above the bear and scrolls only beyond the screen, including while the new-note form is open. It is no longer held at 400px while the bear speaks.
- Hovering a note subject shows its items (☐ open / ☑ done) as well, up to 20, without expanding the note.
- Users of 1.7.5 or earlier receive this update through signature-verified automatic updates (one Windows administrator confirmation). PCs with Smart App Control on block unsigned new versions; see INSTALL.md.
- Verification: unit tests and the related Electron tests pass. The executable is still not Authenticode-signed.
