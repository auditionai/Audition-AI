import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { createDanceVideoOrder, getDanceVideoTemplates } from '../services/danceVideoService';
import { uploadFileToR2 } from '../services/storageService';
import type { DanceVideoTemplate } from '../types';
import './dance-video-orders.css';

type CheckoutStep = 'review' | 'assets' | 'confirm';
const checkoutSteps: Array<{ id: CheckoutStep; label: string }> = [
  { id: 'review', label: 'Kiểm tra mẫu' }, { id: 'assets', label: 'Ảnh nhân vật' }, { id: 'confirm', label: 'Đặt đơn' },
];
const socialLinks = [
  { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61573249500027', Icon: Icons.Facebook },
  { label: 'Zalo', href: 'tel:0824280497', Icon: Icons.Phone },
  { label: 'TikTok', href: 'https://www.tiktok.com/@auditionai.io.vn', Icon: Icons.MessageSquare },
];

export const DanceVideoOrders: React.FC = () => {
  const { notify } = useNotification();
  const [templates, setTemplates] = useState<DanceVideoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [selected, setSelected] = useState<DanceVideoTemplate | null>(null);
  const [step, setStep] = useState<CheckoutStep>('review');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [zalo, setZalo] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try { setTemplates(await getDanceVideoTemplates()); }
    catch (error: any) { notify(error?.message || 'Không thể tải danh mục video.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadTemplates(); }, []);
  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);

  const categories = useMemo(() => ['Tất cả', ...Array.from(new Set(templates.map((item) => item.category || 'Dance AI')))], [templates]);
  const visible = useMemo(() => templates.filter((item) => {
    const matchesCategory = category === 'Tất cả' || item.category === category;
    const haystack = `${item.title} ${item.description || ''} ${item.category || ''}`.toLocaleLowerCase('vi-VN');
    return matchesCategory && haystack.includes(query.toLocaleLowerCase('vi-VN').trim());
  }), [templates, category, query]);
  const stepIndex = checkoutSteps.findIndex((item) => item.id === step);

  const openOrder = (template: DanceVideoTemplate) => {
    setSelected(template); setStep('review'); setFiles([]); setPreviewUrls([]); setZalo(''); setNote('');
  };
  const changeFiles = (input: FileList | null) => {
    if (!input || !selected) return;
    previewUrls.forEach(URL.revokeObjectURL);
    const next = Array.from(input).slice(0, selected.required_image_count);
    setFiles(next); setPreviewUrls(next.map((file) => URL.createObjectURL(file)));
  };
  const removeFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviewUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };
  const submitOrder = async () => {
    if (!selected || files.length !== selected.required_image_count) return;
    setSubmitting(true);
    try {
      const characterImageUrls = await Promise.all(files.map((file, index) => uploadFileToR2(file, `dance-orders/${selected.id}/character-${index + 1}`)));
      await createDanceVideoOrder({ templateId: selected.id, characterImageUrls, contactZalo: zalo, note });
      notify('Đơn video đã được tạo. Theo dõi tiến độ trong Lịch sử tạo.', 'success');
      window.location.assign('/gallery');
    } catch (error: any) {
      notify(error?.message?.includes('INSUFFICIENT_VCOIN') ? 'Số dư Vcoin không đủ cho đơn này.' : (error?.message || 'Không thể tạo đơn video.'), 'error');
    } finally { setSubmitting(false); }
  };

  return <div className="dance-order-page">
    <header className="dance-order-header">
      <div className="dance-order-brand"><span className="dance-order-kicker"><Icons.Video /> Motion catalog</span><h1>Đặt Làm Video AI</h1><p>Chọn một chuyển động mẫu. Chúng tôi tái tạo video cho nhân vật của bạn, không nhận video ngoài danh mục.</p></div>
      <div className="dance-order-sla"><span><b>15-30'</b><small>Nhanh nhất</small></span><span><b>24h</b><small>Tối đa</small></span><span><b>100%</b><small>Theo video mẫu</small></span></div>
    </header>

    <section className="dance-order-toolbar" aria-label="Tìm và lọc video mẫu">
      <label className="dance-search"><Icons.Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên dance, concept, mood..." /></label>
      <div className="dance-category-rail">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? 'is-active' : ''}>{item}</button>)}</div>
      <button className="dance-refresh" onClick={() => void loadTemplates()} aria-label="Tải lại danh mục"><Icons.RefreshCw className={loading ? 'spin' : ''} /></button>
    </section>

    <section className="dance-order-intro"><span><Icons.Clock /> Thời gian xử lý từ 15-30 phút, chậm nhất 24 tiếng</span><span><Icons.AlertTriangle /> Đơn chỉ được hoàn khi vẫn chờ xử lý và Admin chưa tiếp nhận</span></section>

    <section className="dance-catalog-heading"><div><span>Danh mục đang mở</span><h2>Chọn chuyển động bạn muốn</h2></div><b>{visible.length.toLocaleString('vi-VN')} mẫu</b></section>
    {loading ? <div className="dance-loading"><Icons.Loader className="spin" /> Đang đồng bộ thư viện video...</div> : <section className="dance-catalog-grid">
      {visible.map((template, index) => <article className={`dance-template ${index === 0 ? 'is-featured' : ''}`} key={template.id}>
        <div className="dance-template-media"><video src={template.preview_video_url} muted playsInline preload="metadata" controls /><span>{template.category || 'Dance AI'}</span></div>
        <div className="dance-template-body"><div className="dance-template-title"><h3>{template.title}</h3><b><Icons.Gem /> {template.price_vcoin.toLocaleString('vi-VN')}</b></div><p>{template.description || 'Motion Control theo đúng chuyển động của video mẫu.'}</p><footer><span><Icons.User /> {template.required_image_count} ảnh nhân vật</span><button onClick={() => openOrder(template)}>Chọn mẫu <Icons.ChevronRight /></button></footer></div>
      </article>)}
      {!visible.length && <div className="dance-empty"><Icons.Search /><b>Không tìm thấy video phù hợp</b><span>Thử lại với từ khóa hoặc danh mục khác.</span></div>}
    </section>}

    {selected && <aside className="dance-order-drawer" aria-label="Đặt video theo mẫu">
      <header><div><span>Đơn video mới</span><h2>{selected.title}</h2></div><button onClick={() => setSelected(null)} aria-label="Đóng panel"><Icons.X /></button></header>
      <div className="dance-checkout-steps">{checkoutSteps.map((item, index) => <button key={item.id} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''} onClick={() => index <= stepIndex && setStep(item.id)}><i>{index + 1}</i>{item.label}</button>)}</div>
      {step === 'review' && <div className="dance-drawer-body"><div className="dance-order-preview"><video src={selected.preview_video_url} muted playsInline controls preload="metadata" /><div><b>{selected.title}</b><span>{selected.required_image_count} ảnh nhân vật · {selected.price_vcoin} Vcoin</span></div></div><div className="dance-policy"><Icons.AlertTriangle /><p><b>Thanh toán được xác nhận ở bước cuối.</b> Khi đơn đang chờ, chưa được Admin tiếp nhận, bạn có thể yêu cầu hủy hoặc hoàn Vcoin. Sau khi Admin tiếp nhận, đơn không thể hủy hoặc hoàn.</p></div><button className="dance-primary" onClick={() => setStep('assets')}>Tiếp tục với ảnh nhân vật <Icons.ChevronRight /></button></div>}
      {step === 'assets' && <div className="dance-drawer-body"><div className="dance-upload-guide"><b>Cần {selected.required_image_count} ảnh nhân vật</b><span>Ảnh rõ nét, ưu tiên đã tách nền. Hãy mix sẵn trang phục mong muốn trong game.</span></div><label className="dance-dropzone"><Icons.Upload /><b>Tải ảnh nhân vật</b><span>PNG, JPG hoặc WEBP · tối đa {selected.required_image_count} ảnh</span><input type="file" accept="image/*" multiple={selected.required_image_count > 1} onChange={(event) => changeFiles(event.target.files)} /></label>{previewUrls.length > 0 && <div className="dance-uploaded-grid">{previewUrls.map((url, index) => <figure key={url}><img src={url} alt={`Nhân vật ${index + 1}`} /><button onClick={() => removeFile(index)} aria-label={`Xóa ảnh ${index + 1}`}><Icons.X /></button><figcaption>Nhân vật {index + 1}</figcaption></figure>)}</div>}<div className="dance-help-links">{socialLinks.map(({ label, href, Icon }) => <a href={href} key={label} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"><Icon />{label}</a>)}</div><p className="dance-help-note">Không biết chụp ảnh? Liên hệ trực tiếp Admin để được hỗ trợ đăng nhập game và chụp nhân vật.</p><div className="dance-drawer-actions"><button onClick={() => setStep('review')}>Quay lại</button><button className="dance-primary" disabled={files.length !== selected.required_image_count} onClick={() => setStep('confirm')}>Kiểm tra đơn <Icons.ChevronRight /></button></div></div>}
      {step === 'confirm' && <div className="dance-drawer-body"><dl className="dance-order-summary"><div><dt>Video mẫu</dt><dd>{selected.title}</dd></div><div><dt>Chi phí</dt><dd>{selected.price_vcoin.toLocaleString('vi-VN')} Vcoin</dd></div><div><dt>Ảnh đã chọn</dt><dd>{files.length}/{selected.required_image_count}</dd></div></dl><label className="dance-field">Zalo để Admin liên hệ<input value={zalo} onChange={(event) => setZalo(event.target.value)} placeholder="Không bắt buộc" /></label><label className="dance-field">Mô tả yêu cầu<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: thời gian mong muốn, lưu ý về nhân vật..." /></label><div className="dance-confirm-note">Xác nhận tạo đơn sẽ trừ <b>{selected.price_vcoin.toLocaleString('vi-VN')} Vcoin</b>. Job sẽ xuất hiện ở đầu Lịch sử tạo với trạng thái <b>Chờ xử lý</b>.</div><div className="dance-drawer-actions"><button onClick={() => setStep('assets')}>Quay lại</button><button className="dance-primary" disabled={submitting} onClick={() => void submitOrder()}>{submitting ? 'Đang tạo đơn...' : 'Xác nhận đặt video'} <Icons.Check /></button></div></div>}
    </aside>}
  </div>;
};
