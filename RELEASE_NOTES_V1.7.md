# METech小助手 Ver.1.7.0 更新說明

- 更新版本：Ver.1.6.0 → Ver.1.7.0
- 內部版本：1.7.0
- 發布日期：2026-10-04
- 適用平台：Windows x64
- 同版修訂：更新自動安裝／重啟流程與整理視窗復原功能，完整版本號仍為 1.7.0。

## 桌面整理工具

- 從科技球右鍵選單建立多個整理視窗，依應用程式、瀏覽器、設備文件等用途分類。
- 將檔案、資料夾與捷徑直接拖曳加入，保留原始檔名與檔案路徑；收納桌面項目時隱藏原桌面圖示。
- 支援 Ctrl 多選、Shift 範圍選取與 Ctrl+A 全選，一次拖入、移動或拖出多個項目。
- 項目可在不同整理視窗之間轉移，避免來源與目的視窗重複顯示。
- 將原本位於桌面的項目拖回桌面時恢復原圖示，避免 Windows 的來源與目的地相同提示；拖往其他資料夾則由 Windows 處理檔案移動。
- 保留 Windows 檔案、資料夾與捷徑圖示，圖片顯示縮圖；支援雙擊開啟、F2 重新命名及 Windows 檔案右鍵選單。

## 排列與外觀

- 提供「自由排列」與「對齊排列」，可手動調整圖示位置。
- 拖曳時顯示放置位置；對齊排列支援佔用格位交換及多項一起移動。
- 整理視窗可拖曳、調整大小，最小寬度可容納兩欄圖示。
- 可自訂底色、背景圖片、圖案與透明度，以及檔名文字顏色。
- 標題列底色可選「跟隨背景」或「自訂底色」，標題列文字顏色亦可獨立設定。
- 每個整理視窗的外觀與位置各自儲存，重新啟動後還原。

## 彈出設定與鎖定

- 設定改為獨立彈出視窗，調整外觀時即時預覽原整理視窗。
- 按「儲存設定」保留修改；取消或關閉設定視窗會還原未儲存的設定。
- 「固定位置與大小」改名為「鎖定」；鎖定後隱藏設定按鈕，解鎖後恢復顯示。
- 改善整理視窗、科技球選單與背景圖片選擇視窗的層級，避免重疊時反覆閃爍。
- 改善整理視窗重新顯示、最小化還原與移出螢幕後的位置恢復。
- 新增「桌面整理工具 → 復原整理視窗 → 選擇名稱」，重新建立空白或無法顯示的單一視窗，置於目前螢幕內並保留檔案原路徑、排列、外觀及鎖定設定。
- 修正桌面圖示隱藏的權限確認失敗後，所有已收納圖示都回到桌面的問題；現在重新隱藏一般項目，並顯示受保護捷徑需要 Windows 管理員確認的提示。

## 外接螢幕與位置

- 科技球選單可選擇小助手位於主螢幕或外接螢幕右下角。
- 接上、移除或改變螢幕配置時重新校正位置，配合解析度與縮放比例並避開工作列。
- 沒有外接螢幕時回到主螢幕，接回外接螢幕後依選擇重新定位。

## 安裝與自動更新

- Windows 安裝版：`METech-desktop-assistant-Setup-1.7.0.exe`。
- Windows 免安裝版：`METech-desktop-assistant-Portable-1.7.0.exe`。
- 已開啟自動更新的安裝版，在下次啟動後約 30 秒檢查並下載新版；亦可點選「檢查更新」。
- 本修正版在更新下載完成後，會在小助手、設定及 Windows 通知提示；5 秒後保存設定、自動結束並靜默安裝，完成後自動重新開啟。檔案拖曳中會等待拖曳完成。
- 已安裝原始 Ver.1.7.0 的使用者需下載本修正版覆蓋安裝一次，因舊程式不會偵測同版本更新。Ver.1.6.0 仍可經原有更新管道取得本修正版，但本次由舊程式控制安裝；完成安裝後，後續更新才使用新的自動安裝／重啟流程。
- 免安裝版請下載新版手動替換。使用者資料保留於 Windows AppData。
- 收納於整理視窗的檔案與資料夾保留在原位置，不會打包到安裝檔。

## 封裝驗證

- 單元測試與 Windows Electron 測試涵蓋更新提示、5 秒延遲、靜默安裝及強制重啟參數、設定保存、拖曳等待與重複安裝防護。
- 桌面整理的多檔拖入、移動、拖出與跨視窗轉移已使用 Windows 原生拖曳測試驗證。
- 彈出設定、鎖定、外觀保存、圖示及縮圖、最小視窗尺寸與背景圖片選擇視窗重疊測試通過。
- 核對封裝內 77 個程式、前端與資源檔案，確認包含原生 Windows 輔助程式，且未包含個人設定、文件或測試截圖。
- 安裝版與免安裝版內嵌的應用程式壓縮檔 SHA-256 相同，確認兩種封裝內容一致。
- 以封裝內的服務、Preload 與前端，在隔離資料目錄驗證整理視窗、便利貼設定重啟還原及舊版設定搬移。
- 已驗證自動更新資訊的版本號、安裝檔大小、SHA-512 與 blockmap，另提供 `SHA256SUMS-1.7.0.txt`。
- 未執行實際 Windows 關機／開機測試。
- 與前版相同，本次執行檔未使用 Authenticode 程式碼簽章。

## English

- Added desktop organizer boards with file, folder and shortcut drag-and-drop, preserving original paths and hiding collected desktop icons.
- Added multi-selection, batch dragging and cross-board transfers without duplicate entries.
- Added free placement and grid alignment with drop previews, cell swaps and two-column minimum board widths.
- Preserved Windows icons and added image thumbnails, file context menus and renaming.
- Added per-board background, opacity, filename color, title-bar background and title-text customization.
- Settings open in a separate popup with live previews, Save and Cancel; locking hides Settings until unlocked.
- Improved window ordering, file-picker overlap stability and board recovery.
- Choose the primary or external display for the assistant bottom-right position; display changes trigger repositioning above the taskbar.
- Installed builds use the existing GitHub Releases update channel. Portable builds require a manual download.
- Downloaded updates notify you before saving state, automatically installing after five seconds and relaunching; active file drags defer installation.
- This is a same-version 1.7.0 replacement. Users of the original 1.7.0 must install the replacement once; 1.6.0 can still discover it through the existing update channel. The new automatic-install flow becomes available after the replacement is installed.
