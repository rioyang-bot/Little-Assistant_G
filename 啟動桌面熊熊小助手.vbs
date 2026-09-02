Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strPath = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

electronExe = strPath & "\node_modules\electron\dist\electron.exe"
mainScript = strPath & "\electron\main.cjs"

If FSO.FileExists(electronExe) Then
    WshShell.Run """" & electronExe & """ """ & mainScript & """", 0, False
Else
    WshShell.Run "cmd /c npx electron electron/main.cjs", 0, False
End If
