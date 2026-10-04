$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OrganizerIcons {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct ShellFileInfo {
    public IntPtr icon;
    public int index;
    public uint attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string displayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string typeName;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfoW(string file, uint attrs, out ShellFileInfo info, uint size, uint flags);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern uint ExtractIconExW(string file, int index, out IntPtr large, out IntPtr small, uint count);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr icon);
}
'@
$large = [IntPtr]::Zero
$small = [IntPtr]::Zero
$icon = $null
$bitmap = $null
$stream = $null
try {
  if ($env:METECH_ORGANIZER_ICON_MODE -eq 'shell') {
    $info = New-Object OrganizerIcons+ShellFileInfo
    [void][OrganizerIcons]::SHGetFileInfoW($env:METECH_ORGANIZER_ICON_PATH, 0, [ref]$info, [Runtime.InteropServices.Marshal]::SizeOf($info), 0x100)
    $large = $info.icon
  } else {
    [void][OrganizerIcons]::ExtractIconExW($env:METECH_ORGANIZER_ICON_PATH, [int]$env:METECH_ORGANIZER_ICON_INDEX, [ref]$large, [ref]$small, 1)
  }
  $handle = if ($large -ne [IntPtr]::Zero) { $large } else { $small }
  if ($handle -eq [IntPtr]::Zero) { exit 0 }
  $icon = [System.Drawing.Icon]::FromHandle($handle)
  $bitmap = $icon.ToBitmap()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  if ($stream) { $stream.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
  if ($icon) { $icon.Dispose() }
  if ($large -ne [IntPtr]::Zero) { [void][OrganizerIcons]::DestroyIcon($large) }
  if ($small -ne [IntPtr]::Zero) { [void][OrganizerIcons]::DestroyIcon($small) }
}
