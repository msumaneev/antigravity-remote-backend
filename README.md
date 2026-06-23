# Antigravity Remote Backend

This is the backend server for the **Antigravity Remote** Android application. It acts as a seamless bridge between your local Antigravity AI and the remote mobile app.

With our latest update, the backend has been completely rewritten to interface directly with the Antigravity Language Server via its internal **RPC Protocol** over WebSockets, bringing a true native IDE experience to your mobile device.

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

### Exposing the server to the internet
Since this server runs locally on your PC, your phone needs a way to reach it.
We recommend using **Tailscale** for a secure, zero-config VPN:
1. Install Tailscale on your PC and your phone.
2. Log in with the same account.
3. Use your PC's Tailscale IP (e.g. `100.125.x.x`) in the Antigravity Remote Android App.

## New RPC Interaction System

The backend connects directly to the Antigravity Language Server (LS) exactly like the official IDE extension does:

1. **Auto-Discovery**: On startup, the backend automatically locates the running Language Server by inspecting local processes.
2. **Direct WebSocket RPC**: It establishes a direct, authenticated WebSocket connection to `ws://127.0.0.1:<port>/rpc`.
3. **Native Message Sending**: User messages from the mobile app are sent natively using the LS command `workspace.executeCommand("agent.userInput")`.
4. **Real-Time Streaming**: 
   - We subscribe to `agent.stateStream` to instantly push the agent's current status (Thinking, Executing, Error) to the mobile app.
   - We subscribe to `agent.cascadeStream` to sync the complete conversation history natively and in real-time, eliminating the need to parse local transcript files.

This provides an incredibly fast, robust, and lag-free experience.

## Features
- **True Native Sync**: Uses the official LS RPC for pixel-perfect sync of the conversation.
- **Real-time Status**: Watch the AI "think" and "execute tools" live on your phone.
- **Image Uploads**: Supports sending images from the phone's gallery directly to the AI.
- **Zero Config**: Automatically finds and connects to your local Antigravity Language Server securely.

## License
MIT License
