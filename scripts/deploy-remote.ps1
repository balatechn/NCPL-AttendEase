<#
.SYNOPSIS
    NCPL-attend — Direct PSRemoting Deployment
.DESCRIPTION
    Deploys NCPL-attend to a remote Windows server via PS Remoting.
    Copies source code, installs deps and builds on the server.
#>

param(
    [string]$ServerIP   = "192.168.10.10",
    [string]$DeployPath = "C:\NCPL-attend",
    [int]$ApiPort       = 4000,
    [int]$AppPort       = 3000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path -Parent

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  NCPL-attend — Remote Deployment"         -ForegroundColor Cyan
Write-Host "  Target: $ServerIP → $DeployPath"          -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── 1. Credentials ────────────────────────────────────────────
Write-Host "[1/7] Authenticating..." -ForegroundColor Yellow
$cred = Get-Credential -UserName "admin" -Message "Enter password for admin@$ServerIP"

# ── 2. Connect ────────────────────────────────────────────────
Write-Host "[2/7] Connecting to $ServerIP..." -ForegroundColor Yellow
try {
    $session = New-PSSession -ComputerName $ServerIP -Credential $cred -ErrorAction Stop
    Write-Host "  Connected." -ForegroundColor Green
} catch {
    Write-Host "  Failed to connect: $_" -ForegroundColor Red
    Write-Host "  Make sure WinRM is enabled on the server:  winrm quickconfig" -ForegroundColor Yellow
    Write-Host "  And this machine trusts the server:  Set-Item WSMan:\localhost\Client\TrustedHosts -Value '$ServerIP'" -ForegroundColor Yellow
    exit 1
}

# ── 3. Prepare server ────────────────────────────────────────
Write-Host "[3/7] Preparing server environment..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    param($DeployPath, $ApiPort, $AppPort)

    # Create directory
    if (-not (Test-Path $DeployPath)) {
        New-Item -ItemType Directory -Path $DeployPath -Force | Out-Null
    }
    New-Item -ItemType Directory -Path "$DeployPath\logs" -Force | Out-Null

    # Verify Node.js
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host "  Node.js $(node --version) found" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Node.js not installed on server!" -ForegroundColor Red
        Write-Host "  Install from https://nodejs.org/en/download/" -ForegroundColor Yellow
        throw "Node.js not found"
    }

    # Verify/install PM2
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-not $pm2) {
        Write-Host "  Installing PM2 globally..." -ForegroundColor Yellow
        npm install -g pm2
    }
    Write-Host "  PM2 ready" -ForegroundColor Green

    # Firewall rules
    $existing = Get-NetFirewallRule -DisplayName "NCPL-attend*" -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName "NCPL-attend Frontend" -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow | Out-Null
        New-NetFirewallRule -DisplayName "NCPL-attend API" -Direction Inbound -Protocol TCP -LocalPort $ApiPort -Action Allow | Out-Null
        Write-Host "  Firewall rules created (ports $AppPort, $ApiPort)" -ForegroundColor Green
    } else {
        Write-Host "  Firewall rules already exist" -ForegroundColor Green
    }
} -ArgumentList $DeployPath, $ApiPort, $AppPort

# ── 4. Package source (excluding node_modules) ───────────────
Write-Host "[4/7] Packaging source code..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\NCPL-attend-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Create a clean staging directory
$staging = "$env:TEMP\NCPL-attend-staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

# Copy source (no node_modules, no .next)
$excludeDirs = @("node_modules", ".next", "dist", ".git", "logs")
$sources = @("backend", "frontend", "database", "scripts")
foreach ($dir in $sources) {
    $src = Join-Path $ProjectRoot $dir
    if (Test-Path $src) {
        robocopy $src "$staging\$dir" /E /XD $excludeDirs /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    }
}
# Copy root package files
Copy-Item "$ProjectRoot\README.md" -Destination $staging -ErrorAction SilentlyContinue

# Copy ecosystem config to root level
Copy-Item "$ProjectRoot\scripts\ecosystem.config.js" -Destination "$staging\ecosystem.config.js"

Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  Package created: $zipSize MB" -ForegroundColor Green

Remove-Item $staging -Recurse -Force

# ── 5. Upload to server ──────────────────────────────────────
Write-Host "[5/7] Uploading to $ServerIP..." -ForegroundColor Yellow
Copy-Item -Path $zipPath -Destination "C:\NCPL-attend-deploy.zip" -ToSession $session -Force
Write-Host "  Upload complete" -ForegroundColor Green

# ── 6. Extract, install, build on server ──────────────────────
Write-Host "[6/7] Installing & building on server..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    param($DeployPath, $ApiPort, $AppPort, $ServerIP)

    # Stop existing PM2 processes
    pm2 stop NCPL-attend-api NCPL-attend-frontend 2>$null
    pm2 delete NCPL-attend-api NCPL-attend-frontend 2>$null

    # Extract
    $zipFile = "C:\NCPL-attend-deploy.zip"
    if (Test-Path "$DeployPath\backend") {
        # Preserve .env if it exists
        $envBackup = $null
        if (Test-Path "$DeployPath\backend\.env") {
            $envBackup = Get-Content "$DeployPath\backend\.env" -Raw
        }
    }

    Expand-Archive -Path $zipFile -DestinationPath $DeployPath -Force
    Remove-Item $zipFile -Force

    # Restore .env if backed up
    if ($envBackup) {
        $envBackup | Out-File -FilePath "$DeployPath\backend\.env" -Encoding UTF8 -NoNewline
        Write-Host "  Existing .env preserved" -ForegroundColor Green
    }

    # Install backend deps
    Write-Host "  Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location "$DeployPath\backend"
    npm ci --omit=dev 2>&1 | Select-Object -Last 3
    Write-Host "  Backend deps installed" -ForegroundColor Green

    # Install frontend deps & build
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location "$DeployPath\frontend"
    $env:NEXT_PUBLIC_API_URL = "http://${ServerIP}:${ApiPort}/api"
    npm ci 2>&1 | Select-Object -Last 3
    Write-Host "  Building frontend..." -ForegroundColor Yellow
    npm run build 2>&1 | Select-Object -Last 15
    Write-Host "  Frontend built" -ForegroundColor Green

    # Create .env if not exists
    $envPath = "$DeployPath\backend\.env"
    if (-not (Test-Path $envPath)) {
        $jwtSecret = [guid]::NewGuid().ToString() + "-" + [guid]::NewGuid().ToString()
        $refreshSecret = [guid]::NewGuid().ToString() + "-" + [guid]::NewGuid().ToString()
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
JWT_SECRET=$jwtSecret
JWT_REFRESH_SECRET=$refreshSecret
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
BIOMETRIC_DEVICE_SERIAL=JJA1244600336
BIOMETRIC_SYNC_INTERVAL_MINUTES=5
FRONTEND_URL=http://${ServerIP}:${AppPort}
"@ | Out-File -FilePath $envPath -Encoding UTF8
        Write-Host "  .env created — UPDATE DATABASE PASSWORDS!" -ForegroundColor Red
    }

    # Start with PM2
    Set-Location $DeployPath
    pm2 start ecosystem.config.js
    pm2 save

    Write-Host ""
    pm2 list

} -ArgumentList $DeployPath, $ApiPort, $AppPort, $ServerIP

# ── 7. Verify ────────────────────────────────────────────────
Write-Host "`n[7/7] Verifying deployment..." -ForegroundColor Yellow
$status = Invoke-Command -Session $session -ScriptBlock {
    param($ApiPort)
    Start-Sleep -Seconds 3
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 5
        return @{ Status = $resp.StatusCode; Body = $resp.Content }
    } catch {
        return @{ Status = "Error"; Body = $_.Exception.Message }
    }
} -ArgumentList $ApiPort

Remove-PSSession $session
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  NCPL-attend Deployment Complete!"       -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Frontend : http://${ServerIP}:${AppPort}" -ForegroundColor Cyan
Write-Host "  API      : http://${ServerIP}:${ApiPort}" -ForegroundColor Cyan
Write-Host "  Health   : $($status.Status)"              -ForegroundColor $(if($status.Status -eq 200){'Green'}else{'Red'})
Write-Host ""
if ($status.Status -ne 200) {
    Write-Host "  NOTE: API health check may fail until .env DB credentials are set." -ForegroundColor Yellow
    Write-Host "  On server, edit C:\NCPL-attend\backend\.env then: pm2 restart all" -ForegroundColor Yellow
}
Write-Host ""
