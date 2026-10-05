$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot '../electron/windows-desktop-icon-permissions.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Permission script parse failed'}
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-ProtectedFile'},$true)
$replace=$function.Find({param($node) $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Static -and $node.Member.Value -eq 'Replace'},$true)
if(!$replace){throw 'Expected the actual protected writer replacement operation'}
$directory=Join-Path ([IO.Path]::GetTempPath()) ('assistant-permission-write-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($directory) | Out-Null
try {
  $folder=Join-Path $directory '含空白 中文'; [IO.Directory]::CreateDirectory($folder) | Out-Null
  $file=Join-Path $folder 'config.json'; $temporary=$file+'.tmp'
  [IO.File]::WriteAllText($file,'original'); [IO.File]::WriteAllText($temporary,'replacement')
  $beforeAcl=[IO.File]::GetAccessControl($file).GetSecurityDescriptorSddlForm('Access')
  $reproduced=$false
  try { [IO.File]::Replace($temporary,$file,$null) } catch { $reproduced=$true }
  if(!$reproduced){throw 'Expected Windows PowerShell null binding to reproduce the reported error'}
  # Execute the exact replacement expression from the shipped writer. This
  # fixture needs no administrator ownership or access to Program Files.
  Invoke-Expression $replace.Extent.Text
  if([IO.File]::ReadAllText($file) -ne 'replacement' -or [IO.File]::Exists($temporary)){throw 'Replacement did not atomically consume the source'}
  if([IO.File]::GetAccessControl($file).GetSecurityDescriptorSddlForm('Access') -ne $beforeAcl){throw 'Replacement changed the existing destination permissions'}
  for($attempt=0;$attempt -lt 3;$attempt++){
    [IO.File]::WriteAllText($temporary,"updated-$attempt")
    Invoke-Expression $replace.Extent.Text
    if([IO.File]::ReadAllText($file) -ne "updated-$attempt"){throw 'Repeated repair/backup replacement failed'}
  }
  Write-Output 'Windows PowerShell 5.1: original null-backup error reproduced; shipped replacement succeeds repeatedly with Chinese/space paths and retains destination ACLs.'
} finally {
  $resolved=[IO.Path]::GetFullPath($directory)
  if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture directory escapes temporary root'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
