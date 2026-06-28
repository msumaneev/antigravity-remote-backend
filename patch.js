const fs = require('fs');
const oldHandlers = fs.readFileSync('old_handlers.ts', 'utf8');
const currentHandlers = fs.readFileSync('src/api/handlers.ts', 'utf8');

const oldGetCachedStart = oldHandlers.indexOf('let cachedProjectsTree');
const oldTransformEnd = oldHandlers.indexOf('\nimport multer from');
const insertCode = oldHandlers.substring(oldGetCachedStart, oldTransformEnd);

const curTransformStart = currentHandlers.indexOf('function transformTrajectoriesToProjectTree');
const curTransformEnd = currentHandlers.indexOf('\nimport multer from');

let newHandlers = currentHandlers.substring(0, curTransformStart) + insertCode + currentHandlers.substring(curTransformEnd);

const oldTrajStart = oldHandlers.indexOf('    app.get(\'/api/trajectories\'');
const oldTrajEnd = oldHandlers.indexOf('    app.get(\'/api/models\'');
const trajCode = oldHandlers.substring(oldTrajStart, oldTrajEnd);

const curTrajStart = newHandlers.indexOf('    app.get(\'/api/trajectories\'');
const curTrajEnd = newHandlers.indexOf('    app.get(\'/api/models\'');

newHandlers = newHandlers.substring(0, curTrajStart) + trajCode + newHandlers.substring(curTrajEnd);

fs.writeFileSync('src/api/handlers.ts', newHandlers);
console.log('Patch applied successfully.');
