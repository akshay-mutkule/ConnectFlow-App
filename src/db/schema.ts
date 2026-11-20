import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  companyName: text('company_name'),
  notifyCampaignComplete: boolean('notify_campaign_complete').default(true).notNull(),
  notifyDeliveryFailures: boolean('notify_delivery_failures').default(true).notNull(),
  dailySendLimit: integer('daily_send_limit').default(500).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const integrations = pgTable('integrations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  whatsappConnected: boolean('whatsapp_connected').default(false).notNull(),
  whatsappMode: text('whatsapp_mode').default('demo').notNull(),
  whatsappBusinessAccountId: text('whatsapp_business_account_id'),
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'),
  whatsappDisplayPhone: text('whatsapp_display_phone'),
  whatsappAccessToken: text('whatsapp_access_token'),
  emailConnected: boolean('email_connected').default(false).notNull(),
  emailMode: text('email_mode').default('demo').notNull(),
  emailProvider: text('email_provider').default('gmail_smtp').notNull(),
  emailFromAddress: text('email_from_address'),
  emailFromName: text('email_from_name'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpUser: text('smtp_user'),
  smtpPass: text('smtp_pass'),
  emailApiKey: text('email_api_key'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contactGroups = pgTable('contact_groups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  groupIds: jsonb('group_ids').$type<number[]>().default([]).notNull(),
  whatsappOptIn: boolean('whatsapp_opt_in').default(false).notNull(),
  emailOptIn: boolean('email_opt_in').default(false).notNull(),
  whatsappOptOutAt: timestamp('whatsapp_opt_out_at'),
  emailUnsubscribedAt: timestamp('email_unsubscribed_at'),
  suppressedEmail: boolean('suppressed_email').default(false).notNull(),
  source: text('source').default('manual').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  channel: text('channel').notNull(),
  templateCategory: text('template_category').default('draft').notNull(),
  metaTemplateName: text('meta_template_name'),
  metaLanguage: text('meta_language').default('en_US'),
  metaApprovalStatus: text('meta_approval_status').default('approved'),
  subject: text('subject'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  channel: text('channel').notNull(),
  fromEmail: text('from_email'),
  subject: text('subject'),
  body: text('body').notNull(),
  templateId: integer('template_id'),
  executionMode: text('execution_mode').default('demo').notNull(),
  status: text('status').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  deliveredCount: integer('delivered_count').default(0).notNull(),
  readCount: integer('read_count').default(0).notNull(),
  bouncedCount: integer('bounced_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const campaignRecipients = pgTable('campaign_recipients', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  contactName: text('contact_name').notNull(),
  destination: text('destination').notNull(),
  renderedBody: text('rendered_body').notNull(),
  status: text('status').notNull(),
  providerMessageId: text('provider_message_id'),
  errorMessage: text('error_message'),
  isSimulated: boolean('is_simulated').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  action: text('action').notNull(),
  channel: text('channel'),
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  integration: one(integrations, {
    fields: [users.id],
    references: [integrations.userId],
  }),
  contactGroups: many(contactGroups),
  contacts: many(contacts),
  templates: many(templates),
  campaigns: many(campaigns),
  auditLogs: many(auditLogs),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  recipients: many(campaignRecipients),
}));

export const campaignRecipientsRelations = relations(campaignRecipients, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignRecipients.campaignId],
    references: [campaigns.id],
  }),
}));
