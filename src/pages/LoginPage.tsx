import React, { useState } from 'react';
import { ShieldCheck, Check, MessageSquare, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/BrandLogo';

export const LoginPage: React.FC = () => {
  const { signIn, authError } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async () => {
    setSubmitting(true);
    try {
      await signIn();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left Architectural Workspace Preview */}
      <div className="lg:w-[55%] cf-grid-canvas border-b lg:border-b-0 lg:border-r border-slate-200 p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
        <div>
          <BrandLogo size="md" />
        </div>

        <div className="my-10 space-y-8 max-w-xl">
          <div className="space-y-3.5">
            <h1 className="font-display text-3xl sm:text-[40px] font-bold text-slate-900 tracking-tight leading-[1.12] text-balance">
              Direct WhatsApp and Email operations, unified.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
              Build consented audience groups, personalize campaigns with live variables, and audit every delivery outcome from one calm workspace.
            </p>
          </div>

          {/* Crisp Architectural Product Preview Card */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-[#F8FAFC] flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 font-display">
                Dual-Channel Dispatch Preview
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Opt-in verified · Real-time audit
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        WhatsApp Business Cloud API
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        Approved Meta templates · Read &amp; delivery receipts
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 shrink-0 font-mono tabular-nums">
                    <Check className="w-3.5 h-3.5" />
                    <span>99.4%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: '94%' }} />
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        Email Campaign Engine
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        Gmail SMTP &amp; API relay · Automatic unsubscribe links
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 shrink-0 font-mono tabular-nums">
                    <Check className="w-3.5 h-3.5" />
                    <span>98.8%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '88%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span>Separate WhatsApp &amp; Email opt-ins</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span>CSV / Excel contact import</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span>Delivery &amp; bounce logs</span>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="lg:w-[45%] p-8 sm:p-12 lg:p-16 flex items-center justify-center bg-white">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2.5">
            <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
              Sign in to your workspace
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Continue with your Google account to access contacts, approved templates, and campaign reports.
            </p>
          </div>

          {authError && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={submitting}
              className="gsi-material-button w-full shadow-xs"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                </div>
                <span>{submitting ? 'Signing in...' : 'Sign in with Google'}</span>
              </div>
            </button>
          </div>

          <div className="pt-5 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Workspace-isolated data &amp; server-side credentials</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pl-6">
              API tokens and SMTP passwords remain encrypted on the server and are never exposed to the browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
