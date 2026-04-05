import { getSupabaseAuthHeader } from './supabaseClient';
import type { ImageEditRecipePayload } from '../shared/queueRecipes';

export interface DirectImageEditRequest {
  id: string;
  prompt: string;
  toolId: string;
  toolName: string;
  engine: string;
  costVcoin: number;
  queuePayload: ImageEditRecipePayload;
}

export interface DirectImageEditResponse {
  success: boolean;
  id: string;
  status: 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
  updatedAt?: string;
}

export const runDirectImageEdit = async (
  request: DirectImageEditRequest,
): Promise<DirectImageEditResponse> => {
  const authHeader = await getSupabaseAuthHeader();
  const response = await fetch('/api/direct-image-edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(request),
  });

  const rawText = await response.text();
  let payload: Record<string, any> = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const textFallback = rawText && !rawText.trim().startsWith('<')
      ? rawText.trim()
      : '';
    throw new Error(payload?.error || textFallback || `Direct image edit failed (${response.status})`);
  }

  return payload as DirectImageEditResponse;
};
