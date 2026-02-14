
import { S3Client } from "@aws-sdk/client-s3";

// Ensure env vars are loaded (Vite or Process)
const metaEnv = (import.meta as any).env || {};
const processEnv = window.process?.env || {};

const R2_ENDPOINT = metaEnv.VITE_R2_ENDPOINT || processEnv.VITE_R2_ENDPOINT;
const R2_ACCESS_KEY_ID = metaEnv.VITE_R2_ACCESS_KEY_ID || processEnv.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = metaEnv.VITE_R2_SECRET_ACCESS_KEY || processEnv.VITE_R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = metaEnv.VITE_R2_BUCKET_NAME || processEnv.VITE_R2_BUCKET_NAME;
export const R2_PUBLIC_DOMAIN = metaEnv.VITE_R2_PUBLIC_DOMAIN || processEnv.VITE_R2_PUBLIC_DOMAIN;

let s3Client: S3Client | null = null;

if (R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    try {
        s3Client = new S3Client({
            region: "auto",
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });
        console.log("[System] Cloudflare R2 Client Initialized.");
    } catch (e) {
        console.error("Failed to initialize R2 Client", e);
        s3Client = null;
    }
} else {
    console.warn("[System] Missing R2 Configuration. Images will fall back to Local Storage.");
}

export const r2Client = s3Client;
