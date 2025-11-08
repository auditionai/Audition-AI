

import type { Handler, HandlerEvent } from "@netlify/functions";
import { supabaseAdmin } from './utils/supabaseClient';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Hằng số bảo mật, bạn sẽ cần tạo biến này trên Netlify
const MIGRATION_SECRET = process.env.MIGRATION_SECRET;

const handler: Handler = async (event: HandlerEvent) => {
    // --- BẢO MẬT: Chỉ chạy khi có secret key đúng ---
    const { secret } = event.queryStringParameters || {};
    if (!MIGRATION_SECRET || secret !== MIGRATION_SECRET) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden: Invalid secret.' }) };
    }
    console.log("--- [START] Storage Migration Script ---");

    // Khởi tạo các client cần thiết
    const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });

    try {
        // 1. Tìm tất cả các ảnh có URL vẫn còn trỏ đến Supabase Storage
        // Chúng ta giới hạn 50 ảnh mỗi lần chạy để tránh timeout
        const { data: oldImages, error: fetchError } = await supabaseAdmin
            .from('generated_images')
            .select('id, image_url, user_id')
            .like('image_url', `%${process.env.VITE_SUPABASE_URL}%`)
            .limit(50);

        if (fetchError) throw new Error(`Error fetching old images: ${fetchError.message}`);

        if (oldImages.length === 0) {
            console.log("--- [INFO] No more images found on Supabase Storage. Migration complete. ---");
            return { statusCode: 200, body: JSON.stringify({ message: "Migration complete. No images on Supabase Storage found." }) };
        }

        console.log(`--- [INFO] Found ${oldImages.length} images to migrate. Starting process... ---`);
        let migratedCount = 0;

        // 2. Lặp qua từng ảnh để di chuyển
        for (const image of oldImages) {
            try {
                // a. Tải file từ Supabase Storage
                // Lấy đường dẫn file từ URL, ví dụ: 'public/generated_images/user-id/12345.png' -> 'user-id/12345.png'
                const filePath = image.image_url.split('/generated_images/')[1];
                if (!filePath) {
                    console.warn(`[WARN] Skipping image ID ${image.id}: Could not parse file path from URL ${image.image_url}`);
                    continue;
                }

                console.log(`[PROCESS] Downloading: ${filePath}`);
                const { data: blob, error: downloadError } = await supabaseAdmin.storage
                    .from('generated_images')
                    .download(filePath);

                if (downloadError) throw new Error(`Failed to download ${filePath}: ${downloadError.message}`);
                
                const buffer = Buffer.from(await blob.arrayBuffer());
                const mimeType = blob.type;

                // b. Tải file lên Cloudflare R2
                const newFileName = `${image.user_id}/${Date.now()}_migrated.${mimeType.split('/')[1] || 'png'}`;
                console.log(`[PROCESS] Uploading to R2 as: ${newFileName}`);

                const putCommand = new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Key: newFileName,
                    Body: buffer,
                    ContentType: mimeType,
                });
                // FIX: Cast s3Client to 'any' to bypass a likely environment-specific TypeScript type resolution error.
                await (s3Client as any).send(putCommand);

                // c. Cập nhật URL trong CSDL
                const publicUrl = `${process.env.R2_PUBLIC_URL}/${newFileName}`;
                console.log(`[PROCESS] Updating DB for image ID ${image.id} with new URL: ${publicUrl}`);

                const { error: updateError } = await supabaseAdmin
                    .from('generated_images')
                    .update({ image_url: publicUrl })
                    .eq('id', image.id);
                
                if (updateError) throw new Error(`Failed to update DB for image ${image.id}: ${updateError.message}`);
                
                console.log(`[SUCCESS] Migrated image ID ${image.id}`);
                migratedCount++;

            } catch (imageError: any) {
                console.error(`[ERROR] Failed to migrate image ID ${image.id}. Reason: ${imageError.message}. Skipping to next image.`);
                // Tiếp tục với ảnh tiếp theo thay vì dừng toàn bộ kịch bản
            }
        }

        console.log(`--- [END] Finished migration batch. Migrated ${migratedCount} of ${oldImages.length} images. ---`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully migrated ${migratedCount} images in this batch. Run again if more images need migration.` }),
        };

    } catch (error: any) {
        console.error("--- [FATAL] A critical error occurred during migration ---", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Migration failed: ${error.message}` }) };
    }
};

export { handler };