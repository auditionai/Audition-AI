/**
 * Environment variable loader with fallback to local .env file
 * to work around Netlify's 4KB environment variables limit.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let envCache: Record<string, string> | null = null;

const loadEnvFile = (): Record<string, string> => {
  if (envCache) return envCache;

  try {
    // Try to load .env.secrets from the same directory (bundled by Netlify)
    const envPath = join(__dirname, '.env.secrets');
    const content = readFileSync(envPath, 'utf-8');

    const parsed: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        parsed[key.trim()] = value.trim();
      }
    }

    envCache = parsed;
    return parsed;
  } catch {
    // .env file not found or not readable - return empty object
    envCache = {};
    return {};
  }
};

/**
 * Get environment variable with fallback to bundled .env.secrets file
 */
export const getEnvVar = (...keys: string[]): string => {
  // First try process.env (Netlify will have minimal env vars)
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }

  // Then try bundled .env.secrets file
  const envFile = loadEnvFile();
  for (const key of keys) {
    const value = envFile[key];
    if (value) return value;
  }

  return '';
};
