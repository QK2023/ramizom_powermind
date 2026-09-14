'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
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
  'apple-touch-icon.png',
  '_headers'
];

for (const file of publicFiles) {
  const source = path.join(projectRoot, file);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing required public asset: ${file}`);
  }
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of publicFiles) {
  const source = path.join(projectRoot, file);
  const size = fs.statSync(source).size;
  if (size > cloudflareAssetLimit) {
    throw new Error(`Cloudflare asset exceeds 25 MiB: ${file}`);
  }
  fs.copyFileSync(source, path.join(outputDirectory, file));
}

if (!fs.existsSync(path.join(outputDirectory, 'index.html'))) {
  throw new Error('Build output does not contain a top-level index.html');
}

console.log(`Built ${publicFiles.length} static assets in dist/`);
