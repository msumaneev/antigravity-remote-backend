const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/');

ws.on('open', () => {
    console.log('Connected to WebSocket server');
    // Request conversations to make sure we get some traffic
    ws.send(JSON.stringify({ type: 'LIST_CONVERSATIONS' }));
});

ws.on('message', (data) => {
    try {
        const json = JSON.parse(data.toString());
        console.log('Received message type:', json.type);
        if (json.type === 'AGENT_STATE') {
            console.log('AGENT_STATE Data:', JSON.stringify(json.data, null, 2));
        } else if (json.type === 'CONVERSATIONS_LIST') {
            console.log('Conversations count:', json.data.length);
        }
    } catch (e) {
        console.log('Raw message:', data.toString());
    }
});

ws.on('close', () => {
    console.log('Connection closed');
});

ws.on('error', (err) => {
    console.error('WebSocket error:', err);
});

// Run for 10 seconds then exit
setTimeout(() => {
    console.log('Exiting...');
    ws.close();
    process.exit(0);
}, 10000);
