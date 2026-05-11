param(
  [string]$Reason = "scheduled"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  python server.py --backup $Reason
} finally {
  Pop-Location
}
