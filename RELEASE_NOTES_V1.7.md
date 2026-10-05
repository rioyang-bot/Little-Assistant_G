# METech小助手 Ver.1.7.0 更新說明

- 更新版本：Ver.1.6.0 → Ver.1.7.0
- 內部版本：1.7.0
- 首次發布日期：2026-10-04
- 同版修訂發布日期：2026-10-05；重新封裝並更新 GitHub Release 與自動更新管道。
- 適用平台：Windows x64
- 同版修訂：新增總覽設定的「小助手設定」頁簽；保留自動安裝／重啟流程、整理視窗復原、桌面捷徑一次授權及選用背景輔助程序，完整版本號仍為 1.7.0。
- 同版安全性修訂（2026-10-05 第二次）：修正多項安全性問題，改為安裝至 Program Files，桌面整理工具開機不再要求管理員權限，並加入更新簽章驗證；完整版本號仍為 1.7.0，已安裝者需手動安裝一次。

## 安全性修訂

- 修正鬧鐘自訂音效或網址可被用來執行 PowerShell 指令的問題；自訂音效僅接受音訊檔。
- 每個視窗只能使用自己所需的內部功能；瀏覽器設定不再接受命令列程式，應用程式捷徑須由檔案選擇視窗選取。
- 郵件設定頁不再取得已儲存的密碼；變更伺服器、連接埠、帳號或加密方式時須重新輸入密碼，並檢查伺服器與連接埠格式。
- 私人 iCal 網址改為加密儲存；系統無法加密時，不再以可還原的編碼儲存密碼。
- 行事曆顏色只接受 `#RRGGBB` 格式；行事曆重新導向必須維持 https。
- 新增頁面內容安全原則（CSP），禁止前往外部網站或開啟程式內新視窗；網頁連結改由預設瀏覽器開啟。
- YouTube 鬧鐘不再於執行時下載遠端元件。
- 自動更新改為先驗證 METech 更新簽章才安裝，結束程式時不再自動安裝；此保護自下一個版本的更新開始生效。

## 安裝位置與管理員權限

- 改為安裝至 `C:\Program Files\METech-desktop-assistant`（所有使用者），安裝目錄不可變更；安裝及之後每次更新需要 Windows 管理員確認一次。
- 安裝時自動移除舊的個人安裝版本（`%LOCALAPPDATA%\Programs`），保留設定、整理視窗與背景輔助程序。
- 桌面整理工具在開機及自動同步時不再要求管理員權限；遇到受保護的捷徑時顯示提示，可安裝背景輔助程序或一次授權捷徑，完成後開機不需再確認。
- 安裝程式預設建議安裝背景輔助程序；從一般帳號可寫入的位置執行時，會拒絕需要管理員權限的設定。
- 更新時若拒絕管理員確認，小助手會以原版本自動重新開啟。

## 總覽設定與選單

- 新增「小助手設定」頁簽，集中設定顯示層級、允許拖曳、主螢幕／外接螢幕位置、重設位置、助手尺寸、便利貼尺寸、對話字體與球體自轉速度。
- 上述設定從科技球右鍵選單移入新頁簽；變更即時套用並儲存，沿用原有設定值，重新啟動後還原。
- 科技球以滑鼠滾輪調整速度時，新頁簽同步顯示目前數值，包含非預設速度。
- 移除右鍵選單中重複的「語言 / Language」及「來則線上冷知識／笑話」，語言切換與生活知識／笑話功能保留於總覽設定。
- 將「METech小助手」置於右鍵選單最上方，「桌面整理工具」移至「勿擾／專注模式」正上方；主選單僅保留名稱下方的一條分隔線。
- 新頁簽支援繁體中文、英文及較窄視窗的換行排列。

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

- 「總覽設定 → 小助手設定」可選擇小助手位於主螢幕或外接螢幕右下角。
- 接上、移除或改變螢幕配置時重新校正位置，配合解析度與縮放比例並避開工作列。
- 沒有外接螢幕時回到主螢幕，接回外接螢幕後依選擇重新定位。

## 桌面圖示權限（選用功能）

- 新增「桌面整理工具 → 桌面圖示權限」，可一次授權目前已收納的桌面捷徑修改屬性，並提供原權限還原。
- 提供選用的 SYSTEM 背景輔助程序及啟用、停用、修復與移除選項。首次安裝需 Windows 管理員確認；一般小助手繼續以一般權限執行。
- 背景工作限制處理桌面項目的 Hidden／System 屬性，加入使用者身分核對、重新導向連結及多重硬連結拒絕、路徑替換防護與退出復原。
- 一次授權也適用於同帳號的其他程式；背景工作屬高權限入口，保留選用。取消管理員設定後不會立即重複提出 UAC 要求。
- 修正 Windows PowerShell 5.1 在重複設定／修復權限或更新備份時，將空備份路徑轉成空字串而引發「Replace：不合法的路徑格式」的問題；寫入失敗時清理本次產生的暫存檔。
- 118 項單元測試、一般模式原生測試與背景工作範圍測試通過；原生寫入測試重現並驗證上述錯誤修正，連續替換檔案時保留原權限。完整 SYSTEM 執行、受保護目錄與排程的權限拒絕、一次授權／還原仍待管理員整合測試；本次重新封裝不會變更既有權限設定。
- 使用方式及權限範圍詳見同目錄的 `DESKTOP_ICON_PERMISSIONS.md`。

## 安裝與自動更新

- Windows 安裝版：`METech-desktop-assistant-Setup-1.7.0.exe`。
- 統一只提供上述安裝檔；移除免安裝版、重複中文檔名及 ZIP 封裝，後續也只產生 NSIS 安裝版。
- 已開啟自動更新的安裝版，在下次啟動後約 30 秒檢查並下載新版；亦可點選「檢查更新」。
- 本修正版在更新下載完成後，會在小助手、設定及 Windows 通知提示；5 秒後保存設定、自動結束並靜默安裝，完成後自動重新開啟。檔案拖曳中會等待拖曳完成。
- 本次以完整版本號 1.7.0 更新公開發布與自動更新檔案。已安裝任何 1.7.0 版本的使用者需手動安裝一次；低於 1.7.0 的安裝版可透過既有自動更新管道取得。之後的版本將以經簽章驗證的自動更新提供。
- 安裝目錄固定於 Program Files；舊的個人安裝版本會在安裝時自動移除，不會產生第二份安裝。
- 原免安裝版使用者請改用安裝版。使用者資料保留於 Windows AppData。
- 收納於整理視窗的檔案與資料夾保留在原位置，不會打包到安裝檔。

## 封裝驗證

- 本次新頁簽的 Windows Electron 測試驗證設定套用／保存／還原、螢幕位置重設、滾輪速度同步、語言切換、窄視窗排列、舊選單移除與設定 IPC 驗證。
- 本次原生層級測試通過小助手置底、通知置頂及返回測試；整理視窗彼此層級穩定測試在目前使用環境逾時，尚未確認原因。本次未修改層級控制器。
- 單元測試與 Windows Electron 測試涵蓋更新提示、5 秒延遲、靜默安裝及強制重啟參數、設定保存、拖曳等待與重複安裝防護。
- 桌面整理的多檔拖入、移動、拖出與跨視窗轉移已使用 Windows 原生拖曳測試驗證。
- 彈出設定、鎖定、外觀保存、圖示及縮圖、最小視窗尺寸與背景圖片選擇視窗重疊測試通過。
- 核對封裝內 80 個程式、前端與資源檔案，確認包含原生 Windows 輔助程式，且未包含個人設定、文件或測試截圖。
- 核對實際安裝檔內嵌的應用程式內容，確認與已驗證的程式、前端及資源一致。
- 以封裝內的服務、Preload 與前端，在隔離資料目錄驗證整理視窗、便利貼設定重啟還原及舊版設定搬移。
- 已驗證自動更新資訊的版本號、安裝檔大小、SHA-512 與 blockmap，另提供 `SHA256SUMS-1.7.0.txt`。
- 未執行實際 Windows 關機／開機測試。
- 與前版相同，本次執行檔未使用 Authenticode 程式碼簽章。
- 安全性修訂：159 項單元測試通過；以封裝後的程式碼在隔離資料目錄實際啟動，43 項視窗權限、內容安全原則與頁面跳轉檢查通過，包含阻擋插入的腳本及外部網站。
- 安全性修訂：核對封裝內 85 個程式、前端與資源檔與原始碼一致，未包含個人設定或簽章私鑰；更新資訊含管理員權限需求與 METech 更新簽章，並以內建公鑰驗證通過。
- 安全性修訂尚未執行：實際安裝至 Program Files 及移除舊個人安裝版、更新時拒絕管理員確認後的重新開啟、背景輔助程序的 SYSTEM 整合測試，以及會修改實際桌面的原生圖示測試。

## English

- Release revision: October 5, 2026. Full version remains 1.7.0; GitHub Release assets and the automatic-update channel are updated with this build.
- Security revision (second same-version revision, October 5, 2026): fixed PowerShell command injection through alarm sounds, restricted each window to its own IPC channels, stopped returning saved email passwords to the settings page, encrypted private iCal addresses, added a Content Security Policy and navigation guard, and stopped downloading remote yt-dlp components. Users who already installed any 1.7.0 build must install this build once manually.
- The app now installs for all users under `C:\Program Files\METech-desktop-assistant` (fixed directory); installation and each later update need one Windows administrator confirmation. An earlier per-user installation is removed automatically while settings, boards and the background helper are kept. If the update confirmation is declined, the assistant reopens on the current version.
- Desktop organizers no longer ask for administrator rights at startup; protected shortcuts show a hint to install the background helper or grant shortcuts once. The installer recommends the helper by default.
- Later updates are installed only after their METech update signature is verified; installing on exit is disabled.
- Security revision verification: 159 unit tests and 43 isolated launch checks of the packaged code (window permissions, CSP, navigation blocking) passed; the package matches the source and contains no user data or signing private key. Not yet run: a real Program Files installation over a per-user install, declining the update confirmation, SYSTEM helper integration and native tests that modify the real desktop. The executable is still not Authenticode-signed.
- Added an Assistant settings tab for display layers, dragging, primary/external monitor selection, position reset, assistant/sticky-note sizes, dialogue font size and globe speed. Existing preferences are preserved; changes apply and save immediately, and mouse-wheel speed adjustments stay synchronized.
- Removed the migrated controls and duplicate language/trivia entries from the context menu. Language and trivia controls remain in Overview Settings. The new tab supports Chinese, English and narrower window layouts.
- Put the assistant name first and Desktop organizer directly above Focus mode; the main menu retains only the separator below the assistant name.
- Added one-time desktop shortcut attribute authorization/restoration and an optional SYSTEM background helper. Full administrator integration tests remain pending; this local repack does not change existing privilege settings.
- Fixed Windows PowerShell 5.1 converting a null backup pathname to an empty string in File.Replace during repeated permission setup/repair or backup writes. Native regression tests cover repeated writes and preservation of destination permissions.

- Added desktop organizer boards with file, folder and shortcut drag-and-drop, preserving original paths and hiding collected desktop icons.
- Added multi-selection, batch dragging and cross-board transfers without duplicate entries.
- Added free placement and grid alignment with drop previews, cell swaps and two-column minimum board widths.
- Preserved Windows icons and added image thumbnails, file context menus and renaming.
- Added per-board background, opacity, filename color, title-bar background and title-text customization.
- Settings open in a separate popup with live previews, Save and Cancel; locking hides Settings until unlocked.
- Improved window ordering, file-picker overlap stability and board recovery.
- Choose the primary or external display for the assistant bottom-right position; display changes trigger repositioning above the taskbar.
- Only the NSIS installer is distributed and built going forward; portable executables, duplicate Chinese filenames and ZIP packages are removed. Existing portable users should switch to the installer. Installed builds use the existing GitHub Releases update channel.
- Downloaded updates notify you before saving state, automatically installing after five seconds and relaunching; active file drags defer installation.
- Existing 1.7.0 installations require one manual installation of this build, which installs into Program Files and removes an earlier per-user copy; installed versions below 1.7.0 can obtain this build through the automatic-update channel.
