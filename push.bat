@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   LocaCar - Push para Railway
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] npm install backend...
cd backend
call npm install
cd ..

echo.
echo [2/4] npm install frontend...
cd frontend
call npm install
cd ..

echo.
echo [3/4] git add + commit...
git add .
git commit -m "update %date% %time:~0,5%"

echo.
echo [4/4] git push...
git push

echo.
echo ========================================
echo   PUSH CONCLUIDO!
echo ========================================
echo.
pause
