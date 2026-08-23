import https from 'https';
import { EventEmitter } from 'events';
import { discoverLanguageServer } from './discovery';

export class AgentStateStream extends EventEmitter {
    private conversationId: string;
    private req: any = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private currentInteraction: {
        payload: any;
        stepIndex: number | null;
        trajectoryId: string | null;
    } | null = null;

    constructor(conversationId: string) {
        super();
        this.conversationId = conversationId;
    }

    connect() {
        if (this.req) return;

        const ls = discoverLanguageServer();
        if (!ls) {
            this.scheduleReconnect();
            return;
        }

        console.log(`[StateStream] Connecting to StreamAgentStateUpdates for ${this.conversationId}...`);
        
        const payloadObj = { conversationId: this.conversationId };
        const payloadStr = JSON.stringify(payloadObj);
        const payloadBuf = Buffer.from(payloadStr, 'utf8');

        // Connect-RPC Envelope: [Flag(1)][Length(4)][Message...]
        const envelope = Buffer.alloc(5 + payloadBuf.length);
        envelope[0] = 0; // flag
        envelope.writeUInt32BE(payloadBuf.length, 1);
        payloadBuf.copy(envelope, 5);

        this.req = https.request({
            hostname: 'localhost',
            port: ls.httpsPort,
            path: '/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates',
            method: 'POST',
            headers: {
                'Content-Type': 'application/connect+json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': ls.csrfToken
            },
            rejectUnauthorized: false
        }, (res) => {
            if (res.statusCode !== 200) {
                console.error(`[StateStream] Connection failed with status ${res.statusCode} for ${this.conversationId}`);
                this.req = null;
                this.scheduleReconnect();
                return;
            }

            console.log(`[StateStream] Connected successfully for ${this.conversationId}.`);
            let buffer = Buffer.alloc(0);

            res.on('data', (chunk: Buffer) => {
                buffer = Buffer.concat([buffer, chunk]);
                
                while (buffer.length >= 5) {
                    const flags = buffer[0];
                    const length = buffer.readUInt32BE(1);
                    
                    if (buffer.length >= 5 + length) {
                        const messageBuffer = buffer.slice(5, 5 + length);
                        buffer = buffer.slice(5 + length);
                        
                        try {
                            const messageStr = messageBuffer.toString('utf8');
                            const messageObj = JSON.parse(messageStr);
                            
                            // Map/Flatten the update object to match expected client format
                            let mappedData: any = {};
                            if (messageObj.update) {
                                const update = messageObj.update;
                                mappedData = { ...update };
                                
                                // Map status to state (expected by Android client: "THINKING" or "IDLE")
                                const status = update.status || 'CASCADE_RUN_STATUS_IDLE';
                                if (status === 'CASCADE_RUN_STATUS_RUNNING') {
                                    mappedData.state = 'THINKING';
                                } else {
                                    mappedData.state = 'IDLE';
                                }

                                // Check for requestedInteraction inside steps
                                const steps = update.mainTrajectoryUpdate?.stepsUpdate?.steps;
                                if (Array.isArray(steps)) {
                                    for (const step of steps) {
                                        if (step.status === 'CORTEX_STEP_STATUS_WAITING' && step.requestedInteraction) {
                                            const stepIndex = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?? null;
                                            const trajectoryId = step.metadata?.sourceTrajectoryStepInfo?.trajectoryId ?? update.trajectoryId ?? null;
                                            this.currentInteraction = {
                                                payload: step.requestedInteraction,
                                                stepIndex,
                                                trajectoryId
                                            };
                                            console.log(`[StateStream] 🎯 Found WAITING step with requestedInteraction (stepIndex: ${stepIndex}) for ${this.conversationId}`);
                                        } else if (step.status === 'CORTEX_STEP_STATUS_DONE' || step.completedInteractions) {
                                            const stepIndex = step.metadata?.sourceTrajectoryStepInfo?.stepIndex;
                                            if (this.currentInteraction && (this.currentInteraction.stepIndex === null || this.currentInteraction.stepIndex === stepIndex)) {
                                                console.log(`[StateStream] 🧹 Interaction completed for ${this.conversationId}, clearing.`);
                                                this.currentInteraction = null;
                                            }
                                        }
                                    }
                                }

                                if (update.requestedInteraction) {
                                    this.currentInteraction = {
                                        payload: update.requestedInteraction,
                                        stepIndex: null,
                                        trajectoryId: update.trajectoryId ?? null
                                    };
                                }

                                if (status === 'CASCADE_RUN_STATUS_IDLE' && (!steps || !steps.some((s: any) => s.status === 'CORTEX_STEP_STATUS_WAITING'))) {
                                    this.currentInteraction = null;
                                }

                                mappedData.requestedInteraction = this.currentInteraction?.payload || null;
                                mappedData.interactionStepIndex = this.currentInteraction?.stepIndex ?? null;
                                mappedData.interactionTrajectoryId = this.currentInteraction?.trajectoryId ?? null;
                            } else if (messageObj.error) {
                                mappedData = {
                                    error: messageObj.error,
                                    state: 'IDLE',
                                    requestedInteraction: null
                                };
                                this.currentInteraction = null;
                            } else {
                                mappedData = {
                                    ...messageObj,
                                    state: 'IDLE',
                                    requestedInteraction: null
                                };
                                this.currentInteraction = null;
                            }
                            
                            // Ensure conversationId is always present
                            mappedData.conversationId = this.conversationId;

                            if (mappedData.requestedInteraction) {
                                console.log(`[StateStream] 📡 Emitting state with requestedInteraction for ${this.conversationId}`);
                            }
                            
                            this.emit('state', mappedData);
                        } catch (err) {
                            console.error('[StateStream] Error parsing message:', err);
                        }
                    } else {
                        break;
                    }
                }
            });

            res.on('end', () => {
                console.log(`[StateStream] Stream ended for ${this.conversationId}.`);
                this.req = null;
                this.scheduleReconnect();
            });
            
            res.on('error', (err: Error) => {
                console.error(`[StateStream] Stream error for ${this.conversationId}:`, err);
                this.req = null;
                this.scheduleReconnect();
            });
        });

        this.req.on('error', (err: Error) => {
            console.error(`[StateStream] Request error for ${this.conversationId}:`, err);
            this.req = null;
            this.scheduleReconnect();
        });

        this.req.write(envelope);
        this.req.end();
    }

    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.req?.destroy();
        this.req = null;
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 3000);
    }
}

