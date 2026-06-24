@echo off
echo Starting backend update process...
timeout /t 3 /nobreak
git pull origin master
call npm install
call npm run build
echo Restarting server...
where pm2 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    pm2 restart "antigravity-remote"
) else (
    npm run start
)
