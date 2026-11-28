import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Copy,
  Eye,
  Pause,
  Play,
  XCircle,
  MessageSquare,
  Mail,
  X,
  Send,
  Search,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronRight,
  Pencil,
  CalendarClock,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Campaign, CampaignRecipient } from '../types';
import { useToast } from '../components/ToastContext';
import { sanitizeEmailHtml } from '../lib/sanitize';

type FilterTab = 'all' | 'whatsapp' | 'email' | 'completed' | 'failed' | 'scheduled';

export const CampaignsPage: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<CampaignRecipient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'delivered' | 'issues'>('all');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [expandedRecipientId, setExpandedRecipientId] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ campaigns: Campaign[] }>('/api/campaigns');
      setCampaigns(res.campaigns);
    } catch (err: any) {
      showToast('Failed to load campaigns', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const summary = useMemo(() => {
    const total = campaigns.length;
    const scheduled = campaigns.filter((c) => c.status === 'scheduled' || c.status === 'paused').length;
    const completed = campaigns.filter((c) => c.status === 'completed').length;
    const sumSent = campaigns.reduce((acc, c) => acc + c.sentCount, 0);
    const sumDelivered = campaigns.reduce((acc, c) => acc + c.deliveredCount, 0);
    const rate = sumSent > 0 ? Math.round((sumDelivered / sumSent) * 100) : 0;
    return { total, scheduled, completed, rate };
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (filter === 'whatsapp' && c.channel !== 'whatsapp') return false;
      if (filter === 'email' && c.channel !== 'email') return false;
      if (filter === 'completed' && c.status !== 'completed') return false;
      if (filter === 'failed' && c.status !== 'failed') return false;
      if (filter === 'scheduled' && c.status !== 'scheduled' && c.status !== 'paused') return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.channel.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [campaigns, filter, search]);

  const openDetails = async (c: Campaign) => {
    setDetailCampaign(c);
    setDetailRecipients([]);
    setRecipientFilter('all');
    setRecipientSearch('');
    setExpandedRecipientId(null);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiRequest<{ campaign: Campaign; recipients: CampaignRecipient[] }>(
        `/api/campaigns/${c.id}`
      );
      setDetailCampaign(res.campaign);
      setDetailRecipients(res.recipients);
    } catch (err: any) {
      showToast('Failed to load delivery report', err.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDuplicate = async (c: Campaign) => {
    try {
      const res = await apiRequest<{ campaign: Campaign }>(
        `/api/campaigns/${c.id}/duplicate`,
        { method: 'POST' }
      );
      setCampaigns((prev) => [res.campaign, ...prev]);
      showToast('Campaign duplicated', `${res.campaign.name} saved as scheduled draft.`, 'success');
    } catch (err: any) {
      showToast('Duplicate failed', err.message, 'error');
    }
  };

  const openEditScheduleModal = (c: Campaign) => {
    setEditingCampaign(c);
    setEditName(c.name);
    setEditSubject(c.subject || '');
    setEditBody(c.body);
    if (c.scheduledAt) {
      const dt = new Date(c.scheduledAt);
      const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEditScheduledAt(localIso);
    } else {
      setEditScheduledAt('');
    }
  };

  const handleSaveScheduledEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;
    setSavingEdit(true);
    try {
      const res = await apiRequest<{ campaign: Campaign }>(`/api/campaigns/${editingCampaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          subject: editingCampaign.channel === 'email' ? editSubject.trim() : undefined,
          body: editBody,
          scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : undefined,
        }),
      });
      setCampaigns((prev) =>
        prev.map((item) => (item.id === editingCampaign.id ? res.campaign : item))
      );
      setEditingCampaign(null);
      showToast('Campaign updated', `${res.campaign.name} saved`, 'success');
    } catch (err: any) {
      showToast('Update failed', err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStatusChange = async (
    c: Campaign,
    nextStatus: 'paused' | 'scheduled' | 'cancelled' | 'run_now'
  ) => {
    try {
      const res = await apiRequest<{ campaign: Campaign }>(`/api/campaigns/${c.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setCampaigns((prev) => prev.map((item) => (item.id === c.id ? res.campaign : item)));
      showToast('Campaign updated', `${res.campaign.name} is now ${res.campaign.status}`, 'info');
    } catch (err: any) {
      showToast('Update failed', err.message, 'error');
    }
  };

  const handleRetryFailed = async () => {
    if (!detailCampaign) return;
    setRetrying(true);
    try {
      const res = await apiRequest<{ campaign: Campaign; recipients: CampaignRecipient[] }>(
        `/api/campaigns/${detailCampaign.id}/retry-failed`,
        { method: 'POST' }
      );
      setDetailCampaign(res.campaign);
      setDetailRecipients(res.recipients);
      setCampaigns((prev) =>
        prev.map((item) => (item.id === res.campaign.id ? res.campaign : item))
      );
      showToast(
        'Retry completed',
        `${res.campaign.deliveredCount}/${res.campaign.totalRecipients} delivered`,
        'success'
      );
    } catch (err: any) {
      showToast('Retry failed', err.message, 'error');
    } finally {
      setRetrying(false);
    }
  };

  const handleExportReportCsv = () => {
    if (!detailCampaign || !detailRecipients.length) return;
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['recipient', 'destination', 'status', 'provider_message_id', 'error', 'updated_at'].join(',');
    const rows = detailRecipients.map((r) =>
      [
        esc(r.contactName),
        esc(r.destination),
        esc(r.status),
        esc(r.providerMessageId || ''),
        esc(r.errorMessage || ''),
        esc(r.updatedAt),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${detailCampaign.id}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Delivery report exported', `${detailRecipients.length} row(s) downloaded.`, 'success');
  };

  const filteredDetailRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    return detailRecipients.filter((r) => {
      if (
        recipientFilter === 'delivered' &&
        r.status !== 'delivered' &&
        r.status !== 'read' &&
        r.status !== 'sent'
      ) {
        return false;
      }
      if (recipientFilter === 'issues' && r.status !== 'failed' && r.status !== 'bounced') {
        return false;
      }
      if (q) {
        return (
          r.contactName.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q) ||
          (r.errorMessage || '').toLowerCase().includes(q) ||
          (r.providerMessageId || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [detailRecipients, recipientFilter, recipientSearch]);

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 font-mono tabular-nums">
          {filtered.length} campaign{filtered.length === 1 ? '' : 's'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/whatsapp"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>New WhatsApp</span>
          </Link>
          <Link
            to="/email"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>New Email</span>
          </Link>
        </div>
      </div>

      {/* Unified 4-Column Metric Strip */}
      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
        <div className="p-4">
          <p className="text-xs text-slate-500">Total Campaigns</p>
          <p className="font-display text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {summary.total}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Completed</p>
          <p className="font-display text-2xl font-semibold text-emerald-700 mt-1 tabular-nums">
            {summary.completed}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Scheduled / Paused</p>
          <p className="font-display text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {summary.scheduled}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Delivery Rate</p>
          <p className="font-display text-2xl font-semibold text-blue-600 mt-1 tabular-nums">
            {summary.rate}%
          </p>
        </div>
      </div>

      {/* Filters & Live Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-0.5 p-0.5 bg-[#F8FAFC] border border-slate-200 rounded-md">
          {(
            [
              ['all', 'All'],
              ['whatsapp', 'WhatsApp'],
              ['email', 'Email'],
              ['completed', 'Completed'],
              ['scheduled', 'Scheduled'],
              ['failed', 'Failed'],
            ] as [FilterTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaign name..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading campaigns...</div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center space-y-3">
            <Send className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">No matching campaigns</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create a WhatsApp or Email campaign or adjust your filters to inspect historical delivery outcomes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-500">
                  <th className="py-3 px-6">Campaign Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Recipients</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 min-w-[200px]">Delivery Ratio</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((c) => {
                  const total = Math.max(1, c.totalRecipients);
                  const delivPct = Math.min(100, Math.round((c.deliveredCount / total) * 100));
                  const failPct = Math.min(
                    100 - delivPct,
                    Math.round(((c.failedCount + c.bouncedCount) / total) * 100)
                  );

                  return (
                    <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3.5 px-6">
                        <button
                          type="button"
                          onClick={() => openDetails(c)}
                          className="text-left group"
                        >
                          <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {c.executionMode === 'demo' ? 'Simulated Demo' : 'Live API'}
                          </p>
                        </button>
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
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {c.totalRecipients}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {c.scheduledAt && c.status === 'scheduled'
                          ? `Sched: ${new Date(c.scheduledAt).toLocaleString()}`
                          : new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold capitalize ${
                            c.status === 'completed'
                              ? 'text-emerald-700'
                              : c.status === 'failed' || c.status === 'cancelled'
                                ? 'text-red-600'
                                : 'text-amber-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                            {delivPct > 0 && (
                              <div
                                className={
                                  c.channel === 'whatsapp' ? 'bg-emerald-600' : 'bg-blue-600'
                                }
                                style={{ width: `${delivPct}%` }}
                              />
                            )}
                            {failPct > 0 && (
                              <div className="bg-red-500" style={{ width: `${failPct}%` }} />
                            )}
                          </div>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 whitespace-nowrap">
                            {c.deliveredCount}/{c.totalRecipients} deliv
                            {c.channel === 'whatsapp' && c.readCount > 0 ? ` · ${c.readCount} read` : ''}
                            {c.bouncedCount > 0 ? ` · ${c.bouncedCount} bounced` : ''}
                            {c.failedCount > 0 ? ` · ${c.failedCount} failed` : ''}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetails(c)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                            title="View delivery report"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                c.channel === 'whatsapp'
                                  ? `/whatsapp?fromCampaign=${c.id}`
                                  : `/email?fromCampaign=${c.id}`
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                            title="Edit & relaunch in composer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(c)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                            title="Duplicate campaign"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {(c.status === 'scheduled' || c.status === 'paused') && (
                            <button
                              type="button"
                              onClick={() => openEditScheduleModal(c)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                              title="Reschedule or edit queued content"
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          )}
                          {c.status === 'scheduled' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(c, 'run_now')}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-md transition-colors"
                                title="Send now"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(c, 'paused')}
                                className="p-1.5 text-slate-400 hover:text-amber-600 rounded-md transition-colors"
                                title="Pause scheduled campaign"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(c, 'cancelled')}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                                title="Cancel scheduled campaign"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {c.status === 'paused' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(c, 'scheduled')}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                              title="Resume scheduled campaign"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Delivery Report Modal */}
      {detailOpen && detailCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {detailCampaign.name} — Delivery Report
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {detailCampaign.channel.toUpperCase()} ·{' '}
                  {detailCampaign.executionMode === 'demo' ? 'Simulated Demo' : 'Live API'} ·{' '}
                  {detailCampaign.totalRecipients} recipients
                </p>
              </div>
              <div className="flex items-center gap-2">
                {detailCampaign.failedCount + detailCampaign.bouncedCount > 0 && (
                  <button
                    type="button"
                    disabled={retrying}
                    onClick={handleRetryFailed}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                    <span>{retrying ? 'Retrying...' : 'Retry Failed'}</span>
                  </button>
                )}
                {detailRecipients.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportReportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Segmented Horizontal Delivery Funnel Breakdown */}
              {(() => {
                const denom = Math.max(1, detailCampaign.totalRecipients);
                const delivPct = Math.round((detailCampaign.deliveredCount / denom) * 100);
                const pendingSentOnly = Math.max(
                  0,
                  detailCampaign.sentCount - detailCampaign.deliveredCount
                );
                const sentOnlyPct = Math.round((pendingSentOnly / denom) * 100);
                const bouncedPct = Math.round((detailCampaign.bouncedCount / denom) * 100);
                const failedPct = Math.round((detailCampaign.failedCount / denom) * 100);

                return (
                  <div className="p-4 bg-[#F8FAFC] border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">Delivery Funnel</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {delivPct}% delivered
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                      {delivPct > 0 && (
                        <div
                          className="bg-emerald-600 h-full"
                          style={{ width: `${delivPct}%` }}
                          title={`Delivered: ${detailCampaign.deliveredCount}`}
                        />
                      )}
                      {sentOnlyPct > 0 && (
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${sentOnlyPct}%` }}
                          title={`Sent / In Transit: ${pendingSentOnly}`}
                        />
                      )}
                      {bouncedPct > 0 && (
                        <div
                          className="bg-amber-500 h-full"
                          style={{ width: `${bouncedPct}%` }}
                          title={`Bounced: ${detailCampaign.bouncedCount}`}
                        />
                      )}
                      {failedPct > 0 && (
                        <div
                          className="bg-red-500 h-full"
                          style={{ width: `${failedPct}%` }}
                          title={`Failed: ${detailCampaign.failedCount}`}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        Delivered: {detailCampaign.deliveredCount} ({delivPct}%)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Sent/Transit: {pendingSentOnly} ({sentOnlyPct}%)
                      </span>
                      {detailCampaign.channel === 'email' && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Bounced: {detailCampaign.bouncedCount} ({bouncedPct}%)
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Failed: {detailCampaign.failedCount} ({failedPct}%)
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-[11px] text-slate-500">Sent</p>
                  <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {detailCampaign.sentCount}
                  </p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-[11px] text-slate-500">Delivered</p>
                  <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                    {detailCampaign.deliveredCount}
                  </p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-[11px] text-slate-500">
                    {detailCampaign.channel === 'whatsapp' ? 'Read' : 'Bounced'}
                  </p>
                  <p className="font-mono text-lg font-bold text-blue-600 tabular-nums">
                    {detailCampaign.channel === 'whatsapp'
                      ? detailCampaign.readCount
                      : detailCampaign.bouncedCount}
                  </p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-[11px] text-slate-500">Failed</p>
                  <p className="font-mono text-lg font-bold text-red-600 tabular-nums">
                    {detailCampaign.failedCount}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-800">
                  Recipient Logs <span className="text-slate-400 font-normal">(click row to inspect message)</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Filter recipients..."
                      className="pl-7 pr-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-500 w-44"
                    />
                  </div>
                  <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                    {(
                      [
                        ['all', 'All'],
                        ['delivered', 'Delivered'],
                        ['issues', 'Failed / Bounced'],
                      ] as ['all' | 'delivered' | 'issues', string][]
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setRecipientFilter(k)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                          recipientFilter === k
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Recipient</th>
                      <th className="py-2.5 px-4">Destination</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailLoading ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          Loading recipients...
                        </td>
                      </tr>
                    ) : filteredDetailRecipients.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No recipients match this status filter.
                        </td>
                      </tr>
                    ) : (
                      filteredDetailRecipients.map((r) => {
                        const isExpanded = expandedRecipientId === r.id;
                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              onClick={() =>
                                setExpandedRecipientId(isExpanded ? null : r.id)
                              }
                              className="hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-4 font-medium text-slate-800">
                                <span className="inline-flex items-center gap-1.5">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <span>{r.contactName}</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-600">
                                {r.destination}
                              </td>
                              <td className="py-2.5 px-4 font-semibold capitalize">
                                <span
                                  className={
                                    r.status === 'delivered' || r.status === 'read' || r.status === 'sent'
                                      ? 'text-emerald-700'
                                      : r.status === 'failed' || r.status === 'bounced'
                                        ? 'text-red-600'
                                        : 'text-slate-600'
                                  }
                                >
                                  {r.status}
                                  {r.isSimulated ? ' (Demo)' : ''}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-500 font-mono truncate max-w-[180px]">
                                {r.errorMessage || r.providerMessageId || '—'}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-[#F8FAFC]">
                                <td colSpan={4} className="px-4 py-3.5 border-t border-slate-100">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                                      <span>
                                        ID: {r.providerMessageId || 'Not assigned'}
                                      </span>
                                      <span className="tabular-nums">
                                        Updated {new Date(r.updatedAt).toLocaleString()}
                                      </span>
                                    </div>
                                    {r.errorMessage && (
                                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 font-mono">
                                        {r.errorMessage}
                                      </p>
                                    )}
                                    <div className="p-3 bg-white border border-slate-200 rounded-md text-xs text-slate-700">
                                      {detailCampaign.channel === 'email' ? (
                                        <div
                                          className="leading-relaxed space-y-1.5"
                                          dangerouslySetInnerHTML={{
                                            __html: sanitizeEmailHtml(r.renderedBody),
                                          }}
                                        />
                                      ) : (
                                        <p className="whitespace-pre-wrap leading-relaxed">
                                          {r.renderedBody}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule / Edit Scheduled Campaign Modal */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Reschedule &amp; Edit Campaign
              </h3>
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveScheduledEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Scheduled Dispatch Time
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              {editingCampaign.channel === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    required
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message Content *
                </label>
                <textarea
                  rows={5}
                  required
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

