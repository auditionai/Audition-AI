import React from 'react';
import { Icons } from '../../components/Icons';
import type { AdminQueueHealthReport, AdminQueueJob, AdminQueueSummary } from '../../types';
import './queue-workspace.css';

type QueueFilter = 'all' | 'queued' | 'processing' | 'failed' | 'completed' | 'overdue_polls' | 'untouched_queued' | 'stalled_pre_dispatch';

type Props = {
    jobs: AdminQueueJob[];
    summary: AdminQueueSummary;
    healthReport: AdminQueueHealthReport | null;
    loading: boolean;
    reconciling: boolean;
    rescuing: boolean;
    emailFilter: string;
    statusFilter: string;
    assetFilter: string;
    timeScope: 'today' | 'all';
    stageFilter: string;
    stuckOnly: boolean;
    summaryFilter: QueueFilter;
    stageOptions: string[];
    onEmailFilter: (value: string) => void;
    onStatusFilter: (value: any) => void;
    onAssetFilter: (value: any) => void;
    onTimeScope: (value: 'today' | 'all') => void;
    onStageFilter: (value: string) => void;
    onStuckOnly: (value: boolean) => void;
    onSummaryFilter: (value: QueueFilter) => void;
    onRefresh: () => void;
    onRescue: () => void;
    onReconcile: () => void;
    onOpen: (id: string) => void;
    onRetry: (job: AdminQueueJob) => void;
    stageLabel: (stage?: string) => string;
    statusLabel: (status?: string) => string;
    platformLabel: (platform?: string) => string;
    timeAgo: (value?: string) => string;
};

const summaryItems: Array<{ key: QueueFilter; label: string; field: keyof AdminQueueSummary; tone: string }> = [
    { key: 'all', label: 'Tổng job', field: 'total', tone: 'neutral' },
    { key: 'queued', label: 'Đang chờ', field: 'queued', tone: 'warning' },
    { key: 'processing', label: 'Đang xử lý', field: 'processing', tone: 'cyan' },
    { key: 'completed', label: 'Hoàn thành', field: 'completed', tone: 'success' },
    { key: 'failed', label: 'Thất bại', field: 'failed', tone: 'danger' },
    { key: 'overdue_polls', label: 'Poll quá hạn', field: 'overduePolls', tone: 'danger' },
    { key: 'untouched_queued', label: 'Queued stale', field: 'untouchedQueued', tone: 'orange' },
    { key: 'stalled_pre_dispatch', label: 'Kẹt trước khi gửi', field: 'stalledPreDispatch', tone: 'pink' },
];

const getStatusTone = (status?: string) => {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'processing') return 'cyan';
    if (status === 'rescuing') return 'violet';
    return 'warning';
};

export default function QueueWorkspaceV2(props: Props) {
    const liveReport: any = props.healthReport?.liveDbReport;
    const liveCounts = liveReport && !liveReport.error ? liveReport.counts || {} : {};
    const watchdogDue = liveReport && !liveReport.error ? Number(liveReport.watchdogDue || 0) : 0;

    return (
        <section className="queue-v2">
            <header className="queue-v2__hero">
                <div>
                    <span className="queue-v2__eyebrow"><i /> REALTIME OPERATIONS</span>
                    <h2>Queue Operations</h2>
                    <p>Giám sát luồng tạo ảnh và video từ lúc tiếp nhận đến khi provider trả kết quả.</p>
                </div>
                <div className="queue-v2__hero-actions">
                    <button onClick={props.onRefresh} disabled={props.loading}><Icons.RefreshCw className={props.loading ? 'animate-spin' : ''} />{props.loading ? 'Đang tải' : 'Làm mới'}</button>
                    <button className="is-rescue" onClick={props.onRescue} disabled={props.rescuing}><Icons.Zap />{props.rescuing ? 'Đang cứu job' : 'Cứu job timeout'}</button>
                    <button className="is-primary" onClick={props.onReconcile} disabled={props.reconciling}><Icons.Activity />{props.reconciling ? 'Đang reconcile' : 'Reconcile queue'}</button>
                </div>
            </header>

            <div className="queue-v2__summary">
                {summaryItems.map((item) => (
                    <button key={item.key} className={`${props.summaryFilter === item.key ? 'is-active' : ''} is-${item.tone}`} onClick={() => props.onSummaryFilter(item.key)}>
                        <span>{item.label}</span>
                        <strong>{Number(props.summary[item.field] || 0).toLocaleString('vi-VN')}</strong>
                        <i />
                    </button>
                ))}
            </div>

            <section className="queue-v2__health">
                <div className="queue-v2__health-main">
                    <span className="queue-v2__health-icon"><Icons.Shield /></span>
                    <div>
                        <span>QUEUE HEALTH</span>
                        <h3>{watchdogDue > 0 ? `${watchdogDue} job cần watchdog` : 'Luồng vận hành ổn định'}</h3>
                        <p>
                            {liveReport?.error ? `Không đọc được live report: ${liveReport.error}` : `Đã quét ${Number(liveReport?.scanned || 0).toLocaleString('vi-VN')} job`}
                            {' · '}Snapshot {props.healthReport?.lastWatchdogReportUpdatedAt ? props.timeAgo(props.healthReport.lastWatchdogReportUpdatedAt) : 'chưa ghi nhận'}
                        </p>
                    </div>
                </div>
                <div className="queue-v2__health-signals">
                    <div><span>Queued stale</span><strong>{liveCounts.queued_stale || 0}</strong></div>
                    <div><span>Safe requeue</span><strong>{liveCounts.pre_dispatch_safe_requeue_due || 0}</strong></div>
                    <div><span>Provider risk</span><strong>{liveCounts.pre_dispatch_provider_risk || 0}</strong></div>
                    <div><span>Poll overdue</span><strong>{liveCounts.poll_overdue || 0}</strong></div>
                </div>
            </section>

            <section className="queue-v2__workspace">
                <div className="queue-v2__filters">
                    <label className="queue-v2__search"><Icons.Search /><input value={props.emailFilter} onChange={(event) => props.onEmailFilter(event.target.value)} placeholder="Tìm email hoặc Job ID..." /></label>
                    <div className="queue-v2__scope"><button className={props.timeScope === 'today' ? 'is-active' : ''} onClick={() => props.onTimeScope('today')}>Hôm nay</button><button className={props.timeScope === 'all' ? 'is-active' : ''} onClick={() => props.onTimeScope('all')}>Tất cả</button></div>
                    <select value={props.statusFilter} onChange={(event) => props.onStatusFilter(event.target.value)}><option value="all">Mọi trạng thái</option><option value="queued">Đang chờ</option><option value="processing">Đang xử lý</option><option value="rescuing">Đang cứu kết quả</option><option value="completed">Hoàn thành</option><option value="failed">Thất bại</option></select>
                    <select value={props.assetFilter} onChange={(event) => props.onAssetFilter(event.target.value)}><option value="all">Ảnh và Video</option><option value="image">Chỉ ảnh</option><option value="video">Chỉ video</option></select>
                    <select value={props.stageFilter} onChange={(event) => props.onStageFilter(event.target.value)}><option value="all">Tất cả stage</option>{props.stageOptions.map(stage => <option key={stage} value={stage}>{props.stageLabel(stage)}</option>)}</select>
                    <label className="queue-v2__stuck"><span>Chỉ job đang kẹt</span><input type="checkbox" checked={props.stuckOnly} onChange={(event) => props.onStuckOnly(event.target.checked)} /></label>
                </div>

                <div className="queue-v2__list-head"><div><span>JOB STREAM</span><strong>{props.jobs.length} kết quả</strong></div><small>Dữ liệu được đồng bộ trực tiếp từ Supabase queue</small></div>

                {props.jobs.length === 0 ? (
                    <div className="queue-v2__empty"><span><Icons.Activity /></span><h3>Không có job phù hợp</h3><p>Thử thay đổi bộ lọc hoặc đồng bộ lại dữ liệu queue.</p></div>
                ) : (
                    <div className="queue-v2__jobs">{props.jobs.map(job => {
                        const status = job.displayStatus || job.status;
                        const lastLog = job.lastLogMessage || job.queueLogs?.[job.queueLogs.length - 1]?.message || job.error || 'Chưa có log mới';
                        const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
                        return <article
                            className={`queue-v2__job ${job.isStuck ? 'is-stuck' : ''}`}
                            key={job.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => props.onOpen(job.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    props.onOpen(job.id);
                                }
                            }}
                        >
                            <div className="queue-v2__job-main">
                                <span className={`queue-v2__asset queue-v2__asset--${job.assetType === 'video' ? 'video' : 'image'}`}>{job.assetType === 'video' ? <Icons.Video /> : <Icons.Image />}</span>
                                <div><h4>{job.userName || 'Unknown user'}</h4><p>{job.userEmail || job.userId}</p><code>#{job.id.slice(0, 12)}</code></div>
                            </div>
                            <div className="queue-v2__job-state"><span className={`queue-v2__status is-${getStatusTone(status)}`}><i />{props.statusLabel(status)}</span>{job.isStuck && <b>{job.health?.label || 'STUCK'}</b>}<small>{props.platformLabel(job.clientPlatform)}</small></div>
                            <div className="queue-v2__stage"><span>STAGE HIỆN TẠI</span><strong>{props.stageLabel(job.queueStage)}</strong><small>{props.timeAgo(job.updatedAt)}</small></div>
                            <div className="queue-v2__progress"><div><span>Tiến trình</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }} /></i>{job.nextPollAt && <small>Poll {props.timeAgo(job.nextPollAt)}</small>}</div>
                            <div className="queue-v2__log"><span>{job.error ? 'LỖI GẦN NHẤT' : 'LOG GẦN NHẤT'}</span><p className={job.error ? 'is-error' : ''}>{lastLog}</p>{job.jobId && <code>Provider: {job.jobId}</code>}</div>
                            <div className="queue-v2__actions">
                                {status === 'failed' && (
                                    <button
                                        className="queue-v2__retry"
                                        onClick={(event) => { event.stopPropagation(); props.onRetry(job); }}
                                        aria-label={`Chạy lại job ${job.id}`}
                                    >
                                        <Icons.RefreshCw /><span>Chạy lại</span>
                                    </button>
                                )}
                                <button
                                    className="queue-v2__detail"
                                    onClick={(event) => { event.stopPropagation(); props.onOpen(job.id); }}
                                    aria-label={`Xem chi tiết job ${job.id}`}
                                >
                                    <span>Xem chi tiết</span><Icons.ChevronRight />
                                </button>
                            </div>
                        </article>;
                    })}</div>
                )}
            </section>
        </section>
    );
}
