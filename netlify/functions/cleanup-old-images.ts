
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// This handler is triggered by the Netlify scheduler based on the netlify.toml configuration.
const handler: Handler = async () => {
    console.log("--- [START] Scheduled Job: Cleanup Old Images ---");

    // Initialize the S3 client
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT || '',
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
    });

    try {
        // 1. Calculate the cutoff date (3 days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 3);
        const cutoffISOString = cutoffDate.toISOString();

        console.log(`[INFO] Deleting non-public images created before: ${cutoffISOString}`);

        // 2. Fetch old non-public images
        const { data: oldImages, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('id, image_url')
            .lt('created_at', cutoffISOString)
            .eq('is_public', false)
            .limit(50);

        if (fetchError) {
            throw new Error(`Error fetching old images: ${fetchError.message}`);
        }

        if (!oldImages || oldImages.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "No old images to delete." }),
            };
        }

        console.log(`[INFO] Found ${oldImages.length} images to process.`);
        const imageIdsToDelete: string[] = [];
        const r2DeletePromises: Promise<any>[] = [];

        // 3. Prepare R2 deletions
        for (const image of oldImages) {
            if (image.image_url && image.image_url !== 'PENDING' && image.image_url.startsWith(process.env.R2_PUBLIC_URL!)) {
                const key = image.image_url.replace(`${process.env.R2_PUBLIC_URL}/`, '');
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME || '',
                    Key: key,
                });
                r2DeletePromises.push((s3Client as any).send(deleteCommand));
            }
            imageIdsToDelete.push(image.id);
        }
        
        // 4. Execute R2 deletions
        await Promise.allSettled(r2DeletePromises);

        // 5. HARD DELETE records from Database
        // Replacing UPDATE NULL with DELETE to respect NOT NULL constraints
        if (imageIdsToDelete.length > 0) {
            const { error: dbDeleteError } = await supabaseAdmin
                .from('generated_images')
                .delete()
                .in('id', imageIdsToDelete);

            if (dbDeleteError) {
                throw new Error(`Failed to delete records from database: ${dbDeleteError.message}`);
            }
            console.log(`[INFO] Successfully deleted ${imageIdsToDelete.length} records from database.`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Cleanup successful. Deleted ${oldImages.length} images.` }),
        };

    } catch (error: any) {
        console.error("--- [FATAL] Error in cleanup-old-images function ---", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

export { handler };
