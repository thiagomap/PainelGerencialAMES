@echo off
REM ========================================
REM Inicia o Servidor HTTP do Dashboard GRID
REM ========================================

echo.
echo ========================================
echo  SERVIDOR HTTP GRID - DASHBOARD
echo ========================================
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERRO: Python não está instalado!
    echo.
    echo Instale Python em: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM Vai para o diretório correto
cd /d "%~dp0"

REM Inicia o servidor
echo 🚀 Iniciando servidor...
echo.
python servidor-http-grid.py

pause
