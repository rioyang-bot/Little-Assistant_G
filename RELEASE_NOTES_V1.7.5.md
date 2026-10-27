# METech小助手 Ver.1.7.5 更新說明

- 更新版本：Ver.1.7.4 → Ver.1.7.5
- 內部版本：1.7.5
- 發布日期：2026-10-27
- 適用平台：Windows x64

## 桌面整理工具

- 桌面圖示背景輔助程序（以系統權限隱藏受保護捷徑的排程工作）啟動失敗時，會先間隔 3 秒自動重試兩次。例如剛從待機喚醒或剛登入時的暫時失敗，不再讓整段使用期間都無法隱藏公用桌面的捷徑。
- 重試仍失敗時，先以一般權限隱藏可處理的項目，受保護的捷徑暫時留在桌面上；5 分鐘後下一次同步桌面圖示時會再嘗試背景輔助程序，不需重新啟動小助手。
- 背景輔助程序的失敗原因記錄於 `%APPDATA%\METechAssistant\desktop-icons.log`，方便排查。
- 圖示錯誤訊息精簡：
  - 每個整理視窗只顯示自己收納項目的錯誤，不再在所有視窗重複整份清單。
  - 同樣原因的項目合併為一行，例如「4 個項目（Microsoft Edge、WinSCP、TeamViewer 等）：受權限保護，暫時無法從桌面隱藏」。
  - 移除容易誤解的「請確認 Windows 的圖示隱藏程序管理員提示」字樣。
  - 狀態文字最多顯示兩行，將滑鼠停在訊息上可查看完整內容；問題排除後自動消失。

## 更新

- 已安裝 Ver.1.7.4 或更早版本的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。
- 從 Ver.1.7.4 更新時，小助手會先顯示「檢測到 Ver.1.7.5 版本，即將進行自動更新」。
- 開啟「智慧型應用程式控制」的電腦會封鎖未簽章的新版本，請參考 `INSTALL.md`。

## 驗證

- 單元測試全部通過，新增背景輔助程序重試、失敗後改用一般權限並記錄、5 分鐘後改回背景輔助程序，以及各整理視窗錯誤摘要的測試。
- Electron 測試涵蓋長錯誤清單只佔兩行、完整內容保留於提示、問題排除後清除，以及整理視窗的顯示、右鍵選單、標題列、排列與失效項目處理。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- If the desktop icon background helper (the scheduled task that hides protected shortcuts) fails to start, for example right after waking from standby or signing in, it is retried twice, three seconds apart. If it still fails, items that ordinary permissions can handle are hidden, protected shortcuts stay on the desktop for now, and the helper is tried again on the next icon sync after five minutes, without restarting the assistant. Failures are logged to `%APPDATA%\METechAssistant\desktop-icons.log`.
- Icon errors are summarized: each organizer lists only its own items, merged into one line per reason, without the misleading wording about an administrator prompt. The status shows at most two lines; hover for the full text. It clears once resolved.
- Users of 1.7.4 or earlier receive this update through signature-verified automatic updates (one Windows administrator confirmation); 1.7.4 announces the new version first. PCs with Smart App Control on block unsigned new versions; see INSTALL.md.
- Verification: unit tests and the related Electron tests pass. The executable is still not Authenticode-signed.
