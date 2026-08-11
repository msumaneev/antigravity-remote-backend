import { execFile, spawn } from 'child_process';
import { discoverLanguageServer, invalidateDiscovery } from './discovery';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * Find the project UUID from ~/.gemini/config/projects/ by matching folder path.
 */
function findProjectIdByPath(projectPath: string): string | null {
    const projectsDir = path.join(os.homedir(), '.gemini', 'config', 'projects');
    if (!fs.existsSync(projectsDir)) return null;
    
    const normalizedInput = projectPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    
    const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(projectsDir, file), 'utf-8'));
            if (data.id && data.projectResources?.resources?.[0]?.folderUri) {
                const uri = data.projectResources.resources[0].folderUri;
                const decodedPath = decodeURIComponent(uri.replace('file:///', '')).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
                if (decodedPath === normalizedInput) {
                    return data.id;
                }
            }
        } catch (e) {}
    }
    return null;
}

interface SendResult {
    success: boolean;
    method: 'agentapi' | 'file' | 'direct_spawn';
    error?: string;
    newConvId?: string;
}

/**
 * Send a message to an Antigravity agent conversation.
 * 
 * Primary: Uses AgentAPI CLI which natively wakes the agent.
 * Fallback: Writes a JSON message file (requires waitForMessage.js or manual check).
 */
export async function sendMessage(
    conversationId: string,
    rawContent: string,
    model?: string
): Promise<SendResult> {
    let settingsInjection = '';
    if (model) {
        settingsInjection = `<USER_SETTINGS_CHANGE>\nThe user changed setting \`Model Selection\` to ${model}.\n</USER_SETTINGS_CHANGE>\n`;
    }

    // Wrap in USER_REQUEST tags so the agent sees it as a user message
    const content = `${settingsInjection}<USER_REQUEST>\n[Sent from phone]: ${rawContent.trim()}\n</USER_REQUEST>`;

    // Try AgentAPI first
    const result = await sendViaAgentAPI(conversationId, content, model);
    if (result.success) {
        return result;
    }

    console.log(`[Sender] AgentAPI failed (${result.error}), falling back to file-based approach`);

    // Fallback: write message file
    if (conversationId.startsWith('START_NEW_AGENT_')) {
        return { success: false, method: 'agentapi', error: result.error || 'Language Server is not running. Cannot start a new agent via fallback file method.' };
    }
    
    return sendViaFile(conversationId, content);
}

/**
 * Send via native AgentAPI CLI — this wakes the agent automatically.
 */
async function sendViaAgentAPI(conversationId: string, content: string, model?: string): Promise<SendResult> {
    const discovery = discoverLanguageServer();
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
        const tmpDir = path.join(os.tmpdir(), 'antigravity_newconv');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        console.log(`[Sender] Creating new conversation via agentapi new-conversation (projectId: ${projectId})`);
        
        return new Promise((resolve) => {
            const env: Record<string, string> = {
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

            const args = ['agentapi', 'new-conversation'];
            
            // Default to pro if no model specified, it's 'default', or it's a Pro model
            if (!model || model === 'default' || model.toLowerCase().includes('pro')) {
                args.push('--model=pro');
            } else if (model.toLowerCase().includes('lite')) {
                args.push('--model=flash_lite');
            } else {
                args.push('--model=flash');
            }
            args.push(content);

            execFile(discovery.agentApiPath, args, {
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
                        
                        // Migrate uploaded images from safeConvFolder to newConvId folder
                        try {
                            const safeConvFolder = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
                            const oldDir = path.join(BRAIN_DIR, safeConvFolder);
                            const newDir = path.join(BRAIN_DIR, newConvId);
                            if (fs.existsSync(oldDir)) {
                                if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
                                const files = fs.readdirSync(oldDir);
                                for (const file of files) {
                                    fs.copyFileSync(path.join(oldDir, file), path.join(newDir, file));
                                }
                            }
                        } catch (e) {
                            console.error('[Sender] Error migrating upload files:', e);
                        }

                        resolve({ success: true, method: 'agentapi', newConvId });
                    } else {
                        console.error('[Sender] new-conversation: no conversationId in response', stdout);
                        resolve({ success: false, method: 'agentapi', error: 'No conversationId returned' });
                    }
                } catch {
                    console.error('[Sender] new-conversation: failed to parse response', stdout);
                    resolve({ success: false, method: 'agentapi', error: 'Failed to parse response' });
                }
            });
        });
    }

    return new Promise((resolve) => {
        const env: Record<string, string> = {
            PATH: process.env.PATH || '',
            SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
            ANTIGRAVITY_LS_ADDRESS: discovery.address,
            ANTIGRAVITY_CSRF_TOKEN: discovery.csrfToken,
        };

        execFile(
            discovery.agentApiPath,
            ['agentapi', 'send-message', conversationId, content],
            { timeout: 10000, encoding: 'utf8', env },
            (error, stdout, stderr) => {
                if (error) {
                    // Invalidate cache so next call re-discovers
                    invalidateDiscovery();
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
                        invalidateDiscovery();
                        resolve({ success: false, method: 'agentapi', error: result.error });
                    } else {
                        console.log(`[Sender] Message delivered via AgentAPI to ${conversationId}`);
                        resolve({ success: true, method: 'agentapi' });
                    }
                } catch {
                    resolve({ success: true, method: 'agentapi' });
                }
            }
        );
    });
}

/**
 * Fallback: write a message JSON file to the messages directory.
 * This does NOT wake the agent automatically — requires waitForMessage.js or manual intervention.
 */
function sendViaFile(conversationId: string, content: string): SendResult {
    try {
        const id = crypto.randomUUID();
        const messageObj = {
            id,
            recipient: conversationId,
            sender: 'USER_EXPLICIT',
            priority: 'MESSAGE_PRIORITY_HIGH',
            timestamp: new Date().toISOString(),
            content,
        };

        const messagesDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'messages');
        if (!fs.existsSync(messagesDir)) {
            fs.mkdirSync(messagesDir, { recursive: true });
        }

        const msgPath = path.join(messagesDir, `${id}.json`);
        fs.writeFileSync(msgPath, JSON.stringify(messageObj), 'utf8');

        console.log(`[Sender] Message written to file: ${msgPath}`);
        return { success: true, method: 'file' };
    } catch (err) {
        return {
            success: false,
            method: 'file',
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
