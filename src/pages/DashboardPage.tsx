import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Mail,
  ArrowRight,
  Clock,
  Settings2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { integrations, profile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [chartChannel, setChartChannel] = useState<'all' | 'whatsapp' | 'email'>('all');
  const [chartMode, setChartMode] = useState<'campaigns' | 'daily'>('campaigns');
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('all');

  useEffect(() => {
    let active = true;
    (async () => {
      if (data) setRefreshing(true);
      try {
        const res = await apiRequest<DashboardData>(`/api/dashboard?range=${range}`);
        if (active) setData(res);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load dashboard');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [range]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#F8FAFC] border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-[#F8FAFC] border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-[#F8FAFC] border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Unable to load dashboard data.'}
      </div>
    );
  }

  const totalSent = data.stats.whatsappSent + data.stats.emailsSent;
  const deliveryRate =
    totalSent > 0 ? Math.round((data.stats.successfulDeliveries / totalSent) * 100) : 0;

  const waLive = integrations?.whatsappConnected && integrations.whatsappMode === 'live';
  const emailLive = integrations?.emailConnected && integrations.emailMode === 'live';

  const chartCampaigns = [...data.recentCampaigns]
    .filter((c) => chartChannel === 'all' || c.channel === chartChannel)
    .reverse();
  const maxCampaignTotal = Math.max(
    1,
    ...chartCampaigns.map((c) => Math.max(c.totalRecipients, c.sentCount))
  );

  const dailyPoints = (data.dailyTrend || []).map((pt) => {
    const sent =
      chartChannel === 'whatsapp'
        ? pt.whatsappSent
        : chartChannel === 'email'
          ? pt.emailSent
          : pt.whatsappSent + pt.emailSent;
    const total = Math.max(sent, pt.delivered + pt.failed);
    return { ...pt, total };
  });
  const maxDailyTotal = Math.max(1, ...dailyPoints.map((d) => d.total));
  const activeMaxTotal = chartMode === 'campaigns' ? maxCampaignTotal : maxDailyTotal;
  const midTick = Math.round(activeMaxTotal / 2);

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">
          {profile?.displayName ? `${profile.displayName.split(' ')[0]}'s workspace` : 'Overview'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/whatsapp"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Send WhatsApp Message</span>
          </Link>
          <Link
            to="/email"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Email</span>
          </Link>
          <Link
            to="/contacts"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Contacts</span>
          </Link>
        </div>
      </div>

      {/* Unified 5-Column Metric Strip */}
      <div
        className={`bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden transition-opacity ${
          refreshing ? 'opacity-70' : 'opacity-100'
        }`}
      >
        <Link
          to="/contacts"
          className="p-4 hover:bg-[#F8FAFC] transition-colors"
        >
          <p className="text-xs text-slate-500">Total Contacts</p>
          <p className="font-display text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {data.stats.totalContacts.toLocaleString()}
          </p>
        </Link>

        <Link
          to="/whatsapp"
          className="p-4 hover:bg-[#F8FAFC] transition-colors"
        >
          <p className="text-xs text-slate-500">WhatsApp Sent</p>
          <p className="font-display text-2xl font-semibold text-emerald-700 mt-1 tabular-nums">
            {data.stats.whatsappSent.toLocaleString()}
          </p>
        </Link>

        <Link
          to="/email"
          className="p-4 hover:bg-[#F8FAFC] transition-colors"
        >
          <p className="text-xs text-slate-500">Emails Sent</p>
          <p className="font-display text-2xl font-semibold text-blue-600 mt-1 tabular-nums">
            {data.stats.emailsSent.toLocaleString()}
          </p>
        </Link>

        <Link
          to="/campaigns"
          className="p-4 hover:bg-[#F8FAFC] transition-colors"
        >
          <p className="text-xs text-slate-500">Successful Deliveries</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums">
              {data.stats.successfulDeliveries.toLocaleString()}
            </p>
            {totalSent > 0 && (
              <span className="text-xs font-mono text-emerald-700 tabular-nums">
                {deliveryRate}%
              </span>
            )}
          </div>
        </Link>

        <Link
          to="/campaigns"
          className="p-4 col-span-2 sm:col-span-1 hover:bg-[#F8FAFC] transition-colors"
        >
          <p className="text-xs text-slate-500">Failed Messages</p>
          <p className="font-display text-2xl font-semibold text-red-600 mt-1 tabular-nums">
            {data.stats.failedMessages.toLocaleString()}
          </p>
        </Link>
      </div>

      {/* Delivery Chart + Channel Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {chartMode === 'campaigns' ? 'Delivery Breakdown' : 'Daily Send Volume'}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-0.5 bg-[#F8FAFC] border border-slate-200 rounded-lg text-[11px] font-medium">
                {(['7d', '30d', 'all'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setRange(val);
                      setHoveredIdx(null);
                    }}
                    className={`px-2 py-1 rounded-md transition-colors ${
                      range === val ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {val === 'all' ? 'All' : val.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="inline-flex p-0.5 bg-[#F8FAFC] border border-slate-200 rounded-lg text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('campaigns');
                    setHoveredIdx(null);
                  }}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    chartMode === 'campaigns' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Campaigns
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('daily');
                    setHoveredIdx(null);
                  }}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    chartMode === 'daily' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Daily
                </button>
              </div>

              <select
                value={chartChannel}
                onChange={(e) => {
                  setChartChannel(e.target.value as 'all' | 'whatsapp' | 'email');
                  setHoveredIdx(null);
                }}
                aria-label="Filter chart channel"
                className="px-2.5 py-1 text-[11px] font-medium bg-[#F8FAFC] border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">All Channels</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>

          {chartMode === 'campaigns' ? (
            chartCampaigns.length === 0 ? (
              <div className="h-44 border border-dashed border-slate-200 rounded-lg bg-[#F8FAFC] flex flex-col items-center justify-center text-center p-6">
                <p className="text-xs font-medium text-slate-600">No campaign activity in this range</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative h-44 flex">
                  <div className="flex flex-col justify-between pr-3 py-1 text-[10px] font-mono text-slate-400 tabular-nums select-none text-right w-8 shrink-0">
                    <span>{activeMaxTotal}</span>
                    <span>{midTick}</span>
                    <span>0</span>
                  </div>

                  <div className="relative flex-1 flex items-end gap-3 pt-4 border-b border-l border-slate-200 px-3">
                    {chartCampaigns.map((c, idx) => {
                      const delivered = Math.max(
                        c.deliveredCount,
                        c.sentCount - c.failedCount - c.bouncedCount
                      );
                      const failed = c.failedCount + c.bouncedCount;
                      const total = Math.max(1, c.totalRecipients);
                      const barHeightPct = Math.max(12, Math.round((total / activeMaxTotal) * 100));
                      const failPct = Math.round((failed / total) * 100);
                      const isHovered = hoveredIdx === idx;
                      const dimmed = hoveredIdx !== null && !isHovered;

                      return (
                        <div
                          key={c.id}
                          onMouseEnter={() => setHoveredIdx(idx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          onClick={() => navigate('/campaigns')}
                          className={`flex-1 flex flex-col items-center justify-end h-full cursor-pointer relative transition-opacity ${
                            dimmed ? 'opacity-45' : 'opacity-100'
                          }`}
                        >
                          {isHovered && (
                            <div className="absolute -top-2 -translate-y-full z-10 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-md pointer-events-none">
                              <p className="font-semibold">{c.name}</p>
                              <p className="font-mono text-slate-300 tabular-nums">
                                {delivered}/{total} delivered · {failed} failed
                              </p>
                            </div>
                          )}
                          <div
                            style={{ height: `${barHeightPct}%` }}
                            className="w-full max-w-[36px] rounded-t-md overflow-hidden flex flex-col justify-end bg-slate-100"
                          >
                            {failPct > 0 && (
                              <div style={{ height: `${failPct}%` }} className="w-full bg-red-500" />
                            )}
                            <div
                              style={{ height: `${100 - failPct}%` }}
                              className={`w-full ${
                                c.channel === 'whatsapp' ? 'bg-emerald-600' : 'bg-blue-600'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-11 pr-3">
                  {chartCampaigns.map((c) => (
                    <p
                      key={c.id}
                      className="flex-1 text-center text-[11px] text-slate-500 truncate"
                    >
                      {c.name}
                    </p>
                  ))}
                </div>
              </div>
            )
          ) : dailyPoints.length === 0 || dailyPoints.every((d) => d.total === 0) ? (
            <div className="h-44 border border-dashed border-slate-200 rounded-lg bg-[#F8FAFC] flex flex-col items-center justify-center text-center p-6">
              <p className="text-xs font-medium text-slate-600">No daily volume recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative h-44 flex">
                <div className="flex flex-col justify-between pr-3 py-1 text-[10px] font-mono text-slate-400 tabular-nums select-none text-right w-8 shrink-0">
                  <span>{activeMaxTotal}</span>
                  <span>{midTick}</span>
                  <span>0</span>
                </div>

                <div className="relative flex-1 flex items-end gap-2 pt-4 border-b border-l border-slate-200 px-2.5">
                  {dailyPoints.map((pt, idx) => {
                    const waPart = chartChannel === 'email' ? 0 : pt.whatsappSent;
                    const emailPart = chartChannel === 'whatsapp' ? 0 : pt.emailSent;
                    const denom = Math.max(1, waPart + emailPart);
                    const barHeightPct =
                      pt.total > 0 ? Math.max(8, Math.round((pt.total / activeMaxTotal) * 100)) : 3;
                    const waShare = Math.round((waPart / denom) * 100);
                    const emailShare = 100 - waShare;
                    const isHovered = hoveredIdx === idx;
                    const dimmed = hoveredIdx !== null && !isHovered;

                    return (
                      <div
                        key={pt.date}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className={`flex-1 flex flex-col items-center justify-end h-full relative transition-opacity ${
                          dimmed ? 'opacity-45' : 'opacity-100'
                        }`}
                      >
                        {isHovered && (
                          <div className="absolute -top-2 -translate-y-full z-10 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-md pointer-events-none">
                            <p className="font-semibold">{pt.label}</p>
                            <p className="font-mono text-slate-300 tabular-nums">
                              {waPart} WA · {emailPart} Email
                            </p>
                          </div>
                        )}
                        <div
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full max-w-[28px] rounded-t-md overflow-hidden flex flex-col justify-end ${
                            pt.total === 0 ? 'bg-slate-200/70' : 'bg-slate-100'
                          }`}
                        >
                          {pt.total > 0 && (
                            <>
                              {emailPart > 0 && (
                                <div style={{ height: `${emailShare}%` }} className="w-full bg-blue-600" />
                              )}
                              {waPart > 0 && (
                                <div style={{ height: `${waShare}%` }} className="w-full bg-emerald-600" />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pl-10 pr-2.5">
                {dailyPoints.map((pt, idx) => (
                  <p
                    key={pt.date}
                    className="flex-1 text-center text-[10px] font-mono text-slate-400 truncate tabular-nums"
                  >
                    {dailyPoints.length <= 7 || idx % 2 === 0 ? pt.label : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Channel Status */}
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 flex flex-col">
          <div className="px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">Channels</h2>
            <Link
              to="/settings"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Settings</span>
            </Link>
          </div>

          <div className="p-5 space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">WhatsApp</span>
              </div>
              <span className={`text-xs font-medium ${waLive ? 'text-emerald-700' : 'text-slate-500'}`}>
                {waLive ? 'Live API' : 'Demo Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {data.stats.whatsappOptedIn} opted-in (
              {data.stats.totalContacts > 0
                ? Math.round((data.stats.whatsappOptedIn / data.stats.totalContacts) * 100)
                : 0}
              %)
            </p>
            <Link
              to="/whatsapp"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
            >
              <span>Compose message</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-5 space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">Email</span>
              </div>
              <span className={`text-xs font-medium ${emailLive ? 'text-blue-600' : 'text-slate-500'}`}>
                {emailLive ? 'Live Relay' : integrations?.emailConnected ? 'Demo Mode' : 'Not configured'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {data.stats.emailOptedIn} opted-in (
              {data.stats.totalContacts > 0
                ? Math.round((data.stats.emailOptedIn / data.stats.totalContacts) * 100)
                : 0}
              %)
            </p>
            <Link
              to="/email"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 pt-1"
            >
              <span>Compose email</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data.channelBreakdown &&
            (data.channelBreakdown.scheduledCount > 0 ||
              data.channelBreakdown.suppressedCount > 0) && (
              <div className="px-5 py-3 bg-[#F8FAFC] flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                <span>{data.channelBreakdown.scheduledCount} scheduled</span>
                <span>{data.channelBreakdown.suppressedCount} suppressed</span>
              </div>
            )}
        </div>
      </div>

      {/* Recent Campaigns & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">Recent Campaigns</h2>
            <Link
              to="/campaigns"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data.recentCampaigns.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-slate-700">No campaigns sent yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Launch your first WhatsApp or Email campaign to see results here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-[#F8FAFC]">
                    <th className="py-2.5 px-5">Campaign</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Delivered</th>
                    <th className="py-2.5 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.recentCampaigns.map((c) => {
                    const deliv = Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate('/campaigns')}
                        className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-5">
                          <p className="font-medium text-slate-900 truncate max-w-[220px]">{c.name}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              c.channel === 'whatsapp' ? 'text-emerald-700' : 'text-blue-600'
                            }`}
                          >
                            {c.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                          {deliv}/{c.totalRecipients}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <span
                            className={`text-xs font-medium capitalize ${
                              c.status === 'completed'
                                ? 'text-emerald-700'
                                : c.status === 'failed'
                                  ? 'text-red-600'
                                  : 'text-amber-700'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {data.recentActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No recent activity yet.
              </div>
            ) : (
              data.recentActivity.slice(0, 6).map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-start gap-2.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 leading-relaxed">{log.details}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 tabular-nums">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
