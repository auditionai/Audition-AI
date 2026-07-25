import React from 'react';
import { Icons } from '../../components/Icons';
import type { GiftcodeAbuseCase } from '../../services/economyService';
import type { Transaction, UserProfile } from '../../types';
import './admin-operations.css';
import './admin-transaction-metrics.css';

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const dateTime = (value?: string | null) => value
    ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Chưa ghi nhận';

const StatePill = ({ tone = 'neutral', children }: { tone?: string; children: React.ReactNode }) => (
    <span className={`admin-v2-pill admin-v2-pill--${tone}`}>{children}</span>
);

const EmptyPanel = ({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) => (
    <div className="admin-v2-empty">
        <span><Icon className="h-6 w-6" /></span>
        <strong>{title}</strong>
        <p>{description}</p>
    </div>
);

type TransactionsProps = {
    transactions: Transaction[];
    selectedIds: string[];
    processingId?: string | null;
    onToggleAll: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onToggle: (id: string) => void;
    onBulkApprove: () => void;
    onBulkReject: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onDelete: (id: string) => void;
    onRefresh: () => void;
    giftcodeLabel: (value: any) => string | null;
};

export function TransactionsWorkspaceV2(props: TransactionsProps) {
    const pending = props.transactions.filter((item: any) => item.status === 'pending').length;
    const approved = props.transactions.filter((item: any) => ['paid', 'completed', 'success', 'approved'].includes(String(item.status || '').toLowerCase())).length;
    const pendingIds = props.transactions.filter((item: any) => String(item.status || '').toLowerCase() === 'pending').map((item) => item.id);
    const volume = props.transactions.reduce((sum: number, item: any) => sum + Number(item.amount || item.price || 0), 0);
    const vietnamToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const todayTransactions = props.transactions.filter((item) =>
        new Date(item.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === vietnamToday
    );
    const todayPaid = todayTransactions.filter((item) =>
        ['paid', 'completed', 'success', 'approved'].includes(String(item.status || '').toLowerCase())
    ).length;

    return (
        <section className="admin-v2-page">
            <div className="admin-v2-metrics admin-v2-metrics--transactions">
                <article><span>Tổng giao dịch</span><strong>{money(props.transactions.length)}</strong><small>Toàn bộ yêu cầu nạp</small></article>
                <article><span>Nạp hôm nay</span><strong className="is-accent">{money(todayTransactions.length)}</strong><small>{money(todayPaid)} giao dịch đã thanh toán</small></article>
                <article><span>Chờ đối soát</span><strong className="is-warning">{money(pending)}</strong><small>Cần quản trị viên xử lý</small></article>
                <article><span>Đã hoàn tất</span><strong className="is-success">{money(approved)}</strong><small>Đã cộng Vcoin</small></article>
                <article><span>Giá trị ghi nhận</span><strong className="is-accent">{money(volume)}đ</strong><small>Tổng giá trị danh sách</small></article>
            </div>

            <div className="admin-v2-panel">
                <div className="admin-v2-toolbar">
                    <div>
                        <span className="admin-v2-eyebrow">PAYMENT CONTROL</span>
                        <h3>Trung tâm đối soát giao dịch</h3>
                        <p>Kiểm tra thanh toán, duyệt Vcoin và theo dõi trạng thái trong một luồng duy nhất.</p>
                    </div>
                    <div className="admin-v2-actions">
                        {props.selectedIds.length > 0 && <>
                            <button className="admin-v2-button admin-v2-button--success" onClick={props.onBulkApprove}><Icons.Check className="h-4 w-4" /> Duyệt {props.selectedIds.length}</button>
                            <button className="admin-v2-button admin-v2-button--danger" onClick={props.onBulkReject}><Icons.X className="h-4 w-4" /> Từ chối</button>
                        </>}
                        <button className="admin-v2-button" onClick={props.onRefresh}><Icons.RefreshCw className="h-4 w-4" /> Đồng bộ</button>
                    </div>
                </div>

                {props.transactions.length === 0 ? (
                    <EmptyPanel icon={Icons.Gem} title="Chưa có giao dịch" description="Các yêu cầu nạp Vcoin mới sẽ xuất hiện tại đây." />
                ) : (
                    <div className="admin-v2-table-wrap">
                        <table className="admin-v2-table">
                            <thead><tr>
                                <th><input aria-label="Chọn tất cả giao dịch chờ duyệt" type="checkbox" disabled={pendingIds.length === 0} checked={pendingIds.length > 0 && pendingIds.every((id) => props.selectedIds.includes(id))} onChange={props.onToggleAll} /></th>
                                <th>Giao dịch</th><th>Khách hàng</th><th>Gói nạp</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th>
                            </tr></thead>
                            <tbody>{props.transactions.map((tx: any) => {
                                const status = String(tx.status || 'pending').toLowerCase();
                                const done = ['paid', 'completed', 'success', 'approved'].includes(status);
                                const failed = ['failed', 'rejected', 'cancelled'].includes(status);
                                return <tr key={tx.id} className={props.processingId === tx.id ? 'is-processing' : ''}>
                                    <td><input aria-label={`Chọn ${tx.order_code || tx.code}`} type="checkbox" disabled={status !== 'pending'} checked={props.selectedIds.includes(tx.id)} onChange={() => props.onToggle(tx.id)} /></td>
                                    <td><strong className="admin-v2-code">{tx.order_code || tx.code || `#${String(tx.id).slice(0, 8)}`}</strong><small>{dateTime(tx.createdAt)}</small>{props.giftcodeLabel(tx.topupGiftcode) && <StatePill tone="info">{props.giftcodeLabel(tx.topupGiftcode)}</StatePill>}</td>
                                    <td><div className="admin-v2-person"><span>{String(tx.userName || tx.userEmail || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{tx.userName || 'Người dùng'}</strong><small>{tx.userEmail || 'Không có email'}</small></div></div></td>
                                    <td><strong>{money(tx.vcoin_received || 0)} Vcoin</strong><small>{tx.code || 'Gói nạp trực tiếp'}</small></td>
                                    <td><strong>{money(tx.amount || tx.price || 0)}đ</strong>{Number(tx.discountAmount || 0) > 0 && <small className="is-success">Giảm {money(tx.discountAmount)}đ</small>}</td>
                                    <td><StatePill tone={done ? 'success' : failed ? 'danger' : 'warning'}>{done ? 'Hoàn tất' : failed ? 'Đã từ chối' : 'Chờ duyệt'}</StatePill></td>
                                    <td><div className="admin-v2-row-actions">
                                        {!done && !failed && <><button title="Duyệt" className="is-success" onClick={() => props.onApprove(tx.id)}><Icons.Check className="h-4 w-4" /></button><button title="Từ chối" className="is-danger" onClick={() => props.onReject(tx.id)}><Icons.X className="h-4 w-4" /></button></>}
                                        <button title="Xóa giao dịch" onClick={() => props.onDelete(tx.id)}><Icons.Trash className="h-4 w-4" /></button>
                                    </div></td>
                                </tr>;
                            })}</tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

type UsersProps = {
    users: UserProfile[];
    total: number;
    search: string;
    activityFilter: string;
    sortMode: string;
    hasMore: boolean;
    onSearch: (value: string) => void;
    onFilter: (value: any) => void;
    onSort: (value: any) => void;
    onMore: () => void;
    onView: (user: UserProfile) => void;
    onEdit: (user: UserProfile) => void;
    isOnline: (value?: string) => boolean;
    timeAgo: (value?: string) => string;
};

export function UsersWorkspaceV2(props: UsersProps) {
    const online = props.users.filter((user: any) => props.isOnline(user.lastActive)).length;
    const locked = props.users.filter((user: any) => user.accountStatus === 'locked').length;
    const balance = props.users.reduce((sum: number, user: any) => sum + Number(user.vcoin_balance || 0), 0);
    return (
        <section className="admin-v2-page">
            <div className="admin-v2-metrics">
                <article><span>Tổng tài khoản</span><strong>{money(props.total)}</strong><small>Hồ sơ trên hệ thống</small></article>
                <article><span>Đang trực tuyến</span><strong className="is-success">{money(online)}</strong><small>Có hoạt động gần đây</small></article>
                <article><span>Tài khoản khóa</span><strong className="is-danger">{money(locked)}</strong><small>Đang bị hạn chế</small></article>
                <article><span>Số dư hiển thị</span><strong className="is-accent">{money(balance)} VC</strong><small>Trong kết quả hiện tại</small></article>
            </div>
            <div className="admin-v2-panel">
                <div className="admin-v2-toolbar admin-v2-toolbar--stack">
                    <div><span className="admin-v2-eyebrow">CUSTOMER DIRECTORY</span><h3>Quản trị người dùng</h3><p>Tìm tài khoản, theo dõi hoạt động và xử lý hồ sơ từ cùng một màn hình.</p></div>
                    <div className="admin-v2-filters">
                        <label className="admin-v2-search"><Icons.Search className="h-4 w-4" /><input value={props.search} onChange={e => props.onSearch(e.target.value)} placeholder="Tìm theo email..." /></label>
                        <select value={props.activityFilter} onChange={e => props.onFilter(e.target.value)}>
                            <option value="all">Tất cả trạng thái</option><option value="online">Đang online</option><option value="locked">Đã khóa</option><option value="warned">Đã cảnh báo</option><option value="inactive_60">Vắng 60+ ngày</option><option value="inactive_90">Vắng 90+ ngày</option>
                        </select>
                        <select value={props.sortMode} onChange={e => props.onSort(e.target.value)}>
                            <option value="last_active_desc">Hoạt động mới nhất</option><option value="vcoin_desc">Số dư cao nhất</option><option value="usage_desc">Dùng nhiều nhất</option><option value="name_asc">Tên A–Z</option>
                        </select>
                    </div>
                </div>
                {props.users.length === 0 ? <EmptyPanel icon={Icons.Users} title="Không tìm thấy người dùng" description="Thử thay đổi từ khóa hoặc bộ lọc trạng thái." /> :
                    <div className="admin-v2-user-grid">{props.users.map((user: any) => {
                        const onlineNow = props.isOnline(user.lastActive);
                        const lockedNow = user.accountStatus === 'locked';
                        return <article className="admin-v2-user-card" key={user.id}>
                            <div className="admin-v2-user-card__head">
                                <div className="admin-v2-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : String(user.username || user.email || 'U').slice(0, 1).toUpperCase()}<i className={onlineNow ? 'is-online' : ''} /></div>
                                <div><h4>{user.username || 'Chưa đặt tên'}</h4><p>{user.email}</p></div>
                                <StatePill tone={lockedNow ? 'danger' : onlineNow ? 'success' : 'neutral'}>{lockedNow ? 'Đã khóa' : onlineNow ? 'Online' : 'Offline'}</StatePill>
                            </div>
                            <div className="admin-v2-user-card__stats"><div><span>Số dư</span><strong>{money(user.vcoin_balance)} VC</strong></div><div><span>Lượt dùng</span><strong>{money(user.usageCount)}</strong></div><div><span>Hoạt động</span><strong>{props.timeAgo(user.lastActive)}</strong></div></div>
                            {user.accountWarning && <div className="admin-v2-warning"><Icons.AlertTriangle className="h-4 w-4" /><span>{user.accountWarning}</span></div>}
                            <div className="admin-v2-user-card__actions"><button onClick={() => props.onView(user)}>Xem hồ sơ</button><button className="is-primary" onClick={() => props.onEdit(user)}><Icons.Edit2 className="h-4 w-4" /> Chỉnh sửa</button></div>
                        </article>;
                    })}</div>}
                {props.hasMore && <button className="admin-v2-load-more" onClick={props.onMore}>Hiển thị thêm 30 người dùng <Icons.ChevronDown className="h-4 w-4" /></button>}
            </div>
        </section>
    );
}

type AbuseProps = {
    cases: GiftcodeAbuseCase[];
    allCases: GiftcodeAbuseCase[];
    loading: boolean;
    search: string;
    filter: string;
    selectedIds: string[];
    allSelected: boolean;
    bulkLoading: boolean;
    onSearch: (value: string) => void;
    onFilter: (value: any) => void;
    onRefresh: () => void;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    onBulk: (action: 'revoke' | 'warn' | 'lock') => void;
    onAction: (action: 'revoke' | 'warn' | 'lock', item: GiftcodeAbuseCase) => void;
};

export function GiftcodeAbuseWorkspaceV2(props: AbuseProps) {
    const unhandled = props.allCases.filter(item => item.rewardStatus !== 'revoked' && item.accountStatus !== 'locked' && !item.accountWarning).length;
    const highRisk = props.allCases.filter(item => item.riskScore >= 45 || item.severity >= 90).length;
    const locked = props.allCases.filter(item => item.accountStatus === 'locked').length;
    return (
        <section className="admin-v2-page">
            <div className="admin-v2-metrics">
                <article><span>Tín hiệu phát hiện</span><strong>{money(props.allCases.length)}</strong><small>Tổng case được ghi nhận</small></article>
                <article><span>Chưa xử lý</span><strong className="is-warning">{money(unhandled)}</strong><small>Cần quyết định quản trị</small></article>
                <article><span>Rủi ro cao</span><strong className="is-danger">{money(highRisk)}</strong><small>Risk ≥45 hoặc severity ≥90</small></article>
                <article><span>Đã khóa</span><strong className="is-accent">{money(locked)}</strong><small>Tài khoản đã hạn chế</small></article>
            </div>
            <div className="admin-v2-panel">
                <div className="admin-v2-toolbar admin-v2-toolbar--stack">
                    <div><span className="admin-v2-eyebrow">TRUST & SAFETY</span><h3>Điều tra lạm dụng giftcode</h3><p>Đọc tín hiệu trùng IP, trình duyệt, email và xử lý có kiểm soát theo từng bằng chứng.</p></div>
                    <div className="admin-v2-filters">
                        <label className="admin-v2-search"><Icons.Search className="h-4 w-4" /><input value={props.search} onChange={e => props.onSearch(e.target.value)} placeholder="Email, IP, code, campaign..." /></label>
                        <select value={props.filter} onChange={e => props.onFilter(e.target.value)}><option value="unhandled">Chưa xử lý</option><option value="all">Tất cả case</option><option value="duplicates">Trùng cụm</option><option value="high_risk">Rủi ro cao</option><option value="revoked">Đã thu hồi</option><option value="locked">Đã khóa</option></select>
                        <button className="admin-v2-button" onClick={props.onRefresh} disabled={props.loading}><Icons.RefreshCw className={`h-4 w-4 ${props.loading ? 'animate-spin' : ''}`} /> Làm mới</button>
                    </div>
                </div>
                <div className="admin-v2-bulkbar">
                    <button onClick={props.onToggleAll}>{props.allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả kết quả'}</button><span>{props.selectedIds.length} mục đã chọn</span>
                    <div><button disabled={props.bulkLoading || !props.selectedIds.length} onClick={() => props.onBulk('revoke')} className="is-danger">Thu hồi Vcoin</button><button disabled={props.bulkLoading || !props.selectedIds.length} onClick={() => props.onBulk('warn')} className="is-warning">Cảnh báo</button><button disabled={props.bulkLoading || !props.selectedIds.length} onClick={() => props.onBulk('lock')} className="is-primary">Khóa tài khoản</button></div>
                </div>
                {props.loading ? <EmptyPanel icon={Icons.Loader} title="Đang phân tích dữ liệu" description="Hệ thống đang tải tín hiệu vi phạm từ Supabase." /> : props.cases.length === 0 ? <EmptyPanel icon={Icons.Shield} title="Không có case phù hợp" description="Không tìm thấy tín hiệu nào với bộ lọc hiện tại." /> :
                    <div className="admin-v2-case-list">{props.cases.map(item => {
                        const handled = item.accountStatus === 'locked' || item.rewardStatus === 'revoked' || Boolean(item.accountWarning);
                        return <article className="admin-v2-case" key={item.usageId}>
                            <label className="admin-v2-case__select"><input type="checkbox" checked={props.selectedIds.includes(item.usageId)} onChange={() => props.onToggle(item.usageId)} /><span /></label>
                            <div className="admin-v2-case__identity"><div className="admin-v2-avatar">{item.userAvatar ? <img src={item.userAvatar} alt="" /> : String(item.userName || 'U').slice(0, 1)}</div><div><h4>{item.userName || 'Người dùng'}</h4><p>{item.userEmail}</p><small>{money(item.userBalance)} VC · {dateTime(item.usedAt)}</small></div></div>
                            <div className="admin-v2-case__risk"><div className="admin-v2-risk-score"><span>SEVERITY</span><strong>{item.severity}</strong></div><div><StatePill tone={item.riskScore >= 45 ? 'danger' : 'warning'}>Risk {item.riskScore}</StatePill><p>{item.evidence.slice(0, 2).join(' · ') || 'Tín hiệu bất thường từ hệ thống'}</p></div></div>
                            <div className="admin-v2-case__clusters"><span>IP <strong>{item.clusterCounts.ip}</strong></span><span>Browser <strong>{item.clusterCounts.browser}</strong></span><span>Email <strong>{item.clusterCounts.email}</strong></span><span>User <strong>{item.clusterCounts.userCampaign}</strong></span></div>
                            <div className="admin-v2-case__code"><strong>{item.giftCode}</strong><small>{item.campaignKey} · +{item.reward} VC</small><StatePill tone={handled ? 'success' : 'warning'}>{item.accountStatus === 'locked' ? 'Đã khóa' : item.rewardStatus === 'revoked' ? 'Đã thu hồi' : item.accountWarning ? 'Đã cảnh báo' : 'Chưa xử lý'}</StatePill></div>
                            <div className="admin-v2-case__actions"><button disabled={item.rewardStatus === 'revoked'} onClick={() => props.onAction('revoke', item)} className="is-danger">Thu hồi</button><button disabled={Boolean(item.accountWarning)} onClick={() => props.onAction('warn', item)} className="is-warning">Cảnh báo</button><button disabled={item.accountStatus === 'locked'} onClick={() => props.onAction('lock', item)} className="is-primary">Khóa</button></div>
                        </article>;
                    })}</div>}
            </div>
        </section>
    );
}
