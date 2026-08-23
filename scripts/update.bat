@echo off
echo Starting backend update process...
ping 127.0.0.1 -n 4 > nul
git pull origin master
if %ERRORLEVEL% neq 0 (
    echo [ERROR] git pull failed or encountered conflicts. Aborting update.
    exit /b %ERRORLEVEL%
)
call npm install
call npm run build
echo Restarting server...
where pm2 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    pm2 restart "antigravity-remote"
) else (
    npm run start
)
