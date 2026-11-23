export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
  notifyCampaignComplete: boolean;
  notifyDeliveryFailures: boolean;
  dailySendLimit: number;
  createdAt: string;
}

export interface IntegrationState {
  whatsappConnected: boolean;
  whatsappMode: 'live' | 'demo';
  whatsappBusinessAccountId: string;
  whatsappPhoneNumberId: string;
  whatsappDisplayPhone: string;
  hasWhatsappToken: boolean;
  emailConnected: boolean;
  emailMode: 'live' | 'demo';
  emailProvider: 'gmail_smtp' | 'smtp' | 'resend' | 'demo';
  emailFromAddress: string;
  emailFromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPass: boolean;
  hasEmailApiKey: boolean;
}

export interface ContactGroup {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface Contact {
  id: number;
  userId: number;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  groupIds: number[];
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  whatsappOptOutAt: string | null;
  emailUnsubscribedAt: string | null;
  suppressedEmail: boolean;
  source: string;
  createdAt: string;
}

export interface Template {
  id: number;
  userId: number;
  name: string;
  channel: 'whatsapp' | 'email';
  templateCategory: 'whatsapp_approved' | 'draft';
  metaTemplateName: string | null;
  metaLanguage: string | null;
  metaApprovalStatus: string | null;
  subject: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: number;
  userId: number;
  name: string;
  channel: 'whatsapp' | 'email';
  fromEmail: string | null;
  subject: string | null;
  body: string;
  templateId: number | null;
  executionMode: 'live' | 'demo';
  status: 'completed' | 'sending' | 'scheduled' | 'paused' | 'cancelled' | 'failed';
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  bouncedCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface CampaignRecipient {
  id: number;
  campaignId: number;
  contactId: number | null;
  contactName: string;
  destination: string;
  renderedBody: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'bounced' | 'failed';
  providerMessageId: string | null;
  errorMessage: string | null;
  isSimulated: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  channel: string | null;
  details: string;
  createdAt: string;
}

export interface DashboardData {
  stats: {
    totalContacts: number;
    whatsappOptedIn: number;
    emailOptedIn: number;
    whatsappSent: number;
    emailsSent: number;
    successfulDeliveries: number;
    failedMessages: number;
  };
  channelBreakdown?: {
    whatsappDelivered: number;
    emailDelivered: number;
    scheduledCount: number;
    suppressedCount: number;
    whatsappOptOutCount: number;
  };
  recentCampaigns: Campaign[];
  recentActivity: AuditLog[];
}
