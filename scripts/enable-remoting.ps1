<#
.SYNOPSIS
    Enable PowerShell Remoting on the target server
.DESCRIPTION
    Run this on the TARGET SERVER (192.168.10.10) as Administrator
    to enable WinRM for remote deployment.
#>

# Enable PS Remoting
Enable-PSRemoting -Force -SkipNetworkProfileCheck

# Configure WinRM
Set-Item -Path WSMan:\localhost\Service\AllowUnencrypted -Value $true
Set-Item -Path WSMan:\localhost\Service\Auth\Basic -Value $true

# Add trusted hosts on the deploying machine (run this on YOUR machine)
# Set-Item -Path WSMan:\localhost\Client\TrustedHosts -Value "192.168.10.10" -Force

# Restart WinRM
Restart-Service WinRM

Write-Host "PS Remoting enabled successfully" -ForegroundColor Green
Write-Host "On your deploying machine, run:" -ForegroundColor Yellow
Write-Host '  Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.10.10" -Force' -ForegroundColor Cyan
