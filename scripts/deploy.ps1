<#
.SYNOPSIS
    NCPL AttendEase - Deployment Script
.DESCRIPTION
    Deploys the AttendEase HR Attendance Management System to a target server.
    This script builds, packages, and deploys both frontend and backend.
.NOTES
    Run this script from the project root directory.
    Credentials should be provided via environment variables or secure prompts.
    DO NOT hardcode credentials in this file.
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ServerIP = "192.168.10.10",

    [Parameter(Mandatory=$false)]
    [int]$AppPort = 3000,

    [Parameter(Mandatory=$false)]
    [int]$ApiPort = 4000,

    [Parameter(Mandatory=$false)]
    [string]$DeployPath = "C:\NCPL-attend",

    [switch]$BuildOnly,
    [switch]$DeployOnly
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot | Split-Path -Parent

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NCPL-attend - Deployment Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: Build ----
if (-not $DeployOnly) {
    Write-Host "[1/6] Building Backend..." -ForegroundColor Yellow
    Push-Location "$RootDir\backend"
    npm ci --production
    Pop-Location

    Write-Host "[2/6] Building Frontend..." -ForegroundColor Yellow
    Push-Location "$RootDir\frontend"
    # Set production API URL
    $env:NEXT_PUBLIC_API_URL = "http://${ServerIP}:${ApiPort}/api"
    npm ci
    npm run build
    Pop-Location

    Write-Host "[3/6] Creating deployment package..." -ForegroundColor Yellow
    $PackageDir = "$RootDir\dist"
    if (Test-Path $PackageDir) { Remove-Item $PackageDir -Recurse -Force }
    New-Item -ItemType Directory -Path $PackageDir | Out-Null

    # Copy backend
    Copy-Item "$RootDir\backend\src" -Destination "$PackageDir\backend\src" -Recurse
    Copy-Item "$RootDir\backend\node_modules" -Destination "$PackageDir\backend\node_modules" -Recurse
    Copy-Item "$RootDir\backend\package.json" -Destination "$PackageDir\backend\package.json"

    # Copy frontend standalone build
    Copy-Item "$RootDir\frontend\.next\standalone" -Destination "$PackageDir\frontend" -Recurse
    Copy-Item "$RootDir\frontend\.next\static" -Destination "$PackageDir\frontend\.next\static" -Recurse
    Copy-Item "$RootDir\frontend\public" -Destination "$PackageDir\frontend\public" -Recurse

    # Copy database migrations
    Copy-Item "$RootDir\database" -Destination "$PackageDir\database" -Recurse

    # Copy ecosystem file for PM2
    Copy-Item "$RootDir\scripts\ecosystem.config.js" -Destination "$PackageDir\ecosystem.config.js"

    Write-Host "Build package created at: $PackageDir" -ForegroundColor Green
}

if ($BuildOnly) {
    Write-Host "`nBuild complete. Use -DeployOnly to deploy." -ForegroundColor Green
    exit 0
}

# ---- Step 2: Deploy ----
Write-Host ""
Write-Host "[4/6] Connecting to server..." -ForegroundColor Yellow

# Prompt for credentials securely
$cred = Get-Credential -Message "Enter credentials for $ServerIP"

# Test connection
$session = New-PSSession -ComputerName $ServerIP -Credential $cred -ErrorAction Stop
Write-Host "Connected to $ServerIP" -ForegroundColor Green

# ---- Step 3: Setup Server ----
Write-Host "[5/6] Setting up server environment..." -ForegroundColor Yellow

Invoke-Command -Session $session -ScriptBlock {
    param($DeployPath, $ApiPort, $AppPort)

    # Create deploy directory
    if (-not (Test-Path $DeployPath)) {
        New-Item -ItemType Directory -Path $DeployPath -Force | Out-Null
    }

    # Check Node.js
    $nodeExists = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeExists) {
        Write-Host "Installing Node.js..." -ForegroundColor Yellow
        # Download and install Node.js LTS
        $nodeInstaller = "$env:TEMP\node-setup.msi"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" -OutFile $nodeInstaller
        Start-Process msiexec.exe -ArgumentList "/i $nodeInstaller /qn" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        Write-Host "Node.js installed" -ForegroundColor Green
    } else {
        Write-Host "Node.js already installed: $(node --version)" -ForegroundColor Green
    }

    # Check PM2
    $pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-not $pm2Exists) {
        Write-Host "Installing PM2..." -ForegroundColor Yellow
        npm install -g pm2
        pm2 install pm2-windows-startup
    }

    # Open firewall ports
    $rules = Get-NetFirewallRule -DisplayName "NCPL-attend*" -ErrorAction SilentlyContinue
    if (-not $rules) {
        New-NetFirewallRule -DisplayName "NCPL-attend Frontend" -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow | Out-Null
        New-NetFirewallRule -DisplayName "NCPL-attend API" -Direction Inbound -Protocol TCP -LocalPort $ApiPort -Action Allow | Out-Null
        Write-Host "Firewall rules created" -ForegroundColor Green
    }
} -ArgumentList $DeployPath, $ApiPort, $AppPort

# ---- Step 4: Copy files ----
Write-Host "[6/6] Deploying application files..." -ForegroundColor Yellow

$PackageDir = "$RootDir\dist"
Copy-Item -Path "$PackageDir\*" -Destination $DeployPath -ToSession $session -Recurse -Force

# ---- Step 5: Configure and Start ----
Invoke-Command -Session $session -ScriptBlock {
    param($DeployPath, $ApiPort, $AppPort, $ServerIP)

    Set-Location $DeployPath

    # Create .env for backend if it doesn't exist
    $envPath = "$DeployPath\backend\.env"
    if (-not (Test-Path $envPath)) {
        @"
PORT=$ApiPort
NODE_ENV=production
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=attendease
PG_USER=postgres
PG_PASSWORD=CHANGE_ME
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=eSSL_DB
MSSQL_USER=sa
MSSQL_PASSWORD=CHANGE_ME
JWT_SECRET=$(New-Guid)-$(New-Guid)
JWT_REFRESH_SECRET=$(New-Guid)-$(New-Guid)
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
BIOMETRIC_DEVICE_SERIAL=JJA1244600336
BIOMETRIC_SYNC_INTERVAL_MINUTES=5
FRONTEND_URL=http://${ServerIP}:${AppPort}
"@ | Out-File -FilePath $envPath -Encoding UTF8
        Write-Host "Created .env file - PLEASE UPDATE DATABASE CREDENTIALS" -ForegroundColor Red
    }

    # Stop existing PM2 processes
    pm2 delete all 2>$null

    # Start with PM2
    pm2 start ecosystem.config.js
    pm2 save

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Deployment Complete!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Frontend: http://${ServerIP}:${AppPort}" -ForegroundColor Cyan
    Write-Host "  API:      http://${ServerIP}:${ApiPort}" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  IMPORTANT: Update $envPath with actual DB credentials" -ForegroundColor Yellow
    Write-Host "  Then run: pm2 restart all" -ForegroundColor Yellow
} -ArgumentList $DeployPath, $ApiPort, $AppPort, $ServerIP

Remove-PSSession $session
Write-Host "`nDeployment script completed." -ForegroundColor Green
