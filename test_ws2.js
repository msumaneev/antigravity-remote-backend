const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', () => {
    console.log('Connected to WebSocket');
    ws.send(JSON.stringify({ type: 'LIST_CONVERSATIONS' }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'CONVERSATIONS_LIST') {
        console.log('Received CONVERSATIONS_LIST:');
        console.log(JSON.stringify(msg.data, null, 2));
        ws.close();
    } else if (msg.type === 'ERROR') {
        console.log('ERROR:', msg.error);
    } else {
        console.log('MSG TYPE:', msg.type);
    }
});
