$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localEnvironment = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $localEnvironment) {
    Get-Content -LiteralPath $localEnvironment | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$' -and -not [Environment]::GetEnvironmentVariable($matches[1], 'Process')) {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
}
Set-Location (Join-Path $projectRoot 'services/api')
if (-not $env:FLOWSTATE_API_TOKEN) {
    $env:FLOWSTATE_API_TOKEN = & .venv/Scripts/python.exe -c 'import secrets; print(secrets.token_urlsafe(32))'
    Write-Host 'Session device token (paste into FlowState Settings):'
    Write-Host $env:FLOWSTATE_API_TOKEN
}
& .venv/Scripts/python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
& .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
