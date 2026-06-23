const fs = require('fs');
const path = require('path');
const { app } = require('./dist/api/handlers.js'); // Not exported, so we have to copy the logic or require

// Let's just do a curl to our own server!
const http = require('http');
http.get('http://localhost:8080/api/search?q=An', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('An:', data));
});
http.get('http://localhost:8080/api/search?q=A', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('A:', data));
});
