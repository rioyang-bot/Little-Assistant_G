# METech小助手 安裝說明

適用：Windows 10／11（64 位元）

## 下載

1. 開啟 GitHub 發布頁：<https://github.com/rioyang-bot/Little-Assistant_G/releases/latest>
2. 下載 `METech-desktop-assistant-Setup-版本.exe`（例如 `METech-desktop-assistant-Setup-1.7.3.exe`）。

（選用）確認檔案完整：在下載資料夾按右鍵「在終端機中開啟」，執行下列指令，結果應與發布頁 `SHA256SUMS-版本.txt` 內的數值相同。

```powershell
Get-FileHash .\METech-desktop-assistant-Setup-1.7.3.exe -Algorithm SHA256
```

## 安裝步驟

小助手目前沒有 Windows 程式碼簽章，因此安裝時 Windows 會顯示一或兩個警告，屬正常現象。

1. 雙擊安裝檔。
2. 若出現藍色畫面「**Windows 已保護您的電腦**」：點「**其他資訊**」→「**仍要執行**」。
3. 若出現「**使用者帳戶控制**」，發行者顯示「未知」：點「**是**」。
4. 選擇安裝語言（繁體中文／English），依畫面完成安裝。
   - 安裝位置固定為 `C:\Program Files\METech-desktop-assistant`，供電腦上所有使用者使用。
5. 詢問「是否安裝桌面圖示背景輔助程序？」時，建議選「**是**」。安裝後，桌面整理工具開機時不需要再確認管理員權限；也可以之後從小助手右鍵選單啟用。
6. 安裝完成後小助手會自動開啟，並在桌面與開始功能表建立「METech小助手」捷徑。之後每次登入 Windows 會自動啟動。

## 被「智慧型應用程式控制」封鎖時

如果出現白色畫面「**智慧型應用程式控制已封鎖可能不安全的應用程式**」，而且只有「確定」按鈕，表示電腦開啟了 Windows 的「智慧型應用程式控制」。這項功能會封鎖所有沒有程式碼簽章的程式，且**無法針對單一程式設定例外**。

請關閉這項功能後再開啟小助手：

1. 開啟「**Windows 安全性**」（開始功能表搜尋「Windows 安全性」）。
2. 點「**應用程式與瀏覽器控制**」→「**智慧型應用程式控制設定**」。
3. 選擇「**關閉**」。
4. 重新開啟小助手；若尚未安裝完成，請重新執行安裝檔。

注意：

- 使用小助手期間請維持關閉。重新開啟後，下一次自動更新的新版本會再次被封鎖。
- 關閉後，Microsoft Defender 防毒與 SmartScreen 仍會持續保護電腦。
- 較新的 Windows 11（2026 年 4 月更新之後）關閉後可以再開啟；較舊的版本關閉後需重設 Windows 才能再開啟。

## 如何分辨看到的是哪一種警告

| 畫面 | 原因 | 處理方式 |
|---|---|---|
| 藍色「Windows 已保護您的電腦」，有「其他資訊」 | SmartScreen：程式沒有簽章、下載次數少 | 點「其他資訊」→「仍要執行」 |
| 使用者帳戶控制，發行者「未知」 | 安裝到 Program Files 需要管理員確認 | 點「是」 |
| 白色「智慧型應用程式控制已封鎖…」，只有「確定」 | 智慧型應用程式控制已開啟 | 依上一節關閉此功能 |

## 自動更新

- 小助手啟動約 30 秒後會檢查是否有新版本（每次啟動檢查一次），可在「總覽設定」關閉自動更新或手動「立即檢查」。
- 下載後會先驗證 METech 更新簽章，通過才安裝；檔案被竄改或來源不符時不會安裝。
- 下載完成約 5 秒後自動安裝，安裝時會出現一次「使用者帳戶控制」，請點「**是**」。安裝過程不會顯示安裝畫面，完成後小助手會自動重新開啟並顯示更新內容。
- 若在使用者帳戶控制點了「否」，不會安裝更新，小助手約 20 秒後會以原版本重新開啟。

## 常見問題：檔案總管看不到桌面上的檔案

收納進整理視窗的檔案仍保存在原位置（例如 `C:\Users\使用者\Desktop`），只是小助手執行時會將它們設為隱藏，所以檔案總管與各軟體的「開啟檔案」視窗看不到。可以：

- 從整理視窗雙擊開啟，或直接把圖示**拖曳**到網頁、Email、LINE 等需要上傳的地方。
- 在「開啟檔案」視窗直接輸入完整路徑或檔名。
- 暫時從系統匣**結束小助手**：結束後所有收納的檔案會恢復顯示，再次開啟小助手會重新收納。

## 解除安裝

Windows「設定」→「應用程式」→「已安裝的應用程式」→ 找到「METech小助手」→「解除安裝」。

收納的檔案一直保存在原本的位置；小助手結束（包括解除安裝）時會恢復顯示，不會遺失。

## English summary

- Download `METech-desktop-assistant-Setup-<version>.exe` from the [latest release](https://github.com/rioyang-bot/Little-Assistant_G/releases/latest). Optionally compare `Get-FileHash` with `SHA256SUMS-<version>.txt`.
- The installer is not Authenticode-signed. On "Windows protected your PC", choose **More info → Run anyway**; on User Account Control (unknown publisher), choose **Yes**. The app installs for all users in `C:\Program Files\METech-desktop-assistant`; installing the optional desktop icon helper is recommended.
- If "Smart App Control blocked an app that may be unsafe" appears with only an OK button, Smart App Control blocks every unsigned app and allows no per-app exception. Turn it off in **Windows Security → App & browser control → Smart App Control settings**, then start the assistant again, and keep it off while using the assistant; otherwise the next update is blocked again.
- Automatic updates are checked about 30 seconds after start, verified with the METech update signature, and installed after one User Account Control confirmation; declining restarts the current version.
- Collected desktop files stay in place but are hidden while the assistant runs, so File Explorer and Open dialogs do not list them. Open or drag them from the organizer, type the full path, or quit the assistant to show them again.
- Uninstall from **Settings → Apps → Installed apps**. Collected files stay in their original locations and become visible again when the assistant exits.
