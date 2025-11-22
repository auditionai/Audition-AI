<change>
    <file>netlify/functions/delete-image.ts</file>
    <description>Switch from soft delete (update null) to hard delete to fix database constraint violation</description>
    <content><![CDATA[
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Initialize S3 client for R2
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    // 2. Auth check
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const authHeader = event.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // FIX: Use Supabase v2 `auth.getUser` as `auth.api` is from v1.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    
    // Fetch user role
    const { data: userProfile } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single();
    const isAdmin = userProfile?.is_admin || false;


    // 3. Body validation
    const { imageId } = JSON.parse(event.body || '{}');
    if (!imageId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image ID is required.' }) };
    }

    try {
        // 4. Verify image ownership OR admin status
        const { data: imageData, error: imageError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id, image_url')
            .eq('id', imageId)
            .single();

        if (imageError || !imageData) {
            // If the image record doesn't exist, we can't do anything.
            // But we can return success to clear the UI if the client-side logic is optimistic.
            return { statusCode: 404, body: JSON.stringify({ error: 'Image not found in database.' }) };
        }

        // --- MODIFICATION: Allow deletion if user is owner OR is an admin ---
        if (imageData.user_id !== user.id && !isAdmin) {
            return { statusCode: 403, body: JSON.stringify({ error: 'You do not have permission to delete this image.' }) };
        }

        // 5. Attempt to delete image from R2 storage, but don't fail if it's already gone.
        const imageUrl = imageData.image_url;
        if (imageUrl && imageUrl !== 'PENDING') {
            try {
                // Improved URL parsing to handle encoded characters and different structures
                let key = '';
                try {
                    // If it's a valid URL, extract pathname
                    const urlObj = new URL(imageUrl);
                    // Remove leading slash to get key relative to bucket root
                    key = urlObj.pathname.substring(1); 
                } catch (e) {
                    // Fallback string replacement if URL parsing fails (legacy or relative paths)
                    const publicUrl = process.env.R2_PUBLIC_URL || '';
                    key = imageUrl.replace(`${publicUrl}/`, '');
                }
                
                // Decode URI component to handle spaces or special chars in filename
                key = decodeURIComponent(key);

                if (key) {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME!,
                        Key: key,
                    });
                    await (s3Client as any).send(deleteCommand);
                    console.log(`[delete-image] Successfully deleted ${key} from R2.`);
                }
            } catch (r2Error: any) {
                // Log the error but do not stop the function. This is key to fixing the bug.
                console.warn(`[delete-image] Could not delete image from R2 (it might already be gone). Image ID: ${imageId}. Error: ${r2Error.message}`);
            }
        }

        // 6. HARD DELETE the record to avoid not-null constraint on image_url
        const { error: deleteDbError } = await supabaseAdmin
            .from('generated_images')
            .delete()
            .eq('id', imageId);

        if (deleteDbError) {
            // This is a more critical error, so we should throw.
            throw new Error(`Failed to delete database record: ${deleteDbError.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Image deleted successfully.' }),
        };

    } catch (error: any) {
        console.error("Delete image function error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'An unknown server error occurred.' }) };
    }
};

export { handler };
]]></content>
</change>