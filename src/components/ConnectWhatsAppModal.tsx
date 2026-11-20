import React, { useState, useEffect } from 'react';
import { X, MessageSquare, ShieldCheck, AlertTriangle } from 'lucide-react';
import { IntegrationState } from '../types';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ToastContext';

interface ConnectWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
}

export const ConnectWhatsAppModal: React.FC<ConnectWhatsAppModalProps> = ({ open, onClose }) => {
  const { integrations, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(integrations?.whatsappMode === 'live' ? 'live' : 'demo');
      setBusinessAccountId(integrations?.whatsappBusinessAccountId || '');
      setPhoneNumberId(integrations?.whatsappPhoneNumberId || '');
      setDisplayPhone(integrations?.whatsappDisplayPhone || '');
      setAccessToken('');
      setError(null);
    }
  }, [open, integrations]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiRequest<{ integrations: IntegrationState }>('/api/integrations/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          mode,
          businessAccountId: businessAccountId.trim(),
          phoneNumberId: phoneNumberId.trim(),
          displayPhone: displayPhone.trim(),
          accessToken: accessToken.trim() || undefined,
          keepExistingToken: integrations?.hasWhatsappToken,
        }),
      });
      await refreshProfile();
      showToast(
        mode === 'live' ? 'WhatsApp Business API connected' : 'WhatsApp Demo Mode enabled',
        mode === 'live'
          ? 'Messages will be sent via the official Meta Cloud API.'
          : 'Messages will run in simulated Demo Mode.',
        'success'
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save WhatsApp integration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                WhatsApp Business Platform API
              </h2>
              <p className="text-xs text-slate-500">
                Connect your official Meta Cloud API credentials
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
              Connection Mode
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
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Cloud API
              </button>
            </div>
          </div>

          {mode === 'demo' ? (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Demo Mode simulates WhatsApp Cloud API responses so you can test message personalization, opt-in checks, and campaign delivery reports safely. Simulated messages are clearly tagged as Demo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WhatsApp Business Account ID
                  </label>
                  <input
                    type="text"
                    value={businessAccountId}
                    onChange={(e) => setBusinessAccountId(e.target.value)}
                    placeholder="e.g. 1048293019283"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number ID *
                  </label>
                  <input
                    type="text"
                    required={mode === 'live'}
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="e.g. 1093827162534"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Display Business Phone
                </label>
                <input
                  type="text"
                  value={displayPhone}
                  onChange={(e) => setDisplayPhone(e.target.value)}
                  placeholder="+1 555 010 2938"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  System User Access Token {integrations?.hasWhatsappToken ? '(Saved — leave blank to keep)' : '*'}
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Uses official graph.facebook.com v21.0 endpoints. Token is stored securely on the backend.</span>
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
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
