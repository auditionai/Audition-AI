-- Restore indexes that existed on the source project but were not present in the tracked migrations.
CREATE INDEX IF NOT EXISTS idx_generated_images_failed_result_rescue
  ON public.generated_images USING btree (updated_at, id)
  WHERE status = 'failed'::text AND job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_active_created
  ON public.generated_images USING btree (status, created_at, id)
  WHERE queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_counts_user_status_asset
  ON public.generated_images USING btree (user_id, status, asset_type)
  WHERE queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_dispatch_ready
  ON public.generated_images USING btree (status, asset_type, created_at, id)
  WHERE queue_payload IS NOT NULL
    AND queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_poll_ready
  ON public.generated_images USING btree (status, next_poll_at, processing_started_at, created_at, id)
  WHERE job_id IS NOT NULL
    AND queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_stale_polling
  ON public.generated_images USING btree (updated_at, id)
  WHERE status = 'processing'::text
    AND job_id IS NOT NULL
    AND queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_queue_stale_predispatch
  ON public.generated_images USING btree (updated_at, id)
  WHERE job_id IS NULL
    AND status = ANY (ARRAY['queued'::text, 'processing'::text])
    AND queue_kind = ANY (ARRAY['image_generate'::text, 'video_generate'::text, 'motion_generate'::text]);

CREATE INDEX IF NOT EXISTS idx_generated_images_retention_cleanup
  ON public.generated_images USING btree (COALESCE(finished_at, updated_at, created_at), id)
  WHERE status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])
    AND is_public IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_gift_code_usages_browser_key_hash
  ON public.gift_code_usages USING btree (browser_key_hash, created_at DESC)
  WHERE browser_key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_code_usages_campaign_status
  ON public.gift_code_usages USING btree (campaign_key, abuse_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gift_code_usages_email_fingerprint
  ON public.gift_code_usages USING btree (email_fingerprint, created_at DESC)
  WHERE email_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_code_usages_user_agent_hash
  ON public.gift_code_usages USING btree (user_agent_hash, created_at DESC)
  WHERE user_agent_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_package_id
  ON public.payment_transactions USING btree (package_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_code_usages_campaign_browser_ok
  ON public.gift_code_usages USING btree (campaign_key, browser_key_hash)
  WHERE campaign_key IS NOT NULL AND browser_key_hash IS NOT NULL AND abuse_status = 'ok'::text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_code_usages_campaign_email_ok
  ON public.gift_code_usages USING btree (campaign_key, email_fingerprint)
  WHERE campaign_key IS NOT NULL AND email_fingerprint IS NOT NULL AND abuse_status = 'ok'::text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_code_usages_campaign_ip_ok
  ON public.gift_code_usages USING btree (campaign_key, ip_hash)
  WHERE campaign_key IS NOT NULL AND ip_hash IS NOT NULL AND abuse_status = 'ok'::text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_code_usages_campaign_user_ok
  ON public.gift_code_usages USING btree (campaign_key, user_id)
  WHERE campaign_key IS NOT NULL AND abuse_status = 'ok'::text;
