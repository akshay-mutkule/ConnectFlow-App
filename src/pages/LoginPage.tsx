import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 space-y-7 shadow-xs">
        <div className="space-y-4">
          <BrandLogo size="md" />
          <div className="space-y-2 pt-2">
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
              WhatsApp and Email messaging, in one place.
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Manage opted-in contacts, send personalized campaigns, and track deliveries from a single workspace.
            </p>
          </div>
        </div>

        {authError && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {authError}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={submitting}
          className="gsi-material-button w-full"
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

        <div className="pt-5 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Credentials are stored server-side and never exposed in the browser.</span>
        </div>
      </div>
    </div>
  );
};
