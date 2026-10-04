param([int]$MenuPid,[long]$OwnerHandle,[long]$HostHandle)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
public static class ContextMenuFixtureDriver {
  delegate bool EnumWindow(IntPtr h,IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr param);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder name,int count);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder name,int count);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint command);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,uint message,IntPtr wparam,IntPtr lparam);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint message,IntPtr wparam,IntPtr lparam);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu,uint position,StringBuilder text,int size,uint flags);
  [DllImport("user32.dll")] static extern bool GetMenuItemRect(IntPtr window,IntPtr menu,uint index,out RectangleRect rect);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct RectangleRect {public int left,top,right,bottom;}
  static IntPtr Find(int pid,string type,string title,IntPtr owner) {
    IntPtr found=IntPtr.Zero;
    EnumWindows(delegate(IntPtr window,IntPtr unused){
      if(!IsWindowVisible(window))return true;
      uint actual;GetWindowThreadProcessId(window,out actual);if(pid!=0 && actual!=pid)return true;
      var name=new StringBuilder(512);GetClassName(window,name,name.Capacity);if(name.ToString()!=type)return true;
      if(owner!=IntPtr.Zero && GetWindow(window,4)!=owner)return true;
      if(title!=null){name.Clear();GetWindowText(window,name,name.Capacity);if(!name.ToString().Contains(title))return true;}
      found=window;return false;
    },IntPtr.Zero);return found;
  }
  public static void Run(int pid,long ownerHandle,long hostHandle) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    IntPtr popup=IntPtr.Zero;
    for(int i=0;i<150 && popup==IntPtr.Zero;i++){popup=Find(pid,"#32768",null,IntPtr.Zero);Thread.Sleep(50);}
    if(popup==IntPtr.Zero)throw new Exception("Owned Shell menu did not appear.");
    IntPtr host=new IntPtr(hostHandle),menu=SendMessage(popup,0x1e1,IntPtr.Zero,IntPtr.Zero);
    uint hostPid;GetWindowThreadProcessId(host,out hostPid);if(hostPid!=pid)throw new Exception("Menu host belongs to another process.");
    var labels=new List<string>();int selected=-1;
    string action=Environment.GetEnvironmentVariable("METECH_CONTEXT_ACTION");
    string remove=Environment.GetEnvironmentVariable("METECH_CONTEXT_REMOVE_LABEL");
    for(int index=0;index<GetMenuItemCount(menu);index++){
      var label=new StringBuilder(1024);GetMenuString(menu,(uint)index,label,label.Capacity,0x400);string text=label.ToString().Replace("&","");labels.Add(text);
      if(action=="remove" && text==remove)selected=index;
      if(action=="properties" && (text.StartsWith("Properties",StringComparison.OrdinalIgnoreCase) || text.StartsWith("\u5167\u5bb9")))selected=index;
      if(action=="rename" && (text.StartsWith("Rename",StringComparison.OrdinalIgnoreCase) || text.StartsWith("\u91cd\u65b0\u547d\u540d")))selected=index;
    }
    Console.WriteLine(new JavaScriptSerializer().Serialize(new{labels}));
    if(action=="cancel"){PostMessage(host,0x1f,IntPtr.Zero,IntPtr.Zero);return;}
    if(selected<0){PostMessage(host,0x1f,IntPtr.Zero,IntPtr.Zero);throw new Exception("Expected native command was missing.");}
    RectangleRect rect;if(!GetMenuItemRect(host,menu,(uint)selected,out rect))throw new Exception("Selected menu rectangle unavailable.");
    Point click=new Point((rect.left+rect.right)/2,(rect.top+rect.bottom)/2),previous;GetCursorPos(out previous);
    uint actual;IntPtr hit=WindowFromPoint(click);GetWindowThreadProcessId(hit,out actual);
    if(actual!=pid)throw new Exception("Owned menu is covered; refusing mouse injection.");
    try{SetCursorPos(click.X,click.Y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}finally{SetCursorPos(previous.X,previous.Y);}
    if(action=="properties"){
      IntPtr dialog=IntPtr.Zero;
      string name=Environment.GetEnvironmentVariable("METECH_CONTEXT_FILE_NAME");
      for(int i=0;i<150 && dialog==IntPtr.Zero;i++){dialog=Find(pid,"#32770",name,IntPtr.Zero);Thread.Sleep(50);}
      if(dialog==IntPtr.Zero)throw new Exception("Owned file properties dialog did not appear.");
      Thread.Sleep(250);PostMessage(dialog,0x10,IntPtr.Zero,IntPtr.Zero);
    }
  }
}
'@
[ContextMenuFixtureDriver]::Run($MenuPid,$OwnerHandle,$HostHandle)
