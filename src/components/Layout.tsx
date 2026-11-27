import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Mail,
  Send,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { Campaign, Contact, Template } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'whatsapp' | 'email';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, accent: 'whatsapp' },
  { to: '/email', label: 'Email', icon: Mail, accent: 'email' },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { profile, firebaseUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdResults, setCmdResults] = useState<{
    contacts: Contact[];
    campaigns: Campaign[];
    templates: Template[];
  }>({ contacts: [], campaigns: [], templates: [] });
  const [cmdLoading, setCmdLoading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const currentTitle =
    NAV_ITEMS.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
    )?.label || 'Dashboard';

  const displayName =
    profile?.displayName || firebaseUser?.displayName || profile?.email?.split('@')[0] || 'User';
  const displayEmail = profile?.email || firebaseUser?.email || '';
  const initials = displayName
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!cmdOpen) return;
    const q = cmdQuery.trim();
    if (!q) {
      setCmdResults({ contacts: [], campaigns: [], templates: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setCmdLoading(true);
      try {
        const res = await apiRequest<{
          contacts: Contact[];
          campaigns: Campaign[];
          templates: Template[];
        }>(`/api/search?q=${encodeURIComponent(q)}`);
        setCmdResults(res);
      } catch {
        // Ignore transient search errors
      } finally {
        setCmdLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [cmdQuery, cmdOpen]);

  const jumpTo = (path: string) => {
    setCmdOpen(false);
    setCmdQuery('');
    navigate(path);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#F8FAFC] border-r border-slate-200 w-56">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <BrandLogo size="sm" />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => {
                const activeStyles =
                  item.accent === 'whatsapp'
                    ? 'bg-emerald-600/10 text-emerald-800 font-medium'
                    : item.accent === 'email'
                      ? 'bg-blue-600/10 text-blue-700 font-medium'
                      : 'bg-slate-200/70 text-slate-900 font-medium';
                return `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors whitespace-nowrap ${
                  isActive
                    ? activeStyles
                    : 'text-slate-600 hover:bg-slate-200/45 hover:text-slate-900 font-normal'
                }`;
              }}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? item.accent === 'whatsapp'
                          ? 'text-emerald-700'
                          : item.accent === 'email'
                            ? 'text-blue-600'
                            : 'text-slate-900'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 shrink-0 space-y-1">
        <NavLink
          to="/settings"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-slate-200/50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px] font-semibold shrink-0 font-display">
            {initials || 'CF'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-900 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">{displayEmail}</p>
          </div>
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-56">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 h-full">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 lg:pl-56 flex flex-col min-w-0 bg-white">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-semibold text-slate-900 text-[15px] truncate">
              {currentTitle}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="inline-flex items-center justify-between gap-4 px-3 py-1.5 text-xs text-slate-500 bg-white border border-slate-200 rounded-md hover:border-slate-300 hover:text-slate-800 transition-colors whitespace-nowrap shrink-0 sm:w-56"
          >
            <span className="inline-flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Search...</span>
            </span>
            <kbd className="hidden sm:inline font-mono text-[10px] text-slate-400">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="flex-1 p-5 sm:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-20 p-4"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Search contacts, campaigns, or templates..."
                className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setCmdOpen(false)}
                className="text-xs font-mono text-slate-400 hover:text-slate-700 px-1.5 py-0.5 border border-slate-200 rounded"
              >
                ESC
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-3">
              {!cmdQuery.trim() ? (
                <div className="p-2 space-y-1">
                  <button
                    type="button"
                    onClick={() => jumpTo('/whatsapp')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <span>Send WhatsApp Message</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTo('/email')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span>Send Email</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTo('/contacts')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-100"
                  >
                    <span>Manage Contacts</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : cmdLoading ? (
                <p className="p-6 text-center text-xs text-slate-500">Searching...</p>
              ) : cmdResults.contacts.length === 0 &&
                cmdResults.campaigns.length === 0 &&
                cmdResults.templates.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  No matching results found.
                </p>
              ) : (
                <>
                  {cmdResults.contacts.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">Contacts</p>
                      {cmdResults.contacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => jumpTo(`/contacts?contactId=${c.id}`)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                            <p className="text-[11px] font-mono text-slate-500">
                              {[c.phone, c.email].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}
                  {cmdResults.campaigns.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">Campaigns</p>
                      {cmdResults.campaigns.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => jumpTo('/campaigns')}
                          className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                            <p className="text-[11px] text-slate-500 capitalize">
                              {c.channel} · {c.status}
                            </p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}
                  {cmdResults.templates.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">Templates</p>
                      {cmdResults.templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            jumpTo(
                              t.channel === 'whatsapp'
                                ? `/whatsapp?templateId=${t.id}`
                                : `/email?templateId=${t.id}`
                            )
                          }
                          className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-900">{t.name}</p>
                            <p className="text-[11px] text-slate-500 capitalize">{t.channel}</p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
