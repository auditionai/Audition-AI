import type { Handler, HandlerEvent } from "@netlify/functions";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

// This secret should be set in your Netlify environment variables
const RESET_SECRET = process.env.MIGRATION_SECRET;

const handler: Handler = async (event: HandlerEvent) => {
    // --- SECURITY CHECK ---
    const { secret } = event.queryStringParameters || {};
    if (!RESET_SECRET || secret !== RESET_SECRET) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Invalid secret.' }) };
    }

    console.log("--- [START] R2 BUCKET RESET SCRIPT ---");

    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    const bucketName = process.env.R2_BUCKET_NAME!;
    let totalDeleted = 0;
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    try {
        while (isTruncated) {
            const listParams = {
                Bucket: bucketName,
                ContinuationToken: continuationToken,
            };

            const listCommand = new ListObjectsV2Command(listParams);
            const listedObjects = await (s3Client as any).send(listCommand);

            if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
                break; // No more objects to delete
            }

            const deleteParams = {
                Bucket: bucketName,
                Delete: {
                    Objects: listedObjects.Contents.map(({ Key }: { Key: string }) => ({ Key })),
                },
            };

            const deleteCommand = new DeleteObjectsCommand(deleteParams);
            await (s3Client as any).send(deleteCommand);

            const deletedCount = listedObjects.Contents.length;
            totalDeleted += deletedCount;
            console.log(`[INFO] Deleted a batch of ${deletedCount} objects.`);

            isTruncated = listedObjects.IsTruncated || false;
            continuationToken = listedObjects.NextContinuationToken;
        }

        console.log(`--- [END] R2 Reset Complete. Total objects deleted: ${totalDeleted} ---`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Reset complete. Total objects deleted: ${totalDeleted}` }),
        };

    } catch (error: any) {
        console.error("--- [FATAL] A critical error occurred during R2 reset ---", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Reset failed: ${error.message}` }) };
    }
};

export { handler };