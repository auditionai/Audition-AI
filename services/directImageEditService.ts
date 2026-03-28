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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to run direct image edit');
  }

  return payload as DirectImageEditResponse;
};
