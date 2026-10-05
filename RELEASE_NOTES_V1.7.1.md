# METech小助手 Ver.1.7.1 更新說明

- 更新版本：Ver.1.7.0 → Ver.1.7.1
- 內部版本：1.7.1
- 發布日期：2026-10-05
- 適用平台：Windows x64

## 顯示桌面

- 按下 Windows「顯示桌面」（Win+D 或工作列右下角）時，置底模式的小助手與桌面整理視窗會保留在桌面上，約 0.5 秒內出現且不閃爍。
- 回到其他視窗或再次按「顯示桌面」後，小助手與整理視窗恢復置底，位於其他程式下方。
- 「永遠置頂」模式維持原本行為。

## 自動更新

- 本版是第一個透過經簽章驗證的自動更新發布的版本：小助手下載更新後，先驗證 METech 更新簽章才安裝；簽章不符時停止安裝並顯示錯誤。
- 已安裝 Ver.1.7.0 安全性修訂版（安裝於 Program Files）的使用者會自動收到此更新；更新時需要一次 Windows 管理員確認，若拒絕確認，小助手會以原版本自動重新開啟。
- 更早的 1.7.0 版本或更舊版本也會透過自動更新取得此版本並改為安裝至 Program Files；這些舊版本若在更新時拒絕管理員確認，小助手會關閉，下次登入時才會再開啟。

## 驗證

- 單元測試全部通過，並新增「顯示桌面」原生測試（實際按下 Win+D），確認置底的小助手與整理視窗在顯示桌面期間保持可見，之後回到其他程式下方。
- 已在實際使用環境以「顯示桌面」測試確認。
- 與前版相同，執行檔未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- Windows Show desktop (Win+D or the taskbar corner) now keeps the bottom-mode assistant and desktop organizers visible on the desktop within about half a second without flicker; they return below other windows afterwards. Always-on-top mode is unchanged.
- This is the first release delivered through signature-verified automatic updates: downloaded updates are installed only after the METech update signature is verified.
- Users of the Ver.1.7.0 security revision (installed under Program Files) receive this update automatically; it needs one Windows administrator confirmation, and the assistant reopens on the current version if the confirmation is declined. Earlier builds also update and move to Program Files; if they decline the confirmation, the assistant closes until the next sign-in.
- Verification: all unit tests pass, plus a new native Show desktop test using a real Win+D. The executable is still not Authenticode-signed; update contents are protected by the METech update signature.
