import React, { useEffect, useState } from 'react';
import {
  User,
  MessageSquare,
  Mail,
  Bell,
  Shield,
  LogOut,
  Save,
  Copy,
  Check,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { AuditLog } from '../types';
import { useToast } from '../components/ToastContext';
import { ConnectWhatsAppModal } from '../components/ConnectWhatsAppModal';
import { ConnectEmailModal } from '../components/ConnectEmailModal';

export const SettingsPage: React.FC = () => {
  const { profile, integrations, refreshProfile, logout } = useAuth();
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [notifyCampaignComplete, setNotifyCampaignComplete] = useState(true);
  const [notifyDeliveryFailures, setNotifyDeliveryFailures] = useState(true);
  const [dailySendLimit, setDailySendLimit] = useState(500);
  const [saving, setSaving] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [testingChannel, setTestingChannel] = useState<'whatsapp' | 'email' | null>(null);
  const [testResults, setTestResults] = useState<{
    whatsapp?: { ok: boolean; mode: string; message: string };
    email?: { ok: boolean; mode: string; message: string };
  }>({});

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setCompanyName(profile.companyName || '');
      setNotifyCampaignComplete(profile.notifyCampaignComplete);
      setNotifyDeliveryFailures(profile.notifyDeliveryFailures);
      setDailySendLimit(profile.dailySendLimit);
    }
  }, [profile]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest<{ logs: AuditLog[] }>('/api/audit-logs');
        setAuditLogs(res.logs);
      } catch {
        // Ignore if unavailable
      }
    })();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          companyName,
          notifyCampaignComplete,
          notifyDeliveryFailures,
          dailySendLimit,
        }),
      });
      await refreshProfile();
      showToast('Settings saved', 'Profile and preferences updated.', 'success');
    } catch (err: any) {
      showToast('Update failed', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    await apiRequest('/api/integrations/whatsapp', {
      method: 'PUT',
      body: JSON.stringify({ disconnect: true }),
    });
    await refreshProfile();
    showToast('WhatsApp disconnected', undefined, 'info');
  };

  const handleDisconnectEmail = async () => {
    await apiRequest('/api/integrations/email', {
      method: 'PUT',
      body: JSON.stringify({ disconnect: true }),
    });
    await refreshProfile();
    showToast('Email provider disconnected', undefined, 'info');
  };

  const handleTestConnection = async (channel: 'whatsapp' | 'email') => {
    setTestingChannel(channel);
    try {
      const res = await apiRequest<{ ok: boolean; mode: string; message: string }>(
        '/api/integrations/test-connection',
        {
          method: 'POST',
          body: JSON.stringify({ channel }),
        }
      );
      setTestResults((prev) => ({ ...prev, [channel]: res }));
      showToast(
        `${channel === 'whatsapp' ? 'WhatsApp' : 'Email'} connection verified`,
        res.message,
        'success'
      );
    } catch (err: any) {
      const msg = err.message || 'Verification failed';
      setTestResults((prev) => ({
        ...prev,
        [channel]: { ok: false, mode: 'live', message: msg },
      }));
      showToast('Connection check failed', msg, 'error');
    } finally {
      setTestingChannel(null);
    }
  };

  const copyWebhook = async () => {
    try {
      const url = `${window.location.origin}/api/webhooks/whatsapp`;
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
      showToast('Webhook URL copied', url, 'info');
    } catch {
      showToast('Copy failed', 'Unable to copy to clipboard', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Workspace Settings
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage your account profile, messaging API connections, notifications, and audit history.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors self-start sm:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Profile, Rate Limits & Notifications */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
            <User className="w-4 h-4 text-blue-600" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Profile &amp; Account Information
            </h3>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Account Email
                </label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-[#F8FAFC] text-slate-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Daily Campaign Recipient Limit
                </label>
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={dailySendLimit}
                  onChange={(e) => setDailySendLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-semibold text-slate-700">
                  Notification Preferences
                </h4>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCampaignComplete}
                  onChange={(e) => setNotifyCampaignComplete(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Notify when scheduled or bulk campaigns finish dispatching</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyDeliveryFailures}
                  onChange={(e) => setNotifyDeliveryFailures(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Alert on API delivery failures or bounced addresses</span>
              </label>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Right Column: Messaging Channel Integrations */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    WhatsApp Business API
                  </h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {integrations?.whatsappConnected && integrations.whatsappMode === 'live'
                      ? `Live · ID ${integrations.whatsappPhoneNumberId}`
                      : 'Demo Mode (Simulated)'}
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold ${
                  integrations?.whatsappConnected && integrations.whatsappMode === 'live'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {integrations?.whatsappConnected && integrations.whatsappMode === 'live'
                  ? 'Connected'
                  : 'Demo'}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Connect your official Meta Business Phone Number ID and System User Token. Credentials remain server-side only.
            </p>

            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#F8FAFC] border border-slate-200 rounded-lg">
              <code className="text-[11px] font-mono text-slate-700 truncate">
                /api/webhooks/whatsapp
              </code>
              <button
                type="button"
                onClick={copyWebhook}
                className="text-slate-400 hover:text-slate-700 shrink-0"
                title="Copy full webhook URL"
              >
                {copiedWebhook ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {testResults.whatsapp && (
              <p
                className={`text-xs px-3 py-2 rounded-lg border ${
                  testResults.whatsapp.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {testResults.whatsapp.message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWaModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Configure WhatsApp
              </button>
              <button
                type="button"
                disabled={testingChannel === 'whatsapp'}
                onClick={() => handleTestConnection('whatsapp')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>{testingChannel === 'whatsapp' ? 'Testing...' : 'Test Connection'}</span>
              </button>
              {integrations?.whatsappConnected && (
                <button
                  type="button"
                  onClick={handleDisconnectWhatsApp}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Gmail / Email Connection
                  </h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {integrations?.emailConnected
                      ? `${integrations.emailMode === 'live' ? 'Live' : 'Demo'} · ${integrations.emailFromAddress}`
                      : 'Not configured'}
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold ${
                  integrations?.emailConnected ? 'text-blue-600' : 'text-slate-400'
                }`}
              >
                {integrations?.emailConnected ? 'Active' : 'Unset'}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Configure your sender email address via Gmail SMTP App Password, custom SMTP relay, or Resend API key.
            </p>

            {testResults.email && (
              <p
                className={`text-xs px-3 py-2 rounded-lg border ${
                  testResults.email.ok
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {testResults.email.message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Configure Email
              </button>
              {integrations?.emailConnected && (
                <>
                  <button
                    type="button"
                    disabled={testingChannel === 'email'}
                    onClick={() => handleTestConnection('email')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    <span>{testingChannel === 'email' ? 'Testing...' : 'Test Connection'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectEmail}
                    className="px-3.5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security & Audit Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Security &amp; Campaign Audit Ledger
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {auditLogs.length} recent events
          </span>
        </div>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No audit events recorded yet.</p>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-6 py-3 flex items-start justify-between gap-4 text-xs hover:bg-[#F8FAFC] transition-colors"
              >
                <span className="text-slate-700">{log.details}</span>
                <span className="text-slate-400 font-mono whitespace-nowrap tabular-nums">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <ConnectWhatsAppModal open={waModalOpen} onClose={() => setWaModalOpen(false)} />
      <ConnectEmailModal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} />
    </div>
  );
};

