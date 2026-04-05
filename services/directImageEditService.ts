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
  status: 'queued' | 'processing' | 'completed' | 'failed';
  accepted?: boolean;
  imageUrl?: string;
  error?: string;
  updatedAt?: string;
}

const DIRECT_EDIT_POLL_INTERVAL_MS = 2000;
const DIRECT_EDIT_POLL_TIMEOUT_MS = 15 * 60 * 1000;

const parseJsonResponse = async (response: Response) => {
  const rawText = await response.text();
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return rawText && !rawText.trim().startsWith('<') ? { error: rawText.trim() } : {};
  }
};

const fetchDirectImageEditStatus = async (
  id: string,
  authHeader: Record<string, string>,
): Promise<DirectImageEditResponse> => {
  const response = await fetch(`/api/direct-image-edit?id=${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || `Direct image edit status failed (${response.status})`);
  }

  return payload as DirectImageEditResponse;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || `Direct image edit failed (${response.status})`);
  }

  const initial = payload as DirectImageEditResponse;
  if (initial.status === 'completed') {
    return initial;
  }
  if (initial.status === 'failed') {
    throw new Error(initial.error || 'Direct image edit failed');
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < DIRECT_EDIT_POLL_TIMEOUT_MS) {
    await wait(DIRECT_EDIT_POLL_INTERVAL_MS);
    const current = await fetchDirectImageEditStatus(initial.id, authHeader);
    if (current.status === 'completed') {
      return current;
    }
    if (current.status === 'failed') {
      throw new Error(current.error || 'Direct image edit failed');
    }
  }

  throw new Error('Direct image edit timed out while waiting for background processing');
};
