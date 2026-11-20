import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ToastContext';
import { Layout } from './components/Layout';
import { MessageFlow3DModal } from './components/MessageFlow3DModal';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { WhatsAppPage } from './pages/WhatsAppPage';
import { EmailPage } from './pages/EmailPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { SettingsPage } from './pages/SettingsPage';
import { DashboardData } from './types';

function AppRoutes() {
  const { firebaseUser, loading } = useAuth();
  const [open3D, setOpen3D] = useState(false);
  const [latestStats, setLatestStats] = useState<DashboardData['stats'] | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-display font-bold text-sm">
            CF
          </div>
          <p className="text-sm text-slate-500">Loading ConnectFlow workspace...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginPage />;
  }

  return (
    <>
      <Layout onOpen3D={() => setOpen3D(true)}>
        <Routes>
          <Route path="/" element={<DashboardPage onStatsLoaded={setLatestStats} />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/email" element={<EmailPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>

      <MessageFlow3DModal
        open={open3D}
        onClose={() => setOpen3D(false)}
        stats={latestStats}
      />
    </>
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
