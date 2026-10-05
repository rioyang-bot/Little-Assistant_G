param(
  [ValidateSet('Setup','Install','Grant','Restore','Remove','Cleanup','Status')][string]$Mode = 'Install',
  [switch]$Authorized,
  [string]$ContextFile
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
function Write-JsonFile($file, $value) { [IO.File]::WriteAllText($file, (ConvertTo-Json -InputObject $value -Depth 12), (New-Object Text.UTF8Encoding($false))) }
function Reply($value) { [Console]::WriteLine((ConvertTo-Json -InputObject $value -Depth 12 -Compress)) }
function Send-Result($context, $value) {
  if ($context.replyPipe -notmatch '^METech-permissions-[a-f0-9]{32}$' -or $context.token -notmatch '^[a-f0-9]{32}$') { throw '設定回覆連線無效。' }
  $pipe=New-Object IO.Pipes.NamedPipeClientStream('.', $context.replyPipe, [IO.Pipes.PipeDirection]::Out)
  try {
    $pipe.Connect(10000)
    $writer=New-Object IO.StreamWriter($pipe,(New-Object Text.UTF8Encoding($false)))
    try { $value.token=$context.token; $writer.WriteLine((ConvertTo-Json -InputObject $value -Depth 12 -Compress)); $writer.Flush() } finally { $writer.Dispose() }
  } finally { $pipe.Dispose() }
}
function Safe-Directory($directory) {
  $current = [IO.Path]::GetFullPath($directory)
  while ($current -and [IO.Directory]::Exists($current)) {
    if (([IO.File]::GetAttributes($current) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '背景程序目錄不可使用重新導向連結。' }
    $parent = [IO.Directory]::GetParent($current)
    if (!$parent) { break }; $current = $parent.FullName
  }
}
function Protect-Directory($directory, $sid, $publicRead=$false) {
  Safe-Directory $directory
  if (Test-Path -LiteralPath $directory) {
    $existing=Get-Acl -LiteralPath $directory
    if ($existing.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw '背景程序目錄的擁有者不安全，已停止設定。' }
    foreach ($rule in $existing.Access) {
      $identity=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      if ($rule.AccessControlType -eq 'Allow' -and $identity -notin @('S-1-5-18','S-1-5-32-544') -and ([int]$rule.FileSystemRights -band 852310)) { throw '背景程序目錄允許一般帳號修改，已停止設定。' }
    }
  }
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($identity in @('S-1-5-18','S-1-5-32-544')) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  }
  $reader = if ($publicRead) { 'S-1-5-32-545' } else { $sid }
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($reader)), 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  [IO.Directory]::SetAccessControl($directory,$acl)
}
function New-ProtectedFileAcl($sid, $publicRead=$false) {
  $acl=New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($identity in @('S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)), 'FullControl','Allow'))) }
  $reader=if($publicRead){'S-1-5-32-545'}else{$sid}
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($reader)), 'ReadAndExecute','Allow')))
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  return $acl
}
function Write-ProtectedFile($file, $bytes, $sid, $publicRead=$false) {
  if (Test-Path -LiteralPath $file) {
    $existing=Get-Acl -LiteralPath $file
    if ($existing.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544') -or ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '背景程序檔案的權限不安全。' }
    foreach ($rule in $existing.Access) {
      $identity=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      if ($rule.AccessControlType -eq 'Allow' -and $identity -notin @('S-1-5-18','S-1-5-32-544') -and ([int]$rule.FileSystemRights -band 852310)) { throw '背景程序檔案允許一般帳號修改，已停止設定。' }
    }
  }
  $temporary=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try {
    $stream=[IO.File]::Create($temporary,4096,[IO.FileOptions]::None,(New-ProtectedFileAcl $sid $publicRead))
    try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    # Windows PowerShell 5.1 binds $null to an empty string for this .NET
    # overload. NullString preserves a null backup path, including on repair.
    if ([IO.File]::Exists($file)) { [IO.File]::Replace($temporary,$file,[System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($temporary,$file) }
  } finally {
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
  }
}
function Write-ProtectedJson($file, $value, $sid) {
  Write-ProtectedFile $file ((New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Json -InputObject $value -Depth 12))) $sid
}
function Get-UserFolders($sid) {
  $profile = [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid").ProfileImagePath)
  $key = [Microsoft.Win32.Registry]::Users.OpenSubKey("$sid\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
  if (!$key) { throw '無法讀取登入使用者的桌面路徑。' }
  try {
    $folders = @{}
    foreach ($name in @('Desktop','AppData','Local AppData')) {
      $raw = [string]$key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $raw = $raw -replace '(?i)%USERPROFILE%', $profile
      $expanded = [Environment]::ExpandEnvironmentVariables($raw)
      if (!$expanded -or $expanded.Contains('%') -or ![IO.Path]::IsPathRooted($expanded)) { throw '使用者資料路徑無效。' }
      $folders[$name] = [IO.Path]::GetFullPath($expanded).TrimEnd('\')
    }
    foreach ($name in @('Desktop','AppData','Local AppData')) {
      if (!$folders[$name].StartsWith($profile.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '背景程序目前僅支援標準使用者個人資料夾配置。' }
    }
    return $folders
  } finally { $key.Close() }
}
function Load-TargetIdentity {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
public sealed class DesktopPermissionTarget : IDisposable {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string p,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GetFileInformationByHandle(IntPtr h,out Info info);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandle(IntPtr h,StringBuilder name,uint size,uint flags);
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public uint attrs; public System.Runtime.InteropServices.ComTypes.FILETIME created,accessed,written;
    public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;
  }
  IntPtr handle; public string Identity { get; private set; }
  public DesktopPermissionTarget(string path) {
    handle=CreateFile(path,0x80000000,3,IntPtr.Zero,3,0x02000000,IntPtr.Zero);
    if(handle==new IntPtr(-1))throw new IOException("Cannot lock shortcut");
    try {
      Info info;
      if(!GetFileInformationByHandle(handle,out info)||info.links!=1||(info.attrs&0x410)!=0)throw new IOException("Shortcut is a directory, link or reparse point");
      var actual=new StringBuilder(32768);GetFinalPathNameByHandle(handle,actual,(uint)actual.Capacity,0);
      if(!string.Equals(actual.ToString().Replace("\\\\?\\",""),Path.GetFullPath(path),StringComparison.OrdinalIgnoreCase))throw new IOException("Shortcut path is redirected");
      Identity=info.volume+":"+info.indexHigh+":"+info.indexLow;
    }catch{Dispose();throw;}
  }
  public void Dispose(){if(handle!=IntPtr.Zero&&handle!=new IntPtr(-1)){CloseHandle(handle);handle=IntPtr.Zero;}}
}
'@
}
try {
  if (!$Authorized) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $userDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'METechAssistant'
    $stageDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'METechAssistant'
    [IO.Directory]::CreateDirectory($stageDir) | Out-Null
    if ($Mode -eq 'Status') {
      $manifest = Join-Path $userDir 'desktop-icon-broker.json'
      $installed = Test-Path -LiteralPath $manifest
      Reply @{success=$true;installed=$installed}; exit 0
    }
    $nonce = [Guid]::NewGuid().ToString('N')
    $requestFile = Join-Path $stageDir "permissions-$nonce.json"
    $context = @{schema=1;sid=$sid;mode=$Mode;callerPid=$PID;callerStarted=(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks.ToString();replyPipe=('METech-permissions-'+$nonce);token=[Guid]::NewGuid().ToString('N');paths=@()}
    if ($env:METECH_PERMISSION_PATHS) { $context.paths = @(ConvertFrom-Json $env:METECH_PERMISSION_PATHS) }
    Write-JsonFile $requestFile $context
    $security=New-Object IO.Pipes.PipeSecurity
    $security.SetAccessRuleProtection($true,$false)
    foreach ($identity in @($sid,'S-1-5-18','S-1-5-32-544')) { $security.AddAccessRule((New-Object IO.Pipes.PipeAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)), [IO.Pipes.PipeAccessRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow))) }
    $pipe=New-Object IO.Pipes.NamedPipeServerStream($context.replyPipe,[IO.Pipes.PipeDirection]::In,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::Asynchronous,4096,4096,$security)
    try {
      $arguments = @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Authorized','-ContextFile',('"'+$requestFile+'"'))
      $elevated = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
      if (!$pipe.WaitForConnectionAsync().Wait(150000)) { throw '管理員設定連線未完成。' }
      $reader=New-Object IO.StreamReader($pipe,(New-Object Text.UTF8Encoding($false)))
      try { $line=$reader.ReadLineAsync(); if(!$line.Wait(150000)){throw '管理員設定未完成。'}; $result=$line.Result | ConvertFrom-Json } finally { $reader.Dispose() }
      if ($result.token -ne $context.token) { throw '管理員設定回覆驗證失敗。' }
      $elevated.WaitForExit()
      if ($result.success -and $result.manifest) {
        [IO.Directory]::CreateDirectory($userDir) | Out-Null
        Write-JsonFile (Join-Path $userDir 'desktop-icon-broker.json') $result.manifest
      }
      if ($result.success -and $Mode -in @('Setup','Grant') -and $result.changed -gt 0) { Write-JsonFile (Join-Path $userDir 'desktop-icon-permissions.json') @{schema=1;sid=$sid;granted=$true} }
      if ($result.success -and $Mode -in @('Restore','Cleanup') -and !$result.errors.Count -and (Test-Path -LiteralPath (Join-Path $userDir 'desktop-icon-permissions.json'))) { Remove-Item -LiteralPath (Join-Path $userDir 'desktop-icon-permissions.json') -Force }
      if ($result.success -and $Mode -in @('Remove','Cleanup') -and (Test-Path -LiteralPath (Join-Path $userDir 'desktop-icon-broker.json'))) { Remove-Item -LiteralPath (Join-Path $userDir 'desktop-icon-broker.json') -Force }
      $result.PSObject.Properties.Remove('token'); Reply $result; if (!$result.success) { exit 1 }; exit 0
    } finally {
      $pipe.Dispose()
      if (Test-Path -LiteralPath $requestFile) { Remove-Item -LiteralPath $requestFile -Force }
    }
  }
  if (!(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '需要管理員權限。' }
  if ((Get-Item -LiteralPath $ContextFile).Length -gt 1048576) { throw '設定要求過大。' }
  $context = Get-Content -LiteralPath $ContextFile -Raw | ConvertFrom-Json
  if ($context.schema -ne 1 -or $context.sid -notmatch '^S-1-5-21-(\d+-){3}\d+$' -or $context.mode -notin @('Setup','Install','Grant','Restore','Remove','Cleanup')) { throw '設定要求無效。' }
  $caller = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$context.callerPid)"
  if (!$caller -or (Invoke-CimMethod -InputObject $caller -MethodName GetOwnerSid).Sid -ne $context.sid -or (Get-Process -Id $context.callerPid).StartTime.ToUniversalTime().Ticks.ToString() -ne $context.callerStarted) { throw '設定要求的使用者身分不符。' }
  $sid = $context.sid; $Mode = $context.mode
  $folders = Get-UserFolders $sid
  $userDir = Join-Path $folders.AppData 'METechAssistant'
  $stageDir = Join-Path $folders.'Local AppData' 'METechAssistant'
  $root = Join-Path $env:ProgramFiles 'METechAssistant\DesktopIconBroker'
  Protect-Directory (Split-Path -LiteralPath $root) $sid $true
  Protect-Directory $root $sid $true
  $accountRoot = Join-Path $root $sid
  Protect-Directory $accountRoot $sid
  $taskName = 'METechAssistant-DesktopIcons-'+$sid
  $manifestFile = Join-Path $userDir 'desktop-icon-broker.json'
  $backupFile = Join-Path $accountRoot 'permissions.json'
  $records = @()
  if (Test-Path -LiteralPath $backupFile) {
    if ((Get-Acl -LiteralPath $backupFile).GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw '捷徑權限備份的擁有者不安全。' }
    $records = @(Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json)
  }
  $changed=0; $errors=@()
  if ($Mode -in @('Setup','Install')) {
    foreach ($name in @('windows-desktop-icons.ps1','windows-desktop-icon-broker.ps1')) { Write-ProtectedFile (Join-Path $root $name) ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) $sid $true }
    $configFile = Join-Path $accountRoot 'config.json'
    Write-ProtectedJson $configFile @{schema=1;sid=$sid;desktop=$folders.Desktop;journal=(Join-Path $accountRoot 'visibility.json');legacyJournal=(Join-Path $userDir 'desktop-icon-visibility.json');requestFile=(Join-Path $stageDir 'desktop-icon-broker-request.json')} $sid
    $scheduler = New-Object -ComObject 'Schedule.Service'; $scheduler.Connect()
    $definition = $scheduler.NewTask(0)
    $definition.RegistrationInfo.Description = 'METech desktop icon attribute helper. Fixed protected program; no arbitrary commands.'
    $definition.Principal.UserId='SYSTEM'; $definition.Principal.LogonType=5; $definition.Principal.RunLevel=1
    $definition.Settings.ExecutionTimeLimit='PT0S'; $definition.Settings.DisallowStartIfOnBatteries=$false; $definition.Settings.StopIfGoingOnBatteries=$false; $definition.Settings.MultipleInstances=2
    $action=$definition.Actions.Create(0)
    $action.Path=Join-Path $PSHOME 'powershell.exe'
    $action.Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $root 'windows-desktop-icon-broker.ps1')+'" -ConfigPath "'+$configFile+'"'
    $security='D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;'+$sid+')'
    $task=$scheduler.GetFolder('\').RegisterTaskDefinition($taskName,$definition,6,'SYSTEM',$null,5,$security)
    $task.SetSecurityDescriptor($security,16)
    $manifest=@{schema=1;sid=$sid;root=$root;taskName=$taskName;requestFile=(Join-Path $stageDir 'desktop-icon-broker-request.json');enabled=($Mode -eq 'Install')}
  }
  if ($Mode -in @('Setup','Grant')) {
    Load-TargetIdentity
    $allowedRoots=@($folders.Desktop,[Environment]::GetFolderPath('CommonDesktopDirectory'))
    foreach ($file in @($context.paths | Select-Object -Unique)) {
      $target=$null
      try {
        $full=[IO.Path]::GetFullPath([string]$file)
        if ($allowedRoots -notcontains [IO.Path]::GetDirectoryName($full) -or [IO.Path]::GetExtension($full) -notin @('.lnk','.url') -or ([IO.File]::GetAttributes($full) -band [IO.FileAttributes]::ReparsePoint)) { throw '只允許授權桌面上的捷徑。' }
        $target=New-Object DesktopPermissionTarget($full)
        $acl=Get-Acl -LiteralPath $full
        $allowed=$false; $denied=$false
        foreach ($rule in $acl.Access) {
          $ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
          if ($ruleSid -in @($sid,'S-1-1-0','S-1-5-11','S-1-5-32-545') -and ([int]$rule.FileSystemRights -band 256)) {
            if ($rule.AccessControlType -eq 'Allow') {$allowed=$true} else {$denied=$true}
          }
        }
        if ($denied) { throw '此捷徑有明確拒絕規則，已保留原權限。' }
        if ($allowed) { continue }
        if (@($records | Where-Object path -eq $full).Count) { throw '捷徑權限已被其他程式修改，請先還原或檢查。' }
        $before=$acl.GetSecurityDescriptorSddlForm('Access')
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)), 'WriteAttributes','Allow')))
        $after=$acl.GetSecurityDescriptorSddlForm('Access')
        $records += @{path=$full;identity=$target.Identity;before=$before;after=$after}
        Write-ProtectedJson $backupFile @($records) $sid
        Set-Acl -LiteralPath $full -AclObject $acl
        $changed++
      } catch { $errors += [IO.Path]::GetFileName([string]$file)+'：'+$_.Exception.Message }
      finally { if ($target) { $target.Dispose() } }
    }
  }
  if ($Mode -in @('Restore','Cleanup')) {
    Load-TargetIdentity
    $remaining=@()
    foreach ($record in $records) {
      $target=$null
      try {
        if (!(Test-Path -LiteralPath $record.path)) { continue }
        $target=New-Object DesktopPermissionTarget($record.path)
        if ($target.Identity -ne $record.identity) { continue }
        $acl=Get-Acl -LiteralPath $record.path
        $current=$acl.GetSecurityDescriptorSddlForm('Access')
        if ($current -eq $record.before) { continue }
        if ($current -ne $record.after) { throw '捷徑權限已變更，保留其他程式的修改。' }
        $acl.SetSecurityDescriptorSddlForm($record.before,'Access')
        Set-Acl -LiteralPath $record.path -AclObject $acl; $changed++
      } catch { $remaining += $record; $errors += [IO.Path]::GetFileName($record.path)+'：'+$_.Exception.Message }
      finally { if ($target) { $target.Dispose() } }
    }
    Write-ProtectedJson $backupFile @($remaining) $sid
  }
  if ($Mode -in @('Remove','Cleanup')) {
    if ($Mode -eq 'Cleanup' -and $errors.Count -gt 0) { throw '部分捷徑權限尚未還原，已保留背景工作與程式。請檢查權限後再解除安裝。' }
    $visibilityFile=Join-Path $accountRoot 'visibility.json'
    if ((Test-Path -LiteralPath $visibilityFile) -and @(Get-Content -LiteralPath $visibilityFile -Raw | ConvertFrom-Json).Count -gt 0) { throw '背景圖示仍需還原，請先啟用背景模式並正常結束小助手，再移除。' }
    $scheduler=New-Object -ComObject 'Schedule.Service'; $scheduler.Connect()
    try {
      $task=$scheduler.GetFolder('\').GetTask($taskName)
      for($attempt=0;$attempt -lt 50 -and $task.State -eq 4;$attempt++){Start-Sleep -Milliseconds 100}
      if ($task.State -eq 4) { throw '請先停止使用背景程序，再移除。' }
      $scheduler.GetFolder('\').DeleteTask($taskName,0)
    } catch { if ($_.Exception.HResult -ne -2147024894) { throw } }
  }
  $result=@{success=$true;changed=$changed;errors=@($errors);installed=($Mode -in @('Setup','Install'))}
  if ($manifest) { $result.manifest=$manifest }
  Send-Result $context $result
} catch {
  $errorResult=@{success=$false;error=$_.Exception.Message}
  if ($Authorized -and $context) { try { Send-Result $context $errorResult } catch {} }
  elseif (!$Authorized) { Reply $errorResult }
  exit 1
}
