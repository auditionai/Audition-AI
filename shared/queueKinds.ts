export const SYSTEM_QUEUE_KINDS = [
  'image_generate',
  'video_generate',
  'motion_generate',
] as const;

export const DIRECT_IMAGE_EDIT_QUEUE_KIND = 'image_edit_direct';

export const DIRECT_IMAGE_EDIT_TOOL_IDS = [
  'magic_editor_pro',
  'remove_bg_pro',
  'sharpen_upscale',
] as const;

const SYSTEM_QUEUE_KIND_SET = new Set<string>(SYSTEM_QUEUE_KINDS);
const DIRECT_IMAGE_EDIT_TOOL_ID_SET = new Set<string>(DIRECT_IMAGE_EDIT_TOOL_IDS);

export const isSystemQueueKind = (value?: string | null) =>
  SYSTEM_QUEUE_KIND_SET.has(String(value || '').trim().toLowerCase());

export const isDirectImageEditQueueKind = (value?: string | null) =>
  String(value || '').trim().toLowerCase() === DIRECT_IMAGE_EDIT_QUEUE_KIND;

export const isDirectImageEditToolId = (value?: string | null) =>
  DIRECT_IMAGE_EDIT_TOOL_ID_SET.has(String(value || '').trim().toLowerCase());
