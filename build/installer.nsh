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
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "com.metech.assistant"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "METechAssistant"
!macroend
