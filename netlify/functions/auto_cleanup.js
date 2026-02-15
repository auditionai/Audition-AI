
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // Or Service Role Key for better permission
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize R2
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

export const handler = async (event, context) => {
  // Security check: You might want to add a secret query param here to prevent public triggering
  // e.g. ?secret=MY_ADMIN_SECRET
  
  try {
    // 1. Calculate Date Threshold (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoDate = sevenDaysAgo.toISOString();

    // 2. Query images to delete: Older than 7 days AND NOT public (shared)
    const { data: imagesToDelete, error } = await supabase
      .from('generated_images')
      .select('id, user_id, is_public')
      .lt('created_at', isoDate)
      .eq('is_public', false)
      .limit(50); // Delete in batches to avoid timeouts

    if (error) throw error;

    if (!imagesToDelete || imagesToDelete.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No images to cleanup." })
      };
    }

    let deletedCount = 0;
    const errors = [];

    // 3. Process Deletion
    for (const img of imagesToDelete) {
        try {
            const fileName = `${img.user_id}/${img.id}.png`;

            // A. Delete from R2
            await r2.send(new DeleteObjectCommand({
                Bucket: process.env.VITE_R2_BUCKET_NAME,
                Key: fileName
            }));

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
