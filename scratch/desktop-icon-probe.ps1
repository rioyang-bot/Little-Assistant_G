param([string]$FilePath, [switch]$Details)
$ErrorActionPreference = 'Stop'
# Read the actual Explorer desktop view, rather than inferring icon visibility
# from attributes. Interface discovery follows Microsoft's desktop-view sample.
Add-Type -TypeDefinition @'
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
[ComImport, Guid("6d5140c1-7436-11ce-8034-00aa006009fa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IconServiceProvider { [PreserveSig] int QueryService(ref Guid service, ref Guid iid, out IconBrowser browser); }
[ComImport, Guid("000214e2-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IconBrowser {
  void GetWindow(); void ContextSensitiveHelp(); void InsertMenus(); void SetMenu(); void RemoveMenus();
  void SetStatusText(); void EnableModeless(); void TranslateAccelerator(); void BrowseObject();
  void GetViewStateStream(); void GetControlWindow(); void SendControlMessage();
  [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object view);
}
[ComImport, Guid("cde725b0-ccc9-4519-917e-325d72fab4ce"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IconFolderView {
  void GetCurrentViewMode(); void SetCurrentViewMode();
  [PreserveSig] int GetFolder(ref Guid iid, out IconFolder folder);
  [PreserveSig] int Item(int index, out IntPtr item);
  [PreserveSig] int ItemCount(uint flags, out int count);
  void Items(); void GetSelectionMarkedItem(); void GetFocusedItem();
  [PreserveSig] int GetItemPosition(IntPtr item, out IconPoint point);
}
[StructLayout(LayoutKind.Sequential)] struct IconPoint { public int x, y; }
[StructLayout(LayoutKind.Sequential)] struct IconRect { public int left, top, right, bottom; }
[StructLayout(LayoutKind.Sequential)] struct IconScroll { public uint size, mask; public int min,max; public uint page; public int position, track; }
[ComImport, Guid("000214e3-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IconWindow { [PreserveSig] int GetWindow(out IntPtr window); void ContextSensitiveHelp(); }
[StructLayout(LayoutKind.Explicit, Size=272)]
struct IconName { [FieldOffset(0)] public uint type; [FieldOffset(8)] public IntPtr value; }
[ComImport, Guid("000214e6-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IconFolder {
  void ParseDisplayName(); void EnumObjects(); void BindToObject(); void BindToStorage(); void CompareIDs();
  void CreateViewObject(); void GetAttributesOf(); void GetUIObjectOf();
  [PreserveSig] int GetDisplayNameOf(IntPtr item, uint flags, out IconName name);
}
public static class DesktopIconProbe {
  [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)] static extern int StrRetToBuf(ref IconName name, IntPtr item, StringBuilder text, uint size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int metric);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out IconRect rect);
  [DllImport("user32.dll")] static extern bool GetScrollInfo(IntPtr window, int bar, ref IconScroll scroll);
  public static bool Details;
  public static bool Visible(string path) {
    IntPtr previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
    object windows = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
    object browserDispatch = null, view = null; IconBrowser browser = null; IconFolder folder = null;
    try {
      object[] args = { 0, null, 8, 0, 1 };
      browserDispatch = windows.GetType().InvokeMember("FindWindowSW", BindingFlags.InvokeMethod, null, windows, args);
      Guid service = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(IconBrowser).GUID;
      Marshal.ThrowExceptionForHR(((IconServiceProvider)browserDispatch).QueryService(ref service, ref iid, out browser));
      Marshal.ThrowExceptionForHR(browser.QueryActiveShellView(out view));
      var items = (IconFolderView)view;
      iid = typeof(IconFolder).GUID; Marshal.ThrowExceptionForHR(items.GetFolder(ref iid, out folder));
      int count; Marshal.ThrowExceptionForHR(items.ItemCount(2, out count));
      for (int index = 0; index < count; index++) {
        IntPtr item; if (items.Item(index, out item) < 0) continue;
        try {
          IconName name; if (folder.GetDisplayNameOf(item, 0x8000, out name) < 0) continue;
          var text = new StringBuilder(32768); Marshal.ThrowExceptionForHR(StrRetToBuf(ref name, item, text, (uint)text.Capacity));
          if (string.Equals(text.ToString(), path, StringComparison.OrdinalIgnoreCase)) {
            IconPoint point; Marshal.ThrowExceptionForHR(items.GetItemPosition(item, out point));
            if (Details) {
              IntPtr hwnd; Marshal.ThrowExceptionForHR(((IconWindow)view).GetWindow(out hwnd));
              IntPtr list = FindWindowEx(hwnd, IntPtr.Zero, "SysListView32", null);
              IconRect rect; GetClientRect(list, out rect);
              var horizontal = new IconScroll { size=(uint)Marshal.SizeOf(typeof(IconScroll)), mask=0x17 };
              var vertical = horizontal; GetScrollInfo(list, 0, ref horizontal); GetScrollInfo(list, 1, ref vertical);
              Console.WriteLine("point="+point.x+","+point.y+"; client="+rect.right+","+rect.bottom+"; scroll="+horizontal.position+","+vertical.position);
            }
            return point.x < GetSystemMetrics(78) && point.y < GetSystemMetrics(79) && point.x + 256 > 0 && point.y + 256 > 0;
          }
        } finally { Marshal.FreeCoTaskMem(item); }
      }
      return false;
    } finally {
      if (folder != null) Marshal.ReleaseComObject(folder); if (view != null) Marshal.ReleaseComObject(view);
      if (browser != null) Marshal.ReleaseComObject(browser); if (browserDispatch != null) Marshal.ReleaseComObject(browserDispatch);
      Marshal.ReleaseComObject(windows);
      SetThreadDpiAwarenessContext(previousDpi);
    }
  }
}
'@
[DesktopIconProbe]::Details = $Details
[DesktopIconProbe]::Visible($FilePath)
