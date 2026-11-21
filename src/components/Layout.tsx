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
  Box,
  Search,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { Campaign, Contact, Template } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  onOpen3D: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'whatsapp' | 'email';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/contacts', label: 'Contacts', icon: Users },
    ],
  },
  {
    label: 'Messaging Channels',
    items: [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, accent: 'whatsapp' },
      { to: '/email', label: 'Email', icon: Mail, accent: 'email' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/campaigns', label: 'Campaigns', icon: Send },
      { to: '/templates', label: 'Templates', icon: FileText },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const Layout: React.FC<LayoutProps> = ({ children, onOpen3D }) => {
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
    ALL_NAV_ITEMS.find((item) =>
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
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      {/* Brand Lockup */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
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

      {/* Grouped Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-1.5">
              {group.label}
            </p>
            {group.items.map((item) => {
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
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : item.accent === 'email'
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'bg-slate-900 text-white font-semibold';
                    return `flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors whitespace-nowrap ${
                      isActive
                        ? activeStyles
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium'
                    }`;
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? item.accent === 'whatsapp'
                              ? 'text-emerald-600'
                              : item.accent === 'email'
                                ? 'text-blue-600'
                                : 'text-white'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom User Profile & Sign Out */}
      <div className="p-3 border-t border-slate-200 shrink-0 space-y-1.5 bg-[#F8FAFC]/60">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shrink-0 font-display">
            {initials || 'CF'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">{displayEmail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Workspace</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 text-base truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="hidden sm:inline-flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-500 bg-[#F8FAFC] border border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-800 transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Quick jump...</span>
              <kbd className="font-mono text-[10px] text-slate-400 border border-slate-200 bg-white px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onOpen3D}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
            >
              <Box className="w-3.5 h-3.5 text-blue-600" />
              <span>3D Routing</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Command / Quick Search Modal */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-20 p-4"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
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
                  <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                    Quick Actions
                  </p>
                  <button
                    type="button"
                    onClick={() => jumpTo('/whatsapp')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <span>Compose WhatsApp Campaign</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTo('/email')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span>Compose Email Campaign</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpTo('/contacts')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-100"
                  >
                    <span>Manage Contacts &amp; Groups</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : cmdLoading ? (
                <p className="p-6 text-center text-xs text-slate-500">Searching...</p>
              ) : cmdResults.contacts.length === 0 &&
                cmdResults.campaigns.length === 0 &&
                cmdResults.templates.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  No matching contacts, campaigns, or templates.
                </p>
              ) : (
                <>
                  {cmdResults.contacts.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                        Contacts
                      </p>
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
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                        Campaigns
                      </p>
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
                      <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                        Templates
                      </p>
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
