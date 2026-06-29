# 📡 Antigravity Remote Backend

**The native WebSocket bridge connecting your local Antigravity AI to the [Antigravity Remote Android App](https://play.google.com/store/apps/details?id=com.antigravity.remote) (currently in closed testing).**

Seamlessly interact with your Antigravity Language Server from your phone. Send messages, attach images, and watch the AI think and execute tools in real-time — all powered by a robust direct RPC connection.

> Built for **Antigravity 2.1.4**, which runs a single shared **hub** Language Server. The backend auto-detects the hub, authenticates, and streams the full conversation natively.
> 
> *Looking for a web dashboard? Check out [Antigravity Deck](https://github.com/tysonnbt/Antigravity-Deck).*
> *The Android app UI takes significant inspiration from the beautiful design of Antigravity Deck.*

---

## ✨ Feature Highlights

### 🚀 Direct RPC Interaction System
The backend connects directly to the Antigravity Language Server (LS) exactly like the official IDE extension does.

- **Auto-Discovery** — On startup, automatically locates the running Antigravity Language Server by inspecting local processes (detects port and CSRF token).
- **Native Message Sending** — User input from the mobile app is sent natively using the LS command `workspace.executeCommand("agent.userInput")`.

### 🔒 Security & Local Network Auto-Discovery
- **Local Network Auto-Discovery (NSD)** — The backend broadcasts its presence on the local network. The Android app automatically discovers available servers without manual IP entry.
- **Secure QR-Code Authentication** — Pairing a new device is done securely by scanning a dynamically generated QR code in the terminal. The backend validates requests using JWT tokens instead of relying solely on IP whitelists.
- **Auto-Roaming** — If the PC's local IP address changes or it connects via a VPN (like Tailscale), the app automatically pings all known IPs and seamlessly restores the connection.

### ⚡ Real-Time Streaming & Smart Loading
- **Live Status** — Subscribes to `agent.stateStream` to instantly push the agent's current status (Thinking, Executing, Error) to your phone.
- **Smart Chunk Loading** — Chat history loads extremely fast by rendering only 50 messages at a time. When scrolling up, older messages are loaded dynamically in chunks, ensuring the app remains snappy and never lags, even with a massive conversation history.
- **Instant History Sync** — Subscribes to `agent.cascadeStream` to sync the complete conversation natively in real-time, completely bypassing slow transcript parsing.
- **WebSocket Powered** — Maintains a persistent, lag-free connection between your PC and the mobile app.

### 🖥️ Admin Dashboard & Project Access Control
The backend includes a Web Admin Dashboard (accessible at `/admin`, restricted to `localhost` for security) for managing connected devices and restricting access permissions:
- **Device Management** — View all paired devices, pairing times, and their last seen status. Revoke device access with one click.
- **Project Isolation & Restrictions** — Assign specific devices or web clients to restricted projects (e.g., restricting a device to `"GB Project"`). The restricted device will only see that project's folder, file browser, and trajectories.
- **Access Control & Sandboxing** — Restricted devices/clients are automatically blocked from executing critical terminal commands (`KILL`, `START_AGENT`, or sending unassociated inputs) to ensure enterprise-grade security.

### 💬 Web Chat Client (Desktop Interface)
For desktop users (such as accountants or managers) who prefer working on a PC rather than a mobile app, the server exposes a beautiful, fully functional Web Chat Client (accessible at `/chat`):
- **Token-Based Security** — Users authorize securely using a permanent JWT token generated via the Admin Console. No numeric code matching is needed. The token is saved in `localStorage` for convenience.
- **Project Limitation Compliance** — If a token is restricted to a specific project, the Web Chat Client dynamically isolates the user to that project's context, folder contents, and trajectories.
- **Token Quota Monitoring** — A dedicated token status panel directly in the sidebar allows users to track their remaining token quotas in real-time.

### 📱 Mobile Integration
- **Image Uploads** — Supports sending images from your phone's gallery directly to the Antigravity cascade.
- **Remote Access** — Expose this server via Tailscale to control your local AI from anywhere in the world.

### 🔄 Self-Updating Server
- **One-Click Updates** — When the Android client connects, it compares the running backend version against the required target version. If the backend is outdated, a button with `(Update available: [new version])` is displayed in the app.
- **Detached Execution Lifecycle** — Tapping "Update" triggers an API call that spawns a detached platform-specific update script (`update.bat` / `update.sh`), terminates the WebSocket server, pulls the latest code from GitHub, installs packages, rebuilds the server, and automatically boots the new version.

### 🔔 Push Notifications Architecture
The application uses a **direct local connection** system for push notifications, bypassing external cloud messaging servers (like Google FCM or APNs):
- **WebSocket & Foreground Service** — To prevent Android from killing background tasks and terminating the connection, the mobile app runs a persistent Foreground Service that keeps a direct WebSocket connection active to your backend.
- **Isolated Status Tracking** — Agent statuses (`THINKING` / `IDLE`) are tracked independently for each conversation on both the backend and client. A sound notification is triggered only when a specific task transitions from running to the idle (`IDLE`) state.
- **Background Spam Filtering** — The app automatically filters out status updates from background subagents and auxiliary runs, ensuring notifications are sent only for the primary chats initiated by the user.
- **Hiding the Persistent Notification** — According to Android security rules, a Foreground Service must display a persistent notification in the status bar. You can easily hide it by going to the app's notification settings on your phone and disabling the **"Silent Connection Service"** category. This will keep your status bar clean while ensuring high-priority sound notifications for finished tasks continue to work normally.

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
