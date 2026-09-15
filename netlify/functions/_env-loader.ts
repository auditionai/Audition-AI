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
    // Try to load .env from project root (2 levels up from netlify/functions)
    const envPath = join(__dirname, '..', '..', '.env');
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
 * Get environment variable with fallback to .env file
 */
export const getEnvVar = (...keys: string[]): string => {
  // First try process.env (Netlify environment variables)
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }

  // Fallback to .env file
  const envFile = loadEnvFile();
  for (const key of keys) {
    const value = envFile[key];
    if (value) return value;
  }

  return '';
};
