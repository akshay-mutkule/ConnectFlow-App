import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Mail,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Settings2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC<{
  onStatsLoaded?: (stats: DashboardData['stats']) => void;
}> = ({ onStatsLoaded }) => {
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
        if (active) {
          setData(res);
          onStatsLoaded?.(res.stats);
        }
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
  }, [range, onStatsLoaded]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
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

  const waDelivered = data.channelBreakdown?.whatsappDelivered ?? 0;
  const emailDelivered = data.channelBreakdown?.emailDelivered ?? 0;
  const waRate =
    data.stats.whatsappSent > 0 ? Math.round((waDelivered / data.stats.whatsappSent) * 100) : 0;
  const emailRate =
    data.stats.emailsSent > 0 ? Math.round((emailDelivered / data.stats.emailsSent) * 100) : 0;
  const scheduledCount = data.channelBreakdown?.scheduledCount ?? 0;
  const suppressedCount = data.channelBreakdown?.suppressedCount ?? 0;
  const whatsappOptOutCount = data.channelBreakdown?.whatsappOptOutCount ?? 0;

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
    <div className="space-y-7">
      {/* Greeting & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            {profile?.displayName ? `Welcome back, ${profile.displayName.split(' ')[0]}` : 'Messaging Overview'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Unified delivery ledger across your consented WhatsApp and Email audiences.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium mr-1">
            {(
              [
                ['7d', '7D'],
                ['30d', '30D'],
                ['all', 'All'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setRange(val);
                  setHoveredIdx(null);
                }}
                className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  range === val
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link
            to="/whatsapp"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs transition-all whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Send WhatsApp Message</span>
          </Link>
          <Link
            to="/email"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs transition-all whitespace-nowrap shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Email</span>
          </Link>
          <Link
            to="/contacts"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Contacts</span>
          </Link>
        </div>
      </div>

      {/* Unified Architectural Metric Ledger Strip */}
      <div
        className={`bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden shadow-xs transition-opacity ${
          refreshing ? 'opacity-70' : 'opacity-100'
        }`}
      >
        <Link
          to="/contacts"
          className="p-5 hover:bg-[#F8FAFC] transition-colors group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Total Contacts</p>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {data.stats.totalContacts.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {data.stats.whatsappOptedIn} WA · {data.stats.emailOptedIn} Email opt-in
          </p>
        </Link>

        <Link
          to="/whatsapp"
          className="p-5 hover:bg-[#F8FAFC] transition-colors group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">WhatsApp Sent</p>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition-colors" />
          </div>
          <p className="font-display text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
            {data.stats.whatsappSent.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-2 font-mono tabular-nums">
            {waLive ? 'Meta Cloud API' : 'Demo Mode'}
            {data.stats.whatsappSent > 0 ? ` · ${waRate}% deliv` : ''}
          </p>
        </Link>

        <Link
          to="/email"
          className="p-5 hover:bg-[#F8FAFC] transition-colors group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Emails Sent</p>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 transition-colors" />
          </div>
          <p className="font-display text-2xl font-bold text-blue-600 mt-2 tabular-nums">
            {data.stats.emailsSent.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-2 font-mono tabular-nums">
            {emailLive ? 'Live Relay' : integrations?.emailConnected ? 'Demo Mode' : 'Prompt on send'}
            {data.stats.emailsSent > 0 ? ` · ${emailRate}% deliv` : ''}
          </p>
        </Link>

        <Link
          to="/campaigns"
          className="p-5 hover:bg-[#F8FAFC] transition-colors group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Successful Deliveries</p>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {data.stats.successfulDeliveries.toLocaleString()}
            </p>
            {totalSent > 0 && (
              <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                {deliveryRate}%
              </span>
            )}
          </div>
          <div className="mt-2.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all"
              style={{ width: `${deliveryRate}%` }}
            />
          </div>
        </Link>

        <Link
          to="/campaigns"
          className="p-5 col-span-2 sm:col-span-1 hover:bg-[#F8FAFC] transition-colors group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Failed Messages</p>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-600 transition-colors" />
          </div>
          <p className="font-display text-2xl font-bold text-red-600 mt-2 tabular-nums">
            {data.stats.failedMessages.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-2 font-mono tabular-nums">
            {scheduledCount > 0 ? `${scheduledCount} scheduled queued` : 'Failed or bounced'}
          </p>
        </Link>
      </div>

      {/* Campaign Throughput Chart + Channel Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                {chartMode === 'campaigns' ? 'Campaign Delivery Breakdown' : 'Daily Send Volume'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {chartMode === 'campaigns'
                  ? 'Delivered vs. failed volume across your latest campaigns'
                  : `Daily WhatsApp & Email throughput over the last ${range === '7d' ? '7' : '14'} days`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('campaigns');
                    setHoveredIdx(null);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    chartMode === 'campaigns'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Campaign
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('daily');
                    setHoveredIdx(null);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    chartMode === 'daily'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daily Trend
                </button>
              </div>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-medium">
                {(['all', 'whatsapp', 'email'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      setChartChannel(ch);
                      setHoveredIdx(null);
                    }}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      chartChannel === ch
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ch === 'all' ? 'All' : ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                  WhatsApp
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
                  Email
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                  Failed
                </span>
              </div>
            </div>
          </div>

          {chartMode === 'campaigns' ? (
            chartCampaigns.length === 0 ? (
              <div className="h-48 border border-dashed border-slate-200 rounded-lg bg-[#F8FAFC]/60 flex flex-col items-center justify-center text-center p-6">
                <p className="text-xs font-semibold text-slate-700">
                  {chartChannel === 'all'
                    ? 'No campaign telemetry in this window'
                    : `No ${chartChannel === 'whatsapp' ? 'WhatsApp' : 'Email'} campaigns recorded in this window`}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                  Launch a campaign or expand the date range to visualize delivery performance.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative h-48 flex">
                  {/* Y-Axis Scale */}
                  <div className="flex flex-col justify-between pr-3 py-1 text-[10px] font-mono text-slate-400 tabular-nums select-none text-right w-9 shrink-0">
                    <span>{activeMaxTotal}</span>
                    <span>{midTick}</span>
                    <span>0</span>
                  </div>

                  {/* Plot Area with Hairline Grid */}
                  <div className="relative flex-1 flex items-end gap-3 pt-4 border-b border-l border-slate-200 px-3">
                    <div className="absolute inset-x-0 top-1 border-t border-dashed border-slate-100 pointer-events-none" />
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100 pointer-events-none" />

                    {chartCampaigns.map((c, idx) => {
                      const delivered = Math.max(
                        c.deliveredCount,
                        c.sentCount - c.failedCount - c.bouncedCount
                      );
                      const failed = c.failedCount + c.bouncedCount;
                      const total = Math.max(1, c.totalRecipients);
                      const barHeightPct = Math.max(12, Math.round((total / activeMaxTotal) * 100));
                      const failPct = Math.round((failed / total) * 100);
                      const delivPct = Math.round((delivered / total) * 100);
                      const isHovered = hoveredIdx === idx;
                      const dimmed = hoveredIdx !== null && !isHovered;

                      return (
                        <div
                          key={c.id}
                          onMouseEnter={() => setHoveredIdx(idx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          onClick={() => navigate('/campaigns')}
                          className={`flex-1 flex flex-col items-center justify-end h-full cursor-pointer group relative transition-opacity duration-150 ${
                            dimmed ? 'opacity-45' : 'opacity-100'
                          }`}
                        >
                          {isHovered && (
                            <div className="absolute -top-2 -translate-y-full z-10 bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
                              <p className="font-semibold font-display">{c.name}</p>
                              <p className="font-mono text-slate-300 mt-0.5 tabular-nums">
                                {delivered}/{total} delivered ({delivPct}%) · {failed} failed
                              </p>
                            </div>
                          )}
                          <div
                            style={{ height: `${barHeightPct}%` }}
                            className="w-full max-w-[44px] rounded-t-md overflow-hidden flex flex-col justify-end bg-slate-100 ring-1 ring-inset ring-slate-900/5"
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

                <div className="flex items-center gap-3 pl-12 pr-3">
                  {chartCampaigns.map((c) => (
                    <p
                      key={c.id}
                      className="flex-1 text-center text-[11px] text-slate-500 truncate font-medium"
                    >
                      {c.name}
                    </p>
                  ))}
                </div>
              </div>
            )
          ) : dailyPoints.length === 0 || dailyPoints.every((d) => d.total === 0) ? (
            <div className="h-48 border border-dashed border-slate-200 rounded-lg bg-[#F8FAFC]/60 flex flex-col items-center justify-center text-center p-6">
              <p className="text-xs font-semibold text-slate-700">No daily send volume yet</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Daily WhatsApp and Email volume will plot chronologically as campaigns run.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative h-48 flex">
                <div className="flex flex-col justify-between pr-3 py-1 text-[10px] font-mono text-slate-400 tabular-nums select-none text-right w-9 shrink-0">
                  <span>{activeMaxTotal}</span>
                  <span>{midTick}</span>
                  <span>0</span>
                </div>

                <div className="relative flex-1 flex items-end gap-2 pt-4 border-b border-l border-slate-200 px-2.5">
                  <div className="absolute inset-x-0 top-1 border-t border-dashed border-slate-100 pointer-events-none" />
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100 pointer-events-none" />

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
                        className={`flex-1 flex flex-col items-center justify-end h-full relative transition-opacity duration-150 ${
                          dimmed ? 'opacity-45' : 'opacity-100'
                        }`}
                      >
                        {isHovered && (
                          <div className="absolute -top-2 -translate-y-full z-10 bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
                            <p className="font-semibold font-display">{pt.label}</p>
                            <p className="font-mono text-slate-300 mt-0.5 tabular-nums">
                              {waPart} WA · {emailPart} Email · {pt.failed} failed
                            </p>
                          </div>
                        )}
                        <div
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full max-w-[32px] rounded-t-md overflow-hidden flex flex-col justify-end ${
                            pt.total === 0 ? 'bg-slate-200/70' : 'bg-slate-100 ring-1 ring-inset ring-slate-900/5'
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

              <div className="flex items-center gap-2 pl-11 pr-2.5">
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

        {/* Channel Readiness */}
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 flex flex-col">
          <div className="px-6 py-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Channel Readiness
            </h3>
            <Link
              to="/settings"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Configure</span>
            </Link>
          </div>

          <div className="p-5 space-y-2.5 flex-1 hover:bg-[#F8FAFC]/60 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-semibold text-slate-900">WhatsApp Business</span>
              </div>
              <span className={`text-xs font-semibold ${waLive ? 'text-emerald-700' : 'text-amber-700'}`}>
                {waLive ? 'Live API' : 'Demo Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-mono tabular-nums">
              {data.stats.whatsappOptedIn} opted-in · {whatsappOptOutCount} opted-out
              {data.stats.whatsappSent > 0 ? ` · ${waRate}% deliv rate` : ''}
            </p>
            <Link
              to="/whatsapp"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
            >
              <span>Open WhatsApp Composer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-5 space-y-2.5 flex-1 hover:bg-[#F8FAFC]/60 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-semibold text-slate-900">Email Delivery</span>
              </div>
              <span className={`text-xs font-semibold ${emailLive ? 'text-blue-600' : 'text-amber-700'}`}>
                {emailLive ? 'Live Relay' : integrations?.emailConnected ? 'Demo Mode' : 'Setup on send'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-mono tabular-nums">
              {data.stats.emailOptedIn} opted-in · {suppressedCount} suppressed
              {data.stats.emailsSent > 0 ? ` · ${emailRate}% deliv rate` : ''}
            </p>
            {integrations?.emailFromAddress && (
              <p className="text-[11px] text-slate-500 truncate">
                Sender: {integrations.emailFromAddress}
              </p>
            )}
            <Link
              to="/email"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 pt-1"
            >
              <span>Open Email Composer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Campaigns & Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recent Campaigns
            </h3>
            <Link
              to="/campaigns"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data.recentCampaigns.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No campaigns sent yet</p>
              <p className="text-xs text-slate-500">
                Add opted-in contacts and launch your first campaign to see results here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-[#F8FAFC]">
                    <th className="py-3 px-6">Campaign</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Delivery Ratio</th>
                    <th className="py-3 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.recentCampaigns.map((c) => {
                    const total = Math.max(1, c.totalRecipients);
                    const deliv = Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount);
                    const pct = Math.round((deliv / total) * 100);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate('/campaigns')}
                        className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-900 truncate max-w-[200px] group-hover:text-blue-600 transition-colors">
                              {c.name}
                            </p>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {new Date(c.createdAt).toLocaleDateString()} · {c.executionMode === 'demo' ? 'Demo' : 'Live'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              c.channel === 'whatsapp' ? 'text-emerald-700' : 'text-blue-600'
                            }`}
                          >
                            {c.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full rounded-full ${
                                  c.channel === 'whatsapp' ? 'bg-emerald-600' : 'bg-blue-600'
                                }`}
                              />
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-600">
                              {deliv}/{c.totalRecipients}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <span
                            className={`text-xs font-semibold capitalize ${
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

        {/* Recent Activity */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recent Activity
            </h3>
            <Link
              to="/settings"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Audit log
            </Link>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {data.recentActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No recent workspace activity recorded yet.
              </div>
            ) : (
              data.recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="px-6 py-3.5 flex items-start gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 leading-relaxed">{log.details}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-1 tabular-nums">
                      {new Date(log.createdAt).toLocaleString()}
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
