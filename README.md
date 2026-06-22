# Antigravity Remote Backend

This is the backend server for the **Antigravity Remote** Android application. It acts as a bridge between your local Antigravity AI IDE and the remote mobile app. 

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

## Features
- **Real-time Sync**: Uses WebSockets to stream AI responses instantly to the phone.
- **Image Uploads**: Supports uploading images from the phone's gallery directly into the Antigravity chat context.
- **Direct Inbox Integration**: Seamlessly wakes up the Antigravity IDE when a message is received from the mobile app (no background watcher script needed!).

## License
MIT License
