# share.ps1 — start the Augmont webapp + a public Cloudflare tunnel, print the link.
# Run from PowerShell:  .\share.ps1
$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

# 1. (Re)start the web server on port 3000
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Seconds 1
Start-Process node -ArgumentList "server.js" -WindowStyle Hidden
Start-Sleep -Seconds 3

# 2. Start the public tunnel
Remove-Item tunnel.log, tunnel.out -ErrorAction SilentlyContinue
Start-Process -FilePath $cf -ArgumentList 'tunnel','--url','http://localhost:3000','--no-autoupdate' `
  -RedirectStandardError tunnel.log -RedirectStandardOutput tunnel.out -WindowStyle Hidden

# 3. Wait for and print the public URL
$url = $null
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 2
  $c = (Get-Content tunnel.log, tunnel.out -ErrorAction SilentlyContinue) -join "`n"
  if ($c -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $matches[0]; break }
}

Write-Host ""
Write-Host "===================================================="
if ($url) {
  Write-Host " Share link : $url"
} else {
  Write-Host " Tunnel URL not found - check tunnel.log"
}
$pw = (Select-String -Path ".env" -Pattern '^APP_PASSWORD=(.+)$').Matches.Groups[1].Value
Write-Host " Password   : $pw   (any username)"
Write-Host "===================================================="
Write-Host " Keep this window's processes running while teammates use it."
