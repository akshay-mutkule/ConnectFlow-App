import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Plus,
  Upload,
  Search,
  Trash2,
  Edit2,
  FolderPlus,
  CheckSquare,
  Square,
  X,
  AlertTriangle,
  MessageSquare,
  Mail,
  Download,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Contact, ContactGroup } from '../types';
import { useToast } from '../components/ToastContext';

export const ContactsPage: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [consentFilter, setConsentFilter] = useState<'all' | 'whatsapp' | 'email'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [inspectedContact, setInspectedContact] = useState<Contact | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState<string>('');

  // Modals
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  // Contact Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formGroupIds, setFormGroupIds] = useState<number[]>([]);
  const [formWaOptIn, setFormWaOptIn] = useState(false);
  const [formEmailOptIn, setFormEmailOptIn] = useState(false);
  const [saving, setSaving] = useState(false);

  // New Group State
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Import State
  const [importRows, setImportRows] = useState<
    { name: string; phone: string; email: string; tags: string }[]
  >([]);
  const [importSource, setImportSource] = useState<'csv' | 'excel'>('csv');
  const [importGroupIds, setImportGroupIds] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, gRes] = await Promise.all([
        apiRequest<{ contacts: Contact[] }>('/api/contacts'),
        apiRequest<{ groups: ContactGroup[] }>('/api/groups'),
      ]);
      setContacts(cRes.contacts);
      setGroups(gRes.groups);

      const cid = searchParams.get('contactId');
      if (cid) {
        const match = cRes.contacts.find((c) => String(c.id) === cid);
        if (match) setInspectedContact(match);
      }
    } catch (err: any) {
      showToast('Failed to load contacts', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (q) {
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchEmail) return false;
      }
      if (selectedGroupId !== 'all' && !c.groupIds.includes(selectedGroupId)) {
        return false;
      }
      if (selectedTag !== 'all' && !c.tags.includes(selectedTag)) {
        return false;
      }
      if (consentFilter === 'whatsapp' && (!c.whatsappOptIn || Boolean(c.whatsappOptOutAt))) {
        return false;
      }
      if (consentFilter === 'email' && (!c.emailOptIn || c.suppressedEmail)) {
        return false;
      }
      return true;
    });
  }, [contacts, search, selectedGroupId, selectedTag, consentFilter]);

  const openAddContact = () => {
    setEditingContact(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormTags('');
    setFormGroupIds(selectedGroupId !== 'all' ? [selectedGroupId] : []);
    setFormWaOptIn(false);
    setFormEmailOptIn(false);
    setContactModalOpen(true);
  };

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormEmail(c.email || '');
    setFormTags(c.tags.join(', '));
    setFormGroupIds(c.groupIds || []);
    setFormWaOptIn(c.whatsappOptIn);
    setFormEmailOptIn(c.emailOptIn);
    setContactModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        tags: formTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        groupIds: formGroupIds,
        whatsappOptIn: formWaOptIn,
        emailOptIn: formEmailOptIn,
      };
      if (editingContact) {
        const res = await apiRequest<{ contact: Contact }>(
          `/api/contacts/${editingContact.id}`,
          { method: 'PATCH', body: JSON.stringify(payload) }
        );
        setContacts((prev) =>
          prev.map((item) => (item.id === editingContact.id ? res.contact : item))
        );
        if (inspectedContact?.id === editingContact.id) {
          setInspectedContact(res.contact);
        }
        showToast('Contact updated', res.contact.name, 'success');
      } else {
        const res = await apiRequest<{ contact: Contact }>('/api/contacts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setContacts((prev) => [res.contact, ...prev]);
        showToast('Contact added', res.contact.name, 'success');
      }
      setContactModalOpen(false);
    } catch (err: any) {
      showToast('Validation error', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (c: Contact) => {
    try {
      await apiRequest(`/api/contacts/${c.id}`, { method: 'DELETE' });
      setContacts((prev) => prev.filter((item) => item.id !== c.id));
      setSelectedIds((prev) => prev.filter((id) => id !== c.id));
      if (inspectedContact?.id === c.id) setInspectedContact(null);
      showToast('Contact deleted', c.name, 'info');
    } catch (err: any) {
      showToast('Delete failed', err.message, 'error');
    }
  };

  const toggleConsent = async (c: Contact, channel: 'whatsapp' | 'email') => {
    try {
      const payload =
        channel === 'whatsapp'
          ? { whatsappOptIn: !c.whatsappOptIn }
          : { emailOptIn: !c.emailOptIn };
      const res = await apiRequest<{ contact: Contact }>(`/api/contacts/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setContacts((prev) => prev.map((item) => (item.id === c.id ? res.contact : item)));
      if (inspectedContact?.id === c.id) setInspectedContact(res.contact);
    } catch (err: any) {
      showToast('Update failed', err.message, 'error');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    if (
      filteredContacts.length > 0 &&
      filteredContacts.every((c) => selectedIds.includes(c.id))
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContacts.map((c) => c.id));
    }
  };

  const selectAllEligible = (channel: 'whatsapp' | 'email') => {
    const eligible = filteredContacts
      .filter((c) =>
        channel === 'whatsapp'
          ? c.whatsappOptIn && !c.whatsappOptOutAt && Boolean(c.phone)
          : c.emailOptIn && !c.suppressedEmail && Boolean(c.email)
      )
      .map((c) => c.id);
    setSelectedIds(eligible);
    showToast(
      `Selected ${eligible.length} ${channel === 'whatsapp' ? 'WhatsApp' : 'Email'} opted-in contacts`,
      undefined,
      'info'
    );
  };

  const runBulkAction = async (
    action: 'add_group' | 'whatsapp_opt_in' | 'email_opt_in' | 'delete',
    groupId?: number
  ) => {
    if (!selectedIds.length) return;
    try {
      const res = await apiRequest<{ ok: boolean; contacts?: Contact[] }>(
        '/api/contacts/bulk-action',
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds, action, groupId }),
        }
      );
      if (action === 'delete') {
        setContacts((prev) => prev.filter((c) => !selectedIds.includes(c.id)));
        showToast(`Deleted ${selectedIds.length} contact(s)`, undefined, 'info');
        setSelectedIds([]);
      } else if (res.contacts) {
        const updatedMap = new Map(res.contacts.map((c) => [c.id, c]));
        setContacts((prev) => prev.map((c) => updatedMap.get(c.id) || c));
        showToast('Bulk update applied', `${selectedIds.length} contact(s) updated`, 'success');
      }
    } catch (err: any) {
      showToast('Bulk update failed', err.message, 'error');
    }
  };

  const downloadSampleCsv = () => {
    const csv =
      'name,phone,email,tags\nAlex Rivera,+15550192834,alex@example.com,"vip, customer"\nMaya Lin,+15550148821,maya@example.com,"newsletter"\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'connectflow_contacts_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    setImportSource(isExcel ? 'excel' : 'csv');
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, {
        defval: '',
      });

      const mapped = jsonRows.map((row) => {
        const normalized: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          normalized[k.trim().toLowerCase()] = String(v ?? '').trim();
        });
        return {
          name:
            normalized['name'] ||
            normalized['full name'] ||
            normalized['fullname'] ||
            `${normalized['first name'] || ''} ${normalized['last name'] || ''}`.trim(),
          phone: normalized['phone'] || normalized['phone number'] || normalized['mobile'] || '',
          email: normalized['email'] || normalized['email address'] || '',
          tags: normalized['tags'] || normalized['tag'] || '',
        };
      });

      setImportRows(mapped.filter((r) => r.name && (r.phone || r.email)));
    } catch {
      showToast('Parse error', 'Could not read CSV or Excel file.', 'error');
    }
  };

  const handleImportConfirm = async () => {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const res = await apiRequest<{
        importedCount: number;
        skippedCount: number;
        contacts: Contact[];
      }>('/api/contacts/import', {
        method: 'POST',
        body: JSON.stringify({
          contacts: importRows,
          source: importSource,
          groupIds: importGroupIds,
        }),
      });
      setContacts((prev) => [...res.contacts, ...prev]);
      showToast(
        `Imported ${res.importedCount} contacts`,
        'Consent defaulted to opted-out until permission is verified.',
        'success'
      );
      setImportModalOpen(false);
      setImportRows([]);
    } catch (err: any) {
      showToast('Import failed', err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const res = await apiRequest<{ group: ContactGroup }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
        }),
      });
      setGroups((prev) => [...prev, res.group]);
      setNewGroupName('');
      setNewGroupDesc('');
      setGroupModalOpen(false);
      showToast('Group created', res.group.name, 'success');
    } catch (err: any) {
      showToast('Failed to create group', err.message, 'error');
    }
  };

  const handleDeleteGroup = async (g: ContactGroup) => {
    try {
      await apiRequest(`/api/groups/${g.id}`, { method: 'DELETE' });
      setGroups((prev) => prev.filter((item) => item.id !== g.id));
      if (selectedGroupId === g.id) setSelectedGroupId('all');
      showToast('Group removed', g.name, 'info');
    } catch (err: any) {
      showToast('Failed to delete group', err.message, 'error');
    }
  };

  const groupMap = useMemo(() => {
    const m = new Map<number, string>();
    groups.forEach((g) => m.set(g.id, g.name));
    return m;
  }, [groups]);

  const handleExportCsv = () => {
    const targetList =
      selectedIds.length > 0
        ? contacts.filter((c) => selectedIds.includes(c.id))
        : filteredContacts;

    if (!targetList.length) {
      showToast('No contacts to export', 'Add or adjust filters before exporting.', 'error');
      return;
    }

    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'name',
      'phone',
      'email',
      'tags',
      'groups',
      'whatsapp_opt_in',
      'email_opt_in',
      'suppressed_email',
    ].join(',');
    const rows = targetList.map((c) => {
      const grpNames = c.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join('; ');
      return [
        esc(c.name),
        esc(c.phone || ''),
        esc(c.email || ''),
        esc(c.tags.join(', ')),
        esc(grpNames),
        c.whatsappOptIn && !c.whatsappOptOutAt ? 'yes' : 'no',
        c.emailOptIn && !c.suppressedEmail ? 'yes' : 'no',
        c.suppressedEmail ? 'yes' : 'no',
      ].join(',');
    });

    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `connectflow_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Contacts exported', `${targetList.length} contact(s) saved to CSV.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Contacts &amp; Audience Groups
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Organize contacts into groups, import spreadsheets, and govern separate channel consent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{selectedIds.length > 0 ? `Export (${selectedIds.length})` : 'Export CSV'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setImportRows([]);
              setImportModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV / Excel</span>
          </button>
          <button
            type="button"
            onClick={openAddContact}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Groups Sidebar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 h-fit space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400 px-2 pb-1">Contact Groups</p>
          <button
            type="button"
            onClick={() => setSelectedGroupId('all')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedGroupId === 'all'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>All Contacts</span>
            <span className="font-mono tabular-nums">{contacts.length}</span>
          </button>

          {groups.map((g) => {
            const count = contacts.filter((c) => c.groupIds.includes(g.id)).length;
            return (
              <div key={g.id} className="flex items-center gap-1 group">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`flex-1 flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-0 ${
                    selectedGroupId === g.id
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="font-mono tabular-nums ml-2">{count}</span>
                </button>
                {!g.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(g)}
                    className="p-1.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Delete group ${g.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Main Directory */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, or email..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">All Tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['all', 'whatsapp', 'email'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setConsentFilter(f)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      consentFilter === f
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'whatsapp' ? 'WA Opt-In' : 'Email Opt-In'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Selection & Bulk Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
            <div className="flex items-center gap-3 text-slate-600">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                {filteredContacts.length > 0 &&
                filteredContacts.every((c) => selectedIds.includes(c.id))
                  ? 'Clear selection'
                  : 'Select all shown'}
              </button>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <button
                type="button"
                onClick={() => selectAllEligible('whatsapp')}
                className="font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Select WA eligible
              </button>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <button
                type="button"
                onClick={() => selectAllEligible('email')}
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Select Email eligible
              </button>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="font-mono font-semibold text-slate-800 tabular-nums mr-1">
                  {selectedIds.length} selected
                </span>
                <select
                  value={bulkGroupId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      void runBulkAction('add_group', Number(val));
                      setBulkGroupId('');
                    }
                  }}
                  className="text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-700"
                >
                  <option value="">Add to group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => runBulkAction('whatsapp_opt_in')}
                  className="px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded"
                >
                  Enable WA
                </button>
                <button
                  type="button"
                  onClick={() => runBulkAction('email_opt_in')}
                  className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
                >
                  Enable Email
                </button>
                <button
                  type="button"
                  onClick={() => runBulkAction('delete')}
                  className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>

          {/* Contacts Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading contacts...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">No contacts match your filters</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add a contact manually or import a CSV / Excel file to begin building your audience.
                </p>
                <button
                  type="button"
                  onClick={openAddContact}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Contact</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-medium text-slate-500">
                      <th className="py-3 pl-4 pr-2 w-10">
                        <button
                          type="button"
                          onClick={selectAllFiltered}
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Toggle select all"
                        >
                          {filteredContacts.every((c) => selectedIds.includes(c.id)) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Groups &amp; Tags</th>
                      <th className="py-3 px-4">WhatsApp</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredContacts.map((c) => {
                      const isSelected = selectedIds.includes(c.id);
                      const groupNames = c.groupIds
                        .map((id) => groupMap.get(id))
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setInspectedContact(c)}
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <td
                            className="py-3.5 pl-4 pr-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(c.id);
                            }}
                          >
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-700"
                              aria-label={`Select ${c.name}`}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-medium text-slate-900">{c.name}</p>
                            <p className="text-xs text-slate-500 font-mono">
                              {[c.phone, c.email].filter(Boolean).join(' · ')}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            <p className="truncate max-w-[180px]">{groupNames || 'Unassigned'}</p>
                            {c.tags.length > 0 && (
                              <p className="text-slate-400 truncate max-w-[180px]">
                                {c.tags.join(' · ')}
                              </p>
                            )}
                          </td>
                          <td
                            className="py-3.5 px-4"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c.phone) void toggleConsent(c, 'whatsapp');
                            }}
                          >
                            <button
                              type="button"
                              disabled={!c.phone}
                              className={`text-xs font-medium ${
                                !c.phone
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : c.whatsappOptIn && !c.whatsappOptOutAt
                                    ? 'text-emerald-700 hover:text-emerald-800'
                                    : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              {!c.phone
                                ? 'No phone'
                                : c.whatsappOptIn && !c.whatsappOptOutAt
                                  ? 'Opted-In'
                                  : 'Opted-Out'}
                            </button>
                          </td>
                          <td
                            className="py-3.5 px-4"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c.email) void toggleConsent(c, 'email');
                            }}
                          >
                            <button
                              type="button"
                              disabled={!c.email}
                              className={`text-xs font-medium ${
                                !c.email
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : c.suppressedEmail
                                    ? 'text-red-600'
                                    : c.emailOptIn
                                      ? 'text-blue-600 hover:text-blue-700'
                                      : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              {!c.email
                                ? 'No email'
                                : c.suppressedEmail
                                  ? 'Unsubscribed'
                                  : c.emailOptIn
                                    ? 'Opted-In'
                                    : 'Opted-Out'}
                            </button>
                          </td>
                          <td
                            className="py-3.5 px-4 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditContact(c)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                                aria-label={`Edit ${c.name}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteContact(c)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                                aria-label={`Delete ${c.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-Over Contact Inspector Drawer */}
      {inspectedContact && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          onClick={() => setInspectedContact(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-display font-bold text-sm">
                  {inspectedContact.name
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {inspectedContact.name}
                  </h3>
                  <p className="text-xs text-slate-500 capitalize">
                    Added via {inspectedContact.source} ·{' '}
                    {new Date(inspectedContact.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedContact(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Phone</span>
                  <span className="font-mono text-xs text-slate-900">
                    {inspectedContact.phone || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Email</span>
                  <span className="text-xs text-slate-900">{inspectedContact.email || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Groups</span>
                  <span className="text-xs text-slate-900 text-right">
                    {inspectedContact.groupIds
                      .map((id) => groupMap.get(id))
                      .filter(Boolean)
                      .join(', ') || 'Unassigned'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Tags</span>
                  <span className="text-xs text-slate-700">
                    {inspectedContact.tags.length > 0 ? inspectedContact.tags.join(' · ') : 'None'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500">Channel Consent Controls</p>

                <div className="p-4 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">WhatsApp Business</p>
                    <p className="text-xs text-slate-500">
                      {inspectedContact.whatsappOptOutAt
                        ? `Opted out ${new Date(inspectedContact.whatsappOptOutAt).toLocaleDateString()}`
                        : inspectedContact.whatsappOptIn
                          ? 'Active opt-in permission'
                          : 'Not opted in'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!inspectedContact.phone}
                    onClick={() => toggleConsent(inspectedContact, 'whatsapp')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      inspectedContact.whatsappOptIn && !inspectedContact.whatsappOptOutAt
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {inspectedContact.whatsappOptIn && !inspectedContact.whatsappOptOutAt
                      ? 'Opted-In'
                      : 'Opted-Out'}
                  </button>
                </div>

                <div className="p-4 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Email Marketing</p>
                    <p className="text-xs text-slate-500">
                      {inspectedContact.suppressedEmail
                        ? 'Unsubscribed / Suppressed'
                        : inspectedContact.emailOptIn
                          ? 'Active opt-in permission'
                          : 'Not opted in'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!inspectedContact.email}
                    onClick={() => toggleConsent(inspectedContact, 'email')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      inspectedContact.emailOptIn && !inspectedContact.suppressedEmail
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {inspectedContact.suppressedEmail
                      ? 'Unsubscribed'
                      : inspectedContact.emailOptIn
                        ? 'Opted-In'
                        : 'Opted-Out'}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <p className="text-xs font-semibold text-slate-500">Direct Outreach</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={!inspectedContact.whatsappOptIn || !inspectedContact.phone}
                    onClick={() => navigate(`/whatsapp?contactId=${inspectedContact.id}`)}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    disabled={!inspectedContact.emailOptIn || inspectedContact.suppressedEmail || !inspectedContact.email}
                    onClick={() => navigate(`/email?contactId=${inspectedContact.id}`)}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Email</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-[#F8FAFC]">
              <button
                type="button"
                onClick={() => {
                  const target = inspectedContact;
                  setInspectedContact(null);
                  openEditContact(target);
                }}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                Edit Contact Details
              </button>
              <button
                type="button"
                onClick={() => handleDeleteContact(inspectedContact)}
                className="text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Delete Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </h3>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveContact} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number (E.164)
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+15550192834"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="vip, onboarding, newsletter"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Contact Groups
                </label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const active = formGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setFormGroupIds((prev) =>
                            active ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                          )
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          active
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <p className="text-xs font-semibold text-slate-700">
                  Separate Marketing Consent
                </p>
                <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formWaOptIn}
                    onChange={(e) => setFormWaOptIn(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Opted-in for WhatsApp Business messages</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEmailOptIn}
                    onChange={(e) => setFormEmailOptIn(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Opted-in for Email marketing campaigns</span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV / Excel Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Import Contacts (CSV or Excel)
              </h3>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Imported contacts are never automatically treated as opted-in. Both WhatsApp and Email consent default to Opted-Out until explicit permission is recorded.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700">
                  Upload .csv, .xlsx, or .xls file
                </label>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download sample CSV</span>
                </button>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileParse}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
              />

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Assign Imported Contacts to Groups
                </label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const active = importGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setImportGroupIds((prev) =>
                            active ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                          )
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          active
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {importRows.length > 0 && (
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Phone</th>
                        <th className="py-2 px-3">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.slice(0, 8).map((r, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-medium text-slate-800">{r.name}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{r.phone || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{r.email || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importRows.length > 8 && (
                    <p className="text-[11px] text-slate-500 px-3 py-2 border-t border-slate-100">
                      +{importRows.length - 8} more valid rows ready to import
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!importRows.length || importing}
                  onClick={handleImportConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {importing ? 'Importing...' : `Import ${importRows.length} Contacts`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Create Custom Contact Group
              </h3>
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Group Name *
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. VIP Clients"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
