
// DYNAMIC IMPORT PATTERN for AWS SDK
// We remove the top-level import to prevent load blocking

// Ensure env vars are loaded safely
const metaEnv = (import.meta as any).env || {};
const processEnv = typeof window !== 'undefined' && (window as any).process ? (window as any).process.env : {};

const R2_ENDPOINT = metaEnv.VITE_R2_ENDPOINT || processEnv.VITE_R2_ENDPOINT;
const R2_ACCESS_KEY_ID = metaEnv.VITE_R2_ACCESS_KEY_ID || processEnv.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = metaEnv.VITE_R2_SECRET_ACCESS_KEY || processEnv.VITE_R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = metaEnv.VITE_R2_BUCKET_NAME || processEnv.VITE_R2_BUCKET_NAME;
export const R2_PUBLIC_DOMAIN = metaEnv.VITE_R2_PUBLIC_DOMAIN || processEnv.VITE_R2_PUBLIC_DOMAIN;

let cachedClient: any = null;

export const getR2Client = async () => {
    if (cachedClient) return cachedClient;

    if (R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
        try {
            // Lazy load the heavy AWS SDK
            // @ts-ignore
            const { S3Client } = await import("https://esm.sh/@aws-sdk/client-s3@3.620.0");
            
            cachedClient = new S3Client({
                region: "auto",
                endpoint: R2_ENDPOINT,
                credentials: {
                    accessKeyId: R2_ACCESS_KEY_ID,
                    secretAccessKey: R2_SECRET_ACCESS_KEY,
                },
            });
            console.log("[System] R2 Client Loaded Dynamically.");
            return cachedClient;
        } catch (e) {
            console.warn("Failed to load AWS SDK:", e);
            return null;
        }
    }
    return null;
};
