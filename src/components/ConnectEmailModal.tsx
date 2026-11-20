import React, { useState, useEffect } from 'react';
import { X, Mail, ShieldCheck, AlertTriangle } from 'lucide-react';
import { IntegrationState } from '../types';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ToastContext';

interface ConnectEmailModalProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (fromAddress: string) => void;
  promptReason?: string;
}

export const ConnectEmailModal: React.FC<ConnectEmailModalProps> = ({
  open,
  onClose,
  onConnected,
  promptReason,
}) => {
  const { integrations, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [provider, setProvider] = useState<'gmail_smtp' | 'smtp' | 'resend'>('gmail_smtp');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(integrations?.emailMode === 'live' ? 'live' : 'demo');
      setProvider(
        integrations?.emailProvider === 'resend'
          ? 'resend'
          : integrations?.emailProvider === 'smtp'
            ? 'smtp'
            : 'gmail_smtp'
      );
      setFromAddress(integrations?.emailFromAddress || profile?.email || '');
      setFromName(integrations?.emailFromName || profile?.displayName || '');
      setSmtpHost(integrations?.smtpHost || 'smtp.gmail.com');
      setSmtpPort(String(integrations?.smtpPort || 465));
      setSmtpUser(integrations?.smtpUser || integrations?.emailFromAddress || profile?.email || '');
      setSmtpPass('');
      setApiKey('');
      setError(null);
    }
  }, [open, integrations, profile]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = fromAddress.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid sender email address.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest<{ integrations: IntegrationState }>('/api/integrations/email', {
        method: 'PUT',
        body: JSON.stringify({
          mode,
          provider: mode === 'demo' ? 'demo' : provider,
          fromAddress: trimmedEmail,
          fromName: fromName.trim(),
          smtpHost: provider === 'gmail_smtp' ? 'smtp.gmail.com' : smtpHost.trim(),
          smtpPort: Number(smtpPort) || 465,
          smtpUser: (smtpUser || trimmedEmail).trim(),
          smtpPass: smtpPass.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
        }),
      });
      await refreshProfile();
      showToast(
        mode === 'live' ? 'Email provider connected' : 'Sender email saved in Demo Mode',
        `Outgoing emails will use ${trimmedEmail}`,
        'success'
      );
      onConnected?.(trimmedEmail);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save email configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Connect Sender Email
              </h2>
              <p className="text-xs text-slate-500">
                {promptReason || 'Choose your sender address and delivery method'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Sending Mode
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('demo')}
                className={`py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === 'demo'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demo Mode (Simulated)
              </button>
              <button
                type="button"
                onClick={() => setMode('live')}
                className={`py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === 'live'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Provider (SMTP / API)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                From Email Address *
              </label>
              <input
                type="email"
                required
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sender Name
              </label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="ConnectFlow Updates"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          {mode === 'demo' ? (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Demo Mode lets you test personalization, preview emails, and log simulated campaign deliveries using your sender address without external SMTP credentials. Simulated sends are always marked as Demo.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  <option value="gmail_smtp">Gmail (SMTP + App Password)</option>
                  <option value="smtp">Custom SMTP Server</option>
                  <option value="resend">Resend API</option>
                </select>
              </div>

              {provider === 'resend' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Resend API Key {integrations?.hasEmailApiKey ? '(Saved — leave blank to keep)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="re_..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              ) : (
                <>
                  {provider === 'smtp' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          SMTP Host *
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="smtp.example.com"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Port *
                        </label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          placeholder="465"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        SMTP Username
                      </label>
                      <input
                        type="text"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder={fromAddress || 'you@gmail.com'}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {provider === 'gmail_smtp' ? 'Gmail App Password' : 'SMTP Password'}{' '}
                        {integrations?.hasSmtpPass ? '(Saved)' : '*'}
                      </label>
                      <input
                        type="password"
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder="16-character app password"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Credentials are stored securely on the backend and never exposed to the browser.</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : 'Save & Use Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
