#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// List of secret keys to bundle into .env.secrets
const SECRET_KEYS = [
  'CAULENHAU_SUPABASE_ANON_KEY',
  'CAULENHAU_SUPABASE_URL',
  'CLOUDFLARE_QUEUE_ROUTER_URL',
  'CLOUDFLARE_QUEUE_WORKER_SECRET',
  'DISABLE_BACKGROUND_QUEUE_TRIGGER',
  'GOMMO_ACCESS_TOKEN',
  'GOMMO_API_TOKEN',
  'GOMMO_DOMAIN',
  'GOMMO_PROJECT_ID',
  'GOOGLE_CLOUD_LOCATION',
  'GPTI2_API_KEY',
  'GROK_API_KEY',
  'GROK_HEALTH_CHECK_URL',
  'QUEUE_WORKER_MODE',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'TST_API_KEY',
];

const outputPath = path.join(__dirname, '.env.secrets');
const lines = [];

for (const key of SECRET_KEYS) {
  const value = process.env[key];
  if (value) {
    lines.push(`${key}=${value}`);
  }
}

fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.log(`✓ Generated ${outputPath} with ${lines.length} secrets`);
