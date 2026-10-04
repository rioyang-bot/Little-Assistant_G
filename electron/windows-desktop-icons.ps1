param([Parameter(Mandatory=$true)][string]$JournalPath, [Parameter(Mandatory=$true)][int]$OwnerPid, [Parameter(Mandatory=$true)][string]$DesktopDirectory, [switch]$LaunchWorker, [switch]$ElevateWorker, [switch]$PipeWorker, [string]$PipeName, [string]$PipeToken)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Reflection;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

[StructLayout(LayoutKind.Sequential)] struct OrganizerIconPoint { public int x, y; }
[StructLayout(LayoutKind.Explicit, Size=272)] struct OrganizerIconName { [FieldOffset(0)] public uint type; [FieldOffset(8)] public IntPtr value; }
[ComImport, Guid("6d5140c1-7436-11ce-8034-00aa006009fa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface OrganizerIconProvider { [PreserveSig] int QueryService(ref Guid service, ref Guid iid, out OrganizerIconBrowser browser); }
[ComImport, Guid("000214e2-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface OrganizerIconBrowser {
  void GetWindow(); void ContextSensitiveHelp(); void InsertMenus(); void SetMenu(); void RemoveMenus();
  void SetStatusText(); void EnableModeless(); void TranslateAccelerator(); void BrowseObject();
  void GetViewStateStream(); void GetControlWindow(); void SendControlMessage();
  [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object view);
}
[ComImport, Guid("cde725b0-ccc9-4519-917e-325d72fab4ce"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface OrganizerIconView {
  void GetCurrentViewMode(); void SetCurrentViewMode();
  [PreserveSig] int GetFolder(ref Guid iid, out OrganizerIconFolder folder);
  [PreserveSig] int Item(int index, out IntPtr item);
  [PreserveSig] int ItemCount(uint flags, out int count);
  void Items(); void GetSelectionMarkedItem(); void GetFocusedItem();
  [PreserveSig] int GetItemPosition(IntPtr item, out OrganizerIconPoint point);
  void GetSpacing(); void GetDefaultSpacing();
  [PreserveSig] int GetAutoArrange();
  void SelectItem();
  [PreserveSig] int SelectAndPositionItems(uint count,
    [In, MarshalAs(UnmanagedType.LPArray, SizeParamIndex=0)] IntPtr[] items,
    [In, MarshalAs(UnmanagedType.LPArray, SizeParamIndex=0)] OrganizerIconPoint[] points, uint flags);
}
[ComImport, Guid("000214e6-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface OrganizerIconFolder {
  void ParseDisplayName(); void EnumObjects(); void BindToObject(); void BindToStorage(); void CompareIDs();
  void CreateViewObject(); void GetAttributesOf(); void GetUIObjectOf();
  [PreserveSig] int GetDisplayNameOf(IntPtr item, uint flags, out OrganizerIconName name);
}
class OrganizerDesktopView : IDisposable {
  [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)] static extern int StrRetToBuf(ref OrganizerIconName name, IntPtr item, StringBuilder text, uint size);
  object windows, dispatch, shellView;
  OrganizerIconBrowser browser; OrganizerIconFolder folder;
  public OrganizerIconView view;
  public OrganizerDesktopView() {
    try {
      windows = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
      object[] args = { 0, null, 8, 0, 1 };
      dispatch = windows.GetType().InvokeMember("FindWindowSW", BindingFlags.InvokeMethod, null, windows, args);
      Guid service = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(OrganizerIconBrowser).GUID;
      Marshal.ThrowExceptionForHR(((OrganizerIconProvider)dispatch).QueryService(ref service, ref iid, out browser));
      Marshal.ThrowExceptionForHR(browser.QueryActiveShellView(out shellView)); view = (OrganizerIconView)shellView;
      iid = typeof(OrganizerIconFolder).GUID; Marshal.ThrowExceptionForHR(view.GetFolder(ref iid, out folder));
    } catch { Dispose(); throw; }
  }
  public IntPtr Find(string file) {
    int count; Marshal.ThrowExceptionForHR(view.ItemCount(2, out count));
    for (int index = 0; index < count; index++) {
      IntPtr item; if (view.Item(index, out item) < 0) continue;
      try {
        OrganizerIconName name; if (folder.GetDisplayNameOf(item, 0x8000, out name) < 0) continue;
        var text = new StringBuilder(32768); Marshal.ThrowExceptionForHR(StrRetToBuf(ref name, item, text, (uint)text.Capacity));
        if (string.Equals(text.ToString(), file, StringComparison.OrdinalIgnoreCase)) { IntPtr found = item; item = IntPtr.Zero; return found; }
      } finally { if (item != IntPtr.Zero) Marshal.FreeCoTaskMem(item); }
    }
    return IntPtr.Zero;
  }
  public void Move(IntPtr item, int x, int y) {
    Marshal.ThrowExceptionForHR(view.SelectAndPositionItems(1, new IntPtr[] { item }, new OrganizerIconPoint[] { new OrganizerIconPoint { x = x, y = y } }, 0x80));
  }
  public void Dispose() {
    if (folder != null) Marshal.ReleaseComObject(folder); if (shellView != null) Marshal.ReleaseComObject(shellView);
    if (browser != null) Marshal.ReleaseComObject(browser); if (dispatch != null) Marshal.ReleaseComObject(dispatch);
    if (windows != null) Marshal.ReleaseComObject(windows);
    folder = null; shellView = null; browser = null; dispatch = null; windows = null;
  }
}
public class OrganizerIconRecord {
  public string path, identity;
  public uint added;
  public bool viewOnly;
  public int x, y;
  [ScriptIgnore] public IntPtr handle;
}
public static class OrganizerDesktopIcons {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFileAttributes(string path);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool SetFileAttributes(string path, uint attrs);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool GetFileInformationByHandle(IntPtr handle, out FileInfo info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandle(IntPtr handle, StringBuilder path, uint size, uint flags);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern void SHChangeNotify(uint change, uint flags, string path, IntPtr other);
  [StructLayout(LayoutKind.Sequential)] struct FileInfo {
    public uint attrs;
    public System.Runtime.InteropServices.ComTypes.FILETIME created, accessed, written;
    public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow;
  }
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static readonly Dictionary<string, OrganizerIconRecord> Records = new Dictionary<string, OrganizerIconRecord>(StringComparer.OrdinalIgnoreCase);
  static string Journal, Desktop, CommonDesktop;
  static bool NeedsElevation;
  static TextReader ProtocolInput;
  static TextWriter ProtocolOutput = Console.Out;
  static string Key(string path) { return Path.GetFullPath(path).TrimEnd('\\'); }
  static bool OnDesktop(string path) {
    string parent = Path.GetDirectoryName(Key(path));
    return string.Equals(parent, Desktop, StringComparison.OrdinalIgnoreCase) || string.Equals(parent, CommonDesktop, StringComparison.OrdinalIgnoreCase);
  }
  static string Identity(IntPtr handle) {
    FileInfo info; if (!GetFileInformationByHandle(handle, out info)) throw new IOException("無法辨識桌面檔案。");
    return info.volume + ":" + info.indexHigh + ":" + info.indexLow;
  }
  static IntPtr Open(string file) {
    IntPtr handle = CreateFile(file, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
    if (handle == new IntPtr(-1)) throw new IOException("無法存取桌面檔案。");
    return handle;
  }
  static void Trace(string text) {
    if (Environment.GetEnvironmentVariable("METECH_ICON_DEBUG") == "1") File.AppendAllText(Journal + ".debug", text + Environment.NewLine);
  }
  static void Save() {
    Directory.CreateDirectory(Path.GetDirectoryName(Journal));
    string temporary = Journal + ".tmp";
    File.WriteAllText(temporary, Json.Serialize(new List<OrganizerIconRecord>(Records.Values)), new UTF8Encoding(false));
    if (File.Exists(Journal)) File.Replace(temporary, Journal, null); else File.Move(temporary, Journal);
  }
  static void Change(string file, uint attrs) {
    if (attrs == 0) attrs = 128;
    if (!SetFileAttributes(file, attrs)) {
      int error = Marshal.GetLastWin32Error();
      if (error == 5 || error == 1314) NeedsElevation = true;
      throw new IOException(NeedsElevation ? "此桌面項目受到權限保護，請確認 Windows 的圖示隱藏程序管理員提示。" : "無法變更桌面圖示屬性（" + error + "）。");
    }
    SHChangeNotify(0x800, 0x2005, file, IntPtr.Zero);
    SHChangeNotify(0x1000, 0x2005, Path.GetDirectoryName(file), IntPtr.Zero);
  }
  static void Restore(OrganizerIconRecord record) {
    string file = record.path; IntPtr handle = record.handle; bool temporary = handle == IntPtr.Zero;
    if ((GetFileAttributes(file) & 0x400) != 0 && GetFileAttributes(file) != uint.MaxValue) throw new IOException("無法還原重新導向其他位置的桌面項目。");
    if (temporary) { if (!File.Exists(file) && !Directory.Exists(file)) return; handle = Open(file); }
    try {
      if (Identity(handle) != record.identity) return;
      var name = new StringBuilder(32768); uint length = GetFinalPathNameByHandle(handle, name, (uint)name.Capacity, 0);
      if (length > 0 && length < name.Capacity) {
        file = name.ToString();
        if (file.StartsWith("\\\\?\\UNC\\")) file = "\\\\" + file.Substring(8);
        else if (file.StartsWith("\\\\?\\")) file = file.Substring(4);
      }
      uint attrs = GetFileAttributes(file); if (attrs == uint.MaxValue) return;
      if (record.viewOnly) {
        using (var desktopView = new OrganizerDesktopView()) {
          IntPtr item = desktopView.Find(file);
          if (item != IntPtr.Zero) try { desktopView.Move(item, record.x, record.y); } finally { Marshal.FreeCoTaskMem(item); }
        }
      } else if ((attrs & record.added) != 0) Change(file, attrs & ~record.added);
    } finally { if (temporary) CloseHandle(handle); }
  }
  static void Forget(string key) {
    var record = Records[key]; if (record.handle != IntPtr.Zero) CloseHandle(record.handle);
    Records.Remove(key); Save();
  }
  static void Hide(string file) {
    string key = Key(file);
    if (!OnDesktop(key) || Records.ContainsKey(key) || (!File.Exists(key) && !Directory.Exists(key))) return;
    // The privileged worker is limited to desktop entries, not arbitrary
    // targets reached through user-created junctions or symbolic links.
    if ((GetFileAttributes(key) & 0x400) != 0) throw new IOException("無法隱藏重新導向其他位置的桌面項目。");
    IntPtr handle = Open(key); OrganizerIconRecord record;
    try { record = new OrganizerIconRecord { path = key, handle = handle, identity = Identity(handle) }; }
    catch { CloseHandle(handle); throw; }
    uint attrs = GetFileAttributes(key);
    if (attrs == uint.MaxValue) { CloseHandle(handle); throw new IOException("無法讀取桌面檔案屬性。"); }
    record.added = 6 & ~attrs;
    if (record.added == 0) { CloseHandle(handle); return; }
    Records.Add(key, record);
    try {
      Save();
      // Explorer clamps out-of-bounds icon positions back onto the desktop.
      // A protected item must report its permissions error, not pretend that
      // moving its icon to the screen edge successfully hid it.
      Change(key, (attrs & ~128u) | 6);
    } catch { Restore(record); Forget(key); throw; }
  }
  static List<string> Sync(IEnumerable<string> desired) {
    var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (string file in desired) wanted.Add(Key(file));
    var errors = new List<string>();
    foreach (string key in new List<string>(Records.Keys)) if (!wanted.Contains(key)) {
      try { Restore(Records[key]); Forget(key); } catch (Exception error) { errors.Add(Path.GetFileName(key) + "：" + error.Message); }
    }
    foreach (string file in wanted) try { Hide(file); } catch (Exception error) { errors.Add(Path.GetFileName(file) + "：" + error.Message); }
    return errors;
  }
  static void Reply(object value) { ProtocolOutput.WriteLine(Json.Serialize(value)); ProtocolOutput.Flush(); }
  public static void LaunchElevated(string script, string journal, int ownerPid, string desktop, bool elevate) {
    string pipeName = "METech-desktop-icons-" + Guid.NewGuid().ToString("N"), token = Guid.NewGuid().ToString("N");
    var security = new PipeSecurity(); security.SetAccessRuleProtection(true, false);
    security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
    security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), PipeAccessRights.FullControl, AccessControlType.Allow));
    using (var pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, security)) {
      var start = new ProcessStartInfo();
      start.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
      start.Arguments = "-NoProfile -NonInteractive -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + script + "\" -JournalPath \"" + journal + "\" -OwnerPid " + ownerPid + " -DesktopDirectory \"" + desktop.TrimEnd('\\') + "\" -PipeName " + pipeName + " -PipeToken " + token;
      start.UseShellExecute = true; start.WindowStyle = ProcessWindowStyle.Hidden;
      if (elevate) { start.Verb = "runas"; Reply(new { waitingForElevation = true }); }
      using (var child = Process.Start(start)) {
        var connection = pipe.WaitForConnectionAsync();
        if (!connection.Wait(30000)) throw new IOException("桌面圖示程序未連線。");
        using (var input = new StreamReader(pipe, new UTF8Encoding(false), true, 4096, true))
        using (var commands = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true)) {
          commands.AutoFlush = true;
          var handshake = input.ReadLineAsync();
          if (!handshake.Wait(10000) || handshake.Result != token) throw new IOException("桌面圖示程序連線驗證失敗。");
          Task.Factory.StartNew(() => {
            try {
              var source = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true); string line;
              while ((line = source.ReadLine()) != null) commands.WriteLine(line);
              commands.WriteLine("{\"id\":\"shutdown\",\"command\":\"shutdown\"}");
            } catch { }
          });
          // The normal relay owns the pipe, while the worker alone is elevated.
          // A killed relay closes the pipe and the worker restores its flags.
          string response;
          while ((response = input.ReadLine()) != null) { Console.WriteLine(response); Console.Out.Flush(); }
        }
        child.WaitForExit();
        if (child.ExitCode != 0) throw new IOException("桌面圖示管理員程序已停止。");
      }
    }
  }
  public static void RunPipe(string journal, int ownerPid, string desktop, string pipeName, string token) {
    using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous)) {
      pipe.Connect(30000);
      using (var input = new StreamReader(pipe, new UTF8Encoding(false), true, 4096, true))
      using (var output = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true)) {
        output.AutoFlush = true; output.WriteLine(token);
        ProtocolInput = input; ProtocolOutput = output;
        Run(journal, ownerPid, desktop);
      }
    }
  }
  public static void Launch(string script, string journal, int ownerPid, string desktop) {
    // .NET launches the worker outside libuv's kill-on-owner-exit child job.
    var start = new ProcessStartInfo();
    start.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
    start.Arguments = "-NoProfile -NonInteractive -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + script + "\" -JournalPath \"" + journal + "\" -OwnerPid " + ownerPid + " -DesktopDirectory \"" + desktop.TrimEnd('\\') + "\"";
    start.UseShellExecute = false; start.CreateNoWindow = true; start.WindowStyle = ProcessWindowStyle.Hidden;
    start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
    start.StandardOutputEncoding = new UTF8Encoding(false); start.StandardErrorEncoding = new UTF8Encoding(false);
    var child = Process.Start(start);
    var commands = new StreamWriter(child.StandardInput.BaseStream, new UTF8Encoding(false)); commands.AutoFlush = true;
    Task.Factory.StartNew(() => {
      try { var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true); string line;
        while ((line = input.ReadLine()) != null) commands.WriteLine(line);
      } catch { } finally { try { commands.Close(); } catch { } }
    });
    var output = Task.Factory.StartNew(() => { string line; while ((line = child.StandardOutput.ReadLine()) != null) { Console.WriteLine(line); Console.Out.Flush(); } });
    var errors = Task.Factory.StartNew(() => { string line; while ((line = child.StandardError.ReadLine()) != null) Console.Error.WriteLine(line); });
    child.WaitForExit(); output.Wait(); errors.Wait();
    if (child.ExitCode != 0) throw new IOException("桌面圖示復原程序已停止。"); child.Dispose();
  }
  public static void Run(string journal, int ownerPid, string desktop) {
    Journal = journal; Desktop = Key(desktop); CommonDesktop = Key(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory));
    var owner = Process.GetProcessById(ownerPid); Trace("Owner " + ownerPid + " helper " + Process.GetCurrentProcess().Id);
    if (File.Exists(Journal)) {
      foreach (var record in Json.Deserialize<List<OrganizerIconRecord>>(File.ReadAllText(Journal))) {
        if (!OnDesktop(record.path) || (record.added & ~6u) != 0) throw new IOException("桌面圖示復原記錄無效。");
        Records[Key(record.path)] = record;
      }
      var recovery = Sync(new string[0]); if (recovery.Count != 0) {
        Reply(new { ready = false, requiresElevation = NeedsElevation, error = string.Join(" ", recovery) });
        throw new IOException(string.Join(" ", recovery));
      }
    }
    var input = ProtocolInput ?? new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true);
    Task<string> line = Task.Factory.StartNew(() => input.ReadLine());
    Reply(new { ready = true, workerPid = Process.GetCurrentProcess().Id, elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator) });
    try {
      while (!owner.HasExited) {
        if (!line.Wait(200)) continue;
        string text = line.Result; if (text == null) break;
        var request = Json.Deserialize<Dictionary<string, object>>(text); string id = Convert.ToString(request["id"]);
        if (Convert.ToString(request["command"]) == "shutdown") break;
        NeedsElevation = false;
        try {
          var errors = new List<string>(); string command = Convert.ToString(request["command"]);
          if (command == "sync") {
            var paths = new List<string>(); foreach (object item in (System.Collections.IEnumerable)request["paths"]) paths.Add(Convert.ToString(item)); errors = Sync(paths);
          } else if (command == "reveal") {
            string key = Key(Convert.ToString(request["file"])); if (Records.ContainsKey(key)) { Restore(Records[key]); Forget(key); }
          } else throw new IOException("無效的桌面圖示操作。");
          Reply(new { id = id, errors = errors, requiresElevation = NeedsElevation });
        } catch (Exception error) { Reply(new { id = id, error = error.Message, requiresElevation = NeedsElevation }); }
        line = Task.Factory.StartNew(() => input.ReadLine());
      }
    } finally {
      Trace("Restoring " + Records.Count + " ownerExited=" + owner.HasExited);
      var errors = Sync(new string[0]); Trace("Restored; errors=" + string.Join(" ", errors));
      foreach (string error in errors) Console.Error.WriteLine(error);
      foreach (var record in Records.Values) if (record.handle != IntPtr.Zero) CloseHandle(record.handle);
    }
  }
}
'@
if ($PipeName) { [OrganizerDesktopIcons]::RunPipe($JournalPath, $OwnerPid, $DesktopDirectory, $PipeName, $PipeToken) }
elseif ($ElevateWorker) { [OrganizerDesktopIcons]::LaunchElevated($PSCommandPath, $JournalPath, $OwnerPid, $DesktopDirectory, $true) }
elseif ($PipeWorker) { [OrganizerDesktopIcons]::LaunchElevated($PSCommandPath, $JournalPath, $OwnerPid, $DesktopDirectory, $false) }
elseif ($LaunchWorker) { [OrganizerDesktopIcons]::Launch($PSCommandPath, $JournalPath, $OwnerPid, $DesktopDirectory) }
else { [OrganizerDesktopIcons]::Run($JournalPath, $OwnerPid, $DesktopDirectory) }
