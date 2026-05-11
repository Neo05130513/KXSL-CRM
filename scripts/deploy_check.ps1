param(
  [string]$BaseUrl = "http://127.0.0.1:4173"
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")

function Test-Url {
  param(
    [string]$Path,
    [int[]]$ExpectedStatus,
    [string]$ExpectedContentType = ""
  )

  $status = $null
  $contentType = ""
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$base$Path" -TimeoutSec 10
    $status = [int]$response.StatusCode
    $contentType = [string]$response.Headers["Content-Type"]
  } catch {
    if (-not $_.Exception.Response) {
      throw
    }
    $status = [int]$_.Exception.Response.StatusCode
    $contentType = [string]$_.Exception.Response.Headers["Content-Type"]
  }

  $statusOk = $ExpectedStatus -contains $status
  $typeOk = -not $ExpectedContentType -or $contentType.Contains($ExpectedContentType)
  [PSCustomObject]@{
    Path = $Path
    Status = $status
    ContentType = $contentType
    Passed = $statusOk -and $typeOk
  }
}

$checks = @(
  Test-Url "/" @(200) "text/html"
  Test-Url "/api/health" @(200) "application/json"
  Test-Url "/api/bootstrap" @(401) "application/json"
  Test-Url "/manifest.webmanifest" @(200) "application/manifest+json"
  Test-Url "/service-worker.js" @(200) "javascript"
  Test-Url "/assets/icon-192.png" @(200) "image/png"
  Test-Url "/.env" @(404)
  Test-Url "/data/app.db" @(404)
  Test-Url "/.git/config" @(404)
)

$checks | Format-Table -AutoSize

if ($checks | Where-Object { -not $_.Passed }) {
  throw "Deployment check failed: $base"
}

Write-Host "Deployment check passed: $base"
