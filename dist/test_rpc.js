"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handlers_1 = require("./api/handlers");
async function run() {
    try {
        const userStatus = await (0, handlers_1.callRPC)('GetUserStatus', {}, { timeoutMs: 3000 });
        console.log(JSON.stringify(userStatus, null, 2));
    }
    catch (e) {
        console.error(e);
    }
}
run();
