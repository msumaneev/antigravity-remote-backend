# Antigravity Remote Backend

This is the backend server for the **Antigravity Remote** Android application. It acts as a bridge between your local Antigravity AI and the remote mobile app. 

It exposes a REST API and a WebSocket server, allowing the mobile app to:
- Connect securely to your local machine
- Retrieve the active workspace and conversation transcripts
- Send user inputs (text and images) directly to the Antigravity AI
- Receive real-time push notifications and responses from the AI

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/msumaneev/antigravity-remote-backend.git
   cd antigravity-remote-backend
   ```

2. **Install dependencies:**
   Make sure you have Node.js installed.
   ```bash
   npm install
   ```

3. **Build the project:**
   The server is written in TypeScript. After downloading or making changes to the source code, you must build it:
   ```bash
   npm run build
   ```
   *Note: The backend automatically determines your Antigravity workspaces path (`.gemini/antigravity`) across Windows, macOS, or Linux, so no manual path configuration is required!*

## Running the Server

### Option 1: Manual Run
Start the server using:
```bash
npm start
```
The server will start on port `8080` by default.

### Option 2: Autostart (Recommended)
To keep the server running in the background and start automatically when your PC turns on, we recommend using PM2:

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start the backend:
   ```bash
   pm2 start npm --name "antigravity-remote" -- start
   ```
3. Save the process list so it respawns on boot:
   ```bash
   pm2 save
   pm2 startup
   ```
*(Follow the instructions PM2 prints in the terminal after running `pm2 startup` to complete the setup).*

### Exposing the server to the internet
Since this server runs locally on your PC, your phone needs a way to reach it.
We recommend using **Tailscale** for a secure, zero-config VPN:
1. Install Tailscale on your PC and your phone.
2. Log in with the same account.
3. Use your PC's Tailscale IP (e.g. `100.125.x.x`) in the Antigravity Remote Android App.

## How Message Delivery Works

The backend uses the native **AgentAPI** built into Antigravity to deliver messages directly to the AI agent:

1. On startup, the backend auto-discovers the running Antigravity Language Server (PID, CSRF token, HTTP port).
2. When the mobile app sends a message, the backend calls `language_server.exe agentapi send-message` to deliver it.
3. The Language Server **natively wakes up the agent** — no watcher scripts or polling required.

If Antigravity is not running, messages fall back to file-based delivery and will be processed when the app is opened.

You can check if the Language Server is available via the REST endpoint:
```
GET /api/ls-status
→ {"available": true, "pid": 16808, "port": 52268, "method": "agentapi"}
```

## Features
- **Real-time Sync**: Uses WebSockets to stream AI responses instantly to the phone.
- **Image Uploads**: Supports uploading images from the phone's gallery directly into the Antigravity chat context.
- **Native Agent Wakeup**: Uses AgentAPI to instantly wake up the Antigravity agent when a message arrives from the mobile app — no manual scripts needed.
- **Auto-Discovery**: Automatically finds the running Language Server on startup, no configuration required.

## License
MIT License
