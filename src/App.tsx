import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ToastContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { BrandLogo } from './components/BrandLogo';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ContactsPage = lazy(() =>
  import('./pages/ContactsPage').then((m) => ({ default: m.ContactsPage }))
);
const WhatsAppPage = lazy(() =>
  import('./pages/WhatsAppPage').then((m) => ({ default: m.WhatsAppPage }))
);
const EmailPage = lazy(() =>
  import('./pages/EmailPage').then((m) => ({ default: m.EmailPage }))
);
const CampaignsPage = lazy(() =>
  import('./pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage }))
);
const TemplatesPage = lazy(() =>
  import('./pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

function WorkspaceFallback() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
      Loading view...
    </div>
  );
}

function AppRoutes() {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo size="lg" showWordmark={false} />
          <p className="text-sm text-slate-500">Loading ConnectFlow workspace...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Suspense fallback={<WorkspaceFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/email" element={<EmailPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
