import React from 'react';
import { Icons } from '../../components/Icons';
import './ai-usage-analytics.css';

type UsageRow = {
    feature: string;
    count: number;
    vcoins: number;
    revenue: number;
};

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const currency = (value: number) => new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function AIUsageAnalyticsV2({ rows = [] }: { rows?: UsageRow[] }) {
    const sortedRows = [...rows].sort((left, right) => Number(right.count || 0) - Number(left.count || 0));
    const totalUses = sortedRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const totalVcoin = sortedRows.reduce((sum, row) => sum + Number(row.vcoins || 0), 0);
    const totalRevenue = sortedRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const maxUses = Math.max(...sortedRows.map(row => Number(row.count || 0)), 1);
    const topFeature = sortedRows[0];

    return (
        <section className="ai-usage-v2">
            <header className="ai-usage-v2__header">
                <div className="ai-usage-v2__title">
                    <span><Icons.BarChart /></span>
                    <div>
                        <small>FEATURE PERFORMANCE</small>
                        <h3>Hiệu suất tính năng AI</h3>
                        <p>So sánh mức độ sử dụng, Vcoin tiêu thụ và doanh thu ước tính theo từng công cụ.</p>
                    </div>
                </div>
                <div className="ai-usage-v2__live"><i /> Dữ liệu tổng hợp</div>
            </header>

            <div className="ai-usage-v2__overview">
                <article>
                    <span className="is-cyan"><Icons.Activity /></span>
                    <div><small>Tổng lượt sử dụng</small><strong>{number(totalUses)}</strong><p>Trên {number(sortedRows.length)} tính năng</p></div>
                </article>
                <article>
                    <span className="is-pink"><Icons.Gem /></span>
                    <div><small>Vcoin tiêu thụ</small><strong>{number(totalVcoin)} <em>VC</em></strong><p>{totalUses ? (totalVcoin / totalUses).toFixed(1) : '0'} VC / lượt</p></div>
                </article>
                <article>
                    <span className="is-green"><Icons.Zap /></span>
                    <div><small>Doanh thu ước tính</small><strong>{currency(totalRevenue)}</strong><p>Từ toàn bộ tính năng AI</p></div>
                </article>
                <article>
                    <span className="is-violet"><Icons.Star /></span>
                    <div><small>Tính năng dẫn đầu</small><strong className="is-name">{topFeature?.feature || 'Chưa có dữ liệu'}</strong><p>{number(topFeature?.count || 0)} lượt sử dụng</p></div>
                </article>
            </div>

            {sortedRows.length === 0 ? (
                <div className="ai-usage-v2__empty"><Icons.BarChart /><strong>Chưa có dữ liệu thống kê</strong><p>Dữ liệu sử dụng tính năng sẽ xuất hiện tại đây.</p></div>
            ) : (
                <div className="ai-usage-v2__ranking">
                    <div className="ai-usage-v2__ranking-head">
                        <div><small>USAGE RANKING</small><h4>Xếp hạng theo lượt sử dụng</h4></div>
                        <div className="ai-usage-v2__legend"><span><i className="is-cyan" /> Lượt dùng</span><span><i className="is-pink" /> Vcoin</span><span><i className="is-green" /> Doanh thu</span></div>
                    </div>
                    <div className="ai-usage-v2__column-head"><span>Tính năng</span><span>Mức độ sử dụng</span><span>Lượt dùng</span><span>Vcoin</span><span>Doanh thu</span></div>
                    <div className="ai-usage-v2__rows">
                        {sortedRows.map((row, index) => {
                            const usagePercent = Math.max(2, (Number(row.count || 0) / maxUses) * 100);
                            const share = totalUses ? (Number(row.count || 0) / totalUses) * 100 : 0;
                            return (
                                <article key={`${row.feature}-${index}`} className={index < 3 ? `is-top is-top-${index + 1}` : ''}>
                                    <div className="ai-usage-v2__feature">
                                        <b>{index + 1}</b>
                                        <span><Icons.Sparkles /></span>
                                        <div><strong>{row.feature}</strong><small>{share.toFixed(1)}% tổng lượt dùng</small></div>
                                    </div>
                                    <div className="ai-usage-v2__bar"><i><b style={{ width: `${usagePercent}%` }} /></i><small>{usagePercent.toFixed(0)}% so với top 1</small></div>
                                    <div className="ai-usage-v2__metric is-cyan"><small>Lượt dùng</small><strong>{number(row.count)}</strong></div>
                                    <div className="ai-usage-v2__metric is-pink"><small>Tiêu thụ</small><strong>{number(row.vcoins)} VC</strong></div>
                                    <div className="ai-usage-v2__metric is-green"><small>Ước tính</small><strong>{currency(row.revenue)}</strong></div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
