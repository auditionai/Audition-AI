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

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // 3. Body validation
    const { imageId } = JSON.parse(event.body || '{}');
    if (!imageId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Image ID is required.' }) };
    }

    try {
        // 4. Verify image ownership
        const { data: imageData, error: imageError } = await supabaseAdmin
            .from('generated_images')
            .select('user_id, image_url')
            .eq('id', imageId)
            .single();

        if (imageError || !imageData) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Image not found.' }) };
        }

        if (imageData.user_id !== user.id) {
            return { statusCode: 403, body: JSON.stringify({ error: 'You do not have permission to delete this image.' }) };
        }

        // 5. Delete image from R2 storage
        const imageUrl = imageData.image_url;
        const key = imageUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
        
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: key,
        });

        // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
        await (s3Client as any).send(deleteCommand);

        // 6. Delete image record from Supabase database
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