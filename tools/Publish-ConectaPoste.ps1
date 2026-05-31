param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$GitHubRepo = "Caiob-web/conecta-poste",
    [string]$GhExe = "C:\Users\Caio\Documents\Codex\2026-05-24\voc-um-agente-de-desenvolvimento-s\gh-cli\bin\gh.exe",
    [string]$InnoCompiler = "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
    [switch]$SkipInstall,
    [switch]$SkipGitHub
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$solution = Join-Path $root "ConectaPoste.Desktop.sln"
$project = Join-Path $root "ConectaPoste.Desktop\ConectaPoste.Desktop.csproj"
$installerScript = Join-Path $root "Installer\ConectaPoste.iss"
$installerExe = Join-Path $root "Installer\Output\ConectaPoste-Setup.exe"
$zipPackage = Join-Path $root "Installer\Output\ConectaPoste-Windows.zip"
$zipReadme = Join-Path $root "Installer\Output\LEIA-ME-ConectaPoste.txt"

[xml]$projectXml = Get-Content -LiteralPath $project
$version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Nao encontrei <Version> no projeto: $project"
}

Write-Host "==> Build $version"
dotnet build $solution -c $Configuration

Write-Host "==> Publish self-contained ($Runtime)"
dotnet publish $project -c $Configuration -r $Runtime --self-contained true

Write-Host "==> Gerando instalador Inno Setup"
& $InnoCompiler $installerScript

if (-not (Test-Path -LiteralPath $installerExe)) {
    throw "Instalador nao encontrado: $installerExe"
}

Write-Host "==> Gerando pacote ZIP para o portal"
@"
Conecta Poste Desktop

Versao: $version

1. Extraia este ZIP.
2. Execute ConectaPoste-Setup.exe.
3. O instalador criara atalhos no Menu Iniciar e na Area de Trabalho.

Requisitos: Windows com Microsoft Edge WebView2 Runtime.
"@ | Set-Content -LiteralPath $zipReadme -Encoding UTF8

if (Test-Path -LiteralPath $zipPackage) {
    Remove-Item -LiteralPath $zipPackage -Force
}

Compress-Archive -LiteralPath $installerExe, $zipReadme -DestinationPath $zipPackage -Force

if (-not $SkipInstall) {
    Write-Host "==> Instalando localmente"
    $running = Get-Process -Name "ConectaPoste.Desktop" -ErrorAction SilentlyContinue
    if ($running) {
        $running | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
    & $installerExe /VERYSILENT /NORESTART
}

if (-not $SkipGitHub) {
    if (-not (Test-Path -LiteralPath $GhExe)) {
        throw "GitHub CLI nao encontrado: $GhExe"
    }

    $tag = "desktop-v$version"
    $title = "Conecta Poste Desktop v$version"
    $notes = "Instalador Windows do Conecta Poste Desktop. Versao $version."

    Write-Host "==> Publicando GitHub Release $tag"
    & $GhExe release view $tag --repo $GitHubRepo *> $null
    if ($LASTEXITCODE -eq 0) {
        & $GhExe release upload $tag "$installerExe#ConectaPoste-Setup.exe" --repo $GitHubRepo --clobber
        & $GhExe release upload $tag "$zipPackage#ConectaPoste-Windows.zip" --repo $GitHubRepo --clobber
    } else {
        & $GhExe release create $tag "$installerExe#ConectaPoste-Setup.exe" "$zipPackage#ConectaPoste-Windows.zip" --repo $GitHubRepo --title $title --notes $notes --latest
    }
}

Write-Host "==> Concluido: $version"
Write-Host "Download EXE: https://github.com/$GitHubRepo/releases/latest/download/ConectaPoste-Setup.exe"
Write-Host "Download ZIP: https://github.com/$GitHubRepo/releases/latest/download/ConectaPoste-Windows.zip"
Write-Host "Portal: https://conecta-poste.vercel.app"
