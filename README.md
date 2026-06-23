# 📡 Antigravity Remote Backend

**The native WebSocket bridge connecting your local Antigravity AI to the [Antigravity Remote Android App](https://play.google.com/store/apps/details?id=com.antigravity.remote) (currently in closed testing).**

Seamlessly interact with your Antigravity Language Server from your phone. Send messages, attach images, and watch the AI think and execute tools in real-time — all powered by a robust direct RPC connection.

> Built for **Antigravity 2.1.4**, which runs a single shared **hub** Language Server. The backend auto-detects the hub, authenticates, and streams the full conversation natively.
> 
> *Looking for a web dashboard? Check out [Antigravity Deck](https://github.com/tysonnbt/Antigravity-Deck).*

---

## ✨ Feature Highlights

### 🚀 Direct RPC Interaction System
The backend connects directly to the Antigravity Language Server (LS) exactly like the official IDE extension does.

- **Auto-Discovery** — On startup, automatically locates the running Antigravity Language Server by inspecting local processes (detects port and CSRF token).
- **Native Message Sending** — User input from the mobile app is sent natively using the LS command `workspace.executeCommand("agent.userInput")`.
- **Zero Config** — Instantly connects to the local Antigravity LS securely without manual configuration.

### ⚡ Real-Time Streaming & Smart Loading
- **Live Status** — Subscribes to `agent.stateStream` to instantly push the agent's current status (Thinking, Executing, Error) to your phone.
- **Smart Chunk Loading** — Chat history loads extremely fast by rendering only 50 messages at a time. When scrolling up, older messages are loaded dynamically in chunks, ensuring the app remains snappy and never lags, even with a massive conversation history.
- **Instant History Sync** — Subscribes to `agent.cascadeStream` to sync the complete conversation natively in real-time, completely bypassing slow transcript parsing.
- **WebSocket Powered** — Maintains a persistent, lag-free connection between your PC and the mobile app.

### 📱 Mobile Integration
- **Image Uploads** — Supports sending images from your phone's gallery directly to the Antigravity cascade.
- **Remote Access** — Expose this server via Tailscale to control your local AI from anywhere in the world.

---

## 🛠️ Installation & Setup

### 1. Download & Build
```bash
git clone https://github.com/msumaneev/antigravity-remote-backend.git
cd antigravity-remote-backend
npm install
npm run build
```

### 2. Running the Server
**Option A: Manual Start**
```bash
npm start
```
*Server starts on port `8080` by default.*

**Option B: Autostart (Recommended)**
Keep the server running in the background using PM2:
```bash
npm install -g pm2
pm2 start npm --name "antigravity-remote" -- start
pm2 save
pm2 startup
```

### 3. Exposing to the Internet (Tailscale)
Since this server runs locally on your PC, your phone needs a secure way to reach it remotely.
1. Install **Tailscale** on both your PC and your phone.
2. Log in with the same account to create a secure mesh network.
3. Use your PC's Tailscale IP (e.g. `100.x.x.x`) in the Antigravity Remote Android App.

---

## 📄 License
MIT License
