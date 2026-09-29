import React from 'react';
import { Language, ViewId } from '../types';
import { Icons } from '../components/Icons';

interface SupportProps { lang: Language; onNavigate: (view: ViewId) => void; }
const contacts = [
  { title: 'Email hỗ trợ', copy: 'Báo lỗi, hỗ trợ tài khoản hoặc yêu cầu hoàn Vcoin.', href: 'mailto:support@auditionai.vn', label: 'support@auditionai.vn', Icon: Icons.Mail, tone: 'text-cyan-400' },
  { title: 'Zalo / Hotline Admin', copy: 'Hỗ trợ chụp nhân vật game và đơn Đặt Làm Video AI.', href: 'tel:0824280497', label: '0824.280.497', Icon: Icons.Phone, tone: 'text-emerald-400' },
  { title: 'Liên hệ qua Facebook', copy: 'Nhắn trực tiếp để nhận hỗ trợ về tài khoản và Vcoin.', href: 'https://www.facebook.com/profile.php?id=61573249500027', label: 'Facebook Audition AI', Icon: Icons.Facebook, tone: 'text-blue-400' },
  { title: 'Liên hệ qua TikTok', copy: 'Nhắn tin, nhận video mẫu và cập nhật mới nhất.', href: 'https://www.tiktok.com/@auditionai.io.vn', label: 'TikTok Audition AI', Icon: Icons.MessageSquare, tone: 'text-fuchsia-400' },
];

export const Support: React.FC<SupportProps> = ({ lang, onNavigate }) => <div className="mx-auto max-w-4xl space-y-6 pb-24 animate-fade-in">
  <section className="neu-card rounded-3xl p-7 sm:p-9"><div className="flex items-start gap-5"><span className="neu-inset-sm flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"><Icons.Heart className="h-7 w-7 text-[#FF0099]" /></span><div><h1 className="font-accent text-2xl font-black text-slate-900 dark:text-white">Hỗ trợ khách hàng</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Đội ngũ Audition AI hỗ trợ 24/7. Với đơn Đặt Làm Video AI, chỉ hủy hoặc hoàn Vcoin khi đơn vẫn đang chờ và chưa được Admin tiếp nhận xử lý.</p></div></div></section>
  <section className="grid gap-4 md:grid-cols-2">{contacts.map(({ title, copy, href, label, Icon, tone }) => <article key={title} className="neu-card rounded-2xl p-5"><div className="flex items-center gap-3"><Icon className={`h-5 w-5 ${tone}`} /><h2 className="font-accent text-sm font-black text-slate-900 dark:text-white">{title}</h2></div><p className="mt-3 min-h-10 text-xs leading-relaxed text-slate-500">{copy}</p><a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="neu-button mt-4 flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-black text-slate-900 dark:text-white">{label}</a></article>)}</section>
  <section className="grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => onNavigate('guide')} className="neu-button flex items-center gap-4 rounded-2xl p-5 text-left"><Icons.BookOpen className="h-5 w-5 text-fuchsia-400" /><span><b className="block text-sm text-slate-900 dark:text-white">Hướng dẫn sử dụng</b><small className="text-slate-500">Quy trình tạo ảnh, video và tải kết quả.</small></span></button><button type="button" onClick={() => onNavigate('about')} className="neu-button flex items-center gap-4 rounded-2xl p-5 text-left"><Icons.Info className="h-5 w-5 text-cyan-400" /><span><b className="block text-sm text-slate-900 dark:text-white">Thông tin ứng dụng</b><small className="text-slate-500">Phiên bản và nền tảng AI đang dùng.</small></span></button></section>
</div>;
