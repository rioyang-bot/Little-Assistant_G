$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot '../electron/windows-desktop-icon-permissions.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Permission script parse failed'}
$definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Load-TargetIdentity'},$true)
Invoke-Expression $definition.Extent.Text
Load-TargetIdentity
$directory=Join-Path ([IO.Path]::GetTempPath()) ('assistant-permission-identity-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($directory) | Out-Null
$file=Join-Path $directory 'owned.lnk'
[IO.File]::WriteAllText($file,'owned fixture bytes')
try {
  $target=New-Object DesktopPermissionTarget($file)
  $identity=$target.Identity
  try { Move-Item -LiteralPath $file -Destination ($file+'.moved') -ErrorAction Stop; throw 'Unpinned shortcut unexpectedly moved' }
  catch { if($_.Exception.Message -eq 'Unpinned shortcut unexpectedly moved'){throw} }
  $target.Dispose()
  $renamed=$file+'.moved'; Move-Item -LiteralPath $file -Destination $renamed
  $renamedTarget=New-Object DesktopPermissionTarget($renamed)
  if($renamedTarget.Identity -ne $identity){throw 'File identity changed on rename'}
  $renamedTarget.Dispose()
  [IO.File]::WriteAllText($file,'replacement fixture bytes')
  $replacement=New-Object DesktopPermissionTarget($file)
  if($replacement.Identity -eq $identity){throw 'Replacement not detected'}
  $replacement.Dispose()
  New-Item -ItemType HardLink -Path (Join-Path $directory 'linked.lnk') -Target $file | Out-Null
  $rejected=$false
  try{$link=New-Object DesktopPermissionTarget($file);$link.Dispose()}catch{$rejected=$true}
  if(!$rejected){throw 'Hard-linked shortcut accepted'}
  Write-Output 'Permission target identity: pinned file, unchanged identity on rename, replacement detection and hard-link rejection passed.'
} finally {
  if($target){$target.Dispose()};if($renamedTarget){$renamedTarget.Dispose()};if($replacement){$replacement.Dispose()}
  $resolved=[IO.Path]::GetFullPath($directory)
  if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture directory escapes temporary root'}
  Remove-Item -LiteralPath $directory -Recurse -Force
}
