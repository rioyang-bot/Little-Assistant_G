# METech小助手 Ver.1.7.3 更新說明

- 更新版本：Ver.1.7.2 → Ver.1.7.3
- 內部版本：1.7.3
- 發布日期：2026-10-07
- 適用平台：Windows x64

## 切換螢幕

- 延伸、僅第二個螢幕、僅電腦螢幕等每種螢幕模式，分別記住每個整理視窗的位置、大小與視窗內的圖示排列；切回某個模式時自動還原。
- 還沒排列過的螢幕模式，會沿用使用同一個螢幕的模式的排列（例如「僅電腦螢幕」沿用「延伸」中筆電螢幕的排列）；在該模式移動視窗或圖示後，就以新的排列為準。
- 不同縮放比例的螢幕之間切換時，視窗大小不再變形；切換過程中 Windows 自行搬動的位置不會被記錄。
- 切到「僅第二個螢幕」時被 Windows 最小化的整理視窗與小助手會自動恢復顯示，不會搶走目前視窗的焦點；自行最小化的小助手維持最小化。

## 快照

- 系統匣「桌面整理工具 → 快照」：
  - 建立快照：存下所有整理視窗的位置、大小、圖示位置與顯示／隱藏狀態，自動以日期時間與螢幕模式命名。
  - 還原快照：確認後回到快照的排列；檔案本身不會移動，之後刪除的整理視窗略過，之後加入的圖示放在空位。
  - 刪除快照：確認後刪除。
- 最多保留 20 份快照，存於 `desktop-organizer-snapshots.json`。

## 整理視窗

- 鎖定的整理視窗永遠在其他視窗下層；未鎖定的整理視窗點選時移到上層。兩者在 Windows「顯示桌面」時都會保留顯示。
- 控制視窗階層的背景程序遇到錯誤不再停止，意外結束時會自動重新啟動。
- 設定新增「顯示標題列」：從不、滑鼠停留時、總是。
- 標題列上的編輯、隱藏、鎖定按鈕移除，改由空白處右鍵選單操作；選單左側以圖示顯示鎖定與隱藏狀態。
- 整理視窗設定不需解鎖即可開啟；鎖定只固定位置並保持在下層。
- 修正拖放預覽位置的 1 像素偏差。

## 系統匣選單

- 「桌面整理工具」改為：新增整理視窗、顯示整理視窗 ▸（全部顯示與各整理視窗，含狀態圖示）、快照 ▸、疑難排解 ▸（桌面圖示權限、復原整理視窗）。

## 更新

- 已安裝 Ver.1.7.2、Ver.1.7.1 或 Ver.1.7.0 安全性修訂版的使用者會透過經 METech 更新簽章驗證的自動更新取得此版本；更新時需要一次 Windows 管理員確認。

## 驗證

- 單元測試全部通過，新增螢幕模式版面、圖示位置、最小化恢復與快照的測試。
- 整理視窗 Electron 測試涵蓋最小化自動恢復、快照還原（視窗、顯示狀態與圖示位置）、標題列模式、右鍵選單圖示、鎖定時開啟設定與系統匣選單。
- 已在實際使用環境測試延伸／僅第二個螢幕／僅電腦螢幕切換、快照與新選單。
- 「視窗階層」與「整理視窗介面」兩項 Electron 測試的其中一步（整理視窗並排順序、視窗內拖曳）在測試時的桌面環境下未通過；以 Ver.1.7.2 的程式碼執行，在同一步驟結果相同。版面排列測試改為以整數座標模擬拖曳，在縮放螢幕上也能通過。本次未執行會操作實際滑鼠與桌面的原生拖放測試。
- 執行檔仍未使用 Authenticode 程式碼簽章；自動更新內容以 METech 更新簽章保護。

## English

- Each screen mode (Extend, Second screen only, PC screen only) remembers every organizer's bounds and icon positions and restores them after switching. A mode without its own arrangement uses the mode sharing the same screen; moving a window or icon there makes it that mode's own. Window sizes no longer distort between monitors with different scaling, and moves made by Windows during a switch are not recorded. Organizers and the assistant minimized by Windows in "Second screen only" are shown again without taking focus.
- Snapshots (tray → Desktop organizer → Snapshots): take, restore (with confirmation) or delete the arrangement of all organizers, including visibility. Up to 20 snapshots are kept.
- Locked organizers always stay below other windows and unlocked ones come forward when clicked; both stay visible during Show desktop. The layer helper survives errors and restarts after an unexpected exit.
- New title bar setting: never, on hover or always. Title-bar buttons move to the right-click menu, which shows lock and visibility icons. Settings open without unlocking. Drop preview no longer lands 1 px off.
- The tray's Desktop organizer menu groups Show organizer windows, Snapshots and Troubleshooting (icon permissions, recover window).
- Users of 1.7.2, 1.7.1 or the 1.7.0 security revision receive this update through signature-verified automatic updates (one Windows administrator confirmation).
- Verification: unit tests and organizer Electron tests pass; screen switching, snapshots and the menus were tested in real use. One step each of the window-layer and organizer UI Electron tests (organizer sibling ordering, in-window drag) did not pass in the desktop environment at test time and fails at the same step with the 1.7.2 code. The arrangement test now simulates drags at whole-pixel coordinates and passes on scaled displays. Native tests that move the real mouse were not run. The executable is still not Authenticode-signed.
