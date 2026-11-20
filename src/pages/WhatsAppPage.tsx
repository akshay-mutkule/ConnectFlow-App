import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  TestTube,
  BookmarkPlus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Campaign, Contact, ContactGroup, Template } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ConnectWhatsAppModal } from '../components/ConnectWhatsAppModal';

export const WhatsAppPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { integrations } = useAuth();
  const { showToast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [body, setBody] = useState(
    'Hello {{name}},\n\nHope you are doing well. We have an important update for you.\n\nThank you!'
  );
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, gRes, tRes] = await Promise.all([
          apiRequest<{ contacts: Contact[] }>('/api/contacts'),
          apiRequest<{ groups: ContactGroup[] }>('/api/groups'),
          apiRequest<{ templates: Template[] }>('/api/templates'),
        ]);
        setContacts(cRes.contacts);
        setGroups(gRes.groups);
        const waTemplates = tRes.templates.filter((t) => t.channel === 'whatsapp');
        setTemplates(waTemplates);

        const tid = searchParams.get('templateId');
        if (tid) {
          const found = waTemplates.find((t) => String(t.id) === tid);
          if (found) {
            setSelectedTemplateId(String(found.id));
            setBody(found.body);
          }
        }

        const cid = searchParams.get('contactId');
        if (cid) {
          const numId = Number(cid);
          if (numId) setSelectedContactIds([numId]);
        }
      } catch (err: any) {
        showToast('Failed to load WhatsApp workspace', err.message, 'error');
      }
    })();
  }, [searchParams]);

  const eligibleContacts = useMemo(
    () => contacts.filter((c) => c.whatsappOptIn && !c.whatsappOptOutAt && Boolean(c.phone)),
    [contacts]
  );

  const visibleEligibleContacts = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return eligibleContacts;
    return eligibleContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    );
  }, [eligibleContacts, recipientSearch]);

  const recipientSet = useMemo(() => {
    const ids = new Set<number>(selectedContactIds);
    if (selectedGroupIds.length > 0) {
      eligibleContacts.forEach((c) => {
        if (c.groupIds.some((gid) => selectedGroupIds.includes(gid))) {
          ids.add(c.id);
        }
      });
    }
    return eligibleContacts.filter((c) => ids.has(c.id));
  }, [eligibleContacts, selectedContactIds, selectedGroupIds]);

  const sampleContact = recipientSet[0] ||
    eligibleContacts[0] || { name: 'Alex Rivera', phone: '+15550192834' };

  const previewText = useMemo(() => {
    return body
      .replace(/\{\{\s*name\s*\}\}/gi, sampleContact.name)
      .replace(/\{\{\s*phone\s*\}\}/gi, sampleContact.phone || '+15550192834');
  }, [body, sampleContact]);

  const approvedTemplates = templates.filter((t) => t.templateCategory === 'whatsapp_approved');
  const draftTemplates = templates.filter((t) => t.templateCategory !== 'whatsapp_approved');

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const found = templates.find((t) => String(t.id) === id);
    if (found) {
      setBody(found.body);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!body.trim()) return;
    setSavingDraft(true);
    try {
      const draftTitle = campaignName.trim() || `WhatsApp Draft (${new Date().toLocaleDateString()})`;
      const res = await apiRequest<{ template: Template }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: draftTitle,
          channel: 'whatsapp',
          templateCategory: 'draft',
          body,
        }),
      });
      setTemplates((prev) => [res.template, ...prev]);
      showToast('Saved to Templates', res.template.name, 'success');
    } catch (err: any) {
      showToast('Save failed', err.message, 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      showToast('Enter a test phone number', 'Include country code, e.g. +15550192834', 'error');
      return;
    }
    setTestSending(true);
    try {
      const res = await apiRequest<{ ok: boolean; simulated: boolean }>(
        '/api/campaigns/test-send',
        {
          method: 'POST',
          body: JSON.stringify({
            channel: 'whatsapp',
            destination: testPhone.trim(),
            body,
          }),
        }
      );
      showToast(
        res.simulated ? 'Simulated Test Message Logged' : 'Test WhatsApp Message Sent',
        `To ${testPhone.trim()}`,
        'success'
      );
    } catch (err: any) {
      showToast('Test send failed', err.message, 'error');
    } finally {
      setTestSending(false);
    }
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      showToast('Campaign name required', 'Give your WhatsApp campaign a descriptive name.', 'error');
      return;
    }
    if (!body.trim()) {
      showToast('Message required', 'Write a message before sending.', 'error');
      return;
    }
    if (recipientSet.length === 0) {
      showToast('No opted-in recipients selected', 'Select at least one WhatsApp opted-in contact or group.', 'error');
      return;
    }
    if (scheduleEnabled && !scheduledAt) {
      showToast('Schedule time required', 'Pick a date and time for your scheduled campaign.', 'error');
      return;
    }
    setConfirmOpen(true);
  };

  const handleApproveAndSend = async () => {
    setSending(true);
    try {
      const res = await apiRequest<{ campaign: Campaign }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: campaignName.trim(),
          channel: 'whatsapp',
          body,
          templateId: selectedTemplateId ? Number(selectedTemplateId) : null,
          contactIds: recipientSet.map((c) => c.id),
          scheduledAt: scheduleEnabled ? new Date(scheduledAt).toISOString() : null,
          idempotencyKey: `wa_${Date.now()}_${recipientSet.length}`,
        }),
      });
      setConfirmOpen(false);
      showToast(
        scheduleEnabled
          ? 'WhatsApp campaign scheduled'
          : res.campaign.executionMode === 'demo'
            ? 'Demo WhatsApp campaign completed'
            : 'WhatsApp campaign dispatched',
        `${res.campaign.totalRecipients} recipient(s) processed`,
        'success'
      );
      navigate('/campaigns');
    } catch (err: any) {
      showToast('Campaign error', err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const isLive = integrations?.whatsappConnected && integrations.whatsappMode === 'live';

  return (
    <div className="space-y-6">
      {/* Connection Status Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                WhatsApp Business Platform API
              </h2>
              <span
                className={`text-xs font-semibold ${
                  isLive ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isLive ? '· Live Connected' : '· Demo Mode (Simulated)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLive
                ? `Active Phone ID ${integrations?.whatsappPhoneNumberId} (${integrations?.whatsappDisplayPhone || 'Verified Number'})`
                : 'No Meta Cloud API token active. Messages run in simulated Demo Mode until credentials are connected.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConnectModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{isLive ? 'Manage API' : 'Connect WhatsApp API'}</span>
        </button>
      </div>

      <form onSubmit={handleOpenConfirm} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Composer Studio */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. November Product Update"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Load Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Custom Message</option>
                  {approvedTemplates.length > 0 && (
                    <optgroup label="WhatsApp Approved Templates">
                      {approvedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {draftTemplates.length > 0 && (
                    <optgroup label="Saved Drafts">
                      {draftTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {/* Message Composer */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Message Content *
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBody((p) => `${p}{{name}}`)}
                    className="px-2 py-0.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                  >
                    + {'{{name}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBody((p) => `${p}{{phone}}`)}
                    className="px-2 py-0.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                  >
                    + {'{{phone}}'}
                  </button>
                  <button
                    type="button"
                    disabled={savingDraft}
                    onClick={handleSaveAsDraft}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    <BookmarkPlus className="w-3 h-3" />
                    <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
                  </button>
                </div>
              </div>
              <textarea
                rows={6}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5">
                <span>Approved Meta templates apply outside 24h customer service windows.</span>
                <span className="font-mono tabular-nums">{body.length} chars</span>
              </div>
            </div>

            {/* Recipients & Groups */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Opted-In Recipients
                  </h3>
                  <p className="text-xs text-slate-500">
                    {eligibleContacts.length} of {contacts.length} contacts are opted-in for WhatsApp.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                  {recipientSet.length} selected
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Contact Groups</p>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const active = selectedGroupIds.includes(g.id);
                    const eligibleInGroup = eligibleContacts.filter((c) =>
                      c.groupIds.includes(g.id)
                    ).length;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setSelectedGroupIds((prev) =>
                            active ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                          )
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          active
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {g.name} ({eligibleInGroup})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Filter opted-in contacts..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedContactIds(
                        selectedContactIds.length === eligibleContacts.length
                          ? []
                          : eligibleContacts.map((c) => c.id)
                      )
                    }
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                  >
                    {selectedContactIds.length === eligibleContacts.length && eligibleContacts.length > 0
                      ? 'Clear contacts'
                      : 'Select all eligible'}
                  </button>
                </div>

                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {visibleEligibleContacts.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No matching WhatsApp opted-in contacts. Enable opt-in consent in Contacts.
                    </div>
                  ) : (
                    visibleEligibleContacts.map((c) => {
                      const checked =
                        selectedContactIds.includes(c.id) ||
                        c.groupIds.some((gid) => selectedGroupIds.includes(gid));
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedContactIds((prev) =>
                                  prev.includes(c.id)
                                    ? prev.filter((id) => id !== c.id)
                                    : [...prev, c.id]
                                )
                              }
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="font-medium text-slate-800 truncate">{c.name}</span>
                          </div>
                          <span className="text-xs font-mono text-slate-500">{c.phone}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Scheduling & Primary CTA */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Schedule for later</span>
                </label>
                {scheduleEnabled && (
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                  />
                )}
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Review &amp; Send ({recipientSet.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Authentic Mobile WhatsApp Device Preview & Test Send */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                WhatsApp Device Preview
              </h3>
              <span className="text-[11px] text-slate-500 truncate max-w-[160px]">
                Recipient: {sampleContact.name}
              </span>
            </div>

            {/* Mobile Frame */}
            <div className="mx-auto max-w-[330px] border-[6px] border-slate-900 rounded-[26px] overflow-hidden shadow-md bg-[#EFEAE2]">
              <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/30 border border-white/30 flex items-center justify-center text-[11px] font-semibold">
                  CF
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold truncate">ConnectFlow Business</p>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  </div>
                  <p className="text-[10px] text-emerald-100">Official Business Account</p>
                </div>
              </div>

              <div className="p-4 min-h-[240px] flex flex-col justify-between">
                <div className="self-center px-2.5 py-0.5 rounded bg-white/80 text-[10px] font-medium text-slate-600 shadow-xs">
                  TODAY
                </div>

                <div className="mt-6 bg-[#D9FDD3] rounded-xl rounded-tr-xs p-3 shadow-xs self-end max-w-[90%] border border-emerald-200/60">
                  <p className="text-xs text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {previewText || 'Your WhatsApp message preview will appear here...'}
                  </p>
                  <p className="text-[10px] text-slate-500 text-right mt-1 font-mono">
                    10:42 AM · ✓✓
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TestTube className="w-4 h-4 text-emerald-600" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Send Test Message
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+15550192834"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
              />
              <button
                type="button"
                disabled={testSending}
                onClick={handleTestSend}
                className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {testSending ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Final Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Confirm WhatsApp Campaign
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {!isLive && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Running in <strong>Demo Mode (Simulated)</strong>. No live WhatsApp messages will be transmitted externally.
                  </p>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Campaign Name</span>
                  <span className="font-medium text-slate-900">{campaignName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Total Opted-In Recipients</span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {recipientSet.length}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Delivery Timing</span>
                  <span className="font-medium text-slate-900">
                    {scheduleEnabled ? new Date(scheduledAt).toLocaleString() : 'Send Immediately'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {previewText}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleApproveAndSend}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{sending ? 'Dispatching...' : 'Approve & Send'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConnectWhatsAppModal
        open={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
      />
    </div>
  );
};
