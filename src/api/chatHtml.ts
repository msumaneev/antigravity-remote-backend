export function getChatHtml(pairingToken: string): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Remote Chat</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <style>
        :root {
            --bg-color: #0b0f19;
            --sidebar-bg: rgba(17, 24, 39, 0.7);
            --chat-bg: #0f172a;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-gradient: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            --accent-color: #6366f1;
            --border-color: rgba(255, 255, 255, 0.08);
            --card-hover: rgba(255, 255, 255, 0.03);
            --success-color: #10b981;
            --warning-color: #f59e0b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            overflow: hidden;
        }

        /* --- PAIRING SCREEN --- */
        #pairing-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0f172a 50%, #020617 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            transition: opacity 0.5s ease;
        }

        .pairing-card {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(20px);
            border: 1px solid var(--border-color);
            border-radius: 28px;
            padding: 3rem;
            max-width: 450px;
            width: 90%;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: floatIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes floatIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .pairing-card h2 {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
        }

        .pairing-card p {
            color: var(--text-secondary);
            margin-bottom: 2rem;
            font-size: 0.95rem;
            line-height: 1.5;
        }

        .token-input-container {
            width: 100%;
            margin-bottom: 2rem;
        }

        .token-textarea {
            width: 100%;
            height: 100px;
            background: rgba(15, 23, 42, 0.6);
            border: 2px solid var(--border-color);
            border-radius: 12px;
            font-size: 0.9rem;
            color: white;
            padding: 0.75rem;
            font-family: monospace;
            outline: none;
            transition: all 0.2s;
            resize: none;
            box-sizing: border-box;
        }

        .token-textarea:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
        }

        .btn-pair {
            width: 100%;
            background: var(--accent-gradient);
            color: white;
            padding: 1rem;
            border-radius: 14px;
            border: none;
            font-weight: 600;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .btn-pair:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(99, 102, 241, 0.5);
        }

        .pairing-error {
            color: #ef4444;
            font-size: 0.9rem;
            margin-top: 1rem;
            display: none;
        }

        /* --- MAIN LAYOUT --- */
        #app-layout {
            display: none;
            width: 100%;
            height: 100%;
        }

        /* --- SIDEBAR --- */
        #sidebar {
            width: 340px;
            background-color: var(--sidebar-bg);
            backdrop-filter: blur(16px);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            height: 100%;
            z-index: 10;
        }

        .sidebar-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .brand-logo {
            width: 32px;
            height: 32px;
            background: var(--accent-gradient);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 1.1rem;
            color: white;
        }

        .brand-title {
            font-weight: 700;
            font-size: 1.2rem;
            letter-spacing: -0.02em;
        }

        .btn-logout {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 8px;
            transition: all 0.2s;
        }

        .btn-logout:hover {
            color: #ef4444;
            background-color: rgba(239, 68, 68, 0.1);
        }

        /* --- QUOTA SECTION --- */
        .quota-panel {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background: rgba(15, 23, 42, 0.2);
        }

        .quota-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .quota-bar-container {
            margin-bottom: 0.75rem;
        }

        .quota-bar-container:last-child {
            margin-bottom: 0;
        }

        .quota-info {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            margin-bottom: 0.25rem;
        }

        .quota-name {
            font-weight: 500;
        }

        .quota-pct {
            font-weight: 600;
            color: var(--accent-color);
        }

        .quota-bar {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
            overflow: hidden;
        }

        .quota-fill {
            height: 100%;
            background: var(--accent-gradient);
            border-radius: 3px;
            width: 100%;
            transition: width 0.5s ease-out;
        }

        .quota-fill.success {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .quota-fill.warning {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .quota-fill.danger {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }

        /* Navigation / Projects Tree */
        .projects-list {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }

        .project-group {
            margin-bottom: 1rem;
        }

        .project-title {
            font-size: 0.8rem;
            text-transform: uppercase;
            color: var(--text-secondary);
            font-weight: 700;
            letter-spacing: 0.05em;
            padding: 0.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .project-title-left {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .btn-new-chat {
            background: transparent;
            border: none;
            color: var(--accent-color);
            cursor: pointer;
            font-size: 1.1rem;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            transition: background 0.2s;
        }

        .btn-new-chat:hover {
            background: rgba(249, 115, 22, 0.15);
        }

        .chats-list {
            margin-top: 0.25rem;
        }

        .chat-item {
            padding: 0.75rem 1rem;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.95rem;
            transition: all 0.2s;
            margin-bottom: 0.25rem;
            color: var(--text-secondary);
        }

        .chat-item:hover {
            background-color: var(--card-hover);
            color: var(--text-primary);
        }

        .chat-item.active {
            background-color: rgba(99, 102, 241, 0.15);
            color: var(--text-primary);
            font-weight: 500;
            border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .chat-icon {
            opacity: 0.7;
        }

        .chat-item.active .chat-icon {
            opacity: 1;
            color: var(--accent-color);
        }

        /* --- CHAT AREA --- */
        #chat-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            background-color: var(--chat-bg);
            height: 100%;
        }

        .chat-header {
            padding: 1.25rem 2rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: rgba(15, 23, 42, 0.3);
        }

        .chat-header-info h3 {
            font-size: 1.1rem;
            font-weight: 600;
        }

        .chat-header-info p {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-top: 0.15rem;
        }

        .chat-status-badge {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            font-weight: 600;
            padding: 0.4rem 0.8rem;
            border-radius: 9999px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-color);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--text-secondary);
        }

        .status-dot.active {
            background-color: var(--success-color);
            box-shadow: 0 0 8px var(--success-color);
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { opacity: 0.5; }
            50% { opacity: 1; }
            100% { opacity: 0.5; }
        }

        /* Messages Scroll Container */
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .message-bubble {
            max-width: 85%;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            animation: floatUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes floatUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message-bubble.user {
            align-self: flex-end;
        }

        .message-bubble.assistant {
            align-self: flex-start;
        }

        .message-sender {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-secondary);
            margin-left: 0.5rem;
        }

        .message-content {
            padding: 1.25rem 1.5rem;
            border-radius: 20px;
            line-height: 1.6;
            font-size: 0.98rem;
        }

        .message-bubble.user .message-content {
            background: var(--accent-gradient);
            color: white;
            border-bottom-right-radius: 4px;
            box-shadow: 0 4px 15px rgba(249, 115, 22, 0.2);
        }

        .message-bubble.assistant .message-content {
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            border-bottom-left-radius: 4px;
        }

        /* Markdown Styles inside assistant bubble */
        .message-content p {
            margin-bottom: 0.75rem;
        }

        .message-content p:last-child {
            margin-bottom: 0;
        }

        .message-content h1, .message-content h2, .message-content h3 {
            margin-top: 1rem;
            margin-bottom: 0.5rem;
            font-weight: 700;
        }

        .message-content h1 { font-size: 1.4rem; }
        .message-content h2 { font-size: 1.2rem; }
        .message-content h3 { font-size: 1.1rem; }

        .message-content ul, .message-content ol {
            margin-left: 1.5rem;
            margin-bottom: 0.75rem;
        }

        .message-content code {
            font-family: monospace;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.2rem 0.4rem;
            border-radius: 6px;
            font-size: 0.9rem;
        }

        .message-content pre {
            margin-top: 0.75rem;
            margin-bottom: 0.75rem;
            border-radius: 12px;
            overflow: hidden;
        }

        .message-content pre code {
            display: block;
            padding: 1rem;
            overflow-x: auto;
            background: #090d16 !important;
            border: 1px solid var(--border-color);
        }

        .message-content table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 0.75rem;
            margin-bottom: 0.75rem;
            font-size: 0.9rem;
        }

        .message-content th, .message-content td {
            border: 1px solid var(--border-color);
            padding: 0.6rem 0.8rem;
            text-align: left;
        }

        .message-content th {
            background-color: rgba(255, 255, 255, 0.05);
            font-weight: 600;
        }

        /* Interaction Panel */
        .interaction-panel {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 16px;
            padding: 1.25rem;
            margin-top: 1rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .interaction-title {
            color: var(--warning-color);
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .interaction-actions {
            display: flex;
            gap: 0.75rem;
        }

        .btn-action {
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            border: none;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-action.approve {
            background-color: var(--success-color);
            color: white;
        }

        .btn-action.approve:hover {
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
        }

        .btn-action.reject {
            background-color: #ef4444;
            color: white;
        }

        .btn-action.reject:hover {
            box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
        }


        /* Stitch-like Alert/Tip Boxes */
        .alert-box {
            margin: 1.25rem 0;
            padding: 1rem 1.25rem;
            border-radius: 8px;
            border-left: 4px solid var(--accent-color);
            background: rgba(255, 255, 255, 0.02);
            font-size: 0.95rem;
            line-height: 1.6;
        }
        .alert-tip {
            border-left-color: #10b981;
            background: rgba(16, 185, 129, 0.04);
        }
        .alert-note {
            border-left-color: #3b82f6;
            background: rgba(59, 130, 246, 0.04);
        }
        .alert-important {
            border-left-color: #8b5cf6;
            background: rgba(139, 92, 246, 0.04);
        }
        .alert-warning {
            border-left-color: #f59e0b;
            background: rgba(245, 158, 11, 0.04);
        }
        .alert-caution {
            border-left-color: #ef4444;
            background: rgba(239, 68, 68, 0.04);
        }
        .alert-header {
            font-weight: 700;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.35rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .alert-tip .alert-header { color: #10b981; }
        .alert-note .alert-header { color: #3b82f6; }
        .alert-important .alert-header { color: #8b5cf6; }
        .alert-warning .alert-header { color: #f59e0b; }
        .alert-caution .alert-header { color: #ef4444; }
        .alert-content p {
            margin: 0 !important;
        }

        /* Message Input Panel */
        .input-panel {
            padding: 1.5rem 2rem;
            border-top: 1px solid var(--border-color);
            background-color: rgba(15, 23, 42, 0.3);
        }

        .input-box {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border-color);
            border-radius: 18px;
            padding: 0.75rem 1.25rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            transition: border-color 0.2s;
        }

        .input-box:focus-within {
            border-color: var(--accent-color);
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }

        .input-box textarea {
            flex: 1;
            background: transparent;
            border: none;
            color: white;
            outline: none;
            font-family: inherit;
            font-size: 1rem;
            resize: none;
            height: 24px;
            line-height: 24px;
            overflow-y: hidden;
        }

        .btn-send {
            background: var(--accent-gradient);
            border: none;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        .btn-send:hover {
            transform: scale(1.05);
            box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
        }

        .empty-chat-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: var(--text-secondary);
            padding: 2rem;
        }

        .empty-chat-state svg {
            width: 64px;
            height: 64px;
            stroke: var(--text-secondary);
            opacity: 0.5;
            margin-bottom: 1.5rem;
        }

        .empty-chat-state h3 {
            color: var(--text-primary);
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }

        /* --- SCROLLBAR --- */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>

    <!-- Pairing Screen -->
    <div id="pairing-screen">
        <div class="pairing-card">
            <h2>Сопряжение Web Chat</h2>
            <p>Введите 6-значный код сопряжения, отображаемый в Antigravity Remote Admin Console на компьютере.</p>
            <div class="code-input-container">
                <input type="text" maxlength="1" class="code-char" id="c1" autofocus>
                <input type="text" maxlength="1" class="code-char" id="c2">
                <input type="text" maxlength="1" class="code-char" id="c3">
                <input type="text" maxlength="1" class="code-char" id="c4">
                <input type="text" maxlength="1" class="code-char" id="c5">
                <input type="text" maxlength="1" class="code-char" id="c6">
            </div>
            <button class="btn-pair" id="btn-submit-pair">Подключиться</button>
            <div class="pairing-error" id="pairing-error">Неверный код сопряжения. Пожалуйста, попробуйте еще раз.</div>
        </div>
    </div>

    <!-- Main Layout -->
    <div id="app-layout">
        <!-- Sidebar -->
        <div id="sidebar">
            <div class="sidebar-header">
                <div class="brand">
                    <div class="brand-logo">A</div>
                    <div class="brand-title">Antigravity Chat</div>
                </div>
                <button class="btn-logout" id="btn-logout" title="Выйти">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                </button>
            </div>

            <!-- Quota Remaining -->
            <div class="quota-panel" id="quota-panel" style="display:none">
                <div class="quota-header">Остаток Квоты</div>
                <div id="quota-list"></div>
            </div>

            <!-- Projects & Conversations -->
            <div class="projects-list" id="projects-list">
                <!-- Populated dynamically -->
            </div>
        </div>

        <!-- Chat Area -->
        <div id="chat-area">
            <div id="active-chat-view" style="display: none; height: 100%; flex-direction: column;">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <h3 id="active-chat-title">Название чата</h3>
                        <p id="active-chat-project">Проект: ...</p>
                    </div>
                    <div class="chat-status-badge">
                        <div class="status-dot" id="agent-status-dot"></div>
                        <span id="agent-status-text">Инициализация</span>
                    </div>
                </div>

                <!-- Messages -->
                <div class="messages-container" id="messages-container"></div>

                <!-- Input -->
                <div class="input-panel">
                    <div class="input-box">
                        <textarea id="chat-input" placeholder="Введите ваш запрос..." rows="1"></textarea>
                        <button class="btn-send" id="btn-send">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Empty Chat state -->
            <div class="empty-chat-state" id="empty-chat-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <h3>Добро пожаловать в Antigravity</h3>
                <p>Выберите диалог в левой панели или создайте новый чат для вашего проекта.</p>
            </div>
        </div>
    </div>

    <script>
        // Init marked
        marked.setOptions({
            highlight: function(code, lang) {
                return hljs.highlightAuto(code).value;
            },
            breaks: true
        });

        // Config variables
        let jwtToken = localStorage.getItem('antigravity_token');
        let ws = null;
        let activeConversationId = null;
        let activeProjectPath = null;
        let isGenerating = false;
        let activeAgentStatus = 'IDLE';

        // Auto-sizing textarea
        const chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('input', function() {
            this.style.height = '24px';
            this.style.height = (this.scrollHeight - 6) + 'px';
        });

        // Pairing Code Input auto-focus flow
        const codeInputs = document.querySelectorAll('.code-char');
        codeInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                    codeInputs[index - 1].focus();
                }
            });
        });

        // Initialize view
        if (jwtToken) {
            document.getElementById('pairing-screen').style.display = 'none';
            document.getElementById('app-layout').style.display = 'flex';
            connectWebSocket();
        } else {
            document.getElementById('pairing-screen').style.display = 'flex';
        }

        // Pair button handler
        document.getElementById('btn-submit-pair').addEventListener('click', submitPairCode);
        document.getElementById('c6').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitPairCode();
        });

        async function submitPairCode() {
            let code = '';
            codeInputs.forEach(i => code += i.value.trim());
            
            if (code.length !== 6) {
                showError('Пожалуйста, введите все 6 цифр кода');
                return;
            }

            document.getElementById('pairing-error').style.display = 'none';
            
            try {
                const res = await fetch('/api/exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pairingToken: code, deviceName: 'Web Browser' })
                });

                const data = await res.json();
                if (data.token) {
                    jwtToken = data.token;
                    localStorage.setItem('antigravity_token', jwtToken);
                    document.getElementById('pairing-screen').style.display = 'none';
                    document.getElementById('app-layout').style.display = 'flex';
                    connectWebSocket();
                } else {
                    showError(data.error || 'Неверный код сопряжения.');
                }
            } catch(e) {
                showError('Ошибка сети: не удалось соединиться с сервером.');
            }
        }

        function showError(msg) {
            const errEl = document.getElementById('pairing-error');
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите отключить этот браузер?')) {
                localStorage.removeItem('antigravity_token');
                window.location.reload();
            }
        });

        // Connect WebSocket
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = \`\${protocol}//\${window.location.host}\`;
            
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[WS] Connected');
                // Send AUTH
                ws.send(JSON.stringify({
                    type: 'AUTH',
                    authType: 'permanent',
                    token: jwtToken
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleWebSocketMessage(msg);
                } catch(e) {
                    console.error('[WS] Failed to parse message:', event.data, e);
                }
            };

            ws.onclose = () => {
                console.log('[WS] Disconnected, reconnecting in 3s...');
                setTimeout(connectWebSocket, 3000);
            };
        }

        function handleWebSocketMessage(msg) {
            console.log('[WS] Received type:', msg.type);

            switch(msg.type) {
                case 'AUTH_SUCCESS':
                    // Authorized, fetch conversations and quota
                    ws.send(JSON.stringify({ type: 'LIST_CONVERSATIONS_V2' }));
                    ws.send(JSON.stringify({ type: 'GET_QUOTA_SUMMARY' }));
                    // Query quota every 30 seconds
                    setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'GET_QUOTA_SUMMARY' }));
                        }
                    }, 30000);
                    break;
                case 'CONVERSATIONS_LIST':
                    renderProjectsTree(msg.data);
                    break;
                case 'QUOTA_SUMMARY':
                    renderQuota(msg.data);
                    break;
                case 'AGENT_STATE':
                    handleAgentState(msg.data);
                    break;
                case 'CHAT_CREATED':
                    if (msg.oldId === activeConversationId) {
                        activeConversationId = msg.newId;
                        ws.send(JSON.stringify({ type: 'SUBSCRIBE', conversationId: activeConversationId }));
                        loadChatHistory(activeConversationId);
                        ws.send(JSON.stringify({ type: 'LIST_CONVERSATIONS_V2' }));
                    }
                    break;
                case 'EVENT':
                    console.log('[WS Event]:', msg.data);
                    break;
                case 'ERROR':
                    alert('Ошибка сервера: ' + msg.error);
                    break;
            }
        }

        // Render Sidebar
        function renderProjectsTree(tree) {
            const container = document.getElementById('projects-list');
            if (!tree || tree.length === 0) {
                container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 2rem;">Нет доступных проектов</div>';
                return;
            }

            container.innerHTML = tree.map(project => {
                const projectName = project.projectName || project.name || 'Unnamed Project';
                const projectPath = project.projectPath || '';

                const chats = project.conversations || [];
                const chatItemsHtml = chats.map(chat => {
                    const isActive = chat.conversationId === activeConversationId ? 'active' : '';
                    return \`
                        <div class="chat-item \${isActive}" onclick="selectConversation('\${chat.conversationId}', '\${projectName}', '\${projectPath}')">
                            <span class="chat-icon">💬</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\${chat.title || chat.conversationId.substring(0, 8)}</span>
                        </div>
                    \`;
                }).join('');

                return \`
                    <div class="project-group">
                        <div class="project-title">
                            <div class="project-title-left">
                                <span>📁</span>
                                <span>\${projectName}</span>
                            </div>
                            <button class="btn-new-chat" onclick="createNewChat('\${projectName}', '\${projectPath}')" title="Создать чат">+</button>
                        </div>
                        <div class="chats-list">
                            \${chatItemsHtml}
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // Render Token Quota
        function renderQuota(data) {
            const quotaPanel = document.getElementById('quota-panel');
            const quotaList = document.getElementById('quota-list');
            
            if (!data || !data.groups || data.groups.length === 0) {
                quotaPanel.style.display = 'none';
                return;
            }

            quotaPanel.style.display = 'block';
            
            let html = '';
            data.groups.forEach(g => {
                (g.buckets || []).forEach(b => {
                    const pct = Math.round((b.remainingFraction || 0) * 100);
                    
                    let colorClass = 'success';
                    if (pct <= 20) colorClass = 'danger';
                    else if (pct <= 50) colorClass = 'warning';

                    html += \`
                        <div class="quota-bar-container" title="\${b.description || ''}">
                            <div class="quota-info">
                                <span class="quota-name">\${b.displayName}</span>
                                <span class="quota-pct">\${pct}%</span>
                            </div>
                            <div class="quota-bar">
                                <div class="quota-fill \${colorClass}" style="width: \${pct}%"></div>
                            </div>
                        </div>
                    \`;
                });
            });

            quotaList.innerHTML = html;
        }

        // Select Chat
        async function selectConversation(convId, projectName, projectPath) {
            activeConversationId = convId;
            activeProjectPath = projectPath;
            
            document.getElementById('empty-chat-state').style.display = 'none';
            const view = document.getElementById('active-chat-view');
            view.style.display = 'flex';

            document.getElementById('active-chat-title').textContent = 'Диалог: ' + convId.substring(0, 8);
            document.getElementById('active-chat-project').textContent = 'Проект: ' + projectName;
            
            updateAgentStatus('IDLE');

            // Load History
            await loadChatHistory(convId);

            // Subscribe to state updates
            ws.send(JSON.stringify({ type: 'SUBSCRIBE', conversationId: convId }));

            // Update sidebar selection
            const items = document.querySelectorAll('.chat-item');
            items.forEach(i => i.classList.remove('active'));
            event?.currentTarget?.classList?.add('active');
        }

        // Create New Chat (Local client state first)
        function createNewChat(projectName, projectPath) {
            const fakeId = 'START_NEW_AGENT_' + projectPath;
            activeConversationId = fakeId;
            activeProjectPath = projectPath;

            document.getElementById('empty-chat-state').style.display = 'none';
            const view = document.getElementById('active-chat-view');
            view.style.display = 'flex';

            document.getElementById('active-chat-title').textContent = 'Новый чат';
            document.getElementById('active-chat-project').textContent = 'Проект: ' + projectName;
            
            const container = document.getElementById('messages-container');
            container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 2rem;">Напишите первое сообщение, чтобы запустить ассистента.</div>';

            updateAgentStatus('IDLE');
        }

        async function loadChatHistory(convId) {
            const container = document.getElementById('messages-container');
            container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 2rem;">Загрузка истории сообщений...</div>';
            
            try {
                const res = await fetch(\`/api/history?conversationId=\${convId}&token=\${jwtToken}\`);
                const data = await res.json();
                
                if (data.history) {
                    container.innerHTML = '';
                    
                    data.history.forEach(step => {
                        const isUser = step.source === 'USER_EXPLICIT' || step.type === 'USER_INPUT';
                        const isModel = step.source === 'MODEL' || step.type === 'PLANNER_RESPONSE';
                        
                        if ((isUser || isModel) && step.content) {
                            appendMessage(
                                isUser ? 'user' : 'assistant',
                                cleanUserMessage(step.content),
                                isUser ? 'Вы' : 'Ассистент'
                            );
                        }
                    });

                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;
                }
            } catch(e) {
                container.innerHTML = '<div style="color:#ef4444; text-align:center; padding: 2rem;">Не удалось загрузить историю диалога.</div>';
            }
        }

        // Helper to strip metadata/tags from user messages (like [Отправлено с телефона])
        function cleanUserMessage(text) {
            let cleaned = text.replace(/<USER_SETTINGS_CHANGE>[\\s\\S]*?<\\/USER_SETTINGS_CHANGE>/g, '');
            cleaned = cleaned.replace(/<USER_REQUEST>/g, '').replace(/<\/USER_REQUEST>/g, '');
            cleaned = cleaned.replace(/\\[Отправлено с телефона\\]:/g, '');
            return cleaned.trim();
        }

        // Append message to scroll area
        function appendMessage(sender, text, senderName) {
            const container = document.getElementById('messages-container');
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble ' + sender;

            const nameEl = document.createElement('span');
            nameEl.className = 'message-sender';
            nameEl.textContent = senderName;
            
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            
            if (sender === 'assistant') {
                contentEl.innerHTML = marked.parse(text);
            } else {
                contentEl.textContent = text;
            }

            bubble.appendChild(nameEl);
            bubble.appendChild(contentEl);
            container.appendChild(bubble);
            container.scrollTop = container.scrollHeight;
        }

        // Handle Agent State Streams
        function handleAgentState(state) {
            console.log('[Agent State]:', state);

            if (state.conversationId !== activeConversationId) return;

            // Handle run status / THINKING / IDLE
            if (state.state) {
                updateAgentStatus(state.state);
            }

            // If there's an interaction request
            if (state.requestedInteraction && !state.requestedInteraction.cancelled && !state.requestedInteraction.resolved) {
                renderInteractionRequest(state.requestedInteraction);
            } else {
                removeInteractionRequest();
            }

            // Append incremental terminal output or steps if thinking (optional, but let's keep it simple)
        }

        function updateAgentStatus(status) {
            activeAgentStatus = status;
            const dot = document.getElementById('agent-status-dot');
            const text = document.getElementById('agent-status-text');

            if (status === 'THINKING') {
                dot.className = 'status-dot active';
                text.textContent = 'Ассистент думает...';
                isGenerating = true;
            } else {
                dot.className = 'status-dot';
                text.textContent = 'Готов';
                isGenerating = false;
            }
        }

        // Render interactive confirmation buttons (e.g. approve/reject tool calls)
        function renderInteractionRequest(interaction) {
            // Check if panel already exists
            let panel = document.getElementById('active-interaction-panel');
            if (panel) return;

            const container = document.getElementById('messages-container');
            panel = document.createElement('div');
            panel.id = 'active-interaction-panel';
            panel.className = 'interaction-panel';

            const title = document.createElement('div');
            title.className = 'interaction-title';
            title.innerHTML = '⚠️ Требуется подтверждение действия';

            const desc = document.createElement('p');
            desc.textContent = interaction.message || 'Ассистент запрашивает разрешение на выполнение команды или чтение файла.';

            const actions = document.createElement('div');
            actions.className = 'interaction-actions';

            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn-action approve';
            approveBtn.textContent = 'Разрешить';
            approveBtn.onclick = () => respondInteraction(interaction, true);

            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'btn-action reject';
            rejectBtn.textContent = 'Отклонить';
            rejectBtn.onclick = () => respondInteraction(interaction, false);

            actions.appendChild(approveBtn);
            actions.appendChild(rejectBtn);

            panel.appendChild(title);
            panel.appendChild(desc);
            panel.appendChild(actions);
            container.appendChild(panel);
            container.scrollTop = container.scrollHeight;
        }

        function removeInteractionRequest() {
            const panel = document.getElementById('active-interaction-panel');
            if (panel) panel.remove();
        }

        function respondInteraction(interaction, approve) {
            if (!ws) return;
            ws.send(JSON.stringify({
                type: approve ? 'APPROVE_INTERACTION' : 'REJECT_INTERACTION',
                conversationId: activeConversationId,
                interactionPayload: interaction
            }));
            removeInteractionRequest();
        }

        // Send Message action
        const btnSend = document.getElementById('btn-send');
        btnSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function sendMessage() {
            const text = chatInput.value.trim();
            if (!text || !ws) return;

            // Clear input and restore default size
            chatInput.value = '';
            chatInput.style.height = '24px';

            appendMessage('user', text, 'Вы');

            ws.send(JSON.stringify({
                type: 'SEND_INPUT',
                conversationId: activeConversationId,
                data: text,
                model: 'gemini-3.1-pro' // Default model
            }));

            updateAgentStatus('THINKING');
        }
    </script>
</body>
</html>`;
}
