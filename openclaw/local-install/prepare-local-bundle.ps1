[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

$openClawDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $projectDirectory 'OpenClaw-Local-Updates'
}

$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$archive = "$output.zip"

if (Test-Path -LiteralPath $output) {
  throw "Output folder already exists: $output. Rename or remove that old bundle, or pass -OutputDirectory with a new folder."
}
if (Test-Path -LiteralPath $archive) {
  throw "Output archive already exists: $archive. Rename or remove it, or pass -OutputDirectory with a new folder."
}

$streamingSource = Join-Path $openClawDirectory 'skills/streaming-mode'
$gearSource = Join-Path $openClawDirectory 'widgets/gear-engine'

foreach ($required in @(
  (Join-Path $streamingSource 'SKILL.md'),
  (Join-Path $streamingSource 'scripts/install.mjs'),
  (Join-Path $gearSource 'scripts/install.mjs'),
  (Join-Path $gearSource 'plugin/openclaw.plugin.json')
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required source file is missing: $required"
  }
}

New-Item -ItemType Directory -Path $output | Out-Null
Copy-Item -LiteralPath $streamingSource -Destination (Join-Path $output 'streaming-mode') -Recurse

$gearOutput = Join-Path $output 'gear-engine'
New-Item -ItemType Directory -Path (Join-Path $gearOutput 'scripts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $gearSource 'plugin') -Destination (Join-Path $gearOutput 'plugin') -Recurse
Copy-Item -LiteralPath (Join-Path $gearSource 'scripts/install.mjs') -Destination (Join-Path $gearOutput 'scripts/install.mjs')
Copy-Item -LiteralPath (Join-Path $gearSource 'README.md') -Destination (Join-Path $gearOutput 'README.md')

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-local.sh') -Destination (Join-Path $output 'install-local.sh')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $output 'README.md')

$outputPrefix = $output.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$hashLines = Get-ChildItem -LiteralPath $output -File -Recurse |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($outputPrefix.Length).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), $hashLines, $utf8WithoutBom)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archiveStream = [System.IO.File]::Open($archive, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive(
  $archiveStream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)
try {
  Get-ChildItem -LiteralPath $output -File -Recurse |
    Sort-Object FullName |
    ForEach-Object {
      $relative = $_.FullName.Substring($outputPrefix.Length).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $_.FullName,
        $relative,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
} finally {
  $zip.Dispose()
  $archiveStream.Dispose()
}

Write-Host "Local Linux folder: $output"
Write-Host "Transfer archive:    $archive"
Write-Host 'Neither artifact needs GitHub or ClawHub during installation.'
