import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  ArrowUpRight,
  X,
  ShieldCheck,
  FileText,
  Search,
  Copy,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Template } from '../types';
import { useToast } from '../components/ToastContext';

export const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'whatsapp_approved' | 'drafts'>('whatsapp_approved');
  const [search, setSearch] = useState('');
  const [draftChannelFilter, setDraftChannelFilter] = useState<'all' | 'whatsapp' | 'email'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [category, setCategory] = useState<'whatsapp_approved' | 'draft'>('draft');
  const [metaTemplateName, setMetaTemplateName] = useState('');
  const [metaLanguage, setMetaLanguage] = useState('en_US');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ templates: Template[] }>('/api/templates');
      setTemplates(res.templates);
    } catch (err: any) {
      showToast('Failed to load templates', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const approvedTemplates = useMemo(
    () =>
      templates.filter(
        (t) => t.channel === 'whatsapp' && t.templateCategory === 'whatsapp_approved'
      ),
    [templates]
  );

  const draftTemplates = useMemo(
    () => templates.filter((t) => t.templateCategory !== 'whatsapp_approved'),
    [templates]
  );

  const shownList = useMemo(() => {
    const base = activeTab === 'whatsapp_approved' ? approvedTemplates : draftTemplates;
    const q = search.trim().toLowerCase();
    return base.filter((t) => {
      if (activeTab === 'drafts' && draftChannelFilter !== 'all' && t.channel !== draftChannelFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q) ||
        (t.metaTemplateName || '').toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
      );
    });
  }, [activeTab, approvedTemplates, draftTemplates, search, draftChannelFilter]);

  const openCreate = (defaultCat: 'whatsapp_approved' | 'draft') => {
    setEditing(null);
    setName('');
    setChannel('whatsapp');
    setCategory(defaultCat);
    setMetaTemplateName('');
    setMetaLanguage('en_US');
    setSubject('');
    setBody('');
    setModalOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name);
    setChannel(t.channel);
    setCategory(t.templateCategory);
    setMetaTemplateName(t.metaTemplateName || '');
    setMetaLanguage(t.metaLanguage || 'en_US');
    setSubject(t.subject || '');
    setBody(t.body);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        channel: category === 'whatsapp_approved' ? 'whatsapp' : channel,
        templateCategory: category,
        metaTemplateName: category === 'whatsapp_approved' ? metaTemplateName.trim() : null,
        metaLanguage: category === 'whatsapp_approved' ? metaLanguage.trim() : 'en_US',
        subject: channel === 'email' && category === 'draft' ? subject.trim() : null,
        body,
      };
      if (editing) {
        const res = await apiRequest<{ template: Template }>(`/api/templates/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setTemplates((prev) => prev.map((t) => (t.id === editing.id ? res.template : t)));
        showToast('Template updated', res.template.name, 'success');
      } else {
        const res = await apiRequest<{ template: Template }>('/api/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTemplates((prev) => [res.template, ...prev]);
        showToast('Template saved', res.template.name, 'success');
      }
      setModalOpen(false);
    } catch (err: any) {
      showToast('Save failed', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (t: Template) => {
    try {
      const res = await apiRequest<{ template: Template }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: `${t.name} (Copy)`,
          channel: t.channel,
          templateCategory: t.templateCategory,
          metaTemplateName: t.metaTemplateName,
          metaLanguage: t.metaLanguage || 'en_US',
          subject: t.subject,
          body: t.body,
        }),
      });
      setTemplates((prev) => [res.template, ...prev]);
      showToast('Template duplicated', res.template.name, 'success');
    } catch (err: any) {
      showToast('Duplicate failed', err.message, 'error');
    }
  };

  const handleDelete = async (t: Template) => {
    try {
      await apiRequest(`/api/templates/${t.id}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((item) => item.id !== t.id));
      showToast('Template deleted', t.name, 'info');
    } catch (err: any) {
      showToast('Delete failed', err.message, 'error');
    }
  };

  const useTemplate = (t: Template) => {
    navigate(t.channel === 'whatsapp' ? `/whatsapp?templateId=${t.id}` : `/email?templateId=${t.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Category Switcher + Search + CTA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-[#F8FAFC] border border-slate-200 rounded-md">
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp_approved')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeTab === 'whatsapp_approved'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              WhatsApp Approved ({approvedTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeTab === 'drafts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Saved Drafts ({draftTemplates.length})
            </button>
          </div>

          {activeTab === 'drafts' && (
            <select
              value={draftChannelFilter}
              onChange={(e) => setDraftChannelFilter(e.target.value as 'all' | 'whatsapp' | 'email')}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="all">All Channels</option>
              <option value="whatsapp">WhatsApp Drafts</option>
              <option value="email">Email Drafts</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => openCreate(activeTab === 'whatsapp_approved' ? 'whatsapp_approved' : 'draft')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-lg">
          Loading templates...
        </div>
      ) : shownList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-2">
          <FileText className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-900">
            No {activeTab === 'whatsapp_approved' ? 'approved WhatsApp templates' : 'saved drafts'} found
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Create reusable templates with variables like {'{{name}}'} to speed up campaigns.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shownList.map((t) => {
            const plainBody = t.channel === 'email' ? t.body.replace(/<[^>]+>/g, ' ') : t.body;
            return (
              <div
                key={t.id}
                className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-[15px] font-semibold text-slate-900 truncate">
                        {t.name}
                      </h2>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                        <span
                          className={`font-semibold ${
                            t.channel === 'whatsapp' ? 'text-emerald-700' : 'text-blue-600'
                          }`}
                        >
                          {t.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                        </span>
                        {' · '}
                        {t.templateCategory === 'whatsapp_approved'
                          ? `${t.metaTemplateName || 'unmapped'} (${t.metaLanguage || 'en_US'})`
                          : 'Saved Draft'}
                      </p>
                    </div>
                    {t.templateCategory === 'whatsapp_approved' && (
                      <ShieldCheck
                        className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-label="Meta Approved Template"
                      />
                    )}
                  </div>

                  {t.subject && (
                    <p className="text-xs font-medium text-slate-700 truncate">
                      <span className="text-slate-400 font-normal">Subject: </span>
                      {t.subject}
                    </p>
                  )}

                  <p className="pt-2.5 border-t border-slate-100 text-xs text-slate-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                    {plainBody}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                      title="Edit template"
                      aria-label="Edit template"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(t)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                      title="Duplicate template"
                      aria-label="Duplicate template"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                      title="Delete template"
                      aria-label="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => useTemplate(t)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                      t.channel === 'whatsapp'
                        ? 'text-emerald-700 hover:text-emerald-800'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    <span>Use in Campaign</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editing ? 'Edit Template' : 'Create Template'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Template Category
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const val = e.target.value as 'whatsapp_approved' | 'draft';
                    setCategory(val);
                    if (val === 'whatsapp_approved') setChannel('whatsapp');
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="whatsapp_approved">WhatsApp Approved Meta Template</option>
                  <option value="draft">Saved Message Draft</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Order Update"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                {category === 'draft' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Channel
                    </label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as 'whatsapp' | 'email')}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                )}
              </div>

              {category === 'whatsapp_approved' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Meta Approved Template Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={metaTemplateName}
                      onChange={(e) => setMetaTemplateName(e.target.value)}
                      placeholder="account_update_notice"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Language Code
                    </label>
                    <input
                      type="text"
                      value={metaLanguage}
                      onChange={(e) => setMetaLanguage(e.target.value)}
                      placeholder="en_US"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
              )}

              {category === 'draft' && channel === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Updates for {{name}}"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message Body * (Variables: {'{{name}}'}, {'{{phone}}'}, {'{{email}}'})
                </label>
                <textarea
                  required
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hello {{name}}, ..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

