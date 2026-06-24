import { execFile, spawn } from 'child_process';
import { discoverLanguageServer, invalidateDiscovery } from './discovery';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

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
async function sendViaAgentAPI(conversationId: string, content: string): Promise<SendResult> {
    const discovery = discoverLanguageServer();
    if (!discovery) {
        return { success: false, method: 'agentapi', error: 'Language Server not found' };
    }

    if (conversationId.startsWith('START_NEW_AGENT_')) {
        const newConvId = crypto.randomUUID();

        const lsPath = discovery.agentApiPath;
        console.log(`[Sender] Creating new conversation via AgentAPI: ${lsPath} agentapi new-conversation`);
        
        return new Promise((resolve) => {
            execFile(lsPath, ['agentapi', 'new-conversation', content], {
                timeout: 30000,
                windowsHide: true,
            }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Sender] new-conversation failed:', err.message, stderr);
                    // Fallback: write message to file
                    sendViaFile(newConvId, content);
                    resolve({ success: false, method: 'direct_spawn', error: err.message });
                    return;
                }
                console.log('[Sender] new-conversation result:', stdout.trim());
                try {
                    const result = JSON.parse(stdout);
                    const createdConvId = result?.response?.newConversation?.conversationId || newConvId;
                    resolve({ success: true, method: 'direct_spawn', newConvId: createdConvId });
                } catch {
                    resolve({ success: true, method: 'direct_spawn', newConvId });
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
