export interface PersonalizeContact {
  name: string;
  phone?: string | null;
  email?: string | null;
}

const TOKEN_REGEX = /\{\{\s*(name|first_name|phone|email)(?:\s*\|\s*([^}]+))?\s*\}\}/gi;

export function personalizeText(
  template: string,
  contact: PersonalizeContact,
  defaults?: { name?: string; firstName?: string; phone?: string; email?: string }
): string {
  const fullName = (contact.name || '').trim();
  const firstName = fullName.split(/\s+/)[0] || '';
  const phone = (contact.phone || '').trim();
  const email = (contact.email || '').trim();

  return template.replace(TOKEN_REGEX, (_match, rawKey: string, rawFallback?: string) => {
    const key = rawKey.toLowerCase();
    const fallback = rawFallback ? rawFallback.trim() : '';

    if (key === 'first_name') {
      return firstName || fallback || defaults?.firstName || 'there';
    }
    if (key === 'name') {
      return fullName || fallback || defaults?.name || 'Friend';
    }
    if (key === 'phone') {
      return phone || fallback || defaults?.phone || '';
    }
    if (key === 'email') {
      return email || fallback || defaults?.email || '';
    }
    return fallback;
  });
}

export function countMissingVariableContacts(
  template: string,
  contacts: PersonalizeContact[]
): number {
  const tokens: Array<{ key: string; hasFallback: boolean }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX.source, 'gi');
  while ((match = regex.exec(template)) !== null) {
    tokens.push({
      key: match[1].toLowerCase(),
      hasFallback: Boolean(match[2] && match[2].trim()),
    });
  }
  if (tokens.length === 0) return 0;

  return contacts.filter((c) =>
    tokens.some((t) => {
      if (t.hasFallback) return false;
      if (t.key === 'name' || t.key === 'first_name') return !c.name.trim();
      if (t.key === 'phone') return !(c.phone || '').trim();
      if (t.key === 'email') return !(c.email || '').trim();
      return false;
    })
  ).length;
}
