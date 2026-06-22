const fs = require('fs');
const buf = fs.readFileSync('C:/Users/Michael Sumaneev/.gemini/antigravity/agyhub_summaries_proto.pb');
const regex = /\n\$([a-f0-9\-]{36})\x12.*?\n(.)/gs;
let match;
while ((match = regex.exec(buf)) !== null) {
  const uuid = match[1];
  const len = match[2].charCodeAt(0);
  const titleStart = match.index + match[0].length;
  // If the length byte is a varint, we might need to handle it better.
  // For small titles, length is < 128, so one byte is enough.
  if (len < 128) {
    const title = buf.toString('utf8', titleStart, titleStart + len);
    if (/^[A-Za-z0-9 ]/.test(title)) { // Basic heuristic to filter garbage
      console.log(uuid, title);
    }
  }
}
