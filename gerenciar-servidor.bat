@echo off
echo ============================================
echo  SERVIDOR GERENCIAL - GRUPO SANTA CASA
echo ============================================
echo.
echo  Status atual:
pm2 list
echo.
echo  Opcoes:
echo  [1] Ver status
echo  [2] Reiniciar servidor
echo  [3] Ver logs
echo  [4] Parar servidor
echo  [5] Sair
echo.
set /p opcao=Escolha:

if "%opcao%"=="1" pm2 list && pause
if "%opcao%"=="2" pm2 restart relatorio-gerencial && echo Reiniciado! && pause
if "%opcao%"=="3" pm2 logs relatorio-gerencial --lines 50
if "%opcao%"=="4" pm2 stop relatorio-gerencial && echo Parado! && pause
if "%opcao%"=="5" exit
