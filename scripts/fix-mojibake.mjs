import fs from 'fs';

for (const f of ['README.md', 'GITHUB_UPLOAD.md']) {
  let t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  t = t
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â€¦/g, '…')
    .replace(/â€œ/g, '“')
    .replace(/â€/g, '”')
    .replace(/â€˜/g, '‘')
    .replace(/â€™/g, '’')
    .replace(/Â©/g, '©')
    .replace(/â†’/g, '→');
  fs.writeFileSync(f, t, 'utf8');
  console.log('fixed', f);
}
