$ErrorActionPreference = 'Stop'
$encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $encoding
[Console]::OutputEncoding = $encoding
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Drawing;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ComDataObject = System.Runtime.InteropServices.ComTypes.IDataObject;
using System.Runtime.InteropServices.ComTypes;

public class OrganizerDragHost : Form {
  protected override void SetVisibleCore(bool value) { base.SetVisibleCore(false); }
}
[ComVisible(true), Guid("00000121-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerDropSource {
  [PreserveSig] int QueryContinueDrag([MarshalAs(UnmanagedType.Bool)] bool escape, uint keys);
  [PreserveSig] int GiveFeedback(uint effect);
}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellItem {
  [PreserveSig] int BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out OrganizerShellTarget target);
}
[ComImport, Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellTarget {
  [PreserveSig] int DragEnter([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
  [PreserveSig] int DragOver(uint keys, long point, ref uint effect);
  [PreserveSig] int DragLeave();
  [PreserveSig] int Drop([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class OrganizerMoveSource : OrganizerDropSource {
  public bool Canceled;
  public bool DesktopDropRequested;
  public string FilePath;
  public string[] Files;
  public int QueryContinueDrag(bool escape, uint keys) {
    if (escape || OrganizerNativeDrag.EscapePressed || OrganizerNativeDrag.IsClosing) { Canceled = true; return 0x40101; }
    // Chromium received the original press. The physical button remains
    // authoritative during the handoff to this STA thread.
    if (OrganizerNativeDrag.LeftPressed) return 0;
    // Stop OLE before IDropTarget.Drop: a same-desktop Shell move otherwise
    // opens its source/destination-equal dialog before DoDragDrop returns.
    if (Array.Exists(Files ?? new string[] { FilePath }, OrganizerNativeDrag.IsOriginalDesktopAtCursor)) {
      DesktopDropRequested = true;
      return 0x40101;
    }
    return 0x40100;
  }
  public int GiveFeedback(uint effect) { return 0x40102; }
}
public static class OrganizerNativeDrag {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string name, IntPtr context, ref Guid iid, out OrganizerShellItem item);
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  [DllImport("ole32.dll", PreserveSig = true)] static extern int DoDragDrop(IntPtr data, IntPtr source, uint effects, out uint effect);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr SetCapture(IntPtr window);
  [DllImport("user32.dll")] static extern bool ReleaseCapture();
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, UIntPtr keys, IntPtr position);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr window, ref Point point);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GuiThreadInfo info);
  [StructLayout(LayoutKind.Sequential)] struct GuiThreadInfo {
    public uint size, flags;
    public IntPtr active, focus, capture, menu, moveSize, caret;
    public int left, top, right, bottom;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHParseDisplayName(string name, IntPtr context, out IntPtr pidl, uint attributes, out uint found);
  [DllImport("shell32.dll")] static extern IntPtr ILFindLastID(IntPtr pidl);
  [DllImport("shell32.dll")] static extern int SHCreateDataObject(IntPtr folder, uint count, IntPtr[] children, IntPtr inner, ref Guid iid, out ComDataObject data);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
  [DllImport("ole32.dll")] static extern void ReleaseStgMedium(ref STGMEDIUM medium);

  static FORMATETC EffectFormat(string name) {
    return new FORMATETC { cfFormat = unchecked((short)RegisterClipboardFormat(name)), dwAspect = DVASPECT.DVASPECT_CONTENT, lindex = -1, tymed = TYMED.TYMED_HGLOBAL };
  }
  public static void SetEffect(ComDataObject data, string name, uint effect) {
    FORMATETC format = EffectFormat(name);
    STGMEDIUM medium = new STGMEDIUM { tymed = TYMED.TYMED_HGLOBAL, unionmember = GlobalAlloc(0x42, new UIntPtr(4)) };
    if (medium.unionmember == IntPtr.Zero) throw new OutOfMemoryException();
    try {
      IntPtr value = GlobalLock(medium.unionmember);
      if (value == IntPtr.Zero) throw new OutOfMemoryException();
      try { Marshal.WriteInt32(value, unchecked((int)effect)); } finally { GlobalUnlock(medium.unionmember); }
      data.SetData(ref format, ref medium, true);
    } catch { ReleaseStgMedium(ref medium); throw; }
  }
  public static uint? ReadEffect(ComDataObject data, string name) {
    FORMATETC format = EffectFormat(name);
    if (data.QueryGetData(ref format) != 0) return null;
    STGMEDIUM medium;
    data.GetData(ref format, out medium);
    try {
      IntPtr value = GlobalLock(medium.unionmember);
      if (value == IntPtr.Zero) return null;
      try { return unchecked((uint)Marshal.ReadInt32(value)); } finally { GlobalUnlock(medium.unionmember); }
    } finally { ReleaseStgMedium(ref medium); }
  }
  public static ComDataObject CreateFileData(string file) {
    return CreateFilesData(new string[] { file });
  }
  public static ComDataObject CreateFilesData(string[] files) {
    IntPtr folder = IntPtr.Zero;
    var items = new List<IntPtr>();
    ComDataObject data = null;
    try {
      uint found;
      string parent = Path.GetDirectoryName(files[0]);
      bool sameParent = Array.TrueForAll(files, file => string.Equals(parent, Path.GetDirectoryName(file), StringComparison.OrdinalIgnoreCase));
      if (sameParent) Marshal.ThrowExceptionForHR(SHParseDisplayName(parent, IntPtr.Zero, out folder, 0, out found));
      else { folder = Marshal.AllocCoTaskMem(2); Marshal.WriteInt16(folder, 0); }
      var children = new List<IntPtr>();
      foreach(string file in files) {
        IntPtr item;
        Marshal.ThrowExceptionForHR(SHParseDisplayName(file, IntPtr.Zero, out item, 0, out found));
        items.Add(item); children.Add(sameParent ? ILFindLastID(item) : item);
      }
      Guid iid = typeof(ComDataObject).GUID;
      // Shell IDList plus FileDrop let Explorer perform its own file-system
      // move, retaining shortcut contents and names instead of importing data.
      Marshal.ThrowExceptionForHR(SHCreateDataObject(folder, (uint)children.Count, children.ToArray(), IntPtr.Zero, ref iid, out data));
      SetEffect(data, "Preferred DropEffect", 2);
      return data;
    } catch { if (data != null) Marshal.ReleaseComObject(data); throw; }
    finally { if (folder != IntPtr.Zero) Marshal.FreeCoTaskMem(folder); foreach(IntPtr item in items) Marshal.FreeCoTaskMem(item); }
  }
  public static string CompleteTransfer(string file, ComDataObject data, int status, uint result) {
    if (status != 0x40100) return "None";
    // Optimized Shell moves may report None/Copy although the source was moved.
    if (!File.Exists(file) && !Directory.Exists(file)) return "Move";
    // A conventional move copies first. Delete only after BOTH the drop result
    // and the target's Performed DropEffect confirm a completed move.
    if (result == 2 && ReadEffect(data, "Performed DropEffect") == 2) {
      if (Directory.Exists(file)) Directory.Delete(file, true); else File.Delete(file);
      return "Move";
    }
    return "None";
  }
  static void MoveRemainingToDesktop(string[] files) {
    OrganizerShellItem item = null; OrganizerShellTarget target = null; ComDataObject data = null;
    try {
      Guid iid = typeof(OrganizerShellItem).GUID;
      Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),IntPtr.Zero,ref iid,out item));
      Guid handler = new Guid("3981e225-f559-11d3-8e3a-00c04f6837d5"); iid=typeof(OrganizerShellTarget).GUID;
      Marshal.ThrowExceptionForHR(item.BindToHandler(IntPtr.Zero,ref handler,ref iid,out target));
      data=CreateFilesData(files); Point point; GetCursorPos(out point);
      long location=((long)(uint)point.Y<<32)|(uint)point.X; uint effect=2;
      Marshal.ThrowExceptionForHR(target.DragEnter(data,0,location,ref effect));
      if(effect!=0) { effect=2; Marshal.ThrowExceptionForHR(target.Drop(data,0,location,ref effect)); }
      else target.DragLeave();
    } finally {
      if(data!=null)Marshal.ReleaseComObject(data);if(target!=null)Marshal.ReleaseComObject(target);if(item!=null)Marshal.ReleaseComObject(item);
    }
  }
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  public static bool IsOriginalDesktopAtCursor(string file) {
    if (string.IsNullOrEmpty(file)) return false;
    string parent = Path.GetDirectoryName(Path.GetFullPath(file));
    if (!string.Equals(parent, Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), StringComparison.OrdinalIgnoreCase) &&
        !string.Equals(parent, Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), StringComparison.OrdinalIgnoreCase)) return false;
    Point point; if (!GetCursorPos(out point)) return false;
    IntPtr window = WindowFromPoint(point);
    for (int index = 0; window != IntPtr.Zero && index < 20; index++, window = GetParent(window)) {
      var name = new StringBuilder(256); GetClassName(window, name, name.Capacity);
      if (name.ToString() == "SHELLDLL_DefView") return true;
    }
    return false;
  }
  static OrganizerDragHost Host;
  static volatile bool Closing;
  public static bool IsClosing { get { return Closing; } }
  public static bool LeftPressed { get { return (GetAsyncKeyState(1) & 0x8000) != 0; } }
  public static bool EscapePressed { get { return (GetAsyncKeyState(27) & 0x8000) != 0; } }
  static void Reply(string id, string effect, string error, string[] restored = null) {
    Console.WriteLine(Json.Serialize(new { id = id, effect = effect, error = error, restored = restored }));
    Console.Out.Flush();
  }
  static void Drag(Dictionary<string, object> request) {
    string id = Convert.ToString(request["id"]);
    try {
      var fileList = new List<string>();
      if (request.ContainsKey("files")) foreach(object value in (System.Collections.IEnumerable)request["files"]) fileList.Add(Convert.ToString(value));
      else fileList.Add(Convert.ToString(request["file"]));
      string[] files = fileList.ToArray();
      if (files.Length == 0 || files.Length > 300 || Array.Exists(files, file => !File.Exists(file) && !Directory.Exists(file))) { Reply(id, "None", "File does not exist."); return; }
      if (Closing || (GetAsyncKeyState(1) & 0x8000) == 0) { Reply(id, "None", ""); return; }
      uint result = 0;
      int status = 0;
      uint uiThread = GetCurrentThreadId();
      IntPtr dataPtr = IntPtr.Zero, sourcePtr = IntPtr.Zero;
      ComDataObject data = null;
      var dropSource = new OrganizerMoveSource { FilePath = files[0], Files = files };
      ManualResetEvent finished = new ManualResetEvent(false);
      Thread mouse = null;
      try {
        data = CreateFilesData(files);
        if (Environment.GetEnvironmentVariable("METECH_ORGANIZER_DRAG_DEBUG") == "1") Console.Error.WriteLine("Data ready");
        SetCapture(Host.Handle);
        dataPtr = Marshal.GetComInterfaceForObject(data, typeof(ComDataObject));
        sourcePtr = Marshal.GetComInterfaceForObject(dropSource, typeof(OrganizerDropSource));
        // Chromium owns the original mouse-down. Feed the helper's OLE queue
        // from physical button state so it also receives movement and release
        // outside its hidden window. No global input is injected and no other
        // application's input queue or foreground focus is changed.
        mouse = new Thread(delegate() {
          SetThreadDpiAwarenessContext(new IntPtr(-4));
          while (!finished.WaitOne(10)) {
            bool pressed = LeftPressed;
            uint keys = pressed ? 1u : 0u;
            if ((GetAsyncKeyState(16) & 0x8000) != 0) keys |= 4;
            if ((GetAsyncKeyState(17) & 0x8000) != 0) keys |= 8;
            GuiThreadInfo info = new GuiThreadInfo(); info.size = (uint)Marshal.SizeOf(info);
            GetGUIThreadInfo(uiThread, ref info);
            IntPtr capture = info.capture == IntPtr.Zero ? Host.Handle : info.capture;
            Point point; GetCursorPos(out point); ScreenToClient(capture, ref point);
            int packed = (point.X & 0xffff) | ((point.Y & 0xffff) << 16);
            PostMessage(capture, pressed ? 0x200u : 0x202u, new UIntPtr(keys), new IntPtr(packed));
          }
        });
        mouse.IsBackground = true; mouse.Start();
        if (Environment.GetEnvironmentVariable("METECH_ORGANIZER_DRAG_DEBUG") == "1") Console.Error.WriteLine("Starting OLE");
        // Organizer targets keep references (Link); Explorer targets may
        // still perform an explicit external Move initiated by the user.
        status = DoDragDrop(dataPtr, sourcePtr, 6, out result);
        if (Environment.GetEnvironmentVariable("METECH_ORGANIZER_DRAG_DEBUG") == "1") Console.Error.WriteLine("OLE ended " + status + " effect " + result);
        string[] restored = null;
        string effect;
        if (dropSource.DesktopDropRequested) {
          restored = Array.FindAll(files, IsOriginalDesktopAtCursor);
          string[] remaining = Array.FindAll(files, file => !Array.Exists(restored, original => string.Equals(original,file,StringComparison.OrdinalIgnoreCase)));
          if (remaining.Length > 0) MoveRemainingToDesktop(remaining);
          effect = "Desktop";
        } else if (files.Length == 1) effect = CompleteTransfer(files[0], data, status, result);
        // With a batch, only filesystem-confirmed Shell moves count. An
        // aggregate drop effect cannot authorize deleting surviving sources.
        else effect = Array.Exists(files,file=>!File.Exists(file) && !Directory.Exists(file)) ? "Move" : "None";
        Reply(id, effect, "", restored);
      } finally {
        finished.Set(); if (mouse != null) mouse.Join(); finished.Dispose();
        ReleaseCapture();
        if (dataPtr != IntPtr.Zero) Marshal.Release(dataPtr);
        if (sourcePtr != IntPtr.Zero) Marshal.Release(sourcePtr);
        if (data != null) Marshal.ReleaseComObject(data);
      }
    } catch { Reply(id, "None", "Could not start file drag."); }
  }
  public static void Run() {
    Thread ui = new Thread(delegate() { try { RunUi(); } catch { Console.Error.WriteLine("Native drag service stopped."); } });
    ui.SetApartmentState(ApartmentState.STA);
    ui.Start();
    ui.Join();
  }
  static void RunUi() {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    OleInitialize(IntPtr.Zero);
    Host = new OrganizerDragHost();
    Host.ShowInTaskbar = false;
    IntPtr handle = Host.Handle;
    Thread reader = new Thread(delegate() {
      try {
        StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true);
        string line;
        while ((line = input.ReadLine()) != null) {
          Dictionary<string, object> request = Json.Deserialize<Dictionary<string, object>>(line);
          Host.BeginInvoke(new Action(delegate() { Drag(request); }));
        }
      } catch (Exception error) { if (Environment.GetEnvironmentVariable("METECH_ORGANIZER_DRAG_DEBUG") == "1") Console.Error.WriteLine("Drag request reader failed: " + error); }
      Closing = true;
      try { Host.BeginInvoke(new Action(Application.ExitThread)); } catch { }
    });
    reader.IsBackground = true;
    reader.Start();
    Console.WriteLine("{\"ready\":true}");
    Console.Out.Flush();
    Application.Run();
    Host.Dispose();
    OleUninitialize();
  }
}
'@
[OrganizerNativeDrag]::Run()
