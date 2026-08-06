import fs from 'fs';
import path from 'path';

const root = process.cwd();
const outPath = process.argv[2] || path.join(process.env.TEMP || '/tmp', 'butler-text-files.json');

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'scripts') continue;
      walk(p, acc);
    } else {
      const rel = path.relative(root, p).split(path.sep).join('/');
      const ext = path.extname(e.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.mp4', '.webm', '.gif'].includes(ext)) continue;
      acc.push(rel);
    }
  }
  return acc;
}

const files = walk(root);
const batches = [];
let current = [];
let currentSize = 0;
const MAX = 900_000; // ~0.9MB per batch for MCP

for (const f of files) {
  const content = fs.readFileSync(path.join(root, f), 'utf8');
  const size = Buffer.byteLength(content, 'utf8');
  if (current.length && currentSize + size > MAX) {
    batches.push(current);
    current = [];
    currentSize = 0;
  }
  current.push({ path: f, content });
  currentSize += size;
}
if (current.length) batches.push(current);

fs.writeFileSync(outPath + '.meta.json', JSON.stringify({
  totalFiles: files.length,
  batches: batches.map((b, i) => ({ index: i, count: b.length })),
}));

batches.forEach((b, i) => {
  fs.writeFileSync(`${outPath}.batch${i}.json`, JSON.stringify(b));
  console.log(`batch ${i}: ${b.length} files, ${fs.statSync(`${outPath}.batch${i}.json`).size} bytes`);
});
