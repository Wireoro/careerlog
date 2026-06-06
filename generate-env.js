/*
  generate-env.js — run this script once before opening the app locally.
  It reads your .env file and writes env.js, which makes your
  environment variables available to the browser as window.__ENV__.

  Usage:
    node generate-env.js

  This file IS safe to commit. It contains no secrets — it only
  reads from .env (which is gitignored) and writes env.js (also gitignored).

  On Netlify / Vercel:
    You don't need this script. Set your env vars in the platform dashboard
    and they get injected automatically at deploy time.
*/

const fs   = require('fs');
const path = require('path');

const envPath    = path.join(__dirname, '.env');
const outputPath = path.join(__dirname, 'env.js');

if (!fs.existsSync(envPath)) {
  console.error('❌  No .env file found. Create one first (see .env.example).');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const vars  = {};

lines.forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...rest] = trimmed.split('=');
  if (key) vars[key.trim()] = rest.join('=').trim();
});

const output = `/* AUTO-GENERATED — do not edit. Run: node generate-env.js */
/* This file is gitignored — it is only for local development. */
window.__ENV__ = ${JSON.stringify(vars, null, 2)};
`;

fs.writeFileSync(outputPath, output);
console.log('✅  env.js generated with keys:', Object.keys(vars).join(', '));
