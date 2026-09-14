'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const cloudflareAssetLimit = 25 * 1024 * 1024;
const publicFiles = [
  'index.html',
  'app.js',
  'i18n.js',
  'style.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

for (const file of publicFiles) {
  const source = path.join(projectRoot, file);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing required public asset: ${file}`);
  }
}

for (const file of publicFiles) {
  const source = path.join(projectRoot, file);
  const size = fs.statSync(source).size;
  if (size > cloudflareAssetLimit) {
    throw new Error(`Cloudflare asset exceeds 25 MiB: ${file}`);
  }
}

const assetIgnore = fs.readFileSync(path.join(projectRoot, '.assetsignore'), 'utf8');
for (const file of publicFiles) {
  if (!assetIgnore.includes(`!${file}`)) {
    throw new Error(`Public asset is not allowlisted in .assetsignore: ${file}`);
  }
}

console.log(`Validated ${publicFiles.length} root-level static assets for Cloudflare`);
