$ErrorActionPreference='Stop'
$native=Join-Path $env:APPDATA 'switchdash\local-switch-server\native'
Get-Content "$native\run\switch-core.env" | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process')}}
$install=Get-ChildItem "$native\switch-core" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(-not $install){throw 'No installed Switch Core found'}
$env:PYTHONPATH=Join-Path $install.FullName 'src\core'
Set-Location $install.FullName
& (Join-Path $install.FullName 'venv\Scripts\python.exe') -m switch_core.main
