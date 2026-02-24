@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  LocaCar - Deploy Automatizado para Hostinger VPS
REM  Uso: deploy.bat [--full | --backend | --frontend | --watch]
REM ============================================================

set "DEPLOY_HOST=SEU_IP_VPS"
set "DEPLOY_USER=root"
set "DEPLOY_PATH=/opt/locacar"
set "DEPLOY_KEY=~/.ssh/hostinger_key"

REM Cores (ANSI)
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "CYAN=[96m"
set "RESET=[0m"

echo %CYAN%========================================%RESET%
echo %CYAN%  LocaCar - Deploy Script v1.0%RESET%
echo %CYAN%========================================%RESET%
echo.

REM Verifica argumento
set "MODE=%~1"
if "%MODE%"=="" set "MODE=--full"

if "%MODE%"=="--watch" goto :watch
if "%MODE%"=="--full" goto :full
if "%MODE%"=="--backend" goto :backend
if "%MODE%"=="--frontend" goto :frontend

echo %RED%Modo invalido: %MODE%%RESET%
echo Uso: deploy.bat [--full ^| --backend ^| --frontend ^| --watch]
goto :eof

REM ============================================================
:full
echo %YELLOW%[1/5] Build do Frontend...%RESET%
cd frontend
call npm run build
if errorlevel 1 (
    echo %RED%ERRO: Build do frontend falhou!%RESET%
    goto :eof
)
echo %GREEN%Frontend build OK%RESET%
cd ..

echo %YELLOW%[2/5] Enviando Backend via SSH...%RESET%
scp -i %DEPLOY_KEY% -r backend/src backend/package.json backend/package-lock.json %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_PATH%/backend/
if errorlevel 1 (
    echo %RED%ERRO: Falha ao enviar backend!%RESET%
    goto :eof
)
echo %GREEN%Backend enviado%RESET%

echo %YELLOW%[3/5] Enviando Frontend build...%RESET%
scp -i %DEPLOY_KEY% -r frontend/dist/* %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_PATH%/backend/public/
if errorlevel 1 (
    echo %RED%ERRO: Falha ao enviar frontend!%RESET%
    goto :eof
)
echo %GREEN%Frontend enviado%RESET%

echo %YELLOW%[4/5] Instalando dependencias no servidor...%RESET%
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH%/backend && npm ci --only=production"
if errorlevel 1 (
    echo %RED%ERRO: npm install falhou!%RESET%
    goto :eof
)
echo %GREEN%Dependencias OK%RESET%

echo %YELLOW%[5/5] Reiniciando servico...%RESET%
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH%/backend && pm2 restart locacar || pm2 start src/server.js --name locacar"
if errorlevel 1 (
    echo %RED%ERRO: Reinicio falhou!%RESET%
    goto :eof
)

echo.
echo %GREEN%========================================%RESET%
echo %GREEN%  DEPLOY COMPLETO COM SUCESSO!%RESET%
echo %GREEN%========================================%RESET%
echo.

REM Log
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "pm2 logs locacar --lines 5 --nostream"
goto :eof

REM ============================================================
:backend
echo %YELLOW%Deploy apenas do Backend...%RESET%
scp -i %DEPLOY_KEY% -r backend/src backend/package.json backend/package-lock.json %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_PATH%/backend/
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH%/backend && npm ci --only=production && pm2 restart locacar"
echo %GREEN%Backend deploy OK%RESET%
goto :eof

REM ============================================================
:frontend
echo %YELLOW%Deploy apenas do Frontend...%RESET%
cd frontend
call npm run build
cd ..
scp -i %DEPLOY_KEY% -r frontend/dist/* %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_PATH%/backend/public/
echo %GREEN%Frontend deploy OK%RESET%
goto :eof

REM ============================================================
:watch
echo %YELLOW%Modo WATCH ativado. Monitorando mudancas...%RESET%
echo (Pressione Ctrl+C para parar)
echo.

REM Usa npx chokidar-cli para monitorar mudanças
REM Instale: npm install -g chokidar-cli
npx chokidar-cli "backend/src/**/*" "frontend/src/**/*" -c "echo Mudanca detectada! & call deploy.bat --full" --initial false --debounce 5000
if errorlevel 1 (
    echo %RED%chokidar-cli nao encontrado. Instale: npm i -g chokidar-cli%RESET%
    echo Alternativa: use nodemon ou o GitHub Actions para deploy automatico.
)
goto :eof
