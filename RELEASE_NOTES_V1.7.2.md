# METech小助手 Ver.1.7.2 更新說明

- 更新版本：Ver.1.7.1 → Ver.1.7.2
- 內部版本：1.7.2
- 發布日期：2026-10-06
- 適用平台：Windows x64

## 桌面整理工具

- 在整理視窗空白處按右鍵，提供與桌面相似的選單：
  - 重新整理（也可按 F5）。
  - 排序方式：名稱、大小、項目類型、修改日期；資料夾排在檔案前面，依閱讀順序重新擺放。
  - 新增：資料夾、文字文件。新項目建立在桌面並收進這個整理視窗，直接進入命名。
- 右鍵選單在整理視窗鎖定時也可使用；鎖定只固定視窗位置與設定。
- 重新整理會移除原檔案已刪除或移走的項目（例如升級時移除的舊捷徑）；所在位置暫時無法連線（如未插入的隨身碟或網路磁碟）的項目以灰色標示保留。
- 找不到原檔案的項目按右鍵可直接「從整理視窗移除」，也可在視窗內拖曳移動。
- 移除項目時，不再因其他受保護捷徑的錯誤而失敗。
- 整理視窗統一為自由排列，移除設定中的「檔案排列」；原本使用對齊排列的視窗保留目前的圖示位置。長檔名在所有整理視窗最多顯示兩行，不會蓋到下一列。

## 選單

- 科技球與系統匣右鍵選單最上方的名稱旁顯示目前版本，例如「METech小助手  Ver.1.7.2」。

## 更新

- 已安裝 Ver.1.7.1 或 Ver.1.7.0 安全性修訂版的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。

## 驗證

- 單元測試全部通過；整理視窗的 Electron 測試涵蓋右鍵選單（含鎖定狀態）、排序、新增與命名、失效項目的清除／移除／拖曳、自由排列版面、長檔名、縮放與重新載入。
- 已在實際使用環境測試右鍵選單、重新整理與版本顯示。
- 原生拖放測試已移除對齊排列的變體；本次未重新執行會操作實際滑鼠與桌面的原生拖放測試。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- Right-click empty organizer space for Refresh (also F5), Sort by name, size, type or date modified (folders first, laid out in reading order), and New folder or text document (created on the desktop, collected into the board and ready to rename). The menu also works on locked boards; locking only fixes the window and its settings.
- Refresh removes entries whose file was deleted or moved; entries whose location is temporarily unavailable stay dimmed. Missing entries can be removed from the menu or dragged within the window, and removal is no longer blocked by errors about other protected shortcuts.
- Organizers always use free placement; the arrangement setting is removed and boards that used grid alignment keep their icon positions. Long names show up to two lines on every board.
- The tech-ball and tray menus show the current version next to the name.
- Users of 1.7.1 or the 1.7.0 security revision receive this update through signature-verified automatic updates (one Windows administrator confirmation).
- Verification: all unit tests and the organizer Electron tests pass; the menu, refresh and version label were tested in real use. Native drag tests that move the real mouse were not rerun. The executable is still not Authenticode-signed.
