/**
 * Centralized secrets management for Netlify functions
 * Uses getEnvVar to support both Netlify env vars and .env file fallback
 */

import { getEnvVar } from './_env-loader';

export const getCloudflareRouterUrl = () => getEnvVar('CLOUDFLARE_QUEUE_ROUTER_URL');
export const getCloudflareQueueWorkerSecret = () => getEnvVar('CLOUDFLARE_QUEUE_WORKER_SECRET');

export const getTstApiKey = () => getEnvVar('TST_API_KEY');
export const getGpti2ApiKey = () => getEnvVar('GPTI2_API_KEY');
export const getGommoAccessToken = () => getEnvVar('GOMMO_ACCESS_TOKEN', 'GOMMO_API_TOKEN');

export const getGrokApiKey = () => getEnvVar('GROK_API_KEY');
export const getGrokHealthCheckUrl = () => getEnvVar('GROK_HEALTH_CHECK_URL');

export const getSepayMerchantId = () => getEnvVar('SEPAY_MERCHANT_ID');
export const getSepaySecretKey = () => getEnvVar('SEPAY_SECRET_KEY');
export const getSepayApiToken = () => getEnvVar('SEPAY_API_TOKEN', 'SEPAY_USER_API_TOKEN');
export const getSepayEnv = () => getEnvVar('SEPAY_ENV');
export const getSepayPaymentMethod = () => getEnvVar('SEPAY_PAYMENT_METHOD');
export const getSepayApiTimeoutMs = () => getEnvVar('SEPAY_API_TIMEOUT_MS');
