import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { adminDanceVideoAction, getAdminDanceVideoData } from '../services/danceVideoService';
import { uploadFileToR2 } from '../services/storageService';
import './dance-video-admin.css';

type Tab = 'orders' | 'templates';

const freshTemplate = (position: number) => ({
  title: '',
  category: 'Dance AI',
  description: '',
  preview_video_url: '',
  price_vcoin: 50,
  required_image_count: 1,
  is_active: true,
  display_order: position,
});

export const DanceVideoAdminWorkspace: React.FC = () => {
  const [tab, setTab] = useState<Tab>('orders');
  const [templates, setTemplates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingTemplateVideo, setUploadingTemplateVideo] = useState(false);
  const [uploadingJobId, setUploadingJobId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAdminDanceVideoData();
      setTemplates(data.templates || []);
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const haystack = `${job.dance_video_templates?.title || ''} ${job.users?.display_name || ''} ${job.users?.email || ''} ${job.contact_zalo || ''} ${job.note || ''}`.toLowerCase();
      return matchesStatus && haystack.includes(query.toLowerCase().trim());
    });
  }, [jobs, query, statusFilter]);

  const counts = useMemo(() => ({
    pending: jobs.filter((item) => item.status === 'pending').length,
    accepted: jobs.filter((item) => item.status === 'accepted').length,
    processing: jobs.filter((item) => item.status === 'processing').length,
    completed: jobs.filter((item) => item.status === 'completed').length,
    activeTemplates: templates.filter((item) => item.is_active).length,
  }), [jobs, templates]);

  const updateJob = async (job: any, patch: Record<string, unknown>) => {
    await adminDanceVideoAction({
      action: 'update-job',
      id: job.id,
      status: patch.status || job.status,
      adminNote: patch.adminNote ?? job.admin_note,
      resultVideoUrl: patch.resultVideoUrl ?? job.result_video_url,
    });
    await load();
  };

  const handleUploadResultVideo = async (job: any, file: File) => {
    setUploadingJobId(job.id);
    try {
      const url = await uploadFileToR2(file, `dance-orders/${job.id}/result`);
      await updateJob(job, { resultVideoUrl: url, status: 'completed' });
    } catch (err: any) {
      alert('Lỗi tải video kết quả lên R2: ' + (err?.message || 'Không xác định'));
    } finally {
      setUploadingJobId(null);
    }
  };

  const handleUploadTemplateVideo = async (file: File) => {
    if (!draft) return;
    setUploadingTemplateVideo(true);
    try {
      const url = await uploadFileToR2(file, `dance-templates/${draft.id || crypto.randomUUID()}`);
      setDraft((current: any) => ({ ...current, preview_video_url: url }));
    } catch (err: any) {
      alert('Lỗi tải video mẫu lên R2: ' + (err?.message || 'Không xác định'));
    } finally {
      setUploadingTemplateVideo(false);
    }
  };

  const saveTemplate = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await adminDanceVideoAction({
        action: 'save-template',
        template: {
          ...draft,
          price_vcoin: Number(draft.price_vcoin),
          required_image_count: Number(draft.required_image_count),
        },
      });
      setDraft(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa video mẫu này? Thao tác này không thể hoàn tác.')) {
      return;
    }
    await adminDanceVideoAction({ action: 'delete-template', id: templateId });
    await load();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Chờ xử lý',
          classes: 'neu-inset-sm text-amber-500 border border-amber-500/30 bg-amber-500/10',
          dot: 'bg-amber-500',
        };
      case 'accepted':
        return {
          label: 'Đã tiếp nhận',
          classes: 'neu-inset-sm text-[#00F2FE] border border-cyan-400/30 bg-cyan-400/10',
          dot: 'bg-[#00F2FE]',
        };
      case 'processing':
        return {
          label: 'Đang render AI',
          classes: 'neu-inset-sm text-purple-400 border border-purple-400/30 bg-purple-400/10',
          dot: 'bg-purple-400 animate-pulse',
        };
      case 'completed':
        return {
          label: 'Đã hoàn thành',
          classes: 'neu-inset-sm text-emerald-400 border border-emerald-400/30 bg-emerald-400/10',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          label: status,
          classes: 'neu-inset-sm text-slate-400 border border-slate-700 bg-slate-800/20',
          dot: 'bg-slate-400',
        };
    }
  };

  return (
    <div className="dance-admin-workspace space-y-6">
      
      {/* 1. TOP HEADER & SYNC BUTTON */}
      <section className="neu-card p-6 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest font-accent text-[#FF007F]">
            <Icons.Video className="w-4 h-4 text-[#FF007F]" />
            <span>QUẢN TRỊ DỊCH VỤ MOTION CONTROL</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black font-accent text-slate-950 dark:text-white uppercase tracking-wider mt-1">
            ĐẶT LÀM VIDEO AI (DANCE CONSOLE)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
            Quản trị catalog video mẫu vũ đạo, tiếp nhận ảnh từ khách hàng và xuất trả video hoàn thiện qua Cloudflare R2.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="neu-button px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 text-slate-950 dark:text-white hover:text-[#FF007F] transition-colors self-start md:self-auto"
        >
          <Icons.RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#FF007F]' : ''}`} />
          <span>Đồng Bộ Dữ Liệu</span>
        </button>
      </section>

      {/* 2. 4 PROMINENT 3D METRIC KPI CARDS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-md space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent">Chờ Tiếp Nhận</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-accent text-amber-500">{counts.pending}</div>
          <span className="text-[10px] text-slate-500 block">Đơn mới chưa xử lý</span>
        </div>

        {/* Metric 2 */}
        <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-md space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent">Đang Xử Lý</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#00F2FE]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-accent text-[#00F2FE]">
            {counts.accepted + counts.processing}
          </div>
          <span className="text-[10px] text-slate-500 block">{counts.processing} đơn đang render</span>
        </div>

        {/* Metric 3 */}
        <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-md space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent">Đã Hoàn Thành</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-accent text-emerald-500">{counts.completed}</div>
          <span className="text-[10px] text-slate-500 block">Đã trả video kết quả</span>
        </div>

        {/* Metric 4 */}
        <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-md space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent">Mẫu Đang Mở</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-accent text-purple-400">
            {counts.activeTemplates}
            <span className="text-xs text-slate-500 font-mono font-normal ml-1">/ {templates.length}</span>
          </div>
          <span className="text-[10px] text-slate-500 block">Đang hiện trên app</span>
        </div>
      </section>

      {/* 3. TABS SELECTOR (ORDERS VS TEMPLATES) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider font-accent transition-all ${
            tab === 'orders'
              ? 'neu-inset-sm text-[#FF007F] ring-2 ring-[#FF007F] scale-[1.02]'
              : 'neu-button text-slate-700 dark:text-slate-300 hover:text-[#FF007F]'
          }`}
        >
          <Icons.Clock className="w-4 h-4 text-[#FF007F]" />
          <span>Hàng Đợi Đơn Hàng</span>
          <span className="neu-inset-sm px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-900 dark:text-white">
            {jobs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider font-accent transition-all ${
            tab === 'templates'
              ? 'neu-inset-sm text-purple-500 ring-2 ring-purple-500 scale-[1.02]'
              : 'neu-button text-slate-700 dark:text-slate-300 hover:text-purple-500'
          }`}
        >
          <Icons.Video className="w-4 h-4 text-purple-500" />
          <span>Thư Viện Video Mẫu</span>
          <span className="neu-inset-sm px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-900 dark:text-white">
            {templates.length}
          </span>
        </button>
      </div>

      {/* 4. TAB 1: ORDERS CONSOLE */}
      {tab === 'orders' && (
        <section className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên khách, email, Zalo, mẫu video..."
                className="neu-input w-full h-11 pl-10 pr-4 text-xs font-bold rounded-xl outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="neu-input h-11 px-3 text-xs font-bold rounded-xl outline-none"
              >
                <option value="all">Tất cả ({jobs.length})</option>
                <option value="pending">Chờ xử lý ({counts.pending})</option>
                <option value="accepted">Đã tiếp nhận ({counts.accepted})</option>
                <option value="processing">Đang render ({counts.processing})</option>
                <option value="completed">Đã hoàn thành ({counts.completed})</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto dance-admin-table-scroll rounded-2xl neu-inset-sm p-1">
            <table className="w-full text-left text-xs text-slate-800 dark:text-slate-200">
              <thead className="neu-raised-sm text-[10px] font-black text-slate-950 dark:text-white uppercase font-accent border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3.5">Khách & Mẫu Video</th>
                  <th className="px-4 py-3.5">Ảnh Nhân Vật Game</th>
                  <th className="px-4 py-3.5">Liên Hệ & Ghi Chú</th>
                  <th className="px-4 py-3.5 min-w-[260px]">Video Kết Quả (Cloudflare R2)</th>
                  <th className="px-4 py-3.5 text-right">Trạng Thái Đơn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                      {loading ? 'Đang tải dữ liệu...' : 'Không có đơn hàng nào khớp với điều kiện lọc.'}
                    </td>
                  </tr>
                ) : (
                  visibleJobs.map((job) => {
                    const badge = getStatusBadge(job.status);
                    const isUploadingThis = uploadingJobId === job.id;
                    return (
                      <tr key={job.id} className="hover:bg-slate-200/40 dark:hover:bg-white/5 transition-colors align-top">
                        {/* 1. Customer & Template */}
                        <td className="px-4 py-4 space-y-1">
                          <b className="block text-slate-950 dark:text-white font-accent font-black text-sm">
                            {job.dance_video_templates?.title || 'Mẫu video'}
                          </b>
                          <div className="text-slate-600 dark:text-slate-400 text-xs">
                            {job.users?.display_name || job.users?.email || job.user_id}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {new Date(job.created_at).toLocaleString('vi-VN')}
                          </div>
                        </td>

                        {/* 2. Character Reference Images */}
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {(job.character_image_urls || []).map((url: string, index: number) => (
                              <button
                                key={url}
                                type="button"
                                onClick={() => setZoomedImage(url)}
                                className="group relative w-12 h-12 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 hover:border-[#00F2FE] transition-colors"
                                title="Bấm để xem ảnh phóng to"
                              >
                                <img
                                  src={url}
                                  alt={`Nhân vật ${index + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                />
                                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] font-bold text-center text-white py-0.5">
                                  Ảnh {index + 1}
                                </span>
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* 3. Contact & Customer Note */}
                        <td className="px-4 py-4 space-y-1.5 max-w-[200px]">
                          {job.contact_zalo ? (
                            <a
                              href={`https://zalo.me/${job.contact_zalo}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 neu-inset-sm px-2.5 py-1 rounded-lg text-amber-500 font-mono font-bold text-xs hover:underline"
                            >
                              <Icons.Phone className="w-3 h-3" />
                              <span>Zalo: {job.contact_zalo}</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Không có Zalo</span>
                          )}
                          <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                            {job.note || 'Không có ghi chú thêm.'}
                          </p>
                        </td>

                        {/* 4. Result Video Console */}
                        <td className="px-4 py-4 space-y-2">
                          <input
                            defaultValue={job.result_video_url || ''}
                            onBlur={(event) => {
                              if (event.target.value !== (job.result_video_url || '')) {
                                void updateJob(job, { resultVideoUrl: event.target.value });
                              }
                            }}
                            placeholder="Dán URL video kết quả R2..."
                            className="neu-input w-full h-9 px-3 text-xs font-mono rounded-lg outline-none"
                          />

                          <div className="flex items-center gap-2">
                            <label className="flex-1 cursor-pointer neu-button py-1.5 px-3 rounded-xl text-center text-[11px] font-black text-emerald-500 hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-all">
                              {isUploadingThis ? (
                                <>
                                  <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang Tải Lên R2...</span>
                                </>
                              ) : (
                                <>
                                  <Icons.Upload className="w-3.5 h-3.5" />
                                  <span>Tải Video Kết Quả Lên R2</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="video/*"
                                disabled={isUploadingThis}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void handleUploadResultVideo(job, file);
                                }}
                                className="sr-only"
                              />
                            </label>

                            {job.result_video_url && (
                              <a
                                href={job.result_video_url}
                                target="_blank"
                                rel="noreferrer"
                                className="neu-button p-2 rounded-xl text-[#00F2FE]"
                                title="Xem video kết quả"
                              >
                                <Icons.ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* 5. Status Selector */}
                        <td className="px-4 py-4 text-right">
                          <div className="space-y-2 inline-flex flex-col items-end">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black font-accent uppercase ${badge.classes}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              <span>{badge.label}</span>
                            </span>

                            <select
                              value={job.status}
                              onChange={(event) => void updateJob(job, { status: event.target.value })}
                              className="neu-input h-9 px-2 text-xs font-bold rounded-lg outline-none bg-transparent"
                            >
                              <option value="pending">Chờ xử lý</option>
                              <option value="accepted">Đã tiếp nhận</option>
                              <option value="processing">Đang render AI</option>
                              <option value="completed">Đã hoàn thành</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. TAB 2: TEMPLATES MANAGEMENT */}
      {tab === 'templates' && (
        <section className="space-y-4">
          <div className="neu-card p-5 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-xl flex items-center justify-between">
            <div>
              <h3 className="text-base font-black font-accent text-slate-950 dark:text-white uppercase">
                DANH SÁCH VIDEO MẪU CHUYỂN ĐỘNG
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các mẫu đang bật trạng thái "Đang mở" sẽ được khách hàng nhìn thấy và đặt đơn.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDraft(freshTemplate(templates.length))}
              className="neu-button-primary px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
            >
              <Icons.Plus className="w-4 h-4" />
              <span>Tạo Mẫu Video Mới</span>
            </button>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {templates.map((template) => (
              <article
                key={template.id}
                className="neu-card rounded-3xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video w-full bg-black overflow-hidden">
                    <video
                      src={template.preview_video_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="neu-inset-sm px-2.5 py-1 rounded-lg text-[9px] font-black uppercase text-[#00F2FE] bg-black/60 backdrop-blur-md">
                        {template.category || 'Dance AI'}
                      </span>
                    </div>

                    <div className="absolute top-2.5 right-2.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                        template.is_active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      }`}>
                        {template.is_active ? 'Đang mở' : 'Đang ẩn'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-black font-accent text-sm text-slate-950 dark:text-white line-clamp-1">
                        {template.title}
                      </h4>
                      <span className="neu-inset-sm px-2.5 py-0.5 rounded-lg text-amber-500 font-mono font-black text-xs shrink-0">
                        {template.price_vcoin} VC
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed">
                      {template.description || 'Chưa có mô tả chi tiết cho mẫu này.'}
                    </p>

                    <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 pt-1">
                      <Icons.User className="w-3.5 h-3.5 text-[#FF007F]" />
                      <span>Cần {template.required_image_count} ảnh nhân vật Audition</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Thứ tự: {template.display_order ?? 0}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDraft(template)}
                      className="neu-button p-2 rounded-xl text-cyan-400 hover:scale-105 transition-transform"
                      title="Chỉnh sửa mẫu"
                    >
                      <Icons.Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTemplate(template.id)}
                      className="neu-button p-2 rounded-xl text-red-400 hover:scale-105 transition-transform"
                      title="Xóa mẫu"
                    >
                      <Icons.Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {templates.length === 0 && !loading && (
              <div className="col-span-full neu-card rounded-3xl p-16 text-center text-slate-500">
                Chưa có video mẫu nào. Bấm nút "Tạo Mẫu Video Mới" để thêm mẫu đầu tiên!
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. TEMPLATE EDITOR MODAL */}
      {draft && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="neu-card w-full max-w-2xl rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl p-6 sm:p-8 dance-modal-animate space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest font-accent text-[#00F2FE]">
                  QUẢN TRỊ VIDEO CATALOG
                </span>
                <h3 className="text-lg font-black font-accent text-slate-950 dark:text-white uppercase mt-0.5">
                  {draft.id ? 'Chỉnh Sửa Video Mẫu' : 'Tạo Video Mẫu Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="neu-button p-2.5 rounded-xl text-slate-500 hover:text-red-500"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Tên video mẫu *
                </span>
                <input
                  value={draft.title || ''}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Ví dụ: Dance Kpop Hype Boy, Vũ đạo Hip-hop Đôi..."
                  className="neu-input w-full h-11 px-3.5 text-xs font-bold rounded-xl outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Danh mục
                </span>
                <input
                  value={draft.category || ''}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  placeholder="Dance AI, Solo, Couple..."
                  className="neu-input w-full h-11 px-3.5 text-xs font-bold rounded-xl outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Giá Vcoin *
                </span>
                <input
                  type="number"
                  min="1"
                  value={draft.price_vcoin || ''}
                  onChange={(event) => setDraft({ ...draft, price_vcoin: event.target.value })}
                  className="neu-input w-full h-11 px-3.5 text-xs font-bold font-mono rounded-xl outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Số ảnh nhân vật yêu cầu (1-8)
                </span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={draft.required_image_count || 1}
                  onChange={(event) => setDraft({ ...draft, required_image_count: event.target.value })}
                  className="neu-input w-full h-11 px-3.5 text-xs font-bold font-mono rounded-xl outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Thứ tự hiển thị
                </span>
                <input
                  type="number"
                  value={draft.display_order ?? 0}
                  onChange={(event) => setDraft({ ...draft, display_order: Number(event.target.value) })}
                  className="neu-input w-full h-11 px-3.5 text-xs font-bold font-mono rounded-xl outline-none"
                />
              </label>

              {/* Video URL & R2 direct upload */}
              <div className="sm:col-span-2 space-y-2">
                <label className="block space-y-1">
                  <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                    URL Video Preview (Cloudflare R2) *
                  </span>
                  <input
                    value={draft.preview_video_url || ''}
                    onChange={(event) => setDraft({ ...draft, preview_video_url: event.target.value })}
                    placeholder="https://... hoặc bấm tải trực tiếp bên dưới"
                    className="neu-input w-full h-11 px-3.5 text-xs font-mono rounded-xl outline-none"
                  />
                </label>

                <label className="flex items-center justify-center gap-2 cursor-pointer neu-button py-3 px-4 rounded-xl text-center text-xs font-black text-cyan-400 hover:text-cyan-300 border-dashed border border-cyan-400/40">
                  {uploadingTemplateVideo ? (
                    <>
                      <Icons.Loader className="w-4 h-4 animate-spin text-[#00F2FE]" />
                      <span>Đang Tải Video Lên Cloudflare R2...</span>
                    </>
                  ) : (
                    <>
                      <Icons.Upload className="w-4 h-4 text-[#00F2FE]" />
                      <span>Bấm vào đây để tải tệp video MP4/MOV lên Cloudflare R2</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="video/*"
                    disabled={uploadingTemplateVideo}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUploadTemplateVideo(file);
                    }}
                    className="sr-only"
                  />
                </label>

                {draft.preview_video_url && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-500 block mb-1">Xem trước video mẫu:</span>
                    <video
                      src={draft.preview_video_url}
                      controls
                      playsInline
                      className="w-full aspect-video rounded-xl bg-black object-cover max-h-48"
                    />
                  </div>
                )}
              </div>

              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider font-accent text-slate-700 dark:text-slate-300">
                  Mô tả chuyển động
                </span>
                <textarea
                  value={draft.description || ''}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="Ghi chú về nhịp điệu, góc máy, số lượng nhân vật..."
                  className="neu-input w-full h-20 p-3 text-xs font-medium rounded-xl outline-none resize-none"
                />
              </label>

              <label className="flex items-center gap-2.5 sm:col-span-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={draft.is_active !== false}
                  onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })}
                  className="w-4 h-4 accent-[#FF007F] rounded"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Kích hoạt hiển thị video mẫu này cho khách hàng
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="neu-button px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                disabled={saving || !draft.title || !draft.preview_video_url}
                onClick={() => void saveTemplate()}
                className="neu-button-primary px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Icons.Loader className="w-4 h-4 animate-spin text-white" />
                    <span>Đang Lưu...</span>
                  </>
                ) : (
                  <>
                    <Icons.Check className="w-4 h-4" />
                    <span>Lưu Video Mẫu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. ZOOM IMAGE MODAL (When clicking customer reference image) */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] neu-card p-2 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={zoomedImage}
              alt="Ảnh phóng to"
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />
            <div className="p-3 flex items-center justify-between">
              <a
                href={zoomedImage}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-black text-[#00F2FE] hover:underline flex items-center gap-1.5"
              >
                <Icons.ExternalLink className="w-4 h-4" />
                <span>Mở ảnh gốc trong tab mới</span>
              </a>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="neu-button px-4 py-1.5 rounded-xl text-xs font-black text-slate-900 dark:text-white"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
