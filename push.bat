@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   LocaCar - Push para Railway
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] npm install no backend...
cd backend
call npm install
if errorlevel 1 (
    echo ERRO: npm install falhou!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] git add + commit...
git add .
git commit -m "update %date% %time:~0,5%"

echo.
echo [3/3] git push...
git push

echo.
echo ========================================
echo   PUSH CONCLUIDO!
echo   Aguarde o Railway fazer o deploy.
echo ========================================
echo.
pause
