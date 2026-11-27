import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Mail,
  Send,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  TestTube,
  Bold,
  Italic,
  List,
  Link2,
  BookmarkPlus,
  Search,
  Monitor,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Campaign, Contact, ContactGroup, Template } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { ConnectEmailModal } from '../components/ConnectEmailModal';
import { sanitizeEmailHtml } from '../lib/sanitize';

export const EmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { integrations, profile } = useAuth();
  const { showToast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectPromptReason, setConnectPromptReason] = useState<string | undefined>(undefined);
  const [pendingActionAfterEmail, setPendingActionAfterEmail] = useState<'send' | 'test' | null>(
    null
  );

  const [campaignName, setCampaignName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [subject, setSubject] = useState('Important update for {{name}}');
  const [body, setBody] = useState(
    '<p>Hello {{name}},</p><p>We wanted to share an important update regarding your account ({{email}}).</p><p>Best regards,<br/>ConnectFlow Team</p>'
  );
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>('visual');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (integrations?.emailFromAddress) {
      setFromEmail(integrations.emailFromAddress);
    }
  }, [integrations]);

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
        const emailTemplates = tRes.templates.filter((t) => t.channel === 'email');
        setTemplates(emailTemplates);

        const tid = searchParams.get('templateId');
        if (tid) {
          const found = emailTemplates.find((t) => String(t.id) === tid);
          if (found) {
            setSelectedTemplateId(String(found.id));
            if (found.subject) setSubject(found.subject);
            setBody(found.body);
          }
        }

        const cid = searchParams.get('contactId');
        if (cid) {
          const numId = Number(cid);
          if (numId) setSelectedContactIds([numId]);
        }
      } catch (err: any) {
        showToast('Failed to load email workspace', err.message, 'error');
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    if (editorMode === 'visual' && visualRef.current) {
      const safe = sanitizeEmailHtml(body);
      if (visualRef.current.innerHTML !== safe) {
        visualRef.current.innerHTML = safe;
      }
    }
  }, [editorMode, selectedTemplateId]);

  const eligibleContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.emailOptIn &&
          !c.suppressedEmail &&
          !c.emailUnsubscribedAt &&
          Boolean(c.email)
      ),
    [contacts]
  );

  const allEligibleTags = useMemo(() => {
    const set = new Set<string>();
    eligibleContacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [eligibleContacts]);

  const visibleEligibleContacts = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return eligibleContacts;
    return eligibleContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
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

  const activePreviewIdx =
    recipientSet.length > 0 ? Math.min(previewIndex, recipientSet.length - 1) : 0;

  const sampleContact = recipientSet[activePreviewIdx] ||
    eligibleContacts[0] || { name: 'Alex Rivera', email: 'alex@company.com' };

  const previewSubject = useMemo(
    () =>
      subject
        .replace(/\{\{\s*name\s*\}\}/gi, sampleContact.name)
        .replace(/\{\{\s*email\s*\}\}/gi, sampleContact.email || 'alex@company.com'),
    [subject, sampleContact]
  );

  const previewBody = useMemo(
    () =>
      sanitizeEmailHtml(
        body
          .replace(/\{\{\s*name\s*\}\}/gi, sampleContact.name)
          .replace(/\{\{\s*email\s*\}\}/gi, sampleContact.email || 'alex@company.com')
      ),
    [body, sampleContact]
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

  const applyFormat = (cmd: 'bold' | 'italic' | 'insertUnorderedList' | 'createLink') => {
    if (editorMode === 'visual' && visualRef.current) {
      visualRef.current.focus();
      if (cmd === 'createLink') {
        document.execCommand('createLink', false, 'https://example.com');
      } else {
        document.execCommand(cmd, false);
      }
      setBody(visualRef.current.innerHTML);
      return;
    }
    const map: Record<string, [string, string]> = {
      bold: ['<strong>', '</strong>'],
      italic: ['<em>', '</em>'],
      insertUnorderedList: ['<ul><li>', '</li></ul>'],
      createLink: ['<a href="https://">', '</a>'],
    };
    const [prefix, suffix] = map[cmd];
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => `${prev}${prefix}text${suffix}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || 'text';
    setBody(`${body.slice(0, start)}${prefix}${selected}${suffix}${body.slice(end)}`);
  };

  const insertToken = (token: string) => {
    if (editorMode === 'visual' && visualRef.current) {
      visualRef.current.focus();
      document.execCommand('insertText', false, token);
      setBody(visualRef.current.innerHTML);
    } else {
      setBody((p) => `${p}${token}`);
    }
  };

  const insertCtaButton = () => {
    const buttonMarkup =
      '<p style="margin:16px 0;"><a href="https://example.com" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Details</a></p>';
    const next = sanitizeEmailHtml(`${body}${buttonMarkup}`);
    setBody(next);
    if (editorMode === 'visual' && visualRef.current) {
      visualRef.current.innerHTML = next;
    }
    showToast('CTA button inserted', 'Switch to HTML or edit the link label directly.', 'info');
  };

  const dailyLimit = profile?.dailySendLimit || 500;
  const overQuota = recipientSet.length > dailyLimit;
  const usesNameVar = /\{\{\s*name\s*\}\}/i.test(`${subject} ${body}`);
  const usesEmailVar = /\{\{\s*email\s*\}\}/i.test(`${subject} ${body}`);
  const missingVarContacts = recipientSet.filter(
    (c) => (usesNameVar && !c.name.trim()) || (usesEmailVar && !c.email)
  ).length;

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const found = templates.find((t) => String(t.id) === id);
    if (found) {
      if (found.subject) setSubject(found.subject);
      const safe = sanitizeEmailHtml(found.body);
      setBody(safe);
      if (visualRef.current) visualRef.current.innerHTML = safe;
    }
  };

  const handleSaveAsDraft = async () => {
    if (!body.trim()) return;
    setSavingDraft(true);
    try {
      const draftTitle = campaignName.trim() || `Email Draft (${new Date().toLocaleDateString()})`;
      const res = await apiRequest<{ template: Template }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: draftTitle,
          channel: 'email',
          templateCategory: 'draft',
          subject,
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

  const ensureSenderEmailBeforeAction = (action: 'send' | 'test'): boolean => {
    if (!integrations?.emailConnected && !fromEmail.trim()) {
      setPendingActionAfterEmail(action);
      setConnectPromptReason('Enter your sender email address before sending emails.');
      setConnectModalOpen(true);
      return false;
    }
    return true;
  };

  const runTestSend = async (senderOverride?: string) => {
    if (!testEmail.trim()) {
      showToast('Enter a test recipient email', undefined, 'error');
      return;
    }
    setTestSending(true);
    try {
      const res = await apiRequest<{ ok: boolean; simulated: boolean }>(
        '/api/campaigns/test-send',
        {
          method: 'POST',
          body: JSON.stringify({
            channel: 'email',
            fromEmail: (senderOverride || fromEmail).trim(),
            destination: testEmail.trim(),
            subject,
            body,
          }),
        }
      );
      showToast(
        res.simulated ? 'Simulated Test Email Logged' : 'Test Email Sent',
        `To ${testEmail.trim()}`,
        'success'
      );
    } catch (err: any) {
      if (err.code === 'EMAIL_NOT_CONFIGURED') {
        setPendingActionAfterEmail('test');
        setConnectPromptReason('Provide your sender email to deliver this test message.');
        setConnectModalOpen(true);
      } else {
        showToast('Test email failed', err.message, 'error');
      }
    } finally {
      setTestSending(false);
    }
  };

  const handleTestClick = () => {
    if (!ensureSenderEmailBeforeAction('test')) return;
    void runTestSend();
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensureSenderEmailBeforeAction('send')) return;
    if (!campaignName.trim() || !subject.trim() || !body.trim()) {
      showToast('Missing fields', 'Provide campaign name, subject, and email body.', 'error');
      return;
    }
    if (recipientSet.length === 0) {
      showToast('No opted-in recipients selected', 'Select at least one Email opted-in contact or group.', 'error');
      return;
    }
    if (scheduleEnabled && !scheduledAt) {
      showToast('Schedule time required', 'Pick a date and time.', 'error');
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
          channel: 'email',
          fromEmail: fromEmail.trim(),
          subject,
          body,
          templateId: selectedTemplateId ? Number(selectedTemplateId) : null,
          contactIds: recipientSet.map((c) => c.id),
          scheduledAt: scheduleEnabled ? new Date(scheduledAt).toISOString() : null,
          idempotencyKey: `email_${Date.now()}_${recipientSet.length}`,
        }),
      });
      setConfirmOpen(false);
      showToast(
        scheduleEnabled
          ? 'Email campaign scheduled'
          : res.campaign.executionMode === 'demo'
            ? 'Demo Email campaign completed'
            : 'Email campaign dispatched',
        `${res.campaign.totalRecipients} recipient(s) processed`,
        'success'
      );
      navigate('/campaigns');
    } catch (err: any) {
      showToast('Send failed', err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const isLive = integrations?.emailConnected && integrations.emailMode === 'live';

  return (
    <div className="space-y-6">
      {/* Provider Status Bar */}
      <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Mail className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-[#1E293B]">
                Email Sender
              </h2>
              <span
                className={`text-xs font-medium ${
                  isLive ? 'text-blue-600' : 'text-amber-700'
                }`}
              >
                {isLive
                  ? `· Live (${integrations?.emailProvider === 'resend' ? 'Resend' : 'SMTP'})`
                  : integrations?.emailConnected
                    ? '· Demo Mode'
                    : '· Prompt on Send'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {integrations?.emailFromAddress
                ? `Sender: ${integrations.emailFromAddress}`
                : 'You will be prompted to enter your sender email when clicking Send Email.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setPendingActionAfterEmail(null);
            setConnectPromptReason(undefined);
            setConnectModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{integrations?.emailConnected ? 'Configure' : 'Connect Email'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmitForm} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                  placeholder="e.g. Q4 Product Digest"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  From Email *
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPendingActionAfterEmail(null);
                      setConnectPromptReason('Configure your sender email address.');
                      setConnectModalOpen(true);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                  >
                    Configure
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
                  <option value="">Custom Email</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Visual / HTML Rich-Text Body */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-700">Email Body *</label>
                  <div className="inline-flex p-0.5 bg-slate-100 rounded-md">
                    <button
                      type="button"
                      onClick={() => setEditorMode('visual')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                        editorMode === 'visual'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('html')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                        editorMode === 'html'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      HTML
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyFormat('bold')}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('italic')}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('insertUnorderedList')}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Bullet List"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('createLink')}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                    title="Link"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={insertCtaButton}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                    title="Insert Call-to-Action Button"
                  >
                    <MousePointerClick className="w-3 h-3" />
                    <span>CTA Button</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertToken(' {{name}}')}
                    className="px-2 py-1 text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    + {'{{name}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertToken(' {{email}}')}
                    className="px-2 py-1 text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    + {'{{email}}'}
                  </button>
                  <button
                    type="button"
                    disabled={savingDraft}
                    onClick={handleSaveAsDraft}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    <BookmarkPlus className="w-3 h-3" />
                    <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
                  </button>
                </div>
              </div>

              {editorMode === 'visual' ? (
                <div
                  ref={visualRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setBody(e.currentTarget.innerHTML)}
                  className="min-h-[180px] w-full px-3.5 py-3 text-sm text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 leading-relaxed prose prose-sm max-w-none"
                />
              ) : (
                <textarea
                  ref={bodyRef}
                  rows={7}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              )}

              <p className="text-[11px] text-slate-500 mt-1.5">
                Automatic unsubscribe links and suppression enforcement are applied to every campaign email.
              </p>
            </div>

            {/* Opted-In Recipients */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Opted-In Recipients
                  </h3>
                  <p className="text-xs text-slate-500">
                    {eligibleContacts.length} of {contacts.length} contacts are opted-in and not suppressed.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-blue-600 tabular-nums">
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
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
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
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
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

              <div className="flex items-center justify-between gap-3">
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
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  {selectedContactIds.length === eligibleContacts.length && eligibleContacts.length > 0
                    ? 'Clear contacts'
                    : 'Select all eligible'}
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {visibleEligibleContacts.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">
                    No matching Email opted-in contacts. Enable Email consent in Contacts.
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
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium text-slate-800 truncate">{c.name}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-500">{c.email}</span>
                      </label>
                    );
                  })
                )}
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

            {/* Schedule & Send Email */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Schedule Email</span>
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
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Email ({recipientSet.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview & Send Test */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Preview
              </h3>
              <div className="flex items-center gap-2">
                {recipientSet.length > 1 && (
                  <div className="inline-flex items-center border border-slate-200 rounded-md bg-white">
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
                <div className="inline-flex p-0.5 bg-slate-200/70 rounded-md">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`p-1 rounded ${
                      previewViewport === 'desktop' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                    title="Desktop preview"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`p-1 rounded ${
                      previewViewport === 'mobile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                    title="Mobile preview"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`mx-auto bg-white transition-all ${
                previewViewport === 'mobile' ? 'max-w-[320px] border-x border-slate-200' : 'w-full'
              }`}
            >
              <div className="px-5 py-3.5 border-b border-slate-100 space-y-1 text-xs">
                <p className="text-slate-500">
                  From:{' '}
                  <span className="text-slate-800 font-medium">
                    {fromEmail || 'Prompted on send'}
                  </span>
                </p>
                <p className="text-slate-500">
                  To:{' '}
                  <span className="text-slate-800 font-mono">
                    {sampleContact.email || 'alex@company.com'}
                  </span>
                </p>
                <p className="text-slate-900 font-semibold text-sm pt-1">
                  {previewSubject}
                </p>
              </div>
              <div className="p-5 space-y-3">
                <div
                  className="text-xs text-slate-700 leading-relaxed space-y-2"
                  dangerouslySetInnerHTML={{ __html: previewBody }}
                />
                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                  You received this message because you opted in to communications.{' '}
                  <span className="text-blue-600 underline">Unsubscribe</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TestTube className="w-4 h-4 text-blue-600" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Send Test
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                disabled={testSending}
                onClick={handleTestClick}
                className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition-colors whitespace-nowrap"
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
                Confirm Email Campaign
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {!isLive && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Running in <strong>Demo Mode (Simulated)</strong>. Connect SMTP or Resend API to dispatch real emails.
                  </p>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Campaign Name</span>
                  <span className="font-medium text-slate-900">{campaignName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">From Address</span>
                  <span className="font-mono text-xs text-slate-800">{fromEmail}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Eligible Recipients</span>
                  <span className="font-mono font-semibold text-blue-600 tabular-nums">
                    {recipientSet.length}
                  </span>
                </div>
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
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{sending ? 'Dispatching...' : 'Approve & Send'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConnectEmailModal
        open={connectModalOpen}
        promptReason={connectPromptReason}
        onClose={() => {
          setConnectModalOpen(false);
          setPendingActionAfterEmail(null);
        }}
        onConnected={(savedAddress) => {
          setFromEmail(savedAddress);
          if (pendingActionAfterEmail === 'test') {
            void runTestSend(savedAddress);
          } else if (pendingActionAfterEmail === 'send') {
            if (campaignName.trim() && recipientSet.length > 0) {
              setConfirmOpen(true);
            }
          }
          setPendingActionAfterEmail(null);
        }}
      />
    </div>
  );
};
