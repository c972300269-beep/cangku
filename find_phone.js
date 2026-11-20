// Search for a phone number inside text files, docx/xlsx (zip) and raw scans of dirs.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TARGETS = ['18127418049', '1812741', '3867022'];
const ROOTS = (process.argv[2] ? process.argv[2].split('|') : [
  'D:\\',
  'E:\\',
  'C:\\Users\\chenjialin3\\Desktop',
  'C:\\Users\\chenjialin3\\Downloads',
]);
const TEXT_EXT = new Set(['.txt', '.md', '.json', '.csv', '.html', '.htm', '.xml', '.yaml', '.yml', '.js', '.py', '.log', '.ini', '.cfg']);
const ZIP_EXT = new Set(['.docx', '.xlsx', '.pptx', '.docm', '.xlsm', '.odt', '.ods']);
const SKIP = /\\(node_modules|\.git|\\AppData\\Local\\(Packages|Temp\\workbuddy-tmp))\\/i;
const MAX = 40 * 1024 * 1024;

function hit(buf) {
  const s = buf.toString('utf8');
  for (const t of TARGETS) if (s.includes(t)) return t;
  // utf16le fallback
  try {
    const u = buf.toString('utf16le');
    for (const t of TARGETS) if (u.includes(t)) return t + '(utf16)';
  } catch (e) {}
  return null;
}

function scanZip(file) {
  // read central directory entries and inflate
  const buf = fs.readFileSync(file);
  const out = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    let csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    off += 46 + nlen + elen + clen;
    if (csize === 0 || csize > 10 * 1024 * 1024) continue;
    if (!/\.(xml|rels|txt)$/i.test(name)) continue;
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const dstart = lho + 30 + lnlen + lelen;
    try {
      let data = buf.slice(dstart, dstart + csize);
      if (method === 8) data = zlib.inflateRawSync(data);
      const h = hit(data);
      if (h) out.push(name + ' :: ' + h);
    } catch (e) {}
  }
  return out;
}

const found = [];
function walk(dir, depth) {
  if (depth > 8) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p + '\\')) continue;
    if (e.isDirectory()) { walk(p, depth + 1); continue; }
    if (!e.isFile()) continue;
    const ext = path.extname(p).toLowerCase();
    try {
      const st = fs.statSync(p);
      if (st.size > MAX) continue;
      if (TEXT_EXT.has(ext)) {
        const h = hit(fs.readFileSync(p));
        if (h) found.push(p + '  [' + h + ']');
      } else if (ZIP_EXT.has(ext)) {
        const r = scanZip(p);
        if (r.length) found.push(p + '  {' + r.join(' | ') + '}');
      }
    } catch (err) {}
  }
}

for (const r of ROOTS) walk(r, 0);
console.log('FOUND=' + found.length);
found.slice(0, 50).forEach(f => console.log(f));
