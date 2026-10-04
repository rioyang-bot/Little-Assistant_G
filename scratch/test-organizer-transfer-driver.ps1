param([int]$TestPid, [long]$SourceHandle, [long]$TargetHandle, [double]$SourceX, [double]$SourceY, [double]$SourceWidth, [switch]$SelectAll)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies 'System.dll','System.Drawing.dll' -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
public static class OrganizerTransferGesture {
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref Point p);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out Rectangle r);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  static void Check(bool valid, string message) { if (!valid) throw new Exception(message); }
  public static void Run(int pid, long sourceHandle, long targetHandle, double x, double y, double width, bool selectAll) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var source = new IntPtr(sourceHandle); var target = new IntPtr(targetHandle);
    uint actual;
    Check(GetWindowThreadProcessId(source, out actual) != 0 && actual == pid, "Source belongs to another process.");
    Check(GetWindowThreadProcessId(target, out actual) != 0 && actual == pid, "Target belongs to another process.");
    Rectangle rect; Check(GetClientRect(source, out rect), "Source unavailable.");
    double scale = rect.Width / width;
    Point press = new Point((int)(x * scale), (int)(y * scale));
    Check(ClientToScreen(source, ref press), "Source coordinates unavailable.");
    Check(GetClientRect(target, out rect), "Target unavailable.");
    Point drop = new Point(rect.Width / 2, rect.Height / 2);
    Check(ClientToScreen(target, ref drop), "Target coordinates unavailable.");
    Check(GetAncestor(WindowFromPoint(press), 2) == source, "Owned source covered; refusing mouse injection.");
    Check(GetAncestor(WindowFromPoint(drop), 2) == target, "Owned target covered; refusing mouse injection.");
    Point previous; GetCursorPos(out previous);
    bool held = false;
    try {
      SetCursorPos(press.X, press.Y); SetForegroundWindow(source);
      if (GetForegroundWindow() != source) {
        mouse_event(2,0,0,0,UIntPtr.Zero); mouse_event(4,0,0,0,UIntPtr.Zero);
      }
      Check(GetForegroundWindow() == source, "Cannot focus owned fixture.");
      if(selectAll) {
        keybd_event(0x11,0,0,UIntPtr.Zero);keybd_event(0x41,0,0,UIntPtr.Zero);keybd_event(0x41,0,2,UIntPtr.Zero);keybd_event(0x11,0,2,UIntPtr.Zero);Thread.Sleep(200);
      }
      mouse_event(2,0,0,0,UIntPtr.Zero); held = true; Thread.Sleep(150);
      SetCursorPos(press.X + 20, press.Y + 10); Thread.Sleep(1000);
      Check(GetAncestor(WindowFromPoint(drop), 2) == target, "Owned target covered during drag.");
      SetCursorPos(drop.X, drop.Y); Thread.Sleep(450);
      mouse_event(4,0,0,0,UIntPtr.Zero); held = false; Thread.Sleep(300);
    } finally {
      if (held) mouse_event(4,0,0,0,UIntPtr.Zero);
      SetCursorPos(previous.X, previous.Y);
    }
  }
}
'@
[OrganizerTransferGesture]::Run($TestPid, $SourceHandle, $TargetHandle, $SourceX, $SourceY, $SourceWidth, $SelectAll.IsPresent)
