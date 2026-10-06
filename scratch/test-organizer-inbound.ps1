param([switch]$Batch)
$ErrorActionPreference = 'Stop'
$env:METECH_INBOUND_BATCH = if($Batch.IsPresent){'1'}else{'0'}
$inboundTestRoot = Join-Path ([IO.Path]::GetTempPath()) ('organizer-inbound-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($inboundTestRoot)
$env:METECH_INBOUND_ROOT = $inboundTestRoot
$env:METECH_INBOUND_ELECTRON = (Resolve-Path (Join-Path $PSScriptRoot '../node_modules/electron/dist/electron.exe')).Path
$env:METECH_INBOUND_APP = (Resolve-Path (Join-Path $PSScriptRoot 'test-organizer-inbound-app.cjs')).Path
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class OrganizerInboundTest {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rectangle rect);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
  static Dictionary<string, object> Read(string file) {
    try { using (var stream = new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)) using(var reader = new StreamReader(stream)) return Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd()); } catch(IOException) { return null; }
  }
  public static void Run() {
    Exception failure = null;
    Thread thread = new Thread(delegate() { try { RunSta(); } catch(Exception error) { failure = error; } });
    thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join(); if(failure != null) throw failure;
  }
  static void RunSta() {
    Check(!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator), "Inbound fixture must run without elevation.");
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    string root = Environment.GetEnvironmentVariable("METECH_INBOUND_ROOT"), stateFile = Path.Combine(root,"state.json");
    string file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "organizer-inbound-" + Guid.NewGuid().ToString() + ".txt");
    File.WriteAllText(file,"native incoming drag contents");
    var files=new List<string>();files.Add(file);
    if(Environment.GetEnvironmentVariable("METECH_INBOUND_BATCH")=="1") {
      for(int index=1;index<3;index++) {
        string extra=Path.Combine(Path.GetDirectoryName(file),Path.GetFileNameWithoutExtension(file)+"-"+index+".txt");
        File.WriteAllText(extra,"native incoming drag contents");files.Add(extra);
      }
    }
    File.WriteAllText(Path.Combine(root,"source-path.txt"),file);
    var originalFlags = File.GetAttributes(file);
    var child = new Process(); child.StartInfo.FileName = Environment.GetEnvironmentVariable("METECH_INBOUND_ELECTRON");
    child.StartInfo.Arguments = "\"" + Environment.GetEnvironmentVariable("METECH_INBOUND_APP") + "\" \"" + root + "\"";
    child.StartInfo.UseShellExecute=false; child.StartInfo.CreateNoWindow=true; child.StartInfo.WindowStyle=ProcessWindowStyle.Hidden;
    child.StartInfo.RedirectStandardError=true; child.StartInfo.RedirectStandardOutput=true;
    string diagnostics=""; child.ErrorDataReceived += delegate(object sender,DataReceivedEventArgs e) { if(e.Data!=null) diagnostics+=e.Data+" "; };
    var source = new Form(); source.Text="Organizer incoming drag fixture"; source.StartPosition=FormStartPosition.Manual;
    source.Bounds=new Rectangle(750,180,260,200); source.TopMost=true;
    var label = new Label(); label.Dock=DockStyle.Fill; label.Text="Drag test file into organizer"; label.TextAlign=ContentAlignment.MiddleCenter; source.Controls.Add(label);
    int stage=0,ticks=0; IntPtr target=IntPtr.Zero; Point start=Point.Empty,drop=Point.Empty,oldCursor; GetCursorPos(out oldCursor);
    Exception failure=null; int effect=-1; bool dragStarted=false;
    System.Threading.Timer timer=null; int driving=0;
    IntPtr sourceHandle=IntPtr.Zero;Point sourceStart=Point.Empty;
    label.MouseDown += delegate(object sender,MouseEventArgs e) {
      if(e.Button!=MouseButtons.Left || stage!=2) return;
      var data = new DataObject(); data.SetData(DataFormats.FileDrop,files.ToArray());
      dragStarted=true;
      Interlocked.Exchange(ref effect,(int)label.DoDragDrop(data,DragDropEffects.Link));
    };
    source.Shown += delegate { sourceHandle=source.Handle;sourceStart=label.PointToScreen(new Point(80,80));timer.Change(0,160); };
    // The driver runs outside the drag-source STA, which must remain free to
    // answer Chromium's IDataObject calls throughout the native OLE loop.
    timer=new System.Threading.Timer(delegate(object tickState) {
      if(Interlocked.Exchange(ref driving,1)!=0)return;
      SetThreadDpiAwarenessContext(new IntPtr(-4));
      try {
        if(++ticks>130 || child.HasExited) throw new Exception("Incoming drag failed at stage " + stage + ". " + diagnostics + (File.Exists(stateFile)?File.ReadAllText(stateFile):"no state"));
        var state=Read(stateFile); if(state==null) return;
        var ui=(Dictionary<string,object>)state["ui"];
        if(stage==0) {
          target=new IntPtr(Convert.ToInt64(state["handle"])); Rectangle rect; GetClientRect(target,out rect);
          double scale=rect.Width/Convert.ToDouble(ui["width"]); drop=new Point((int)(180*scale),(int)(120*scale)); ClientToScreen(target,ref drop);
          start=sourceStart; SetCursorPos(start.X,start.Y); stage=1;
        } else if(stage==1) {
          Check(GetAncestor(WindowFromPoint(start),2)==sourceHandle,"Owned source covered; no input injected.");
          stage=2; mouse_event(2,0,0,0,UIntPtr.Zero);
        } else if(stage==2) {
          if(!dragStarted)return;
          // Advance before injecting movement so any callback caused by the
          // native message loop cannot rewind the driver stage.
          stage=3; SetCursorPos(start.X+20,start.Y+10);
        }
        else if(stage==3) { stage=4; SetCursorPos(drop.X,drop.Y); }
        else if(stage==4) {
          Check(GetAncestor(WindowFromPoint(drop),2)==target,"Owned target covered; no release injected.");
          stage=5; mouse_event(4,0,0,0,UIntPtr.Zero);
        } else if(stage==5 && Interlocked.CompareExchange(ref effect,0,0)>=0 && Convert.ToInt32(ui["icons"])==files.Count) {
          Check(effect==(int)DragDropEffects.Link,"Source must receive Link, not Move or Copy.");
          var items=(IList)state["items"]; Check(items.Count==files.Count,"Incoming file missing.");
          var item=(Dictionary<string,object>)items[0]; Check(Convert.ToString(item["path"])==file,"Original path changed.");
          Check(File.ReadAllText(file)=="native incoming drag contents","File bytes changed.");
          Check((File.GetAttributes(file)&(FileAttributes.Hidden|FileAttributes.System))==(FileAttributes.Hidden|FileAttributes.System),"Collected desktop icon was not hidden.");
          for(int index=0;index<files.Count;index++) {
            Check(Convert.ToString(((Dictionary<string,object>)items[index])["path"])==files[index],"Batch original path changed.");
            Check(File.ReadAllText(files[index])=="native incoming drag contents","Batch bytes changed.");
            Check((File.GetAttributes(files[index])&(FileAttributes.Hidden|FileAttributes.System))==(FileAttributes.Hidden|FileAttributes.System),"Batch desktop icon not hidden.");
          }
          Check(!Convert.ToBoolean(state["elevated"]),"Normal desktop file should not require elevation.");
          Check(Convert.ToString(ui["status"])=="","Organizer reported a drop error.");
          Check(!Directory.Exists(Path.Combine(root,"profile","desktop-organizer-files")),"File was copied into organizer storage.");
          stage=6;timer.Change(Timeout.Infinite,Timeout.Infinite);source.BeginInvoke((Action)(()=>source.Close()));
        }
      } catch(Exception error) {
        failure=error;
        // DoDragDrop runs a nested message loop. Release the injected button
        // before closing the source, otherwise cleanup cannot leave that loop.
        mouse_event(4,0,0,0,UIntPtr.Zero);timer.Change(Timeout.Infinite,Timeout.Infinite);source.BeginInvoke((Action)(()=>source.Close()));
      }
      finally {Interlocked.Exchange(ref driving,0);}
    },null,Timeout.Infinite,160);
    try {
      child.Start(); child.BeginErrorReadLine(); child.BeginOutputReadLine(); Application.Run(source);
      if(failure!=null) throw failure; Check(stage==6,"Incoming drag incomplete.");
      File.WriteAllText(Path.Combine(root,"quit"),"quit"); Check(child.WaitForExit(5000),"Fixture did not exit.");
      for(int i=0;i<50 && File.GetAttributes(file)!=originalFlags;i++) Thread.Sleep(100);
      Check(File.GetAttributes(file)==originalFlags,"Original desktop attributes were not restored.");
      foreach(string member in files)Check(File.GetAttributes(member)==originalFlags,"Batch desktop attributes were not restored.");
      Console.WriteLine("Native file drag into normal Electron: passed. Original path and bytes retained, Link effect, icon hidden, flags restored on exit.");
    } finally {
      mouse_event(4,0,0,0,UIntPtr.Zero); SetCursorPos(oldCursor.X,oldCursor.Y); timer.Dispose(); source.Dispose();
      try { File.WriteAllText(Path.Combine(root,"quit"),"quit"); if(!child.WaitForExit(5000)) child.Kill(); } catch { }
      child.Dispose(); foreach(string member in files)if(File.Exists(member)) {File.SetAttributes(member,originalFlags);File.Delete(member);}
    }
  }
}
'@
try { [OrganizerInboundTest]::Run() }
finally {
  $resolvedInboundRoot = [IO.Path]::GetFullPath($inboundTestRoot)
  $inboundTempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($resolvedInboundRoot.StartsWith($inboundTempPrefix,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedInboundRoot).StartsWith('organizer-inbound-test-')) { Remove-Item -LiteralPath $resolvedInboundRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
