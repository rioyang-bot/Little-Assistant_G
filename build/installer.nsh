!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\METech-desktop-assistant"
!macroend

; Start the installed assistant whenever the current user signs in.  Keeping
; this in the installer also replaces any stale development-mode login item.
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "METechAssistant" '"$INSTDIR\METech-desktop-assistant.exe"'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "METechAssistant"
!macroend
