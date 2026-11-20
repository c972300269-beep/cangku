const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chenjialin3';
const candidates = [];
function probe(p) { try { if (fs.statSync(p).isDirectory()) candidates.push(p); } catch (e) {} }
['Documents', 'Desktop', 'Downloads', 'OneDrive'].forEach(d => {
  probe(path.join(base, d));
  ['WeChat Files', 'xwechat_files', 'WPS Cloud Files', 'Tencent Files', 'WPS Office'].forEach(sub => {
    probe(path.join(base, d, sub));
  });
});
probe('D:\\');
probe('E:\\');
console.log('EXISTING_DIRS:');
candidates.forEach(c => console.log('  ' + c));
