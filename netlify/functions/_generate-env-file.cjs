#!/usr/bin/env node
// Script to generate .env.secrets file from environment variables during build
const fs = require('fs');
const path = require('path');

const secretKeys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TST_API_KEY',
  'GPTI2_API_KEY',
  'CLOUDFLARE_QUEUE_ROUTER_URL',
  'CLOUDFLARE_QUEUE_WORKER_SECRET',
  'GOMMO_ACCESS_TOKEN',
  'GOMMO_API_TOKEN',
  'GROK_API_KEY',
  'GROK_HEALTH_CHECK_URL',
  'CAULENHAU_SUPABASE_URL',
  'CAULENHAU_SUPABASE_ANON_KEY',
  'SEPAY_MERCHANT_ID',
  'SEPAY_SECRET_KEY',
  'SEPAY_SUCCESS_URL',
  'SEPAY_ERROR_URL',
  'SEPAY_IPN_URL',
  'SEPAY_PAYMENT_METHOD',
];

const lines = secretKeys
  .filter(key => process.env[key])
  .map(key => `${key}=${process.env[key]}`);

const outputPath = path.join(__dirname, '.env.secrets');
fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
console.log(`✓ Generated ${outputPath} with ${lines.length} secrets`);
