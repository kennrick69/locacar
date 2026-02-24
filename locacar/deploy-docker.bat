@echo off
REM ============================================================
REM  LocaCar - Deploy via Docker no VPS Hostinger
REM  Uso: deploy-docker.bat
REM ============================================================

set "DEPLOY_HOST=SEU_IP_VPS"
set "DEPLOY_USER=root"
set "DEPLOY_PATH=/opt/locacar"
set "DEPLOY_KEY=~/.ssh/hostinger_key"

echo [1/3] Enviando projeto para o servidor...
scp -i %DEPLOY_KEY% -r backend frontend docker-compose.yml .env %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_PATH%/
if errorlevel 1 (
    echo ERRO: Falha no envio!
    goto :eof
)

echo [2/3] Construindo e subindo containers...
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH% && docker compose down && docker compose up -d --build"
if errorlevel 1 (
    echo ERRO: Docker compose falhou!
    goto :eof
)

echo [3/3] Executando migracoes...
ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH% && docker compose exec backend node src/config/migrate.js"

echo.
echo === DEPLOY DOCKER COMPLETO! ===
echo.

ssh -i %DEPLOY_KEY% %DEPLOY_USER%@%DEPLOY_HOST% "cd %DEPLOY_PATH% && docker compose ps"
