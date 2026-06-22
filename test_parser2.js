const fs = require('fs');
const buf = fs.readFileSync('C:/Users/Michael Sumaneev/.gemini/antigravity/agyhub_summaries_proto.pb');
const map = {};
let idx = 0;
while (idx < buf.length) {
    if (buf[idx] === 0x0a && buf[idx+1] === 0x24) { // \n$
        const uuid = buf.toString('ascii', idx+2, idx+38);
        if (/^[a-f0-9\-]{36}$/.test(uuid)) {
            let tIdx = idx + 38;
            if (buf[tIdx] === 0x12) {
                tIdx++;
                while(buf[tIdx] >= 128) tIdx++;
                tIdx++;
                if (buf[tIdx] === 0x0a) {
                    tIdx++;
                    let titleLen = buf[tIdx];
                    if (titleLen < 128) {
                        tIdx++;
                        const title = buf.toString('utf8', tIdx, tIdx + titleLen);
                        if (/^[A-Za-zА-Яа-я0-9]/.test(title)) {
                            map[uuid] = title;
                        }
                    }
                }
            }
        }
    }
    idx++;
}
for (const k in map) {
    if (map[k].includes('Automated Testing')) {
        console.log('Automated found for UUID:', k);
    }
    if (k === 'c9595225-471f-45a8-b6ce-841f16b97dfd') {
        console.log('c9595225... title is:', map[k]);
    }
}
