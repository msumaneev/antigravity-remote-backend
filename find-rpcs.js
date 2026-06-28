const fs = require('fs');

const path = 'C:\\Users\\Michael Sumaneev\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe';
const buffer = fs.readFileSync(path);

// we can just regex over the buffer directly or convert to string (might be huge, so we process in chunks)
const str = buffer.toString('ascii'); // Warning: might take 100-200MB of RAM, which Node can handle easily
const matches = str.match(/Get[A-Z][a-zA-Z0-9]+/g);
if (matches) {
    const unique = [...new Set(matches)];
    const interesting = unique.filter(m => /Usage|Limit|Quota|Sub|Model|User/i.test(m));
    console.log(interesting.join('\n'));
} else {
    console.log("No matches found.");
}
