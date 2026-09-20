const CHARACTER_IDENTITY_LOCK = `The uploaded image is the sole, immutable reference. Preserve the exact same character with zero identity or design changes: face, facial expression, eyes, nose, mouth, face shape, hairstyle, hair color, skin tone, body shape, proportions, pose, hands, fingers, outfit, every garment, accessories, shoes, colors, materials, textures, logos, and all visible details. Do not redraw, reinterpret, beautify, humanize, stylize, recolor, crop, replace, add, remove, or invent any part of the character.`;

export const SHARPEN_UPSCALE_CHARACTER_LOCK_PROMPT = `${CHARACTER_IDENTITY_LOCK}

TASK: Improve only technical image clarity. Reduce blur, compression artifacts, noise, and jagged edges while preserving every visual detail and the original framing exactly. Do not alter the background, lighting, shadows, camera angle, composition, or any character pixel semantics. Do not generate a new image or a different version of the character. Output the same image, only cleaner and sharper.`;

export const REMOVE_BACKGROUND_CHARACTER_LOCK_PROMPT = `${CHARACTER_IDENTITY_LOCK}

TASK: Remove only the background and every non-character/UI element. Keep the complete original character intact with its exact silhouette, pose, framing, facial expression, clothing, shoes, colors, and all details. Preserve clean edge detail around hair, fingers, accessories, and shoes without halos. Place the unchanged character on a solid pure black background (#000000). Do not crop, resize, retouch, redraw, or change the character in any way.`;
