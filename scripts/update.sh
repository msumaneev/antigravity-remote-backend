#!/bin/bash
echo "Starting backend update process..."
sleep 3
git pull origin master || { echo "[ERROR] git pull failed. Aborting update."; exit 1; }
npm install
npm run build
echo "Restarting server..."
if command -v pm2 &> /dev/null; then
    pm2 restart "antigravity-remote"
else
    npm run start
fi
