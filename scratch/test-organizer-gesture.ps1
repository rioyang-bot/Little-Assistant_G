param([ValidateSet('free','grid','row','column')][string]$Arrangement = 'free', [switch]$Batch)
$ErrorActionPreference = 'Stop'
$env:METECH_GESTURE_ARRANGEMENT = $Arrangement
$env:METECH_GESTURE_BATCH = if($Batch.IsPresent) {'1'} else {'0'}
if($Batch.IsPresent -and $Arrangement -ne 'free'){throw 'Batch gesture uses free placement.'}
$gestureTestRoot = Join-Path ([IO.Path]::GetTempPath()) ('organizer-gesture-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($gestureTestRoot)
$env:METECH_GESTURE_ROOT = $gestureTestRoot
$env:METECH_GESTURE_ELECTRON = (Resolve-Path (Join-Path $PSScriptRoot '../node_modules/electron/dist/electron.exe')).Path
$env:METECH_GESTURE_APP = (Resolve-Path (Join-Path $PSScriptRoot 'test-organizer-gesture-app.cjs')).Path
# This integration test controls only its own Electron fixture and drop-target
# window. It does not minimize, close or manipulate the user's applications.
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ComDataObject = System.Runtime.InteropServices.ComTypes.IDataObject;

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface GestureShellItem {
  [PreserveSig] int BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out GestureShellTarget target);
}
[ComImport, Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface GestureShellTarget {
  [PreserveSig] int DragEnter([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
  [PreserveSig] int DragOver(uint keys, long point, ref uint effect);
  [PreserveSig] int DragLeave();
  [PreserveSig] int Drop([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
}
public static class OrganizerGestureTest {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string name, IntPtr context, ref Guid iid, out GestureShellItem item);
  [DllImport("ole32.dll")] static extern int RegisterDragDrop(IntPtr window, GestureShellTarget target);
  [DllImport("ole32.dll")] static extern int RevokeDragDrop(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rectangle rect);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
  static void FocusOwnedWindow(IntPtr window, Point point) {
    SetCursorPos(point.X, point.Y); SetForegroundWindow(window);
    if (GetForegroundWindow() != window) {
      // Windows can reject programmatic foreground changes. Click only after
      // verifying the pointer reaches this test's own, unobscured window.
      Check(GetAncestor(WindowFromPoint(point), 2) == window, "Owned source covered; no focus click injected.");
      mouse_event(2,0,0,0,UIntPtr.Zero); mouse_event(4,0,0,0,UIntPtr.Zero);
    }
    Check(GetForegroundWindow() == window, "Cannot focus owned Electron fixture.");
  }
  static Dictionary<string, object> Read(string file) {
    try { using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) using (var reader = new StreamReader(stream)) return Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd()); } catch (IOException) { return null; }
  }
  static string ReadText(string file) {
    using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))using(var reader=new StreamReader(stream))return reader.ReadToEnd();
  }
  public static void Run() {
    Exception error = null;
    Thread thread = new Thread(delegate() { try { RunSta(); } catch (Exception failure) { error = failure; } });
    thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join(); if (error != null) throw error;
  }
  static void RunSta() {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    string root = Environment.GetEnvironmentVariable("METECH_GESTURE_ROOT");
    string stateFile = Path.Combine(root, "state.json");
    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
    string destination = null;
    var destinations = new List<string>();
    bool batch = Environment.GetEnvironmentVariable("METECH_GESTURE_BATCH") == "1";
    Process child = new Process();
    child.StartInfo.FileName = Environment.GetEnvironmentVariable("METECH_GESTURE_ELECTRON");
    child.StartInfo.Arguments = "\"" + Environment.GetEnvironmentVariable("METECH_GESTURE_APP") + "\" \"" + root + "\"";
    child.StartInfo.UseShellExecute = false; child.StartInfo.CreateNoWindow = true;
    child.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
    child.StartInfo.EnvironmentVariables["METECH_ORGANIZER_DRAG_DEBUG"] = "1";
    child.StartInfo.RedirectStandardInput = true; child.StartInfo.RedirectStandardError = true;
    child.StartInfo.RedirectStandardOutput = true;
    string diagnostics = "";
    child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) diagnostics += e.Data + " "; };
    Form target = new Form(); target.Text = "Organizer Desktop drop fixture";
    target.StartPosition = FormStartPosition.Manual; target.Bounds = new Rectangle(900, 280, 300, 210); target.TopMost = true;
    Label label = new Label(); label.Text = "Desktop Shell drop target (test files only)"; label.Dock=DockStyle.Fill; label.TextAlign=ContentAlignment.MiddleCenter; target.Controls.Add(label);
    GestureShellItem shellItem = null; GestureShellTarget shellTarget = null;
    Point oldCursor; GetCursorPos(out oldCursor);
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer(); timer.Interval = 120;
    Exception failure = null;
    IntPtr sourceWindow = IntPtr.Zero; Point sourcePoint = Point.Empty;
    double sourceScale = 1;
    int stage = 0, ticks = 0; bool registered = false;
    try {
      child.Start(); child.BeginErrorReadLine(); child.BeginOutputReadLine();
      target.Shown += delegate {
        Guid iid = typeof(GestureShellItem).GUID;
        Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(desktop, IntPtr.Zero, ref iid, out shellItem));
        Guid handler = new Guid("3981e225-f559-11d3-8e3a-00c04f6837d5"); iid = typeof(GestureShellTarget).GUID;
        Marshal.ThrowExceptionForHR(shellItem.BindToHandler(IntPtr.Zero, ref handler, ref iid, out shellTarget));
        Marshal.ThrowExceptionForHR(RegisterDragDrop(target.Handle, shellTarget)); registered = true;
        timer.Start();
      };
      timer.Tick += delegate {
        try {
          if (++ticks > 100 || child.HasExited) { if (child.HasExited) child.WaitForExit(); string nativeLog = Path.Combine(root, "native-debug.txt"); string events = Path.Combine(root,"events.txt"); throw new Exception("Gesture test failed. Stage=" + stage + ", Exit=" + (child.HasExited ? child.ExitCode.ToString() : "running") + ", State=" + (File.Exists(stateFile) ? File.ReadAllText(stateFile) : "missing") + ", Native=" + (File.Exists(nativeLog) ? File.ReadAllText(nativeLog) : "missing") + ", Events=" + (File.Exists(events) ? File.ReadAllText(events) : "missing") + ", Diagnostics=" + diagnostics); }
          var state = Read(stateFile); if (state == null) return;
          var items = (System.Collections.IList)state["items"];
          if (stage == 0 && Convert.ToString(state["phase"]) == "ready") {
            var source = Read(Path.Combine(root, "source.json"));
            sourceWindow = new IntPtr(Convert.ToInt64(state["handle"]));
            Rectangle rect; GetClientRect(sourceWindow, out rect);
            double scale = rect.Width / Convert.ToDouble(source["width"]);
            sourceScale = scale;
            sourcePoint = new Point((int)(Convert.ToDouble(source["x"]) * scale), (int)(Convert.ToDouble(source["y"]) * scale)); ClientToScreen(sourceWindow, ref sourcePoint);
            destination = Path.Combine(desktop, Convert.ToString(source["fileName"]));
            Check(!File.Exists(destination) && !Directory.Exists(destination), "Fixture destination already exists.");
            foreach(object value in (System.Collections.IEnumerable)source["fileNames"]) {
              string targetPath=Path.Combine(desktop,Convert.ToString(value));
              Check(!File.Exists(targetPath) && !Directory.Exists(targetPath),"Batch fixture destination already exists.");destinations.Add(targetPath);
            }
            FocusOwnedWindow(sourceWindow, sourcePoint); stage++;
          } else if (stage == 1) {
            Check(GetAncestor(WindowFromPoint(sourcePoint), 2) == sourceWindow, "Owned source is covered; no click was injected.");
            if(batch){keybd_event(0x11,0,0,UIntPtr.Zero);keybd_event(0x41,0,0,UIntPtr.Zero);keybd_event(0x41,0,2,UIntPtr.Zero);keybd_event(0x11,0,2,UIntPtr.Zero);stage=10;return;}
            mouse_event(2,0,0,0,UIntPtr.Zero); stage++;
          }
          else if(stage==10){mouse_event(2,0,0,0,UIntPtr.Zero);stage=2;}
          else if (stage == 2) { SetCursorPos(sourcePoint.X + 20, sourcePoint.Y + 10); stage++; }
          else if (stage == 3) {
            if(Convert.ToString(state["phase"])!="dragging")return;
            bool aligned = Convert.ToString(state["arrangement"]) == "grid";
            Point inside = new Point((int)((aligned ? 49 : 220) * sourceScale), (int)((aligned ? 58 : 155) * sourceScale)); ClientToScreen(sourceWindow, ref inside); SetCursorPos(inside.X, inside.Y); stage++;
          } else if (stage == 4) {
            if (Convert.ToString(state["arrangement"]) == "grid") {
              var preview = Read(Path.Combine(root,"preview.json")); if(preview == null) {
                Point jiggle=new Point((int)(49*sourceScale),(int)((58+(ticks%2))*sourceScale));ClientToScreen(sourceWindow,ref jiggle);SetCursorPos(jiggle.X,jiggle.Y);return;
              }
              Check(Convert.ToInt32(preview["x"]) == 8 && Convert.ToInt32(preview["y"]) == 12 && Convert.ToBoolean(preview["visible"]), "Grid drop preview must mark the first slot.");
              Check(Convert.ToString(preview["text"]) == "\u4ea4\u63db\u4f4d\u7f6e", "Occupied drop preview must explain the exchange: " + Convert.ToString(preview["text"]));
            }
            mouse_event(4,0,0,0,UIntPtr.Zero); stage++;
          }
          else if (stage == 5 && items.Count == (batch || Convert.ToString(state["arrangement"]) == "grid" ? 3 : 1)) {
            var item = (Dictionary<string, object>)items[batch?0:items.Count-1]; var position = (Dictionary<string, object>)item["position"];
            if (Convert.ToString(state["phase"]) != "ended-None") return;
            if (Convert.ToString(state["arrangement"]) == "free" || Convert.ToString(state["arrangement"]) == "grid") {
              if(Convert.ToString(state["arrangement"]) == "grid") {
                if(Convert.ToDouble(position["x"]) != 8 || Convert.ToDouble(position["y"]) != 12) return;
                var firstPosition = (Dictionary<string,object>)((Dictionary<string,object>)items[0])["position"];
                var secondPosition = (Dictionary<string,object>)((Dictionary<string,object>)items[1])["position"];
                Check(Convert.ToDouble(firstPosition["x"]) == 184 && Convert.ToDouble(firstPosition["y"]) == 12,"Occupied folder did not exchange positions.");
                Check(Convert.ToDouble(secondPosition["x"]) == 96 && Convert.ToDouble(secondPosition["y"]) == 12,"Unrelated folder was displaced.");
              } else if (Convert.ToDouble(position["x"]) < 100) return;
            }
            else Check(Convert.ToDouble(position["x"]) == 8 && Convert.ToDouble(position["y"]) == 12, "Internal drop displaced an automatically arranged item.");
            Check(File.Exists(Convert.ToString(item["path"])) || Directory.Exists(Convert.ToString(item["path"])), "Internal placement moved or deleted the file.");
            var source = Read(Path.Combine(root, "source.json"));
            Check(Convert.ToString(item["path"]) == Path.Combine(root, Convert.ToString(source["fileName"])), "Adding or repositioning changed the original path.");
            Check(ReadText(Path.Combine(root, "events.txt")).Contains("\"effect\":\"link\""), "Organizer drop did not report Link to the source.");
            sourcePoint = new Point((int)((Convert.ToDouble(position["x"]) + 41) * sourceScale), (int)((Convert.ToDouble(position["y"]) + 35 + 23) * sourceScale)); ClientToScreen(sourceWindow, ref sourcePoint);
            FocusOwnedWindow(sourceWindow, sourcePoint);
            Check(GetAncestor(WindowFromPoint(sourcePoint), 2) == sourceWindow, "Owned source is covered; no click was injected.");
            if(batch){keybd_event(0x11,0,0,UIntPtr.Zero);keybd_event(0x41,0,0,UIntPtr.Zero);keybd_event(0x41,0,2,UIntPtr.Zero);keybd_event(0x11,0,2,UIntPtr.Zero);stage=11;return;}
            mouse_event(2,0,0,0,UIntPtr.Zero); stage++;
          } else if(stage==11){mouse_event(2,0,0,0,UIntPtr.Zero);stage=6;
          } else if (stage == 6) { SetCursorPos(sourcePoint.X + 20, sourcePoint.Y + 10); stage++; }
          else if (stage == 7) {
            // Keep the physical button held inside the source until the second
            // OLE session is ready, including creation of batch Shell data.
            if(Convert.ToString(state["phase"])!="dragging")return;
            string nativeLog=Path.Combine(root,"native-debug.txt");
            if(!File.Exists(nativeLog) || ReadText(nativeLog).Split(new string[]{"Starting OLE"},StringSplitOptions.None).Length<3)return;
            Point drop = target.PointToScreen(new Point(130, 95)); SetCursorPos(drop.X, drop.Y); stage++;
          } else if (stage == 8) { mouse_event(4,0,0,0,UIntPtr.Zero); stage++; }
          else if (stage == 9 && items.Count == (Convert.ToString(state["arrangement"]) == "grid" ? 2 : 0)) {
            string contents = Convert.ToString(state["arrangement"]) == "grid" ? Path.Combine(destination,"contents.txt") : destination;
            Check(File.Exists(contents) && File.ReadAllText(contents) == "real Electron gesture contents", "Desktop contents were not moved correctly.");
            foreach(string targetPath in destinations) {
              string member=Directory.Exists(targetPath)?Path.Combine(targetPath,"contents.txt"):targetPath;
              Check(File.Exists(member) && File.ReadAllText(member)=="real Electron gesture contents","Batch Desktop contents were not moved correctly.");
            }
            timer.Stop(); target.Close();
          }
        } catch (Exception error) { failure = error; timer.Stop(); target.Close(); }
      };
      Application.Run(target);
      if (failure != null) throw failure;
      Check(stage == 9, "Gesture was not completed.");
      Console.WriteLine("Real Electron mouse gestures (internal placement and Desktop Shell move): passed. Source removed, board item removed, bytes and filename retained. Idle layout stable with GPU enabled.");
    } finally {
      mouse_event(4,0,0,0,UIntPtr.Zero); SetCursorPos(oldCursor.X, oldCursor.Y);
      timer.Dispose(); if (registered && !target.IsDisposed) RevokeDragDrop(target.Handle);
      target.Dispose();
      if (shellTarget != null) Marshal.ReleaseComObject(shellTarget); if (shellItem != null) Marshal.ReleaseComObject(shellItem);
      try { File.WriteAllText(Path.Combine(root, "quit"), "quit"); child.StandardInput.Close(); if (!child.WaitForExit(5000)) child.Kill(); } catch { }
      child.Dispose();
      if (destination != null && File.Exists(destination)) File.Delete(destination);
      if (destination != null && Directory.Exists(destination)) {
        Check(Path.GetDirectoryName(Path.GetFullPath(destination)) == desktop && Path.GetFileName(destination) == "organizer-gesture-" + Path.GetFileName(root).Substring(Path.GetFileName(root).Length-36), "Unexpected fixture cleanup path.");
        File.Delete(Path.Combine(destination,"contents.txt")); Directory.Delete(destination,false);
      }
      foreach(string targetPath in destinations) {
        Check(Path.GetDirectoryName(Path.GetFullPath(targetPath))==desktop && Path.GetFileName(targetPath).StartsWith("organizer-gesture-"),"Unexpected batch cleanup path.");
        if(File.Exists(targetPath))File.Delete(targetPath);
        if(Directory.Exists(targetPath)){File.Delete(Path.Combine(targetPath,"contents.txt"));Directory.Delete(targetPath,false);}
      }
    }
  }
}
'@
try { [OrganizerGestureTest]::Run() }
finally {
  $resolvedGestureTestRoot = [IO.Path]::GetFullPath($gestureTestRoot)
  $gestureTempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($resolvedGestureTestRoot.StartsWith($gestureTempPrefix,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedGestureTestRoot).StartsWith('organizer-gesture-test-')) { Remove-Item -LiteralPath $resolvedGestureTestRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
