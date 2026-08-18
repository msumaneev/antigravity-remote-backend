export function getAdminHtml(qrDataUrl: string, pairingToken: string, cloudflareUrl: string, serverId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Remote - Admin Console</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: #1e293b;
            --card-bg-subtle: #182234;
            --card-border: rgba(255, 255, 255, 0.08);
            --card-border-hover: rgba(99, 102, 241, 0.3);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent-primary: #6366f1;
            --accent-primary-hover: #4f46e5;
            --accent-gradient: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
            --accent-emerald: #10b981;
            --accent-emerald-hover: #059669;
            --accent-rose: #f43f5e;
            --accent-rose-hover: #e11d48;
            --accent-amber: #f59e0b;
            --border-radius-lg: 16px;
            --border-radius-md: 10px;
            --border-radius-sm: 6px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 2rem 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .layout-container {
            width: 100%;
            max-width: 1200px;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        /* --- Header --- */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--card-border);
        }

        .header-title-group h1 {
            font-size: 1.85rem;
            font-weight: 800;
            background: linear-gradient(135deg, #818cf8 0%, #34d399 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .header-title-group p {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 0.25rem;
        }

        .header-badges {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.4rem 0.8rem;
            border-radius: 9999px;
            font-size: 0.8rem;
            font-weight: 600;
            background: rgba(16, 185, 129, 0.1);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #34d399;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
        }

        /* --- Main Grid --- */
        .dashboard-grid {
            display: grid;
            grid-template-columns: 360px 1fr;
            gap: 1.5rem;
        }

        @media (max-width: 960px) {
            .dashboard-grid {
                grid-template-columns: 1fr;
            }
        }

        .left-column, .right-column {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        /* --- Card Styles --- */
        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-lg);
            padding: 1.5rem;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            gap: 1rem;
            transition: border-color 0.2s;
        }

        .card:hover {
            border-color: var(--card-border-hover);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--card-border);
        }

        .card-header h2 {
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .count-badge {
            background: rgba(99, 102, 241, 0.15);
            color: #a5b4fc;
            padding: 0.2rem 0.6rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 700;
        }

        /* --- QR Card Specifics --- */
        .qr-wrapper {
            background: white;
            padding: 1rem;
            border-radius: var(--border-radius-md);
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0.5rem auto;
            width: fit-content;
        }

        .qr-wrapper img {
            display: block;
            width: 170px;
            height: 170px;
        }

        .qr-info {
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-secondary);
            line-height: 1.45;
        }

        .meta-pill {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--card-bg-subtle);
            padding: 0.5rem 0.75rem;
            border-radius: var(--border-radius-sm);
            font-size: 0.75rem;
            color: var(--text-muted);
            border: 1px solid var(--card-border);
        }

        .meta-pill code {
            color: #a5b4fc;
            font-family: monospace;
            word-break: break-all;
        }

        /* --- Form Elements --- */
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }

        label {
            font-size: 0.825rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        input[type="text"] {
            background: var(--card-bg-subtle);
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-sm);
            padding: 0.7rem 0.9rem;
            font-size: 0.9rem;
            color: var(--text-primary);
            outline: none;
            transition: all 0.2s;
            font-family: inherit;
        }

        input[type="text"]:focus {
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        /* --- Project Selection Container --- */
        .projects-picker {
            background: var(--card-bg-subtle);
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-sm);
            padding: 0.75rem;
            max-height: 180px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .checkbox-row {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 0.85rem;
            color: var(--text-primary);
            cursor: pointer;
            user-select: none;
            padding: 0.25rem 0.4rem;
            border-radius: 4px;
            transition: background 0.15s;
        }

        .checkbox-row:hover {
            background: rgba(255, 255, 255, 0.04);
        }

        .checkbox-row input[type="checkbox"] {
            accent-color: var(--accent-primary);
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .project-path-sub {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-left: auto;
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* --- Buttons --- */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.65rem 1.1rem;
            border-radius: var(--border-radius-sm);
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            font-family: inherit;
        }

        .btn-primary {
            background: var(--accent-gradient);
            color: white;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .btn-primary:hover {
            opacity: 0.95;
            transform: translateY(-1px);
        }

        .btn-success {
            background: var(--accent-emerald);
            color: white;
        }

        .btn-success:hover {
            background: var(--accent-emerald-hover);
        }

        .btn-danger {
            background: var(--accent-rose);
            color: white;
        }

        .btn-danger:hover {
            background: var(--accent-rose-hover);
        }

        .btn-secondary {
            background: var(--card-bg-subtle);
            color: var(--text-primary);
            border: 1px solid var(--card-border);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .btn-sm {
            padding: 0.35rem 0.65rem;
            font-size: 0.78rem;
        }

        /* --- Invite Output Result --- */
        .invite-result-box {
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: var(--border-radius-sm);
            padding: 0.85rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .invite-url-row {
            display: flex;
            gap: 0.5rem;
        }

        .invite-url-input {
            flex: 1;
            background: #0f172a;
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-sm);
            padding: 0.5rem 0.75rem;
            font-family: monospace;
            font-size: 0.8rem;
            color: #818cf8;
            outline: none;
        }

        /* --- Lists & Tables --- */
        .list-container {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .empty-state {
            padding: 2rem 1rem;
            text-align: center;
            color: var(--text-muted);
            font-size: 0.875rem;
            border: 1px dashed var(--card-border);
            border-radius: var(--border-radius-sm);
        }

        .item-card {
            background: var(--card-bg-subtle);
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-sm);
            padding: 0.85rem 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            transition: all 0.2s;
        }

        .item-card:hover {
            border-color: rgba(255, 255, 255, 0.15);
            background: rgba(30, 41, 59, 0.8);
        }

        .item-info {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            min-width: 0;
        }

        .item-title-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .item-name {
            font-weight: 700;
            font-size: 0.95rem;
            color: var(--text-primary);
        }

        .item-sub {
            font-size: 0.78rem;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .item-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
        }

        /* --- Badges --- */
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 0.18rem 0.5rem;
            border-radius: 4px;
            font-size: 0.72rem;
            font-weight: 600;
        }

        .badge-admin {
            background: rgba(129, 140, 248, 0.15);
            color: #818cf8;
            border: 1px solid rgba(129, 140, 248, 0.3);
        }

        .badge-guest {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .badge-proj {
            background: rgba(255, 255, 255, 0.07);
            color: #cbd5e1;
            border: 1px solid var(--card-border);
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .badge-all {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        /* --- Modal --- */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-lg);
            padding: 1.75rem;
            max-width: 500px;
            width: 90%;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
            animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h3 {
            font-size: 1.15rem;
            color: var(--text-primary);
        }

        .modal-close {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 1.25rem;
            cursor: pointer;
        }

        .modal-close:hover {
            color: var(--text-primary);
        }

        /* --- Toast Notification --- */
        .toast-container {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            z-index: 9999;
        }

        .toast {
            background: #1e293b;
            color: #f8fafc;
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-sm);
            padding: 0.75rem 1.25rem;
            font-size: 0.85rem;
            font-weight: 500;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            animation: toastIn 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .toast.success {
            border-left: 4px solid var(--accent-emerald);
        }

        .toast.error {
            border-left: 4px solid var(--accent-rose);
        }

        @keyframes toastIn {
            from { opacity: 0; transform: translateX(20px); }
            to { opacity: 1; transform: translateX(0); }
        }
    </style>
</head>
<body>
    <div class="layout-container" data-pairing-token="${pairingToken}">
        <!-- Header -->
        <header>
            <div class="header-title-group">
                <h1>Antigravity Remote</h1>
                <p>Admin Management &amp; Device Access Control Console</p>
            </div>
            <div class="header-badges">
                <div class="status-badge">
                    <span class="status-dot"></span>
                    <span>Server Online</span>
                </div>
                <a href="/chat" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration: none;">
                    Web Chat ↗
                </a>
            </div>
        </header>

        <!-- Main Dashboard Grid -->
        <div class="dashboard-grid">
            <!-- Left Column: Admin Pairing QR + Server Info -->
            <div class="left-column">
                <!-- QR Code Card -->
                <div class="card">
                    <div class="card-header">
                        <h2>📱 Admin Pairing</h2>
                    </div>
                    <div class="qr-wrapper">
                        <img src="${qrDataUrl}" alt="Admin Pairing QR Code" />
                    </div>
                    <p class="qr-info">
                        Open the <strong>Antigravity Remote</strong> app on your Android device, tap <strong>Scan QR</strong>, and scan this code to link as Administrator.
                    </p>
                    <div class="meta-pill">
                        <span>Active Cloudflare URL:</span>
                        <code id="cf-url-display">${cloudflareUrl || 'Direct / Localhost'}</code>
                    </div>
                    <div class="meta-pill">
                        <span>Server ID:</span>
                        <code>${serverId || 'Default'}</code>
                    </div>
                </div>

                <!-- Pro Upgrade Banner -->
                <div class="card" style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(49, 46, 129, 0.3) 100%);">
                    <div class="card-header">
                        <h2>⭐ Pro License</h2>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-secondary); line-height: 1.45;">
                        Unlock unlimited servers and full remote management. One license covers up to 3 mobile devices.
                    </p>
                    <a href="https://antigravity-remote.lemonsqueezy.com/checkout/buy/04aec57c-1e98-4ddf-a075-1d85cb162953" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;">
                        Get Pro License Key
                    </a>
                </div>
            </div>

            <!-- Right Column: Invites, Pending Requests, Connected Devices -->
            <div class="right-column">
                <!-- Section 1: Create Invite Link -->
                <div class="card">
                    <div class="card-header">
                        <h2>🔗 Create Invite Link</h2>
                    </div>
                    <div class="form-group">
                        <label for="invite-name-input">Guest Name / Description (Optional)</label>
                        <input type="text" id="invite-name-input" placeholder="e.g. Alex, Mobile Test Device" />
                    </div>

                    <div class="form-group">
                        <label>Allowed Projects</label>
                        <div class="projects-picker">
                            <label class="checkbox-row" style="border-bottom: 1px solid var(--card-border); padding-bottom: 0.4rem; font-weight: 600;">
                                <input type="checkbox" id="invite-all-projects" checked />
                                <span>All Projects (*)</span>
                            </label>
                            <div id="invite-projects-list" style="display: flex; flex-direction: column; gap: 0.3rem;">
                                <!-- Dynamic checkboxes injected via JS -->
                                <span style="font-size: 0.75rem; color: var(--text-muted);">Loading projects...</span>
                            </div>
                        </div>
                    </div>

                    <button class="btn btn-primary" id="btn-generate-invite">
                        Generate Invite Link
                    </button>

                    <!-- Result container -->
                    <div id="invite-result-box" class="invite-result-box" style="display: none;">
                        <div style="font-size: 0.8rem; font-weight: 600; color: #a5b4fc;">
                            Invite Link Ready:
                        </div>
                        <div class="invite-url-row">
                            <input type="text" id="invite-url-output" class="invite-url-input" readonly />
                            <button class="btn btn-success btn-sm" id="btn-copy-invite">Copy</button>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">
                            Send this link to your guest. When they open it and submit their name, you can approve their access below.
                        </div>
                    </div>
                </div>

                <!-- Section 2: Pending Requests -->
                <div class="card">
                    <div class="card-header">
                        <h2>
                            ⏳ Pending Requests
                            <span class="count-badge" id="pending-count">0</span>
                        </h2>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Live updates (3s)</span>
                    </div>

                    <div id="pending-list" class="list-container">
                        <div class="empty-state">No pending requests at the moment.</div>
                    </div>
                </div>

                <!-- Section 3: Connected Devices & Guests -->
                <div class="card">
                    <div class="card-header">
                        <h2>
                            👥 Connected Devices &amp; Guests
                            <span class="count-badge" id="devices-count">0</span>
                        </h2>
                        <button class="btn btn-secondary btn-sm" id="btn-refresh-devices">Refresh</button>
                    </div>

                    <div id="devices-list" class="list-container">
                        <div class="empty-state">Loading connected devices...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Access Modal -->
    <div class="modal-overlay" id="edit-modal">
        <div class="modal">
            <div class="modal-header">
                <h3 id="modal-device-name">Edit Device Access</h3>
                <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <div class="form-group">
                <label>Allowed Projects</label>
                <div class="projects-picker" style="max-height: 240px;">
                    <label class="checkbox-row" style="border-bottom: 1px solid var(--card-border); padding-bottom: 0.4rem; font-weight: 600;">
                        <input type="checkbox" id="modal-all-projects" />
                        <span>All Projects (*)</span>
                    </label>
                    <div id="modal-projects-list" style="display: flex; flex-direction: column; gap: 0.3rem;">
                        <!-- Checkboxes for editing access -->
                    </div>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancel</button>
                <button class="btn btn-primary btn-sm" id="modal-save-btn">Save Changes</button>
            </div>
        </div>
    </div>

    <!-- Toast Notifications Container -->
    <div class="toast-container" id="toast-container"></div>

    <!-- Client Application Logic -->
    <script>
        // State
        let allProjects = [];
        let connectedDevices = [];
        let pendingInvites = [];
        let currentEditDeviceId = null;

        // Utility: HTML Escaping
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Utility: Toast notifications
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.innerText = message;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Utility: Format relative time
        function formatTime(timestamp) {
            if (!timestamp) return 'Never';
            const diff = Date.now() - Number(timestamp);
            const seconds = Math.floor(diff / 1000);
            if (seconds < 60) return 'Just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return minutes + 'm ago';
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return hours + 'h ago';
            const days = Math.floor(hours / 24);
            return days + 'd ago';
        }

        // Utility: Safe parse project IDs
        function parseProjectIds(raw) {
            if (!raw) return null;
            if (Array.isArray(raw)) return raw;
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
                return [parsed];
            } catch (e) {
                return [raw];
            }
        }

        // Format project tags
        function renderProjectTags(projectIds) {
            const parsed = parseProjectIds(projectIds);
            if (!parsed || (parsed.length === 1 && parsed[0] === '*')) {
                return '<span class="badge badge-all">All Projects (*)</span>';
            }
            if (parsed.length === 0) {
                return '<span class="badge badge-guest">No Projects</span>';
            }
            return parsed.map(id => {
                const found = allProjects.find(p => p.id === id || p.name === id || p.projectName === id);
                const title = found ? (found.name || found.projectName || id) : id;
                return '<span class="badge badge-proj" title="' + escapeHtml(id) + '">' + escapeHtml(title) + '</span>';
            }).join(' ');
        }

        // 1. Fetch and render projects list for forms
        async function loadProjects() {
            try {
                const res = await fetch('/api/projects');
                if (res.ok) {
                    allProjects = await res.json();
                    renderProjectCheckboxes();
                }
            } catch (e) {
                console.error('Failed to load projects:', e);
            }
        }

        function renderProjectCheckboxes() {
            const container = document.getElementById('invite-projects-list');
            if (!container) return;

            if (!allProjects || allProjects.length === 0) {
                container.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">No active projects found</span>';
                return;
            }

            container.innerHTML = allProjects.map(proj => {
                const displayName = proj.name || proj.projectName || proj.id;
                const pathSnippet = proj.projectPath || '';
                return \`
                    <label class="checkbox-row">
                        <input type="checkbox" class="invite-proj-cb" value="\${escapeHtml(proj.id)}" />
                        <span>\${escapeHtml(displayName)}</span>
                        <span class="project-path-sub">\${escapeHtml(pathSnippet)}</span>
                    </label>
                \`;
            }).join('');

            // When individual checkbox is checked, uncheck "All Projects"
            const allCb = document.getElementById('invite-all-projects');
            const individualCbs = container.querySelectorAll('.invite-proj-cb');

            allCb.addEventListener('change', () => {
                if (allCb.checked) {
                    individualCbs.forEach(cb => cb.checked = false);
                }
            });

            individualCbs.forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        allCb.checked = false;
                    }
                });
            });
        }

        // 2. Generate Invite Link
        const btnGenerate = document.getElementById('btn-generate-invite');
        const inviteNameInput = document.getElementById('invite-name-input');
        const inviteResultBox = document.getElementById('invite-result-box');
        const inviteUrlOutput = document.getElementById('invite-url-output');
        const btnCopyInvite = document.getElementById('btn-copy-invite');

        btnGenerate.addEventListener('click', async () => {
            try {
                btnGenerate.disabled = true;
                btnGenerate.innerText = 'Generating...';

                const name = inviteNameInput.value.trim() || 'Guest';
                const allCb = document.getElementById('invite-all-projects');
                const checked = Array.from(document.querySelectorAll('.invite-proj-cb:checked')).map(cb => cb.value);

                let allowedProjectIds = null;
                if (allCb && allCb.checked) {
                    allowedProjectIds = ['*'];
                } else if (checked.length > 0) {
                    allowedProjectIds = checked;
                } else {
                    allowedProjectIds = ['*'];
                }

                const res = await fetch('/api/admin/invite/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, allowedProjectIds })
                });

                if (!res.ok) {
                    throw new Error('Server returned ' + res.status);
                }

                const data = await res.json();
                inviteUrlOutput.value = data.inviteUrl || window.location.origin + '/invite/' + data.token;
                inviteResultBox.style.display = 'flex';
                showToast('Invite link created successfully!');
            } catch (err) {
                console.error(err);
                showToast('Failed to create invite link: ' + err.message, 'error');
            } finally {
                btnGenerate.disabled = false;
                btnGenerate.innerText = 'Generate Invite Link';
            }
        });

        // Copy button
        btnCopyInvite.addEventListener('click', () => {
            const url = inviteUrlOutput.value;
            if (!url) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => {
                    btnCopyInvite.innerText = '✓ Copied!';
                    setTimeout(() => btnCopyInvite.innerText = 'Copy', 2000);
                    showToast('Copied to clipboard!');
                }).catch(() => fallbackCopy(url));
            } else {
                fallbackCopy(url);
            }
        });

        function fallbackCopy(text) {
            inviteUrlOutput.select();
            document.execCommand('copy');
            btnCopyInvite.innerText = '✓ Copied!';
            setTimeout(() => btnCopyInvite.innerText = 'Copy', 2000);
            showToast('Copied to clipboard!');
        }

        // 3. Pending Requests Handling
        async function loadPendingInvites() {
            try {
                const res = await fetch('/api/admin/invites/pending');
                if (res.ok) {
                    pendingInvites = await res.json();
                    renderPendingInvites();
                }
            } catch (e) {
                console.error('Failed to load pending invites:', e);
            }
        }

        function renderPendingInvites() {
            const countBadge = document.getElementById('pending-count');
            const container = document.getElementById('pending-list');
            if (!container || !countBadge) return;

            countBadge.innerText = String(pendingInvites.length);

            if (!pendingInvites || pendingInvites.length === 0) {
                container.innerHTML = '<div class="empty-state">No pending requests at the moment.</div>';
                return;
            }

            container.innerHTML = pendingInvites.map(item => {
                const name = item.name || 'Guest';
                const token = item.token;
                const time = formatTime(item.created_at);
                const projectsHtml = renderProjectTags(item.allowed_project_ids);

                return \`
                    <div class="item-card">
                        <div class="item-info">
                            <div class="item-title-row">
                                <span class="item-name">\${escapeHtml(name)}</span>
                                <span class="badge badge-guest">Pending</span>
                            </div>
                            <div class="item-sub">
                                <span>Requested \${time}</span>
                                <span>•</span>
                                <span>Token: <code style="color:#a5b4fc;">\${escapeHtml(token.substring(0, 8))}...</code></span>
                            </div>
                            <div style="margin-top: 0.35rem; display: flex; gap: 0.3rem; flex-wrap: wrap;">
                                \${projectsHtml}
                            </div>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-success btn-sm" onclick="approveRequest('\${escapeHtml(token)}')">
                                Approve
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="rejectRequest('\${escapeHtml(token)}')">
                                Reject
                            </button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        window.approveRequest = async function(token) {
            try {
                const res = await fetch('/api/admin/invite/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                if (res.ok) {
                    showToast('Request approved successfully!');
                    loadPendingInvites();
                    loadDevices();
                } else {
                    showToast('Failed to approve request', 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        };

        window.rejectRequest = async function(token) {
            try {
                const res = await fetch('/api/admin/invite/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                if (res.ok) {
                    showToast('Request rejected', 'success');
                    loadPendingInvites();
                } else {
                    showToast('Failed to reject request', 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        };

        // 4. Connected Devices Handling
        async function loadDevices() {
            try {
                const res = await fetch('/api/devices');
                if (res.ok) {
                    connectedDevices = await res.json();
                    renderDevices();
                }
            } catch (e) {
                console.error('Failed to load devices:', e);
            }
        }

        function renderDevices() {
            const countBadge = document.getElementById('devices-count');
            const container = document.getElementById('devices-list');
            if (!container || !countBadge) return;

            countBadge.innerText = String(connectedDevices.length);

            if (!connectedDevices || connectedDevices.length === 0) {
                container.innerHTML = '<div class="empty-state">No paired devices found.</div>';
                return;
            }

            container.innerHTML = connectedDevices.map(dev => {
                const name = dev.name || 'Unknown Device';
                const id = dev.id || '';
                const lastSeen = formatTime(dev.lastSeen);
                const pairedAt = formatTime(dev.pairedAt);
                const isRestricted = dev.allowed_project_ids && dev.allowed_project_ids.length > 0 && !(dev.allowed_project_ids.length === 1 && dev.allowed_project_ids[0] === '*');
                const roleBadge = isRestricted ? '<span class="badge badge-guest">Guest</span>' : '<span class="badge badge-admin">Admin</span>';
                const projectsHtml = renderProjectTags(dev.allowed_project_ids);

                return \`
                    <div class="item-card">
                        <div class="item-info">
                            <div class="item-title-row">
                                <span class="item-name">\${escapeHtml(name)}</span>
                                \${roleBadge}
                            </div>
                            <div class="item-sub">
                                <span>UID: <code style="color:#a5b4fc;" title="\${escapeHtml(id)}">\${escapeHtml(id.substring(0, 12))}...</code></span>
                                <span>•</span>
                                <span>Active: \${lastSeen}</span>
                                <span>•</span>
                                <span>Paired: \${pairedAt}</span>
                            </div>
                            <div style="margin-top: 0.35rem; display: flex; gap: 0.3rem; flex-wrap: wrap;">
                                \${projectsHtml}
                            </div>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-secondary btn-sm" onclick="openEditAccessModal('\${escapeHtml(id)}')">
                                Edit Access
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteDevice('\${escapeHtml(id)}', '\${escapeHtml(name)}')">
                                Revoke
                            </button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        document.getElementById('btn-refresh-devices').addEventListener('click', () => {
            loadDevices();
            showToast('Devices refreshed');
        });

        window.deleteDevice = async function(id, name) {
            if (!confirm('Are you sure you want to revoke and delete device "' + name + '"?')) {
                return;
            }
            try {
                const res = await fetch('/api/devices/' + id, { method: 'DELETE' });
                if (res.ok) {
                    showToast('Device removed successfully');
                    loadDevices();
                } else {
                    showToast('Failed to delete device', 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        };

        // 5. Edit Device Access Modal
        const editModal = document.getElementById('edit-modal');
        const modalDeviceName = document.getElementById('modal-device-name');
        const modalProjectsList = document.getElementById('modal-projects-list');
        const modalAllProjects = document.getElementById('modal-all-projects');
        const modalCloseBtn = document.getElementById('modal-close-btn');
        const modalCancelBtn = document.getElementById('modal-cancel-btn');
        const modalSaveBtn = document.getElementById('modal-save-btn');

        window.openEditAccessModal = function(deviceId) {
            const dev = connectedDevices.find(d => d.id === deviceId);
            if (!dev) return;

            currentEditDeviceId = deviceId;
            modalDeviceName.innerText = 'Edit Access: ' + (dev.name || 'Device');

            const currentAllowed = parseProjectIds(dev.allowed_project_ids);
            const isAll = !currentAllowed || (currentAllowed.length === 1 && currentAllowed[0] === '*');

            modalAllProjects.checked = isAll;

            modalProjectsList.innerHTML = allProjects.map(proj => {
                const isChecked = !isAll && currentAllowed && (currentAllowed.includes(proj.id) || currentAllowed.includes(proj.name) || currentAllowed.includes(proj.projectName));
                const displayName = proj.name || proj.projectName || proj.id;
                return \`
                    <label class="checkbox-row">
                        <input type="checkbox" class="modal-proj-cb" value="\${escapeHtml(proj.id)}" \${isChecked ? 'checked' : ''} />
                        <span>\${escapeHtml(displayName)}</span>
                    </label>
                \`;
            }).join('');

            const individualCbs = modalProjectsList.querySelectorAll('.modal-proj-cb');
            modalAllProjects.onchange = () => {
                if (modalAllProjects.checked) {
                    individualCbs.forEach(cb => cb.checked = false);
                }
            };
            individualCbs.forEach(cb => {
                cb.onchange = () => {
                    if (cb.checked) {
                        modalAllProjects.checked = false;
                    }
                };
            });

            editModal.style.display = 'flex';
        };

        function closeEditModal() {
            editModal.style.display = 'none';
            currentEditDeviceId = null;
        }

        modalCloseBtn.addEventListener('click', closeEditModal);
        modalCancelBtn.addEventListener('click', closeEditModal);

        modalSaveBtn.addEventListener('click', async () => {
            if (!currentEditDeviceId) return;

            try {
                modalSaveBtn.disabled = true;
                modalSaveBtn.innerText = 'Saving...';

                let projectIds = null;
                if (modalAllProjects.checked) {
                    projectIds = ['*'];
                } else {
                    const checked = Array.from(modalProjectsList.querySelectorAll('.modal-proj-cb:checked')).map(cb => cb.value);
                    projectIds = checked.length > 0 ? checked : ['*'];
                }

                const res = await fetch('/api/devices/' + currentEditDeviceId + '/restrict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectIds })
                });

                if (res.ok) {
                    showToast('Device access updated successfully!');
                    closeEditModal();
                    loadDevices();
                } else {
                    showToast('Failed to update device access', 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            } finally {
                modalSaveBtn.disabled = false;
                modalSaveBtn.innerText = 'Save Changes';
            }
        });

        // Init
        loadProjects();
        loadPendingInvites();
        loadDevices();

        // Real-time polling for pending requests every 3 seconds
        setInterval(loadPendingInvites, 3000);
    </script>
</body>
</html>`;
}
