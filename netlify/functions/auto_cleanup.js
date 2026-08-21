
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize R2
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || process.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

const r2BucketName = process.env.R2_BUCKET_NAME || process.env.VITE_R2_BUCKET_NAME;

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const expectedSecret = process.env.CRON_SECRET || '';
  const providedSecret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'] || '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!supabase) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Cleanup service is not configured' }) };
  }
  
  try {
    const RETENTION_DAYS = 7;
    // 1. Calculate Date Threshold
    const retentionThreshold = new Date();
    retentionThreshold.setDate(retentionThreshold.getDate() - RETENTION_DAYS);
    const isoDate = retentionThreshold.toISOString();
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    const errors = [];

    // 2. Query assets to delete: Older than the retention window AND NOT public (shared)
    const { data: imagesToDelete, error } = await supabase
      .from('generated_images')
      .select('id, user_id, is_public, image_url')
      .lt('created_at', isoDate)
      .eq('is_public', false)
      .limit(50); // Delete in batches to avoid timeouts

    if (error) throw error;

    // 3. Process Deletion for DB images
    if (imagesToDelete && imagesToDelete.length > 0) {
        for (const img of imagesToDelete) {
            try {
                const publicBase = process.env.VITE_R2_PUBLIC_URL;
                const imageUrl = img.image_url || '';
                const fileName = publicBase && imageUrl.startsWith(publicBase)
                    ? imageUrl.replace(`${publicBase}/`, '')
                    : null;

                // A. Delete from R2 only for legacy/published objects stored there
                if (fileName) {
                    await r2.send(new DeleteObjectCommand({
                        Bucket: r2BucketName,
                        Key: fileName
                    }));
                }

                // B. Delete from Database
                const { error: dbDelError } = await supabase
                    .from('generated_images')
                    .delete()
                    .eq('id', img.id);
                
                if (dbDelError) throw dbDelError;

                deletedCount++;
            } catch (e) {
                console.error(`Failed to delete image ${img.id}:`, e);
                errors.push({ id: img.id, error: e.message });
            }
        }
    }

    // 4. Process Deletion for orphaned inputs/ folder in R2
    let isTruncated = true;
    let continuationToken = undefined;
    while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
            Bucket: r2BucketName,
            Prefix: 'inputs/',
            ContinuationToken: continuationToken,
        });
        const listResponse = await r2.send(listCommand);
        const objects = listResponse.Contents || [];
        
        const objectsToDelete = objects.filter(obj => {
            if (!obj.Key || !obj.LastModified) return false;
            const age = now - obj.LastModified.getTime();
            return age > retentionMs;
        }).map(obj => ({ Key: obj.Key }));

        if (objectsToDelete.length > 0) {
            await r2.send(new DeleteObjectsCommand({
                Bucket: r2BucketName,
                Delete: { Objects: objectsToDelete }
            }));
            deletedCount += objectsToDelete.length;
        }
        isTruncated = listResponse.IsTruncated || false;
        continuationToken = listResponse.NextContinuationToken;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Deleted ${deletedCount} images.`,
        errors: errors
      })
    };

  } catch (error) {
    console.error("Cleanup Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
