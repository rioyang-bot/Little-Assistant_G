param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
# This script and its configuration are installed in an administrator-owned
# directory. A task accepts data only, never a script or executable to run.
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.schema -ne 1 -or $config.sid -notmatch '^S-1-5-21-(\d+-){3}\d+$') { throw 'Invalid broker configuration' }
$requestFile = $config.requestFile
if (!(Test-Path -LiteralPath $requestFile) -or (Get-Item -LiteralPath $requestFile).Length -gt 8192) { exit 0 }
$request = Get-Content -LiteralPath $requestFile -Raw | ConvertFrom-Json
if ($request.pipeName -notmatch '^METech-desktop-icons-[a-f0-9]{32}$' -or $request.token -notmatch '^[a-f0-9]{32}$' -or [int]$request.ownerPid -le 0) { throw 'Invalid broker request' }
$owner = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$request.ownerPid)"
if (!$owner -or (Invoke-CimMethod -InputObject $owner -MethodName GetOwnerSid).Sid -ne $config.sid) { throw 'Broker caller identity mismatch' }
$process = Get-Process -Id $request.ownerPid
if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$request.ownerStarted) { throw 'Broker caller process changed' }
& (Join-Path $PSScriptRoot 'windows-desktop-icons.ps1') -JournalPath $config.journal -RecoveryJournal $config.legacyJournal -OwnerPid $request.ownerPid -DesktopDirectory $config.desktop -PipeName $request.pipeName -PipeToken $request.token
