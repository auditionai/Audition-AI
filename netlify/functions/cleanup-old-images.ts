import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// This handler is triggered by the Netlify scheduler based on the netlify.toml configuration.
const handler: Handler = async () => {
    console.log("--- [START] Scheduled Job: Cleanup Old Images ---");

    // Initialize the S3 client to interact with Cloudflare R2 storage.
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    try {
        // 1. Calculate the cutoff date (7 days ago from the current time).
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        const cutoffISOString = cutoffDate.toISOString();

        console.log(`[INFO] Deleting images created before: ${cutoffISOString}`);

        // 2. Fetch up to 100 images from the database that are older than the cutoff date.
        // A limit is used to prevent function timeouts if there's a large backlog of images.
        const { data: oldImages, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('id, image_url')
            .lt('created_at', cutoffISOString)
            .limit(100);

        if (fetchError) {
            throw new Error(`Error fetching old images: ${fetchError.message}`);
        }

        if (!oldImages || oldImages.length === 0) {
            console.log("[INFO] No old images found to delete. Job complete.");
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "No old images to delete." }),
            };
        }

        console.log(`[INFO] Found ${oldImages.length} images to delete.`);
        const imageIdsToDeleteFromDb: string[] = [];
        const r2DeletePromises: Promise<any>[] = [];

        // 3. Prepare promises to delete each image file from R2 storage.
        for (const image of oldImages) {
            if (image.image_url && image.image_url.startsWith(process.env.R2_PUBLIC_URL!)) {
                // Extract the object key from the full public URL.
                const key = image.image_url.replace(`${process.env.R2_PUBLIC_URL}/`, '');
                
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Key: key,
                });
                
                // Add the delete promise to an array and the ID to a list for DB deletion.
                r2DeletePromises.push((s3Client as any).send(deleteCommand));
                imageIdsToDeleteFromDb.push(image.id);
            }
        }
        
        // 4. Execute all R2 file deletions in parallel for efficiency.
        const r2Results = await Promise.allSettled(r2DeletePromises);
        r2Results.forEach((result, index) => {
            if (result.status === 'rejected') {
                // Log a warning but don't stop the process if one file fails to delete.
                console.warn(`[WARN] Failed to delete image from R2 for DB ID ${imageIdsToDeleteFromDb[index]}:`, result.reason);
            }
        });

        // 5. Delete the corresponding records from the Supabase database.
        if (imageIdsToDeleteFromDb.length > 0) {
            const { error: dbDeleteError } = await supabaseAdmin
                .from('generated_images')
                .delete()
                .in('id', imageIdsToDeleteFromDb);

            if (dbDeleteError) {
                throw new Error(`Failed to delete records from database: ${dbDeleteError.message}`);
            }
            console.log(`[INFO] Successfully deleted ${imageIdsToDeleteFromDb.length} records from the database.`);
        }

        console.log("--- [END] Cleanup Job Finished Successfully ---");
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Cleanup successful. Processed ${oldImages.length} images.` }),
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
