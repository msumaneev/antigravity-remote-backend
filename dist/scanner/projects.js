"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjects = getProjects;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const BRAIN_DIR = path.join(process.env.APPDATA || process.env.USERPROFILE || '', '.gemini', 'antigravity', 'brain');
async function getProjects() {
    // For now, we will just scan the brain directory for conversation IDs
    // since every active chat/project has a conversation ID folder there.
    if (!fs.existsSync(BRAIN_DIR)) {
        return [];
    }
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'scratch') {
            const conversationId = entry.name;
            const logDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'logs');
            if (fs.existsSync(logDir)) {
                projects.push({
                    id: conversationId,
                    name: `Project/Session ${conversationId.substring(0, 8)}`,
                    path: path.join(BRAIN_DIR, conversationId)
                });
            }
        }
    }
    return projects;
}
