$ErrorActionPreference = 'Stop'
$nativeDragTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('organizer-native-' + [guid]::NewGuid().ToString())
$env:METECH_NATIVE_DRAG_TEST_DIR = $nativeDragTestRoot
$env:METECH_NATIVE_DRAG_HELPER = (Resolve-Path (Join-Path $PSScriptRoot '../electron/windows-file-drag.ps1')).Path
[void](New-Item -ItemType Directory -Path $nativeDragTestRoot)
try {
  Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class OrganizerDragTest {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
  public static void Run() {
    Exception error = null;
    Thread ui = new Thread(delegate() { try { RunUi(); } catch (Exception failure) { error = failure; } });
    ui.SetApartmentState(ApartmentState.STA); ui.Start(); ui.Join();
    if (error != null) throw error;
  }
  static void RunUi() {
    string root = Environment.GetEnvironmentVariable("METECH_NATIVE_DRAG_TEST_DIR");
    string source = Path.Combine(root, "drag-source.txt");
    string destination = Path.Combine(root, "drag-destination.txt");
    File.WriteAllText(source, "native move contents");
    JavaScriptSerializer json = new JavaScriptSerializer();
    Process child = new Process();
    StreamWriter commands = null;
    child.StartInfo.FileName = "powershell.exe";
    child.StartInfo.Arguments = "-NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File \"" + Environment.GetEnvironmentVariable("METECH_NATIVE_DRAG_HELPER") + "\"";
    child.StartInfo.UseShellExecute = false;
    child.StartInfo.CreateNoWindow = true;
    child.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
    child.StartInfo.RedirectStandardInput = true;
    child.StartInfo.RedirectStandardOutput = true;
    child.StartInfo.RedirectStandardError = true;
    child.StartInfo.StandardOutputEncoding = new UTF8Encoding(false);
    Point oldCursor; GetCursorPos(out oldCursor);
    Exception failure = null;
    string diagnostics = "";
    child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) diagnostics += e.Data + " "; };
    Form target = new Form();
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    try {
      child.Start();
      commands = new StreamWriter(child.StandardInput.BaseStream, new UTF8Encoding(false));
      commands.AutoFlush = true;
      child.BeginErrorReadLine();
      Task<string> ready = child.StandardOutput.ReadLineAsync();
      Check(ready.Wait(15000) && ready.Result != null && ready.Result.Contains("ready"), "Native helper did not become ready.");
      target.Text = "Desktop organizer drag test";
      target.StartPosition = FormStartPosition.Manual;
      target.Bounds = new Rectangle(120, 120, 280, 160);
      target.TopMost = true; target.AllowDrop = true;
      target.DragEnter += delegate(object sender, DragEventArgs e) { e.Effect = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Move : DragDropEffects.None; };
      target.DragOver += delegate(object sender, DragEventArgs e) { e.Effect = DragDropEffects.Move; };
      bool received = false;
      target.DragDrop += delegate(object sender, DragEventArgs e) {
        try {
          string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
          Check(files.Length == 1 && files[0] == source, "Unexpected native drop payload.");
          File.Move(source, destination); received = true; e.Effect = DragDropEffects.Move;
        } catch (Exception error) { failure = error; e.Effect = DragDropEffects.None; }
      };
      int stage = 0, ticks = 0;
      Task<string> result = null;
      timer.Interval = 150;
      timer.Tick += delegate {
        try {
          if (++ticks > 70) throw new Exception("Native drag test timed out. Received=" + received + ", Response=" + (result == null ? "none" : result.Status.ToString()) + ", Diagnostics=" + diagnostics);
          Point point = target.PointToScreen(new Point(90, 65));
          if (stage == 0) {
            SetCursorPos(point.X, point.Y); mouse_event(2, 0, 0, 0, UIntPtr.Zero);
            result = child.StandardOutput.ReadLineAsync();
            commands.WriteLine(json.Serialize(new { id = "move-test", file = source })); stage++;
          } else if (stage == 1) { SetCursorPos(point.X + 30, point.Y + 15); stage++; }
          else if (stage == 2) { mouse_event(4, 0, 0, 0, UIntPtr.Zero); stage++; }
          else if (stage == 3 && !result.IsCompleted) { mouse_event(4, 0, 0, 0, UIntPtr.Zero); }
          else if (result.IsCompleted) {
            Check(failure == null, "Native drop target failed.");
            Check(received && result.Result != null && result.Result.Contains("Move"), "Native move was not delivered. Received=" + received + ", Response=" + result.Result + ", Exit=" + (child.HasExited ? child.ExitCode.ToString() : "running") + ", Diagnostics=" + diagnostics);
            Check(!File.Exists(source) && File.ReadAllText(destination) == "native move contents", "Move left a duplicate or lost contents.");
            timer.Stop(); target.Close();
          }
        } catch (Exception error) { failure = error; timer.Stop(); target.Close(); }
      };
      target.Shown += delegate { timer.Start(); };
      Application.Run(target);
      if (failure != null) throw failure;
      string canceled = Path.Combine(root, "cancel-source.txt"); File.WriteAllText(canceled, "cancel contents");
      Task<string> cancelResult = child.StandardOutput.ReadLineAsync();
      commands.WriteLine(json.Serialize(new { id = "cancel-test", file = canceled }));
      Check(cancelResult.Wait(5000) && cancelResult.Result.Contains("None") && File.Exists(canceled), "Cancel modified the source.");
      Console.WriteLine("Windows OLE Move, actual file transfer and cancellation assertions passed.");
    } finally {
      mouse_event(4, 0, 0, 0, UIntPtr.Zero); SetCursorPos(oldCursor.X, oldCursor.Y);
      timer.Dispose(); target.Dispose();
      try { if (commands != null) commands.Close(); if (!child.WaitForExit(2000)) child.Kill(); } catch { }
      child.Dispose();
    }
  }
}
'@
  [OrganizerDragTest]::Run()
} finally {
  $nativeDragResolvedRoot = [System.IO.Path]::GetFullPath($nativeDragTestRoot)
  $nativeDragTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($nativeDragResolvedRoot.StartsWith($nativeDragTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $nativeDragResolvedRoot -Leaf).StartsWith('organizer-native-')) {
    Remove-Item -LiteralPath $nativeDragResolvedRoot -Recurse -Force
  }
}
