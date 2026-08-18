# Genera AVENTA_CONTEXT.md con el codigo fuente del proyecto (sin secretos ni ruido).
# Uso (desde la raiz del repo):
#   powershell -ExecutionPolicy Bypass -File .\scripts\export-aventa-context.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$Output = Join-Path $Root "AVENTA_CONTEXT.md"

$ExcludeDirs = @(
    "node_modules",
    ".next",
    ".git",
    ".cursor",
    ".vscode",
    ".vercel",
    "dist",
    "build",
    "out",
    "coverage",
    ".turbo",
    ".cache",
    "archived"
)

$ExcludeFiles = @(
    "AVENTA_CONTEXT.md",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "tsconfig.tsbuildinfo"
)

$IncludeExtensions = @(
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".scss",
    ".json",
    ".md",
    ".mjs",
    ".cjs",
    ".sql"
)

function Test-IsExcludedPath {
    param([string]$FullPath)

    $normalized = $FullPath.Replace("/", "\")
    foreach ($dir in $ExcludeDirs) {
        if ($normalized -match ("[\\]" + [regex]::Escape($dir) + "[\\]")) {
            return $true
        }
        if ($normalized -match ("[\\]" + [regex]::Escape($dir) + "$")) {
            return $true
        }
    }
    return $false
}

Write-Host "Escaneando proyecto en: $Root"
Write-Host "Salida: $Output"
Write-Host ""

$files = @(Get-ChildItem -Path $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $name = $_.Name
        $ext = $_.Extension.ToLowerInvariant()

        ($IncludeExtensions -contains $ext) -and
        ($ExcludeFiles -notcontains $name) -and
        (-not (Test-IsExcludedPath $_.FullName)) -and
        (-not ($name -like ".env*" -and $name -ne ".env.example"))
    } |
    Sort-Object FullName)

$utf8 = New-Object System.Text.UTF8Encoding $false
$writer = New-Object System.IO.StreamWriter($Output, $false, $utf8)

try {
    $writer.WriteLine("# AVENTA - FULL PROJECT CONTEXT")
    $writer.WriteLine("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    $writer.WriteLine("Root: $Root")
    $writer.WriteLine("Files: $($files.Count)")
    $writer.WriteLine("")

    $count = 0
    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($Root.Path.Length).TrimStart("\", "/")

        $writer.WriteLine("==================================================")
        $writer.WriteLine("FILE: $relativePath")
        $writer.WriteLine("==================================================")
        $writer.WriteLine("")

        try {
            $content = [System.IO.File]::ReadAllText($file.FullName)
            $writer.WriteLine($content)
        }
        catch {
            $writer.WriteLine("[[ERROR leyendo archivo: $($_.Exception.Message)]]")
        }

        $writer.WriteLine("")
        $count++
        if ($count % 50 -eq 0) {
            Write-Host "  ... $count / $($files.Count) archivos"
        }
    }
}
finally {
    $writer.Close()
}

$sizeMB = [math]::Round((Get-Item $Output).Length / 1MB, 2)

Write-Host ""
Write-Host "=========================================="
Write-Host " AVENTA CONTEXT GENERADO"
Write-Host "=========================================="
Write-Host ""
Write-Host "Archivo : $Output"
Write-Host "Archivos: $count"
Write-Host "Tamano  : $sizeMB MB"
Write-Host ""
Write-Host "Excluido: node_modules, .next, .git, .env*, locks, builds, caches"
Write-Host ""
