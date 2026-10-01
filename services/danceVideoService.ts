import { getSupabaseAuthHeader, supabase } from './supabaseClient';
import type { DanceVideoJob, DanceVideoTemplate } from '../types';

export const getDanceVideoTemplates = async (): Promise<DanceVideoTemplate[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('dance_video_templates').select('*').eq('is_active', true).order('display_order').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createDanceVideoOrder = async (payload: { templateId: string; characterImageUrls: string[]; customerName?: string; contactZalo?: string; note?: string }) => {
  const response = await fetch('/api/dance-video-order', { method: 'POST', headers: { ...(await getSupabaseAuthHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể tạo đơn đặt video.');
  window.dispatchEvent(new Event('balance_updated'));
  return data as { id: string };
};

export const getAdminDanceVideoData = async () => {
  const response = await fetch('/api/admin-dance-video', { headers: await getSupabaseAuthHeader() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể tải dữ liệu Dance AI.');
  return data as { templates: DanceVideoTemplate[]; jobs: Array<DanceVideoJob & { users?: { display_name?: string; email?: string } }> };
};

export const adminDanceVideoAction = async (payload: Record<string, unknown>) => {
  const response = await fetch('/api/admin-dance-video', { method: 'POST', headers: { ...(await getSupabaseAuthHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể cập nhật Dance AI.');
  return data;
};
