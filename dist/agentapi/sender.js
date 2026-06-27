"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
const child_process_1 = require("child_process");
const discovery_1 = require("./discovery");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
const BRAIN_DIR = path_1.default.join(os_1.default.homedir(), '.gemini', 'antigravity', 'brain');
/**
 * Find the project UUID from ~/.gemini/config/projects/ by matching folder path.
 */
function findProjectIdByPath(projectPath) {
    const projectsDir = path_1.default.join(os_1.default.homedir(), '.gemini', 'config', 'projects');
    if (!fs_1.default.existsSync(projectsDir))
        return null;
    const normalizedInput = projectPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    const files = fs_1.default.readdirSync(projectsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectsDir, file), 'utf-8'));
            if (data.id && data.projectResources?.resources?.[0]?.folderUri) {
                const uri = data.projectResources.resources[0].folderUri;
                const decodedPath = decodeURIComponent(uri.replace('file:///', '')).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
                if (decodedPath === normalizedInput) {
                    return data.id;
                }
            }
        }
        catch (e) { }
    }
    return null;
}
/**
 * Send a message to an Antigravity agent conversation.
 *
 * Primary: Uses AgentAPI CLI which natively wakes the agent.
 * Fallback: Writes a JSON message file (requires waitForMessage.js or manual check).
 */
async function sendMessage(conversationId, rawContent, model) {
    let settingsInjection = '';
    if (model) {
        settingsInjection = `<USER_SETTINGS_CHANGE>\nThe user changed setting \`Model Selection\` to ${model}.\n</USER_SETTINGS_CHANGE>\n`;
    }
    // Wrap in USER_REQUEST tags so the agent sees it as a user message
    const content = `${settingsInjection}<USER_REQUEST>\n[Отправлено с телефона]: ${rawContent.trim()}\n</USER_REQUEST>`;
    // Try AgentAPI first
    const result = await sendViaAgentAPI(conversationId, content);
    if (result.success) {
        return result;
    }
    console.log(`[Sender] AgentAPI failed (${result.error}), falling back to file-based approach`);
    // Fallback: write message file
    return sendViaFile(conversationId, content);
}
/**
 * Send via native AgentAPI CLI — this wakes the agent automatically.
 */
async function sendViaAgentAPI(conversationId, content) {
    const discovery = (0, discovery_1.discoverLanguageServer)();
    if (!discovery) {
        return { success: false, method: 'agentapi', error: 'Language Server not found' };
    }
    if (conversationId.startsWith('START_NEW_AGENT_')) {
        const projectPath = conversationId.replace('START_NEW_AGENT_', '');
        // Find projectId from config by matching folder path
        const projectId = findProjectIdByPath(projectPath);
        if (!projectId) {
            console.error(`[Sender] Could not find projectId for path: ${projectPath}`);
            return { success: false, method: 'agentapi', error: 'Project not found in config' };
        }
        // Use `agentapi new-conversation` with ANTIGRAVITY_PROJECT_ID env var.
        // This creates the cascade, binds the workspace, AND starts the agent!
        // IMPORTANT: CWD must be a clean dir (no .agents/) to avoid project_env_config conflicts
        const tmpDir = path_1.default.join(os_1.default.tmpdir(), 'antigravity_newconv');
        if (!fs_1.default.existsSync(tmpDir))
            fs_1.default.mkdirSync(tmpDir, { recursive: true });
        console.log(`[Sender] Creating new conversation via agentapi new-conversation (projectId: ${projectId})`);
        return new Promise((resolve) => {
            const env = {
                PATH: process.env.PATH || '',
                SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
                APPDATA: process.env.APPDATA || '',
                LOCALAPPDATA: process.env.LOCALAPPDATA || '',
                USERPROFILE: process.env.USERPROFILE || '',
                HOME: process.env.HOME || process.env.USERPROFILE || '',
                ANTIGRAVITY_LS_ADDRESS: discovery.address,
                ANTIGRAVITY_CSRF_TOKEN: discovery.csrfToken,
                ANTIGRAVITY_PROJECT_ID: projectId,
            };
            (0, child_process_1.execFile)(discovery.agentApiPath, [
                'agentapi', 'new-conversation', content
            ], {
                timeout: 30000,
                encoding: 'utf8',
                env,
                cwd: tmpDir,
                windowsHide: true,
            }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Sender] new-conversation failed:', err.message, stdout, stderr);
                    resolve({ success: false, method: 'agentapi', error: err.message });
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    if (result.error) {
                        console.error('[Sender] new-conversation error:', result.error);
                        resolve({ success: false, method: 'agentapi', error: result.error });
                        return;
                    }
                    const newConvId = result.response?.newConversation?.conversationId;
                    if (newConvId) {
                        console.log(`[Sender] new-conversation created: ${newConvId} — agent started!`);
                        resolve({ success: true, method: 'agentapi', newConvId });
                    }
                    else {
                        console.error('[Sender] new-conversation: no conversationId in response', stdout);
                        resolve({ success: false, method: 'agentapi', error: 'No conversationId returned' });
                    }
                }
                catch {
                    console.error('[Sender] new-conversation: failed to parse response', stdout);
                    resolve({ success: false, method: 'agentapi', error: 'Failed to parse response' });
                }
            });
        });
    }
    return new Promise((resolve) => {
        const env = {
            PATH: process.env.PATH || '',
            SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
            ANTIGRAVITY_LS_ADDRESS: discovery.address,
            ANTIGRAVITY_CSRF_TOKEN: discovery.csrfToken,
        };
        (0, child_process_1.execFile)(discovery.agentApiPath, ['agentapi', 'send-message', conversationId, content], { timeout: 10000, encoding: 'utf8', env }, (error, stdout, stderr) => {
            if (error) {
                // Invalidate cache so next call re-discovers
                (0, discovery_1.invalidateDiscovery)();
                resolve({
                    success: false,
                    method: 'agentapi',
                    error: error.message,
                });
                return;
            }
            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    (0, discovery_1.invalidateDiscovery)();
                    resolve({ success: false, method: 'agentapi', error: result.error });
                }
                else {
                    console.log(`[Sender] Message delivered via AgentAPI to ${conversationId}`);
                    resolve({ success: true, method: 'agentapi' });
                }
            }
            catch {
                resolve({ success: true, method: 'agentapi' });
            }
        });
    });
}
/**
 * Fallback: write a message JSON file to the messages directory.
 * This does NOT wake the agent automatically — requires waitForMessage.js or manual intervention.
 */
function sendViaFile(conversationId, content) {
    try {
        const id = crypto_1.default.randomUUID();
        const messageObj = {
            id,
            recipient: conversationId,
            sender: 'USER_EXPLICIT',
            priority: 'MESSAGE_PRIORITY_HIGH',
            timestamp: new Date().toISOString(),
            content,
        };
        const messagesDir = path_1.default.join(BRAIN_DIR, conversationId, '.system_generated', 'messages');
        if (!fs_1.default.existsSync(messagesDir)) {
            fs_1.default.mkdirSync(messagesDir, { recursive: true });
        }
        const msgPath = path_1.default.join(messagesDir, `${id}.json`);
        fs_1.default.writeFileSync(msgPath, JSON.stringify(messageObj), 'utf8');
        console.log(`[Sender] Message written to file: ${msgPath}`);
        return { success: true, method: 'file' };
    }
    catch (err) {
        return {
            success: false,
            method: 'file',
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
