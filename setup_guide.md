# Antigravity Remote Backend — Deployment and Android App Connection Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Connecting the Android App](#connecting-the-android-app)
- [Windows Firewall Setup](#windows-firewall-setup)
- [Server Process Management](#server-process-management)
- [Common Errors and Solutions](#common-errors-and-solutions)

---

## Quick Start

```bash
cd /path/to/antigravity-remote-backend
npm install
npm run build
node dist/index.js
```

Upon startup, the server will output to the console:
```
=================================================
🚀 Antigravity Remote Backend is RUNNING
=================================================

📱 Enter these settings in your Android App:

   IP Address : <your IP>
   Port       : 8081

=================================================

🔑 PAIRING CODE: 418824
   (Enter this code in the Android App)
=================================================
```

> [!IMPORTANT]
> **The pairing code rotates every 5 minutes.** If the code is rejected, check the server logs for the current one.

---

## Connecting the Android App

### Step 1: Find the Server IP Address

The server automatically detects the IP. If you are using **Tailscale**, it will display the Tailscale IP (format `100.x.x.x`). Otherwise, it will show the local network IP.

### Step 2: Enter Settings in the App

In the Android app, on the connection screen, enter:
- **IP Address** — The IP shown in the server console
- **Port** — `8081` (default)

### Step 3: Enter the 6-digit Code

Enter the code displayed in the console and tap **Connect**.

---

## Windows Firewall Setup

> [!CAUTION]
> **This is a mandatory step!** Without it, the Android app will not be able to connect — you will get a `Connection failed: failed to connect after 5000ms` error.

### Open PowerShell as Administrator and run:

```powershell
New-NetFirewallRule -DisplayName "Antigravity Backend 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

### Verify the rule:

```powershell
Get-NetFirewallRule -DisplayName "Antigravity Backend 8081"
```

> [!NOTE]
> This rule only needs to be created **once** and persists after reboot. There is no need to run it again.

### If using Tailscale

Ensure that:
1. Tailscale is installed and connected on **both** devices (server + phone).
2. Both devices can see each other in the Tailscale Admin Console.
3. Tailscale ACL rules allow traffic between the devices.

---

## Server Process Management

### Recommended Method: Direct Run

```bash
node dist/index.js
```

### With PM2 (for automatic restarts)

```bash
# First launch
npx pm2 start dist/index.js --name "antigravity-backend"

# View logs (including pairing code)
npx pm2 logs antigravity-backend --nostream --lines 50

# Restart after changes
npm run build
npx pm2 restart antigravity-backend

# Stop
npx pm2 stop antigravity-backend
```

> [!WARNING]
> **PM2 on Windows can be unstable.** The PM2 daemon might "die" between command calls. If `npx pm2 status` shows an empty table, the daemon restarted and lost the process. In this case, use the direct run method instead.

### Viewing PM2 Logs Directly

If `npx pm2 logs` does not display data, the logs are stored in:
```
%USERPROFILE%\.pm2\logs\antigravity-backend-out.log   # stdout
%USERPROFILE%\.pm2\logs\antigravity-backend-error.log  # stderr
```

---

## Common Errors and Solutions

### ❌ `Connection failed: failed to connect after 5000ms`

**Cause:** The phone cannot reach the server.

**Solutions (check in order):**

1. **Windows Firewall** — The most common cause. [Add the firewall rule](#windows-firewall-setup).

2. **Server is not running** — Check with:
   ```powershell
   netstat -ano | Select-String ":8081"
   ```
   If there is no row with `LISTENING`, the server is not listening on the port.

3. **Port is used by another process** — See [EADDRINUSE](#-error-listen-eaddrinuse-address-already-in-use-00008081).

4. **Different networks** — If using Tailscale, ensure both devices are connected. If using a local network, the phone and server must be on the same Wi-Fi.

---

### ❌ `401 Unauthorized` / `Invalid or expired pairing code`

**Cause:** The pairing code does not match.

**Solutions:**

1. **Code expired** — It rotates every 5 minutes. Find the current code in the logs:
   ```powershell
   # Direct run — code is in the console
   # PM2 — code is in the logs:
   Select-String "PAIRING CODE" "$env:USERPROFILE\.pm2\logs\antigravity-backend-out.log" | Select-Object -Last 1
   ```

2. **Old code version is running** — If the `/api/pair` endpoint is missing, the server returns 404. Rebuild:
   ```bash
   npm run build
   ```

---

### ❌ `404 Not Found`

**Cause:** The `/api/pair` route is not registered on the server.

**Solution:**
```bash
git pull origin master
npm install
npm run build
# Restart the server
```

---

### ❌ `Error: listen EADDRINUSE: address already in use 0.0.0.0:8081`

**Cause:** Port 8081 is already occupied by another process.

**Solution:**

1. Find the process occupying the port:
   ```powershell
   netstat -ano | Select-String ":8081"
   # Note the PID from the last column (e.g., 16672)
   ```

2. Check what process it is:
   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = 16672" | Select-Object ProcessId, CommandLine
   ```

3. Kill it:
   ```powershell
   Stop-Process -Id 16672 -Force
   ```

4. **Check for watchdog scripts!** Sometimes a PowerShell watchdog is running on the server, automatically restarting the old version:
   ```powershell
   # Find watchdog processes
   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "while.*node" } | Select-Object ProcessId, CommandLine
   ```
   Kill them too, otherwise the old process will resurrect.

> [!WARNING]
> **Watchdog + PM2 = conflict!** If a watchdog script is configured on the server (`while ($true) { node dist/index.js; ... }`), and you are using PM2 at the same time, they will compete for port 8081. Use **only one** of them.

---

### ❌ WebSocket connects, but data doesn't load

Check the server logs for errors:
```powershell
# PM2
Get-Content "$env:USERPROFILE\.pm2\logs\antigravity-backend-error.log" -Tail 50

# Or direct run — errors are output to the console
```

---

## Environment Variables (.env)

The `.env` file is located in the project root. Key variables:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `8081` |
| `HOST` | Bind address | `0.0.0.0` |
| `JWT_SECRET` | Secret for signing JWT tokens | Auto-generated |
| `ADMIN_LOGIN` | Admin login | — |
| `ADMIN_PASSWORD` | Admin password | — |

---

## Pre-launch Checklist

- [ ] `npm install` executed
- [ ] `npm run build` executed without errors
- [ ] Firewall rule for port 8081 created
- [ ] `.env` file configured (or using defaults)
- [ ] No other processes on port 8081 (`netstat -ano | Select-String ":8081"`)
- [ ] No conflicting watchdog scripts
- [ ] Tailscale connected on both devices (if used)
