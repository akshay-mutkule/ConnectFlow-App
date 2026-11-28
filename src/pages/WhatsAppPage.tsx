import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  Strikethrough,
  Code,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Campaign, CampaignRecipient, Contact, ContactGroup, Template } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ConnectWhatsAppModal } from '../components/ConnectWhatsAppModal';
import { countMissingVariableContacts, personalizeText } from '../lib/personalize';

function renderWhatsAppLine(line: string, lineKey: number): React.ReactNode[] {
  const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const inner = token.slice(1, -1);
    if (token.startsWith('*')) {
      parts.push(<strong key={`${lineKey}-${idx++}`}>{inner}</strong>);
    } else if (token.startsWith('_')) {
      parts.push(<em key={`${lineKey}-${idx++}`}>{inner}</em>);
    } else if (token.startsWith('~')) {
      parts.push(<del key={`${lineKey}-${idx++}`}>{inner}</del>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={`${lineKey}-${idx++}`}
          className="px-1 py-0.5 rounded bg-black/5 font-mono text-[11px]"
        >
          {inner}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts;
}

function renderWhatsAppFormatted(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {renderWhatsAppLine(line, i)}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

export const WhatsAppPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { integrations, profile } = useAuth();
  const { showToast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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
  const [recipientTagFilter, setRecipientTagFilter] = useState('all');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

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

        const fromCampaignId = searchParams.get('fromCampaign');
        if (fromCampaignId) {
          try {
            const campRes = await apiRequest<{
              campaign: Campaign;
              recipients: CampaignRecipient[];
            }>(`/api/campaigns/${fromCampaignId}`);
            if (campRes.campaign.channel === 'whatsapp') {
              setCampaignName(`${campRes.campaign.name} (Relaunch)`);
              setBody(campRes.campaign.body);
              if (campRes.campaign.templateId) {
                setSelectedTemplateId(String(campRes.campaign.templateId));
              }
              const eligibleIdSet = new Set(
                cRes.contacts
                  .filter((c) => c.whatsappOptIn && !c.whatsappOptOutAt && Boolean(c.phone))
                  .map((c) => c.id)
              );
              const preselected = Array.from(
                new Set(
                  campRes.recipients
                    .map((r) => r.contactId)
                    .filter((id): id is number => Boolean(id) && eligibleIdSet.has(id!))
                )
              );
              if (preselected.length > 0) setSelectedContactIds(preselected);
            }
          } catch {
            // Ignore invalid source campaign id
          }
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

  const allEligibleTags = useMemo(() => {
    const set = new Set<string>();
    eligibleContacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [eligibleContacts]);

  const visibleEligibleContacts = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    return eligibleContacts.filter((c) => {
      if (recipientTagFilter !== 'all' && !c.tags.includes(recipientTagFilter)) {
        return false;
      }
      if (q) {
        return c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [eligibleContacts, recipientSearch, recipientTagFilter]);

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

  const activePreviewIdx =
    recipientSet.length > 0 ? Math.min(previewIndex, recipientSet.length - 1) : 0;

  const sampleContact = recipientSet[activePreviewIdx] ||
    eligibleContacts[0] || { name: 'Alex Rivera', phone: '+15550192834' };

  const previewText = useMemo(
    () => personalizeText(body, sampleContact, { phone: '+15550192834' }),
    [body, sampleContact]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const toggleTagSelection = (tag: string) => {
    const matchingIds = eligibleContacts
      .filter((c) => c.tags.includes(tag))
      .map((c) => c.id);
    if (!matchingIds.length) return;
    const allSelected = matchingIds.every((id) => selectedContactIds.includes(id));
    setSelectedContactIds((prev) =>
      allSelected
        ? prev.filter((id) => !matchingIds.includes(id))
        : Array.from(new Set([...prev, ...matchingIds]))
    );
  };

  const approvedTemplates = templates.filter((t) => t.templateCategory === 'whatsapp_approved');
  const draftTemplates = templates.filter((t) => t.templateCategory !== 'whatsapp_approved');

  const applyWhatsAppFormat = (marker: '*' | '_' | '~' | '`') => {
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => `${prev}${marker}text${marker}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || 'text';
    const next = `${body.slice(0, start)}${marker}${selected}${marker}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const found = templates.find((t) => String(t.id) === id);
    if (found) {
      setBody(found.body);
    }
  };

  const dailyLimit = profile?.dailySendLimit || 500;
  const overQuota = recipientSet.length > dailyLimit;
  const missingVarContacts = useMemo(
    () => countMissingVariableContacts(body, recipientSet),
    [body, recipientSet]
  );

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
      {/* Connection Status Bar */}
      <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <MessageSquare className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-[#1E293B]">
                WhatsApp Business
              </h2>
              <span
                className={`text-xs font-medium ${
                  isLive ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isLive ? '· Live Connected' : '· Demo Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLive
                ? `Phone ID ${integrations?.whatsappPhoneNumberId} (${integrations?.whatsappDisplayPhone || 'Verified'})`
                : 'Messages run in simulated Demo Mode until Meta Cloud API credentials are connected.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConnectModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{isLive ? 'Configure' : 'Connect API'}</span>
        </button>
      </div>

      <form onSubmit={handleOpenConfirm} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Composer */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-5">
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
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-700 mr-1">
                    Message Content *
                  </label>
                  <button
                    type="button"
                    onClick={() => applyWhatsAppFormat('*')}
                    className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Bold (*text*)"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWhatsAppFormat('_')}
                    className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Italic (_text_)"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWhatsAppFormat('~')}
                    className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Strikethrough (~text~)"
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWhatsAppFormat('`')}
                    className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Monospace (`text`)"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBody((p) => `${p}{{first_name | there}}`)}
                    title="Inserts first name with 'there' fallback if missing"
                    className="px-2 py-0.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                  >
                    + {'{{first_name}}'}
                  </button>
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
                ref={bodyRef}
                rows={6}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 leading-relaxed"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mt-1.5">
                <span>Approved Meta templates apply outside 24h customer service windows.</span>
                <span
                  className={`font-mono tabular-nums ${
                    body.length > 4096
                      ? 'text-red-600 font-semibold'
                      : body.length > 1024
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {body.length} / 4096 chars
                </span>
              </div>
            </div>

            {selectedTemplate?.templateCategory === 'whatsapp_approved' && (
              <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Meta Approved Template:{' '}
                    <strong className="font-mono">
                      {selectedTemplate.metaTemplateName || selectedTemplate.name}
                    </strong>{' '}
                    · {selectedTemplate.metaLanguage || 'en_US'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-700">
                  Dispatched via template payload
                </span>
              </div>
            )}

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

              {allEligibleTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">Quick-Target by Tag</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allEligibleTags.map((tag) => {
                      const matching = eligibleContacts.filter((c) => c.tags.includes(tag));
                      const active =
                        matching.length > 0 &&
                        matching.every((c) => selectedContactIds.includes(c.id));
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTagSelection(tag)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                            active
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-[#F8FAFC] border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          #{tag} ({matching.length})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Filter opted-in contacts..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  {allEligibleTags.length > 0 && (
                    <select
                      value={recipientTagFilter}
                      onChange={(e) => setRecipientTagFilter(e.target.value)}
                      aria-label="Filter contacts by tag"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="all">All tags</option>
                      {allEligibleTags.map((tag) => (
                        <option key={tag} value={tag}>
                          #{tag}
                        </option>
                      ))}
                    </select>
                  )}
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

            {/* Pre-Flight Guardrail (shown only when quota exceeded or variables missing) */}
            {(overQuota || missingVarContacts > 0) && (
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                {overQuota && (
                  <span className="text-red-600 font-medium tabular-nums">
                    Exceeds daily limit ({recipientSet.length} / {dailyLimit} recipients)
                  </span>
                )}
                {missingVarContacts > 0 && (
                  <span className="text-amber-700 font-medium">
                    {missingVarContacts} recipient(s) missing a variable field (fallback used)
                  </span>
                )}
              </div>
            )}

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
                disabled={overQuota}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Review &amp; Send ({recipientSet.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview & Test Send */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Preview
              </h3>
              <div className="flex items-center gap-1.5">
                {recipientSet.length > 1 && (
                  <div className="inline-flex items-center border border-slate-200 rounded-md bg-[#F8FAFC]">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) =>
                          prev <= 0 ? recipientSet.length - 1 : prev - 1
                        )
                      }
                      className="p-1 text-slate-500 hover:text-slate-800"
                      aria-label="Previous recipient preview"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1.5 text-[10px] font-mono text-slate-600 tabular-nums">
                      {activePreviewIdx + 1}/{recipientSet.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) =>
                          prev >= recipientSet.length - 1 ? 0 : prev + 1
                        )
                      }
                      className="p-1 text-slate-500 hover:text-slate-800"
                      aria-label="Next recipient preview"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-slate-500 truncate max-w-[140px]">
                  {sampleContact.name}
                </span>
              </div>
            </div>

            {/* Mobile Frame */}
            <div className="mx-auto max-w-[330px] border-[5px] border-slate-900 rounded-[22px] overflow-hidden bg-[#EFEAE2]">
              <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/30 border border-white/30 flex items-center justify-center text-[11px] font-semibold">
                  CF
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold truncate">ConnectFlow Business</p>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  </div>
                  <p className="text-[10px] text-emerald-100">Business Account</p>
                </div>
              </div>

              <div className="p-4 min-h-[240px] flex flex-col justify-between">
                <div className="self-center px-2.5 py-0.5 rounded bg-white/85 text-[10px] font-medium text-slate-600">
                  TODAY
                </div>

                <div className="mt-6 bg-[#D9FDD3] rounded-lg rounded-tr-xs p-3 self-end max-w-[90%] border border-emerald-200/60">
                  <div className="text-xs text-slate-900 leading-relaxed break-words">
                    {previewText
                      ? renderWhatsAppFormatted(previewText)
                      : 'Your WhatsApp message preview will appear here...'}
                  </div>
                  <p className="text-[10px] text-slate-500 text-right mt-1 font-mono">
                    10:42 AM · ✓✓
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TestTube className="w-4 h-4 text-emerald-600" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Send Test
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
