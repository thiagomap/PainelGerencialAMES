# ============================================================
#  PUBLICAR PAINEL – Grupo Santa Casa de Franca
#  Execute este script todo mês após baixar os novos XLS
#  Uso: clique direito → "Executar com PowerShell"
# ============================================================

$BASE = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BASE

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  PUBLICAR PAINEL AMEs – Santa Casa de Franca" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Passo 1: Gerar dados frescos dos XLS
Write-Host "[1/3] Gerando dados dos arquivos XLS..." -ForegroundColor Yellow
node gerar-dados.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao gerar dados. Verifique os arquivos XLS." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}
Write-Host "     OK - dados-embutidos.js atualizado" -ForegroundColor Green

# Passo 2: Copiar arquivos para pasta deploy
Write-Host ""
Write-Host "[2/3] Preparando pasta deploy..." -ForegroundColor Yellow
Copy-Item "painel.html"       "deploy\painel.html"       -Force
Copy-Item "dados-embutidos.js" "deploy\dados-embutidos.js" -Force
Write-Host "     OK - 3 arquivos prontos em .\deploy\" -ForegroundColor Green

# Passo 3: Abrir Netlify Drop
Write-Host ""
Write-Host "[3/3] Abrindo Netlify para publicar..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  INSTRUÇÕES:" -ForegroundColor White
Write-Host "  1. O Netlify vai abrir no navegador" -ForegroundColor White
Write-Host "  2. Arraste a pasta  'deploy'  para a area indicada" -ForegroundColor White
Write-Host "     (a pasta fica em: $BASE\deploy)" -ForegroundColor Gray
Write-Host "  3. Aguarde o upload (segundos)" -ForegroundColor White
Write-Host "  4. Copie o link gerado (ex: https://nome-aleatório.netlify.app)" -ForegroundColor White
Write-Host ""
Write-Host "  Na primeira vez: crie conta grátis em netlify.com" -ForegroundColor Cyan
Write-Host "  para manter o mesmo link todo mês." -ForegroundColor Cyan
Write-Host ""

Start-Process "https://app.netlify.com/drop"

# Abrir o explorer na pasta deploy para facilitar o drag-and-drop
Start-Process explorer.exe "deploy"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Pasta 'deploy' aberta no Explorer." -ForegroundColor Green
Write-Host "  Arraste ela para o Netlify no navegador." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Pressione Enter para fechar"
