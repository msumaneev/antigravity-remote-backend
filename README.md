# 📡 Antigravity Remote Backend

**The native WebSocket bridge connecting your local Antigravity AI to the [Antigravity Remote Android App](https://play.google.com/store/apps/details?id=com.antigravity.remote)**

Seamlessly interact with your Antigravity Language Server from your phone. Send messages, attach images, and watch the AI think and execute tools in real-time — all powered by a robust direct RPC connection.

> Built for **Antigravity 2.6.0**, which runs a single shared **hub** Language Server. The backend auto-detects the hub, authenticates, and streams the full conversation natively.

---

## ✨ Feature Highlights

### 🚀 Direct RPC Interaction System
The backend connects directly to the Antigravity Language Server (LS) exactly like the official IDE extension does.

- **Auto-Discovery** — On startup, automatically locates the running Antigravity Language Server by inspecting local processes (detects port and CSRF token).
- **Native Message Sending** — User input from the mobile app is sent natively using the LS command `workspace.executeCommand("agent.userInput")`.

### 🔒 Security & Firebase Auto-Discovery
- **Firebase Discovery** — The backend automatically updates its Cloudflare Tunnel URL in Firebase Realtime Database. The Android app fetches this URL on startup, completely eliminating the need for manual IP entry or local network restrictions.
- **Secure QR-Code Authentication** — Pairing a new device is done securely by scanning a dynamically generated QR code in the terminal. The backend validates requests using JWT tokens instead of relying solely on IP whitelists.
- **Auto-Roaming** — As the tunnel provides a stable public URL, the connection seamlessly persists whether you are on Wi-Fi or cellular data, without any VPN requirements.

### ⚡ Real-Time Streaming & Smart Loading
- **Live Status** — Subscribes to `agent.stateStream` to instantly push the agent's current status (Thinking, Executing, Error) to your phone.
- **Smart Chunk Loading** — Chat history loads extremely fast by rendering only 50 messages at a time. When scrolling up, older messages are loaded dynamically in chunks, ensuring the app remains snappy and never lags, even with a massive conversation history.
- **Instant History Sync** — Subscribes to `agent.cascadeStream` to sync the complete conversation natively in real-time, completely bypassing slow transcript parsing.
- **WebSocket Powered** — Maintains a persistent, lag-free connection between your PC and the mobile app.

### 🖥️ Admin Dashboard & Guest Access Management
The backend includes robust project sharing and access control features, manageable both via a local Web Admin Dashboard (accessible at `/admin`, restricted to `localhost` for security) and directly from the Android App's Access Management screen:
- **Guest Access (Project Sharing)** — Securely share specific projects with other users. Manage guest permissions directly from your phone.
- **Device Management** — View all paired devices, pairing times, and their last seen status. Revoke device access with one click.
- **Project Isolation & Restrictions** — Assign specific devices or web clients to restricted projects. A restricted guest device will only see that project's folder, file browser, and trajectories.
- **Access Control & Sandboxing** — Restricted devices/clients are automatically blocked from executing critical terminal commands (`KILL`, `START_AGENT`, or sending unassociated inputs).

### 💬 Web Chat Client (Desktop Interface)
For desktop users (such as accountants or managers) who prefer working on a PC rather than a mobile app, the server exposes a beautiful, fully functional Web Chat Client (accessible at `/chat`):
- **Token-Based Security** — Users authorize securely using a permanent JWT token generated via the Admin Console. No numeric code matching is needed. The token is saved in `localStorage` for convenience.
- **Project Limitation Compliance** — If a token is restricted to a specific project, the Web Chat Client dynamically isolates the user to that project's context, folder contents, and trajectories.
- **Token Quota Monitoring** — A dedicated token status panel directly in the sidebar allows users to track their remaining token quotas in real-time.

### 📱 Mobile Integration
- **Image Uploads** — Supports sending images from your phone's gallery directly to the Antigravity cascade.
- **Remote Access** — Securely exposed via Cloudflare Tunnels to control your local AI from anywhere in the world without port forwarding or VPNs.

### 🔄 Self-Updating Server & Fork Protection (v2.9.1+)
- **One-Click Updates** — When the Android client connects, it compares the running backend version against the required target version. If the backend is outdated, an `Update` button is displayed in the mobile app.
- **Safe Detached Execution** — Tapping "Update" triggers `/api/update-server`, spawning a detached platform-specific script (`update.bat` / `update.sh`) that verifies `git pull` status before rebuilding.
- **Race Condition Locking** — Prevents duplicate simultaneous updates from multiple paired devices.
- **Open-Source Fork Protection** — If you are actively developing your own custom fork or local modifications, you can disable remote auto-updates by setting `DISABLE_AUTO_UPDATE=true` in `.env`. Custom builds with `-custom`, `-dev`, `-fork` version tags are also automatically recognized by the app.

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
git clone https://github.com/figaro-develop/antigravity-remote-backend.git
cd antigravity-remote-backend
npm install
npm run build
```

### 2. Configuration (.env)
Create a `.env` file in the root directory:
```env
# Optional: Firebase Realtime Database for automatic URL discovery
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
FIREBASE_SECRET=your_firebase_secret_key

# Optional: Disable mobile 1-click updates (recommended for active fork development)
DISABLE_AUTO_UPDATE=false
```

### 3. Exposing to the Internet & Running (Cloudflare Tunnels)
Instead of relying on local IPs or VPNs, the server uses Cloudflare Tunnels to securely expose the connection to the internet.

To start the server and the tunnel simultaneously, run the included PowerShell script:
```powershell
.\start_tunnel.ps1
```
This script will:
1. Start the Node.js backend.
2. Launch a Cloudflare Tunnel (cloudflared).
3. Automatically publish the new public URL to Firebase.
4. Your Android app will discover the new URL instantly upon launch.

**Autostart (Recommended)**
You can configure Windows Task Scheduler or use PM2 to run `start_tunnel.ps1` automatically on boot to keep your backend permanently available.

---

## 📄 License
MIT License
