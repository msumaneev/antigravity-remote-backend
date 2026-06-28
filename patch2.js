const fs = require('fs');
const oldHandlers = fs.readFileSync('old_handlers.ts', 'utf8');
const currentHandlers = fs.readFileSync('src/api/handlers.ts', 'utf8');

// Find getCachedProjectsTree and getProjectsTree
const startIdx = oldHandlers.indexOf('let cachedProjectsTree');
const endIdx = oldHandlers.indexOf('function transformTrajectoriesToProjectTree');
if (startIdx === -1 || endIdx === -1) throw new Error("Could not find functions in old_handlers.ts");
const extractedCode = oldHandlers.substring(startIdx, endIdx);

// Insert into currentHandlers
const insertIdx = currentHandlers.indexOf('function transformTrajectoriesToProjectTree');
if (insertIdx === -1) throw new Error("Could not find insert point in src/api/handlers.ts");

let newHandlers = currentHandlers.substring(0, insertIdx) + extractedCode + currentHandlers.substring(insertIdx);

// Replace /api/trajectories
const trajRegex = /app\.get\('\/api\/trajectories', async \(req: Request, res: Response\) => \{[\s\S]*?\}\);/;
const newTraj = `app.get('/api/trajectories', async (req: Request, res: Response) => {
        try {
            const tree = await getCachedProjectsTree();
            res.json(tree);
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });`;

newHandlers = newHandlers.replace(trajRegex, newTraj);

fs.writeFileSync('src/api/handlers.ts', newHandlers);
console.log('Patch applied safely!');
