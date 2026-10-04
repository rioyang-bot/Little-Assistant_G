$ErrorActionPreference = 'Stop'
# Exercise Windows' real Shell drop target without injecting mouse/keyboard
# input or controlling any window. All transfers use disposable fixture files.
$shellHelperSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../electron/windows-file-drag.ps1') -Raw
. ([scriptblock]::Create($shellHelperSource.Replace('[OrganizerNativeDrag]::Run()', '')))
Add-Type -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll' -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Windows.Forms;
using ComDataObject = System.Runtime.InteropServices.ComTypes.IDataObject;

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface TestShellItem {
  [PreserveSig] int BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out TestShellDropTarget target);
}
[ComImport, Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface TestShellDropTarget {
  [PreserveSig] int DragEnter([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
  [PreserveSig] int DragOver(uint keys, long point, ref uint effect);
  [PreserveSig] int DragLeave();
  [PreserveSig] int Drop([MarshalAs(UnmanagedType.Interface)] ComDataObject data, uint keys, long point, ref uint effect);
}
public static class ShellTransferTest {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out TestShellItem item);
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  static void Check(bool value, string message) { if (!value) throw new Exception(message); }
  static object Invoke(string method, params object[] args) {
    Type helper = null;
    foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies()) { helper = assembly.GetType("OrganizerNativeDrag"); if (helper != null) break; }
    return helper.GetMethod(method).Invoke(null, args);
  }
  static uint Drop(string destination, ComDataObject data) {
    TestShellItem item = null; TestShellDropTarget target = null;
    try {
      Guid iid = typeof(TestShellItem).GUID;
      Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(destination, IntPtr.Zero, ref iid, out item));
      Guid handler = new Guid("3981e225-f559-11d3-8e3a-00c04f6837d5"); iid = typeof(TestShellDropTarget).GUID;
      Marshal.ThrowExceptionForHR(item.BindToHandler(IntPtr.Zero, ref handler, ref iid, out target));
      uint effect = 2;
      Marshal.ThrowExceptionForHR(target.DragEnter(data, 1, 0, ref effect));
      Check(effect == 2, "Shell target did not accept Move.");
      effect = 2; Marshal.ThrowExceptionForHR(target.Drop(data, 0, 0, ref effect));
      return effect;
    } finally { if (target != null) Marshal.ReleaseComObject(target); if (item != null) Marshal.ReleaseComObject(item); }
  }
  public static void Run(string root) {
    Exception failure = null;
    Thread thread = new Thread(delegate() { try { RunSta(root); } catch (Exception error) { failure = error; } });
    thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join();
    if (failure != null) throw failure;
  }
  static void RunSta(string root) {
    OleInitialize(IntPtr.Zero);
    try {
      string destination = Path.Combine(root, "Desktop-target"); Directory.CreateDirectory(destination);
      foreach (string name in new [] { "\u6e2c\u8a66\u6a94\u6848 \u539f\u540d.txt", "Original shortcut.lnk", "Folder with files" }) {
        string file = Path.Combine(root, name); bool folder = name == "Folder with files";
        if (folder) { Directory.CreateDirectory(file); File.WriteAllText(Path.Combine(file, "child.txt"), "contents"); }
        else File.WriteAllText(file, "contents");
        ComDataObject data = (ComDataObject)Invoke("CreateFileData", file);
        try {
          IntPtr dataPointer = Marshal.GetComInterfaceForObject(data, typeof(ComDataObject));
          Check(dataPointer != IntPtr.Zero, "Cannot pass the Shell data object into the OLE drag loop."); Marshal.Release(dataPointer);
          var format = new FORMATETC { cfFormat = (short)DataFormats.GetFormat("Shell IDList Array").Id, dwAspect=DVASPECT.DVASPECT_CONTENT, lindex=-1, tymed=TYMED.TYMED_HGLOBAL };
          Check(data.QueryGetData(ref format) == 0, "Missing Shell IDList Array.");
          uint result = Drop(destination, data);
          string completed = (string)Invoke("CompleteTransfer", file, data, 0x40100, result);
          Check(completed == "Move", "Shell transfer did not complete as Move.");
          Check(!File.Exists(file) && !Directory.Exists(file), "Source remained after Shell drop.");
          string moved = Path.Combine(destination, name);
          Check(File.ReadAllText(folder ? Path.Combine(moved, "child.txt") : moved) == "contents", "Filename or content changed.");
        } finally { Marshal.ReleaseComObject(data); }
      }
      string otherParent=Path.Combine(root,"other-parent");Directory.CreateDirectory(otherParent);
      string batchFolder=Path.Combine(otherParent,"batch-folder");Directory.CreateDirectory(batchFolder);
      string[] batchFiles={Path.Combine(root,"batch-one.txt"),Path.Combine(otherParent,"batch-two.txt"),batchFolder};
      for(int index=0;index<batchFiles.Length;index++)File.WriteAllText(index==2?Path.Combine(batchFiles[index],"child.txt"):batchFiles[index],"batch contents "+index);
      ComDataObject batchData=(ComDataObject)Invoke("CreateFilesData",(object)batchFiles);
      try {
        Drop(destination,batchData);
        for(int index=0;index<batchFiles.Length;index++) {
          Check(!File.Exists(batchFiles[index]) && !Directory.Exists(batchFiles[index]),"Batch Shell move left a source.");
          string moved=Path.Combine(destination,Path.GetFileName(batchFiles[index]));
          Check(File.ReadAllText(index==2?Path.Combine(moved,"child.txt"):moved)=="batch contents "+index,"Batch path, name or contents changed.");
        }
      } finally {Marshal.ReleaseComObject(batchData);}
      // Also bind to the user's actual Desktop folder. Only this uniquely
      // named fixture is touched, and it is removed after checking its bytes.
      string desktopFile = "organizer-drag-test-" + Guid.NewGuid().ToString() + ".txt";
      string desktopSource = Path.Combine(root, desktopFile);
      string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
      string desktopDestination = Path.Combine(desktop, desktopFile);
      File.WriteAllText(desktopSource, "desktop transfer contents");
      ComDataObject desktopData = (ComDataObject)Invoke("CreateFileData", desktopSource);
      try {
        uint result = Drop(desktop, desktopData);
        Check((string)Invoke("CompleteTransfer", desktopSource, desktopData, 0x40100, result) == "Move", "Desktop transfer did not complete.");
        Check(!File.Exists(desktopSource) && File.ReadAllText(desktopDestination) == "desktop transfer contents", "Desktop source or destination is incorrect.");
      } finally { Marshal.ReleaseComObject(desktopData); if (File.Exists(desktopDestination)) File.Delete(desktopDestination); }
      // A target that merely reports Move cannot authorize source deletion.
      string retained = Path.Combine(root, "retained.txt"); File.WriteAllText(retained, "keep");
      ComDataObject retainedData = (ComDataObject)Invoke("CreateFileData", retained);
      try {
        Check((string)Invoke("CompleteTransfer", retained, retainedData, 0x40100, (uint)2) == "None", "Unconfirmed move was trusted.");
        Check(File.Exists(retained), "Unconfirmed move deleted source.");
        Invoke("SetEffect", retainedData, "Performed DropEffect", (uint)2);
        Check((string)Invoke("CompleteTransfer", retained, retainedData, 0x40101, (uint)2) == "None", "Cancellation was trusted.");
        Check(File.Exists(retained), "Cancel deleted source.");
        string copied = Path.Combine(destination, "retained.txt"); File.Copy(retained, copied);
        Check((string)Invoke("CompleteTransfer", retained, retainedData, 0x40100, (uint)2) == "Move", "Confirmed conventional move not completed.");
        Check(!File.Exists(retained) && File.ReadAllText(copied) == "keep", "Conventional move lost contents.");
      } finally { Marshal.ReleaseComObject(retainedData); }
      Console.WriteLine("Real Windows Shell transfer assertions passed (actual Desktop, Unicode filename, shortcut, folder, cancellation, unconfirmed and conventional moves).");
    } finally { OleUninitialize(); }
  }
}
'@
$shellTransferRoot = Join-Path ([IO.Path]::GetTempPath()) ('organizer-shell-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($shellTransferRoot)
try { [ShellTransferTest]::Run($shellTransferRoot) }
finally {
  $resolvedShellTransferRoot = [IO.Path]::GetFullPath($shellTransferRoot)
  if ($resolvedShellTransferRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedShellTransferRoot).StartsWith('organizer-shell-test-')) {
    Remove-Item -LiteralPath $resolvedShellTransferRoot -Recurse -Force
  }
}
