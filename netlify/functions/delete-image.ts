
import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const handler: Handler = async (event: HandlerEvent) => {
    // 1. Initialize S3 client for R2
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT || '',
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
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

    // FIX: Use Supabase v2 `auth.getUser`
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
            return { statusCode: 404, body: JSON.stringify({ error: 'Image not found in database.' }) };
        }

        // Allow deletion if user is owner OR is an admin
        if (imageData.user_id !== user.id && !isAdmin) {
            return { statusCode: 403, body: JSON.stringify({ error: 'You do not have permission to delete this image.' }) };
        }

        // 5. Attempt to delete image from R2 storage
        const imageUrl = imageData.image_url;
        if (imageUrl && imageUrl !== 'PENDING') {
            try {
                let key = '';
                try {
                    const urlObj = new URL(imageUrl);
                    key = urlObj.pathname.substring(1); 
                } catch (e) {
                    // Fallback for manual URL construction if needed
                    const publicUrl = process.env.R2_PUBLIC_URL || '';
                    key = imageUrl.replace(`${publicUrl}/`, '');
                }
                
                key = decodeURIComponent(key);

                if (key) {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME || '',
                        Key: key,
                    });
                    // Cast to any to avoid potential type mismatches with R2's "auto" region
                    await (s3Client as any).send(deleteCommand);
                    console.log(`[delete-image] Successfully deleted ${key} from R2.`);
                }
            } catch (r2Error: any) {
                console.warn(`[delete-image] Could not delete image from R2 (it might already be gone). Image ID: ${imageId}. Error: ${r2Error.message}`);
            }
        }

        // 6. DELETE image record from Supabase (Hard Delete)
        // We delete the row entirely instead of updating image_url to null to avoid NOT NULL constraints
        const { error: deleteDbError } = await supabaseAdmin
            .from('generated_images')
            .delete()
            .eq('id', imageId);

        if (deleteDbError) {
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
