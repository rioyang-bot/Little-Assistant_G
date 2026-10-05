param([Parameter(Mandatory=$true)][string]$WindowsJson)
# Presses Win+D (Windows "Show desktop") and records which window is visible at each
# test window's centre. The desktop is always toggled back, and as a final
# safety net it is restored again if app windows are still hidden under it.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ShowDesktopProbe {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // A real Win+D makes the desktop the foreground window, unlike Shell.ToggleDesktop.
  public static void PressWinD() {
    keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(0x44, 0, 0, UIntPtr.Zero);
    keybd_event(0x44, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }
  public static long TopAt(long handle) {
    RECT r; GetWindowRect(new IntPtr(handle), out r);
    var p = new POINT { X = (r.L + r.R) / 2, Y = (r.T + r.B) / 2 };
    return GetAncestor(WindowFromPoint(p), 2).ToInt64();
  }
  public static long Desktop() { return FindWindow("Progman", null).ToInt64(); }
  public static int AppWindowsBelowDesktop() {
    IntPtr progman = FindWindow("Progman", null); bool below = false; int count = 0;
    for (IntPtr h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero; h = GetWindow(h, 2)) {
      if (h == progman) { below = true; continue; }
      if (!below || !IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) continue;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x88) != 0) continue;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) continue;
      count++;
    }
    return count;
  }
}
'@
$windows = Get-Content -LiteralPath $WindowsJson -Raw | ConvertFrom-Json
function Sample($phase) { foreach ($w in $windows) { [pscustomobject]@{ phase=$phase; name=$w.name; hwnd=[string]$w.hwnd; top=[string][ShowDesktopProbe]::TopAt([long]$w.hwnd) } } }
$shell = New-Object -ComObject Shell.Application
$rows = @(Sample 'before')
try {
  [ShowDesktopProbe]::PressWinD()
  foreach ($i in 1..4) { Start-Sleep -Milliseconds 700; $rows += Sample 'show-desktop' }
} finally {
  [ShowDesktopProbe]::PressWinD()
  Start-Sleep -Milliseconds 1200
  if ([ShowDesktopProbe]::AppWindowsBelowDesktop() -gt 0) { $shell.ToggleDesktop(); Start-Sleep -Milliseconds 1200 }
}
$rows += Sample 'restored'
[pscustomobject]@{ desktop=[string][ShowDesktopProbe]::Desktop(); rows=$rows } | ConvertTo-Json -Depth 4 -Compress
