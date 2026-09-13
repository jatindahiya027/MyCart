$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appRoot

Write-Host "Starting MyCart..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 18+ and npm are required. Install Node.js and run this script again." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
  npm install
}

$pythonBootstrap = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonBootstrap) {
  $pythonBootstrap = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $pythonBootstrap) {
  Write-Host "Python 3.10+ was not found. Install Python and run this script again." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

$venvPython = Join-Path $appRoot ".venv\Scripts\python.exe"
$venvScrapling = Join-Path $appRoot ".venv\Scripts\scrapling.exe"
$browserMarker = Join-Path $appRoot ".venv\.scrapling-browser-ready"

if (-not (Test-Path $venvPython)) {
  Write-Host "Creating the project Python environment..." -ForegroundColor Yellow
  & $pythonBootstrap.Source -m venv .venv
}

Write-Host "Checking Scrapling..." -ForegroundColor Yellow
& $venvPython -c "from scrapling.fetchers import Fetcher, StealthyFetcher" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $venvPython -m pip install -r requirements.txt
}

if (-not (Test-Path $browserMarker)) {
  Write-Host "Installing Scrapling's browser runtime..." -ForegroundColor Yellow
  & $venvScrapling install
  New-Item -ItemType File -Path $browserMarker -Force | Out-Null
}

if (Get-Command redis-cli -ErrorAction SilentlyContinue) {
  redis-cli ping 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0 -and (Get-Command redis-server -ErrorAction SilentlyContinue)) {
    Write-Host "Starting Redis..." -ForegroundColor Yellow
    Start-Process -WindowStyle Minimized redis-server
  }
}

Write-Host "Preparing database..." -ForegroundColor Yellow
node createdb.js

if (-not (Test-Path ".next/BUILD_ID")) {
  Write-Host "Building production app..." -ForegroundColor Yellow
  npm run build
}

Write-Host ""
Write-Host "MyCart will open at http://localhost:3027" -ForegroundColor Green
Write-Host "Keep this window open while using the app." -ForegroundColor DarkGray
Write-Host ""

npm run start
