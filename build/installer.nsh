!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\METech-desktop-assistant"
!macroend

; Start the installed assistant whenever the current user signs in.  Keeping
; this in the installer also replaces any stale development-mode login item.
!macro customInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "com.metech.assistant"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "METechAssistant" '"$INSTDIR\METech-desktop-assistant.exe"'
  ; The optional privileged helper is registered only with explicit consent.
  ; Silent upgrades preserve its existing registration and ordinary app token.
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "是否安裝桌面圖示背景輔助程序？$\r$\n它以 SYSTEM 權限執行，僅處理桌面圖示的隱藏及還原。首次需 Windows 管理員確認，之後可免除每次詢問。$\r$\n也可以稍後從小助手右鍵選單啟用。" IDNO metech_skip_helper
    nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\electron\windows-desktop-icon-permissions.ps1" -Mode Install'
    Pop $0
    metech_skip_helper:
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ${If} ${FileExists} "$APPDATA\METechAssistant\desktop-icon-broker.json"
    ${OrIf} ${FileExists} "$APPDATA\METechAssistant\desktop-icon-permissions.json"
      nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\electron\windows-desktop-icon-permissions.ps1" -Mode Cleanup'
      Pop $0
      ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "桌面圖示權限尚未清理完成。請重新開啟小助手，還原捷徑權限並移除背景程序後，再解除安裝。"
        Abort
      ${EndIf}
    ${EndIf}
  ${EndIf}
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "com.metech.assistant"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "METechAssistant"
!macroend
