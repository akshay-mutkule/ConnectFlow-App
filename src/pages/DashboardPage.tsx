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

export const DashboardPage: React.FC<{
  onStatsLoaded?: (stats: DashboardData['stats']) => void;
}> = ({ onStatsLoaded }) => {
  const { integrations, profile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<DashboardData>('/api/dashboard');
        if (active) {
          setData(res);
          onStatsLoaded?.(res.stats);
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onStatsLoaded]);

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

  const waLive = integrations?.whatsappConnected && integrations.whatsappMode === 'live';
  const emailLive = integrations?.emailConnected && integrations.emailMode === 'live';

  const chartCampaigns = [...data.recentCampaigns].reverse();
  const maxTotal = Math.max(1, ...chartCampaigns.map((c) => Math.max(c.totalRecipients, c.sentCount)));

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
          <Link
            to="/whatsapp"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Send WhatsApp Message</span>
          </Link>
          <Link
            to="/email"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Email</span>
          </Link>
          <Link
            to="/contacts"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Contacts</span>
          </Link>
        </div>
      </div>

      {/* Unified Architectural Metric Ledger Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Contacts</p>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {data.stats.totalContacts.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
            {data.stats.whatsappOptedIn} WA · {data.stats.emailOptedIn} Email opt-in
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">WhatsApp Sent</p>
          <p className="font-display text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
            {data.stats.whatsappSent.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {waLive ? 'Meta Cloud API' : 'Demo Mode'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Emails Sent</p>
          <p className="font-display text-2xl font-bold text-blue-600 mt-2 tabular-nums">
            {data.stats.emailsSent.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {emailLive ? 'Live Relay' : integrations?.emailConnected ? 'Demo Mode' : 'Prompt on send'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Successful Deliveries</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {data.stats.successfulDeliveries.toLocaleString()}
            </p>
            {totalSent > 0 && (
              <span className="text-xs font-mono font-medium text-emerald-700 tabular-nums">
                {deliveryRate}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Confirmed receipts</p>
        </div>

        <div className="p-5 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">Failed Messages</p>
          <p className="font-display text-2xl font-bold text-red-600 mt-2 tabular-nums">
            {data.stats.failedMessages.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">Failed or bounced</p>
        </div>
      </div>

      {/* Campaign Throughput Chart + Channel Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Campaign Delivery Breakdown
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Delivered vs. failed volume across your latest campaigns
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600">
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

          {chartCampaigns.length === 0 ? (
            <div className="h-44 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-center p-6">
              <p className="text-xs font-medium text-slate-700">No campaign telemetry yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Launch your first WhatsApp or Email campaign to visualize delivery performance here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-44 flex items-end gap-3 pt-4 border-b border-slate-200 px-2">
                {chartCampaigns.map((c, idx) => {
                  const delivered = Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount);
                  const failed = c.failedCount + c.bouncedCount;
                  const total = Math.max(1, c.totalRecipients);
                  const barHeightPct = Math.max(12, Math.round((total / maxTotal) * 100));
                  const failPct = Math.round((failed / total) * 100);
                  const isHovered = hoveredIdx === idx;
                  return (
                    <div
                      key={c.id}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => navigate('/campaigns')}
                      className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group relative"
                    >
                      {isHovered && (
                        <div className="absolute -top-2 -translate-y-full z-10 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                          <p className="font-semibold">{c.name}</p>
                          <p className="font-mono text-slate-300">
                            {delivered} deliv · {failed} fail
                          </p>
                        </div>
                      )}
                      <div
                        style={{ height: `${barHeightPct}%` }}
                        className="w-full max-w-[44px] rounded-t-md overflow-hidden flex flex-col justify-end bg-slate-100 transition-opacity group-hover:opacity-90"
                      >
                        {failPct > 0 && (
                          <div
                            style={{ height: `${failPct}%` }}
                            className="w-full bg-red-500"
                          />
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
              <div className="flex items-center gap-3 px-2">
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
              className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Configure</span>
            </Link>
          </div>

          <div className="p-5 space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">WhatsApp Business</span>
              </div>
              <span className={`text-xs font-medium ${waLive ? 'text-emerald-700' : 'text-amber-700'}`}>
                {waLive ? 'Live API' : 'Demo Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {data.stats.whatsappOptedIn} opted-in contact(s) ready for broadcast or approved templates.
            </p>
            <Link
              to="/whatsapp"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
            >
              <span>Open WhatsApp Composer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-5 space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">Email Delivery</span>
              </div>
              <span className={`text-xs font-medium ${emailLive ? 'text-blue-600' : 'text-amber-700'}`}>
                {emailLive ? 'Live Relay' : integrations?.emailConnected ? 'Demo Mode' : 'Setup on send'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {integrations?.emailFromAddress
                ? `Active sender: ${integrations.emailFromAddress} · ${data.stats.emailOptedIn} opted-in`
                : `${data.stats.emailOptedIn} opted-in contact(s) · Sender email prompted on compose`}
            </p>
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
              className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 whitespace-nowrap"
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
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-[#F8FAFC]">
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
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-6">
                          <p className="font-medium text-slate-900 truncate max-w-[200px]">{c.name}</p>
                          <p className="text-xs text-slate-500 font-mono">
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
                                className={`h-full ${
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
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {data.recentActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No recent workspace activity recorded yet.
              </div>
            ) : (
              data.recentActivity.map((log) => (
                <div key={log.id} className="px-6 py-3.5 flex items-start gap-3">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 leading-relaxed">{log.details}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-1">
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
