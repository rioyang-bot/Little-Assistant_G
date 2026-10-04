$ErrorActionPreference = 'Stop'
$encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $encoding
[Console]::OutputEncoding = $encoding
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[ComImport, Guid("FC4801A3-2BA9-11CF-A229-00AA003D7352"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerMenuWithSite {
  [PreserveSig] int SetSite([MarshalAs(UnmanagedType.IUnknown)] object site);
  [PreserveSig] int GetSite(ref Guid iid,out IntPtr site);
}
[ComVisible(true), Guid("00000114-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerMenuWindow {
  [PreserveSig] int GetWindow(out IntPtr window);
  [PreserveSig] int ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool enter);
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class OrganizerMenuSite : OrganizerMenuWindow {
  readonly IntPtr Owner;
  public OrganizerMenuSite(IntPtr owner){Owner=owner;}
  public int GetWindow(out IntPtr window){window=Owner;return 0;}
  public int ContextSensitiveHelp(bool enter){return unchecked((int)0x80004001);}
}
[ComImport, Guid("000214E6-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellFolder {
  [PreserveSig] int ParseDisplayName(IntPtr window,IntPtr bind,IntPtr name,IntPtr eaten,IntPtr pidl,IntPtr attributes);
  [PreserveSig] int EnumObjects(IntPtr window,uint flags,IntPtr result);
  [PreserveSig] int BindToObject(IntPtr pidl,IntPtr bind,ref Guid iid,IntPtr result);
  [PreserveSig] int BindToStorage(IntPtr pidl,IntPtr bind,ref Guid iid,IntPtr result);
  [PreserveSig] int CompareIDs(IntPtr param,IntPtr first,IntPtr second);
  [PreserveSig] int CreateViewObject(IntPtr window,ref Guid iid,IntPtr result);
  [PreserveSig] int GetAttributesOf(uint count,IntPtr items,IntPtr attributes);
  [PreserveSig] int GetUIObjectOf(IntPtr window,uint count,[MarshalAs(UnmanagedType.LPArray,SizeParamIndex=1)] IntPtr[] items,ref Guid iid,IntPtr reserved,[MarshalAs(UnmanagedType.Interface)] out OrganizerShellMenu menu);
}
[ComImport, Guid("000214E4-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellMenu {
  [PreserveSig] int QueryContextMenu(IntPtr menu,uint index,uint first,uint last,uint flags);
  [PreserveSig] int InvokeCommand(ref OrganizerInvokeInfo info);
  [PreserveSig] int GetCommandString(UIntPtr id,uint flags,IntPtr reserved,[MarshalAs(UnmanagedType.LPWStr)] StringBuilder value,uint length);
}
[ComImport, Guid("000214F4-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellMenu2 {
  [PreserveSig] int QueryContextMenu(IntPtr menu,uint index,uint first,uint last,uint flags);
  [PreserveSig] int InvokeCommand(ref OrganizerInvokeInfo info);
  [PreserveSig] int GetCommandString(UIntPtr id,uint flags,IntPtr reserved,IntPtr value,uint length);
  [PreserveSig] int HandleMenuMsg(uint message,IntPtr wparam,IntPtr lparam);
}
[ComImport, Guid("BCFCE0A0-EC17-11D0-8D10-00A0C90F2719"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface OrganizerShellMenu3 {
  [PreserveSig] int QueryContextMenu(IntPtr menu,uint index,uint first,uint last,uint flags);
  [PreserveSig] int InvokeCommand(ref OrganizerInvokeInfo info);
  [PreserveSig] int GetCommandString(UIntPtr id,uint flags,IntPtr reserved,IntPtr value,uint length);
  [PreserveSig] int HandleMenuMsg(uint message,IntPtr wparam,IntPtr lparam);
  [PreserveSig] int HandleMenuMsg2(uint message,IntPtr wparam,IntPtr lparam,out IntPtr result);
}
[StructLayout(LayoutKind.Sequential)]
public struct OrganizerInvokeInfo {
  public uint size,mask; public IntPtr window,verb,parameters,directory;
  public int show; public uint hotkey; public IntPtr icon,title,verbW,parametersW,directoryW,titleW; public Point point;
}
public class OrganizerMenuHost : Form {
  public OrganizerShellMenu2 Menu2; public OrganizerShellMenu3 Menu3;
  protected override void WndProc(ref Message message) {
    if(message.Msg==0x1f)OrganizerNativeMenu.CancelMenu();
    if(message.Msg==0x117 || message.Msg==0x2b || message.Msg==0x2c || message.Msg==0x120) {
      IntPtr result;
      if(Menu3!=null && Menu3.HandleMenuMsg2((uint)message.Msg,message.WParam,message.LParam,out result)==0){message.Result=result;return;}
      if(Menu2!=null && message.Msg!=0x120 && Menu2.HandleMenuMsg((uint)message.Msg,message.WParam,message.LParam)==0){message.Result=IntPtr.Zero;return;}
    }
    base.WndProc(ref message);
  }
}
public static class OrganizerNativeMenu {
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHParseDisplayName(string name,IntPtr bind,out IntPtr pidl,uint attributes,out uint found);
  [DllImport("shell32.dll")] static extern int SHBindToParent(IntPtr pidl,ref Guid iid,out OrganizerShellFolder folder,out IntPtr child);
  [DllImport("user32.dll")] static extern IntPtr CreatePopupMenu();
  [DllImport("user32.dll")] static extern bool DestroyMenu(IntPtr menu);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr menu,int index);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool AppendMenu(IntPtr menu,uint flags,UIntPtr id,string label);
  [DllImport("user32.dll")] static extern uint TrackPopupMenuEx(IntPtr menu,uint flags,int x,int y,IntPtr owner,IntPtr options);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr window,int index,IntPtr value);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr wparam,IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EndMenu();
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static OrganizerMenuHost Host;
  static bool Busy;
  static readonly object ContinueLock=new object();
  static string WaitingId;
  static ManualResetEvent ContinueEvent;
  static bool CancelInvoke;
  public static void CancelMenu(){EndMenu();}
  static void Reply(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
  public static OrganizerShellMenu CreateMenu(string file,IntPtr owner) {
    IntPtr pidl=IntPtr.Zero;OrganizerShellFolder folder=null;
    try {
      uint found;Marshal.ThrowExceptionForHR(SHParseDisplayName(file,IntPtr.Zero,out pidl,0,out found));
      Guid iid=typeof(OrganizerShellFolder).GUID;IntPtr child;
      Marshal.ThrowExceptionForHR(SHBindToParent(pidl,ref iid,out folder,out child));
      iid=typeof(OrganizerShellMenu).GUID;OrganizerShellMenu menu;
      Marshal.ThrowExceptionForHR(folder.GetUIObjectOf(owner,1,new[]{child},ref iid,IntPtr.Zero,out menu));
      return menu;
    } finally {if(folder!=null)Marshal.ReleaseComObject(folder);if(pidl!=IntPtr.Zero)Marshal.FreeCoTaskMem(pidl);}
  }
  static void Show(Dictionary<string,object> request) {
    string id=Convert.ToString(request["id"]);
    if(Busy){Reply(new{id,error="Another menu is open."});return;}
    Busy=true;OrganizerShellMenu shell=null;OrganizerMenuWithSite withSite=null;IntPtr menu=IntPtr.Zero;
    try {
      string file=Convert.ToString(request["file"]);IntPtr owner=new IntPtr(Convert.ToInt64(request["owner"]));uint pid;
      if(!File.Exists(file) && !Directory.Exists(file))throw new FileNotFoundException();
      if(GetWindowThreadProcessId(owner,out pid)==0 || pid!=Convert.ToUInt32(request["ownerPid"]))throw new InvalidOperationException("Menu owner is unavailable.");
      SetWindowLongPtr(Host.Handle,-8,owner);
      shell=CreateMenu(file,Host.Handle);menu=CreatePopupMenu();if(menu==IntPtr.Zero)throw new InvalidOperationException("Cannot create menu.");
      withSite=shell as OrganizerMenuWithSite;
      if(withSite!=null)withSite.SetSite(new OrganizerMenuSite(owner));
      uint flags=0x10u | (Convert.ToBoolean(request["extended"])?0x100u:0u);
      Marshal.ThrowExceptionForHR(shell.QueryContextMenu(menu,0,1,0x6fff,flags));
      bool hasCopyPath=false;
      for(int index=0;index<GetMenuItemCount(menu);index++) {
        uint existing=GetMenuItemID(menu,index);if(existing<1 || existing>0x6fff)continue;
        var canonical=new StringBuilder(256);
        if(shell.GetCommandString(new UIntPtr(existing-1),4,IntPtr.Zero,canonical,256)==0 && string.Equals(canonical.ToString(),"copyaspath",StringComparison.OrdinalIgnoreCase))hasCopyPath=true;
      }
      AppendMenu(menu,0x800,UIntPtr.Zero,null);
      AppendMenu(menu,0,new UIntPtr(0x7000),Convert.ToString(request["removeLabel"]));
      AppendMenu(menu,0,new UIntPtr(0x7001),Convert.ToString(request["revealLabel"]));
      if(!hasCopyPath)AppendMenu(menu,0,new UIntPtr(0x7002),Convert.ToString(request["copyPathLabel"]));
      Host.Menu3=shell as OrganizerShellMenu3;Host.Menu2=shell as OrganizerShellMenu2;
      Host.TopMost=true;Host.Show();SetForegroundWindow(Host.Handle);
      int x=Convert.ToInt32(request["x"]),y=Convert.ToInt32(request["y"]);
      uint command=TrackPopupMenuEx(menu,0x100|0x2,x,y,Host.Handle,IntPtr.Zero);
      PostMessage(Host.Handle,0,IntPtr.Zero,IntPtr.Zero);Host.TopMost=false;
      string action="cancel",verb="";
      if(command==0x7000)action="remove";
      else if(command==0x7001)action="reveal";
      else if(command==0x7002)action="copy-path";
      else if(command>=1 && command<=0x6fff) {
        var text=new StringBuilder(256);shell.GetCommandString(new UIntPtr(command-1),4,IntPtr.Zero,text,256);verb=text.ToString();
        if(string.Equals(verb,"rename",StringComparison.OrdinalIgnoreCase))action="rename";
        else {
          var signal=new ManualResetEvent(false);
          lock(ContinueLock){WaitingId=id;ContinueEvent=signal;CancelInvoke=false;}
          Reply(new{id,beforeInvoke=true,verb});
          bool acknowledged=signal.WaitOne(15000),cancel;
          lock(ContinueLock){cancel=CancelInvoke;WaitingId=null;ContinueEvent=null;}
          signal.Dispose();
          if(!acknowledged || cancel)throw new InvalidOperationException("File operation was cancelled.");
          var info=new OrganizerInvokeInfo {size=(uint)Marshal.SizeOf(typeof(OrganizerInvokeInfo)),mask=0x4000|0x20000000,window=owner,verb=new IntPtr(command-1),verbW=new IntPtr(command-1),show=1,point=new Point(x,y)};
          Marshal.ThrowExceptionForHR(shell.InvokeCommand(ref info));action="shell";
        }
      }
      Reply(new{id,action,verb,clipboardSequence=GetClipboardSequenceNumber()});
    } catch(Exception error){Reply(new{id,error=error.Message});}
    finally {
      Host.Menu2=null;Host.Menu3=null;Host.TopMost=false;Host.Hide();SetWindowLongPtr(Host.Handle,-8,IntPtr.Zero);
      if(withSite!=null)withSite.SetSite(null);
      if(menu!=IntPtr.Zero)DestroyMenu(menu);if(shell!=null)Marshal.ReleaseComObject(shell);Busy=false;
    }
  }
  public static void Run() {
    Exception failure=null;var thread=new Thread(delegate(){try{RunUi();}catch(Exception error){failure=error;}});
    thread.SetApartmentState(ApartmentState.STA);thread.Start();thread.Join();if(failure!=null)throw failure;
  }
  static void RunUi() {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    Host=new OrganizerMenuHost {Text="METech Windows file menu",ShowInTaskbar=false,FormBorderStyle=FormBorderStyle.None,Opacity=0,StartPosition=FormStartPosition.Manual,Bounds=new Rectangle(-20000,-20000,1,1)};
    IntPtr handle=Host.Handle;
    var input=new Thread(delegate(){
      string line;while((line=Console.ReadLine())!=null){
        try{
          var request=Json.Deserialize<Dictionary<string,object>>(line);
          if(request.ContainsKey("continue")){
            lock(ContinueLock){if(WaitingId==Convert.ToString(request["continue"]) && ContinueEvent!=null){CancelInvoke=request.ContainsKey("cancel");ContinueEvent.Set();}}
          } else Host.BeginInvoke(new Action(()=>Show(request)));
        }catch{}
      }
      lock(ContinueLock){if(ContinueEvent!=null){CancelInvoke=true;ContinueEvent.Set();}}
      Host.BeginInvoke(new Action(()=>{EndMenu();Host.Close();Application.ExitThread();}));
    });input.IsBackground=true;input.Start();
    uint sequence=GetClipboardSequenceNumber();
    var clipboard=new System.Windows.Forms.Timer {Interval=500};
    clipboard.Tick+=delegate{uint current=GetClipboardSequenceNumber();if(current!=sequence){sequence=current;Reply(new{clipboardChanged=true,sequence});}};
    clipboard.Start();Reply(new{ready=true,host=handle.ToInt64().ToString()});Application.Run();clipboard.Dispose();Host.Dispose();
  }
}
'@
[OrganizerNativeMenu]::Run()
