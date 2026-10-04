param([int]$TestOwnerPid, [long]$TestOwnerHandle)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class OrganizerModalDriver {
  delegate bool EnumCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumCallback callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
  static bool Above(IntPtr window, IntPtr other) {
    for(int i=0;i<10000;i++) { window=GetWindow(window,3); if(window==IntPtr.Zero)return false; if(window==other)return true; }
    return false;
  }
  public static void Run(int pid, long handle) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var owner=new IntPtr(handle); IntPtr dialog=IntPtr.Zero;
    string expectedTitle=Environment.GetEnvironmentVariable("METECH_MODAL_TEST_TITLE");
    try {
      uint ownerPid; GetWindowThreadProcessId(owner,out ownerPid);
      if(ownerPid!=pid)throw new Exception("Owned fixture process mismatch.");
      for(int attempt=0;attempt<200 && dialog==IntPtr.Zero;attempt++) {
        EnumWindows(delegate(IntPtr window,IntPtr data) {
          uint actualPid; GetWindowThreadProcessId(window,out actualPid);
          if(actualPid!=pid || GetWindow(window,4)!=owner || !IsWindowVisible(window))return true;
          var title=new StringBuilder(512); GetWindowText(window,title,title.Capacity);
          if(title.ToString()!=expectedTitle)return true;
          dialog=window; return false;
        },IntPtr.Zero);
        if(dialog==IntPtr.Zero)Thread.Sleep(100);
      }
      if(dialog==IntPtr.Zero)throw new Exception("Native fixture dialog did not appear.");
      if(IsWindowEnabled(owner))throw new Exception("File picker did not disable its organizer owner.");
      Rect bounds; GetWindowRect(owner,out bounds);
      // Only this PID/owner/title-verified fixture dialog is repositioned.
      if(!SetWindowPos(dialog,IntPtr.Zero,bounds.left+20,bounds.top+20,700,480,0x214))throw new Exception("Could not overlap fixture dialog.");
      Thread.Sleep(400);
      Console.WriteLine("{\"ready\":true}"); Console.Out.Flush();
      int lost=0;
      for(int i=0;i<18;i++) {
        if(i==6 || i==12)SetWindowPos(dialog,IntPtr.Zero,bounds.left+20+i*2,bounds.top+20+i,0,0,0x215);
        if(!Above(owner,dialog) || IsWindowEnabled(owner))lost++;
        Thread.Sleep(150);
      }
      Console.WriteLine("{\"complete\":true,\"samples\":18,\"lost\":"+lost+"}"); Console.Out.Flush();
      Console.ReadLine(); // Host stops recording before closing this fixture.
    } finally {
      if(dialog!=IntPtr.Zero)PostMessage(dialog,0x10,IntPtr.Zero,IntPtr.Zero);
    }
  }
}
'@
[OrganizerModalDriver]::Run($TestOwnerPid,$TestOwnerHandle)
