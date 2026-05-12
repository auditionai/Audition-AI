export const DEFAULT_IMAGE_NEGATIVE_PROMPT = 'crowd, extra people, audience, bystanders, deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, extra limbs, extra arm, extra arms, extra hand, extra hands, extra leg, extra legs, extra foot, extra feet, duplicated limb, duplicated limbs, duplicate hand, duplicate hands, duplicate foot, duplicate feet, ugly, disgusting, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, malformed feet, merged fingers, fused fingers, six fingers, seven fingers, broken wrist, twisted arm, twisted leg, blur, out of focus, long neck, long body, mutated hands and fingers, out of frame, blender, doll, doll face, mannequin face, mannequin body, waxy skin, plastic skin, dark skin, darker skin, tanned skin, bronzed skin, yellow skin, orange skin, oversaturated warm skin, muddy skin tone, incorrect skin tone, skin tone shift, chibi proportions, giant eyes, baby face, stiff pose, rigid pose, stiff limbs, frozen posture, uncanny face, over-smoothed face, low-res, poorly-drawn face, out of frame double, two heads, blurred, ugly, disfigured, too many fingers, deformed, repetitive, black and white, grainy, duplicate, photorealistic, realistic photo, sketch, flat anime drawing, flat cartoon, drawing, art, 2d';

export const AUDITION_KOREA_MMO_STYLE_PROMPT = [
  'STYLE QUALITY: premium Audition Korea MMO 3D game-avatar render, high-end Korean stylized fashion-game character art, not a real human photo and not flat 2D cartoon art.',
  'IDENTITY: preserve the uploaded character references exactly for face, hair, skin tone, body structure, outfit, shoes, accessories, makeup, gender presentation, and unique marks; never invent a new face or replace the avatar.',
  'CHARACTER BUILD: adult stylized 3D avatar, elegant but normal proportions, natural short avatar neck, balanced shoulders and torso, clean limbs, believable hands and feet; no chibi body, child face, giant head, tiny body, mannequin pose, or doll anatomy.',
  'MATERIALS: soft Korean MMO 3D skin shader, gentle subsurface scattering, clean stylized pores, refined eye gloss, crisp lashes/brows/makeup, detailed hair strands, cloth, leather, metal, and glass response; no waxy plastic skin or hard toy sheen.',
  'RENDER: cinematic Unreal/Octane-like 3D lighting, soft global illumination, controlled depth of field, crisp facial details, vibrant restrained color grade, premium game-poster finish.',
].join(' ');

const sanitizeStylePresetText = (value?: string | null) => {
  const sanitized = String(value || '')
    .replace(/\bstyle\s+(?:image|reference)\b/gi, 'render style')
    .replace(/\bdo not send or depend on a style image\b/gi, '')
    .replace(/\buploaded style image\b/gi, 'style direction')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized.length > 220 ? `${sanitized.slice(0, 220).trim()}...` : sanitized;
};

export const buildAuditionKoreaMmoStylePrompt = (stylePresetText?: string | null) =>
  [AUDITION_KOREA_MMO_STYLE_PROMPT, sanitizeStylePresetText(stylePresetText)]
    .filter(Boolean)
    .join(' ');
