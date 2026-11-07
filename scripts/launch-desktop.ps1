param([switch]$ServicesOnly)
$ErrorActionPreference = 'Stop'
$desktopStarted=$false
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $env:LOCALAPPDATA 'FlowState\startup'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$statePath = Join-Path $stateDir 'status.json'
$events = [System.Collections.Generic.List[string]]::new()
function Status($stage, $message, $failed = $false, $ready = $false) {
    $events.Add("$(Get-Date -Format HH:mm:ss) $message")
    $state = @{stage=$stage; message=$message; failed=$failed; ready=$ready; logs=@($events.ToArray())} | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($statePath, $state)
}
function Healthy($url) { try { $null=Invoke-RestMethod $url -TimeoutSec 2; return $true } catch { return $false } }
function DockerReady {
    $ErrorActionPreference = 'Continue'
    & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}
function WaitHealthy($url, $name, $seconds=90) {
    $until=(Get-Date).AddSeconds($seconds)
    while((Get-Date) -lt $until) { if(Healthy $url){return}; Start-Sleep -Seconds 2 }
    throw "$name did not become healthy within $seconds seconds. See local service logs."
}
try {
    Status 'Preparing' 'Loading local configuration'
    if(-not(Test-Path "$root\.env")){throw 'Missing .env. Complete the first-time setup documented in README.'}
    Get-Content "$root\.env" | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process')}}
    $env:FLOWSTATE_STARTUP_STATUS=$statePath
    $env:FLOWSTATE_AGENT_WORKDIR=$root
    $codex = Get-Command codex -ErrorAction SilentlyContinue
    if($codex){$env:FLOWSTATE_CODEX_BINARY=$codex.Source}
    $exe=Join-Path $root 'apps\desktop\src-tauri\target\debug\flowstate-desktop.exe'
    if(-not(Test-Path $exe)){throw 'Build the desktop first: pnpm --filter @flowstate/desktop exec tauri build --debug --no-bundle'}
    if(-not $ServicesOnly){Start-Process -FilePath $exe -WorkingDirectory $root; $desktopStarted=$true}
    Status 'Docker' 'Starting Docker Desktop'
    $docker=Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
    if(-not(Test-Path $docker)){$docker=(Get-Command docker -ErrorAction Stop).Source}
    if(-not (DockerReady)){Start-Process (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe') -WindowStyle Hidden}
    $dockerReady=$false
    for($i=0;$i -lt 90;$i++){if(DockerReady){$dockerReady=$true;break};Start-Sleep -Seconds 2}
    if(-not $dockerReady){throw 'Docker did not become ready. Open Docker Desktop to inspect its startup error.'}
    Status 'Switch' 'Docker ready. Starting the existing Switch installation'
    $native=Join-Path $env:APPDATA 'switchdash\local-switch-server\native'
    if(-not(Healthy "$env:SWITCH_BASE_URL/health")){
        $pg=Get-Content "$native\run\postgres.json" | ConvertFrom-Json
        $ErrorActionPreference='Continue'
        & (Join-Path $pg.binDir 'pg_ctl.exe') status -D "$native\pgdata" *> $null
        if($LASTEXITCODE -ne 0){
            $pgStart=Start-Process (Join-Path $pg.binDir 'pg_ctl.exe') -ArgumentList @('start','-D',"`"$native\pgdata`"",'-l',"`"$stateDir\postgres.log`"",'-w') -WindowStyle Hidden -PassThru
            if(-not $pgStart.WaitForExit(60000)){throw 'Switch database startup timed out. Inspect postgres.log.'}
            if($pgStart.ExitCode -ne 0){throw 'Switch database could not start. Inspect postgres.log.'}
        }
        Status 'Switch' 'Database ready. Starting Mattermost container'
        & $docker compose -p switchdash-local-mattermost -f "$native\mattermost-compose.yml" up -d *> "$stateDir\mattermost-start.log"
        if($LASTEXITCODE -ne 0){throw 'Mattermost could not start. Inspect mattermost-start.log.'}
        $ErrorActionPreference='Stop'
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSScriptRoot\start-switch.ps1`"") -WindowStyle Hidden -RedirectStandardOutput "$stateDir\switch.out.log" -RedirectStandardError "$stateDir\switch.err.log"
        WaitHealthy "$env:SWITCH_BASE_URL/health" 'Switch' 120
    }
    Status 'API' 'Switch healthy. Starting FlowState service'
    if(-not(Healthy 'http://127.0.0.1:8000/api/v1/health')){
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSScriptRoot\start-api.ps1`"") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$stateDir\api.out.log" -RedirectStandardError "$stateDir\api.err.log"
        WaitHealthy 'http://127.0.0.1:8000/api/v1/health' 'FlowState API'
    }
    Status 'Room connection' 'API healthy. Connecting the configured Switch rooms'
    $headers=@{Authorization="Bearer $env:FLOWSTATE_API_TOKEN"}
    Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/switch/connect' -Method Post -Headers $headers -TimeoutSec 30 | Out-Null
    $connected=$false
    for($i=0;$i -lt 20;$i++){$s=Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/switch/status' -Headers $headers -TimeoutSec 3;if($s.status -eq 'connected'){$connected=$true;break};Start-Sleep -Seconds 1}
    if(-not $connected){throw 'Switch is reachable but room coverage was not acknowledged. Check the relay and room configuration.'}
    Status 'Ready' 'Services healthy. Opening your workspace.' $false $true
} catch {
    Status 'Needs attention' $_.Exception.Message $true
    if(-not $desktopStarted -and -not $ServicesOnly){
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("FlowState could not open: $($_.Exception.Message)`n`nDetails: $statePath",'FlowState startup') | Out-Null
    }
}
