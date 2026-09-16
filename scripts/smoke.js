// Headless-Selbsttest: node scripts/smoke.js [library-ordner]
// Baut nichts – vorher `npm run build` (siehe npm-Script "smoke").
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

const dir = resolve(process.argv[2] ?? 'samples/DemoProject')
const r = spawnSync('npx electron-vite preview', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ASSET_LIBRARY_SMOKE: dir }
})
process.exit(r.status ?? 1)
