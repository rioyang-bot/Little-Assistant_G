param([switch]$Batch)
$ErrorActionPreference = 'Stop'
$env:METECH_RETURN_BATCH = if($Batch.IsPresent){'1'}else{'0'}
$env:METECH_RETURN_HELPER = (Resolve-Path (Join-Path $PSScriptRoot '../electron/windows-file-drag.ps1')).Path
# All mouse input targets this test's own topmost window. A native child uses
# the desktop view class so the real helper's desktop detection is exercised.
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
using ComDataObject = System.Runtime.InteropServices.ComTypes.IDataObject;

[ComVisible(true), Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ReturnDropTarget {
  [PreserveSig] int DragEnter([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
  [PreserveSig] int DragOver(uint keys, long point, ref uint effect);
  [PreserveSig] int DragLeave();
  [PreserveSig] int Drop([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class ReturnDropCounter : ReturnDropTarget {
  public int Entered, Dropped;
  public int DragEnter(ComDataObject data, uint keys, long point, ref uint effect) { Entered++; effect=2; return 0; }
  public int DragOver(uint keys, long point, ref uint effect) { effect=2; return 0; }
  public int DragLeave() { return 0; }
  // A regression can be observed safely without forwarding the erroneous
  // same-folder operation to Explorer and opening a blocking system dialog.
  public int Drop(ComDataObject data, uint keys, long point, ref uint effect) { Dropped++; effect=0; return 0; }
}
public static class DesktopReturnTest {
  delegate IntPtr WindowProcedure(IntPtr hwnd, uint message, IntPtr wp, IntPtr lp);
  static readonly WindowProcedure Procedure = DefWindowProc;
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct WindowClass {
    public uint style; public WindowProcedure procedure; public int classExtra, windowExtra;
    public IntPtr instance, icon, cursor, background;
    public string menu, name;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern ushort RegisterClass(ref WindowClass windowClass);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool UnregisterClass(string name, IntPtr instance);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr hwnd, uint message, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint extra, string name, string text, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr window);
  [DllImport("ole32.dll")] static extern int RegisterDragDrop(IntPtr window, ReturnDropTarget target);
  [DllImport("ole32.dll")] static extern int RevokeDragDrop(IntPtr window);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  static void Check(bool value, string message) { if (!value) throw new Exception(message); }
  public static void Run() {
    Exception error=null;
    Thread sta=new Thread(delegate() { try { RunSta(); } catch(Exception failure) { error=failure; } });
    sta.SetApartmentState(ApartmentState.STA); sta.Start(); sta.Join(); if(error!=null) throw error;
  }
  static void RunSta() {
    string source=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "organizer-return-test-"+Guid.NewGuid()+".txt");
    Check(!File.Exists(source), "Fixture already exists"); File.WriteAllText(source,"desktop return unchanged");
    bool batch=Environment.GetEnvironmentVariable("METECH_RETURN_BATCH")=="1";
    string temporaryRoot=Path.Combine(Path.GetTempPath(),"organizer-return-"+Guid.NewGuid());
    string[] files={source};
    if(batch) {
      Directory.CreateDirectory(temporaryRoot);
      files=new string[]{source,Path.Combine(temporaryRoot,"organizer-return-test-"+Guid.NewGuid()+".txt"),Path.Combine(temporaryRoot,"organizer-return-test-"+Guid.NewGuid()+".txt")};
      for(int index=1;index<files.Length;index++)File.WriteAllText(files[index],"batch desktop unchanged");
    }
    var json=new JavaScriptSerializer(); var child=new Process();
    child.StartInfo=new ProcessStartInfo("powershell.exe", "-NoProfile -NonInteractive -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File \""+Environment.GetEnvironmentVariable("METECH_RETURN_HELPER")+"\"");
    child.StartInfo.UseShellExecute=false; child.StartInfo.CreateNoWindow=true; child.StartInfo.WindowStyle=ProcessWindowStyle.Hidden;
    child.StartInfo.RedirectStandardInput=true; child.StartInfo.RedirectStandardOutput=true; child.StartInfo.RedirectStandardError=true;
    child.StartInfo.StandardOutputEncoding=new UTF8Encoding(false);
    var window=new Form { Text="Same-desktop return fixture", TopMost=true, StartPosition=FormStartPosition.Manual, Bounds=new Rectangle(120,120,340,210) };
    var timer=new System.Windows.Forms.Timer { Interval=160 };
    Point previous; GetCursorPos(out previous);
    IntPtr native=IntPtr.Zero, instance=Process.GetCurrentProcess().MainModule.BaseAddress;
    var target=new ReturnDropCounter(); bool registered=false, classRegistered=false; StreamWriter commands=null;
    Exception failure=null; Task<string> result=null; int ticks=0, stage=0;
    try {
      child.Start(); child.BeginErrorReadLine();
      commands=new StreamWriter(child.StandardInput.BaseStream,new UTF8Encoding(false)) { AutoFlush=true };
      Task<string> ready=child.StandardOutput.ReadLineAsync(); Check(ready.Wait(15000)&&ready.Result.Contains("ready"),"Helper unavailable");
      var cls=new WindowClass { procedure=Procedure, instance=instance, name="SHELLDLL_DefView" };
      Check(RegisterClass(ref cls)!=0,"Cannot register owned desktop-view fixture"); classRegistered=true;
      window.Shown+=delegate {
        native=CreateWindowEx(0,"SHELLDLL_DefView","owned fixture",0x50000000,0,0,300,160,window.Handle,IntPtr.Zero,instance,IntPtr.Zero);
        Check(native!=IntPtr.Zero,"Fixture creation failed"); Marshal.ThrowExceptionForHR(RegisterDragDrop(native,target)); registered=true; timer.Start();
      };
      timer.Tick+=delegate {
        try {
          Check(++ticks<70,"Return timed out at stage "+stage);
          Point point=window.PointToScreen(new Point(110,75));
          if(stage==0) {
            SetCursorPos(point.X,point.Y); Check(WindowFromPoint(point)==native,"Fixture covered; no click injected");
            mouse_event(2,0,0,0,UIntPtr.Zero); result=child.StandardOutput.ReadLineAsync();
            commands.WriteLine(batch?json.Serialize(new {id="batch-desktop-return",files=files}):json.Serialize(new { id="same-desktop-return",file=source })); stage++;
          } else if(stage==1&&target.Entered>0) { SetCursorPos(point.X+15,point.Y+10); stage++; }
          else if(stage==2) { mouse_event(4,0,0,0,UIntPtr.Zero); stage++; }
          else if(stage==3&&result.IsCompleted) {
            Check(result.Result!=null&&result.Result.Contains("\"effect\":\"Desktop\""),"Wrong result: "+result.Result);
            Check(target.Dropped==0,"OLE invoked the desktop Drop before restoring the icon");
            Check(File.Exists(source)&&File.ReadAllText(source)=="desktop return unchanged","Source changed");
            if(batch) {
              var response=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(result.Result);
              var restored=(System.Collections.IList)response["restored"];
              Check(restored.Count==1 && Convert.ToString(restored[0])==source,"Mixed batch must restore only same-desktop members.");
              for(int index=1;index<files.Length;index++) {
                string destination=Path.Combine(Path.GetDirectoryName(source),Path.GetFileName(files[index]));
                Check(!File.Exists(files[index]) && File.ReadAllText(destination)=="batch desktop unchanged","Other members were not moved to Desktop.");
              }
            }
            timer.Stop(); window.Close();
          }
        } catch(Exception error) { failure=error; timer.Stop(); window.Close(); }
      };
      Application.Run(window); if(failure!=null) throw failure;
      Check(stage==3,"Return did not complete");
      Console.WriteLine("Same-desktop native release: Desktop result; IDropTarget.Drop never invoked; source path and contents unchanged.");
    } finally {
      mouse_event(4,0,0,0,UIntPtr.Zero); SetCursorPos(previous.X,previous.Y); timer.Dispose();
      if(registered) RevokeDragDrop(native); if(native!=IntPtr.Zero) DestroyWindow(native);
      window.Dispose(); if(classRegistered) UnregisterClass("SHELLDLL_DefView",instance);
      try { if(commands!=null) commands.Close(); if(!child.WaitForExit(3000)) child.Kill(); } catch { }
      child.Dispose(); if(File.Exists(source)) File.Delete(source);
      if(batch) {
        for(int index=1;index<files.Length;index++) {
          if(File.Exists(files[index]))File.Delete(files[index]);
          string destination=Path.Combine(Path.GetDirectoryName(source),Path.GetFileName(files[index]));if(File.Exists(destination))File.Delete(destination);
        }
        if(Directory.Exists(temporaryRoot))Directory.Delete(temporaryRoot,false);
      }
    }
  }
}
'@
[DesktopReturnTest]::Run()
