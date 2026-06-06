/*
  generate-env.js
  Works in two modes:
  - Locally: reads from .env file
  - Render / CI: reads from system environment variables
*/

const fs   = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, 'env.js');

const KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY'];

const vars = {};

// Try .env file first (local development)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key) vars[key.trim()] = rest.join('=').trim();
  });
  console.log('Reading from .env file...');
} else {
  // No .env file — read from system environment (Render, CI, etc.)
  console.log('No .env file found. Reading from system environment variables...');
}

// Always also read from system environment (system vars override .env)
KEYS.forEach(key => {
  if (process.env[key]) vars[key] = process.env[key];
});

// Check all required keys are present
const missing = KEYS.filter(k => !vars[k]);
if (missing.length > 0) {
  console.error('Missing environment variables:', missing.join(', '));
  console.error('Set them in your Render dashboard under Environment Variables.');
  process.exit(1);
}

const output = `/* AUTO-GENERATED — do not edit */
window.__ENV__ = ${JSON.stringify(vars, null, 2)};
`;

fs.writeFileSync(outputPath, output);
console.log('env.js generated with keys:', Object.keys(vars).join(', '));
