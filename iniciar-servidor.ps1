# Script PowerShell para iniciar o Servidor HTTP do Dashboard GRID
# Execute: powershell -ExecutionPolicy Bypass -File iniciar-servidor.ps1

Write-Host "`n" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SERVIDOR HTTP GRID - DASHBOARD" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se Python está instalado
try {
    $python_version = python --version 2>&1
    Write-Host "✅ Python encontrado: $python_version" -ForegroundColor Green
} catch {
    Write-Host "❌ ERRO: Python não está instalado!" -ForegroundColor Red
    Write-Host "Instale em: https://www.python.org/downloads/" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Vai para o diretório correto
$script_dir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $script_dir

Write-Host ""
Write-Host "🚀 Iniciando servidor HTTP na rede interna..." -ForegroundColor Green
Write-Host ""

# Executa o servidor
python servidor-http-grid.py
