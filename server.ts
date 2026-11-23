import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  users,
  integrations,
  contactGroups,
  contacts,
  templates,
  campaigns,
  campaignRecipients,
  auditLogs,
} from './src/db/schema.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  executeCampaignById,
  markContactUnsubscribed,
  normalizePhoneE164,
  personalizeMessage,
  processDueScheduledCampaigns,
  sendEmailMessage,
  sendWhatsAppMessage,
} from './src/services/messaging.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));

function getAppBaseUrl(req: express.Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function resolveDbUser(req: AuthRequest) {
  const uid = req.user!.uid;
  const email = req.user!.email || `${uid}@connectflow.local`;
  const name = (req.user!.name as string | undefined) || undefined;
  return getOrCreateUser(uid, email, name);
}

function sanitizeIntegration(row: typeof integrations.$inferSelect | undefined) {
  if (!row) {
    return {
      whatsappConnected: false,
      whatsappMode: 'demo',
      whatsappBusinessAccountId: '',
      whatsappPhoneNumberId: '',
      whatsappDisplayPhone: '',
      hasWhatsappToken: false,
      emailConnected: false,
      emailMode: 'demo',
      emailProvider: 'gmail_smtp',
      emailFromAddress: '',
      emailFromName: '',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpUser: '',
      hasSmtpPass: false,
      hasEmailApiKey: false,
    };
  }
  return {
    whatsappConnected: row.whatsappConnected,
    whatsappMode: row.whatsappMode,
    whatsappBusinessAccountId: row.whatsappBusinessAccountId || '',
    whatsappPhoneNumberId: row.whatsappPhoneNumberId || '',
    whatsappDisplayPhone: row.whatsappDisplayPhone || '',
    hasWhatsappToken: Boolean(row.whatsappAccessToken),
    emailConnected: row.emailConnected,
    emailMode: row.emailMode,
    emailProvider: row.emailProvider,
    emailFromAddress: row.emailFromAddress || '',
    emailFromName: row.emailFromName || '',
    smtpHost: row.smtpHost || 'smtp.gmail.com',
    smtpPort: row.smtpPort || 465,
    smtpUser: row.smtpUser || '',
    hasSmtpPass: Boolean(row.smtpPass),
    hasEmailApiKey: Boolean(row.emailApiKey),
  };
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public One-Click Unsubscribe Endpoint
app.get('/api/unsubscribe', async (req, res) => {
  const contactId = Number(req.query.cid);
  const userId = Number(req.query.u);
  if (!contactId || !userId) {
    return res.status(400).send('Invalid unsubscribe link.');
  }
  await markContactUnsubscribed(contactId, userId, 'email');
  await db.insert(auditLogs).values({
    userId,
    action: 'contact_unsubscribed',
    channel: 'email',
    details: `Contact #${contactId} unsubscribed via email footer link.`,
  });
  res.send(`<!doctype html><html><head><title>Unsubscribed — ConnectFlow</title></head><body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px;color:#1e293b;border:1px solid #e2e8f0;border-radius:12px;"><h2 style="margin-top:0;">You have been unsubscribed</h2><p style="color:#475569;line-height:1.6;">Your email address has been removed from future marketing campaigns and added to our suppression list.</p></body></html>`);
});

// Public WhatsApp Business Cloud API Webhook
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'connectflow_verify_token';
  if (mode === 'subscribe' && token === expectedToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};
        const statuses = value?.statuses || [];
        for (const st of statuses) {
          const msgId = st.id;
          const nextState = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
          if (!msgId || !nextState) continue;
          const [rec] = await db
            .select()
            .from(campaignRecipients)
            .where(eq(campaignRecipients.providerMessageId, msgId))
            .limit(1);

          if (rec) {
            await db
              .update(campaignRecipients)
              .set({
                status: nextState,
                errorMessage: st.errors?.[0]?.title || rec.errorMessage,
                updatedAt: new Date(),
              })
              .where(eq(campaignRecipients.id, rec.id));

            // Recompute campaign aggregates
            const allRecs = await db
              .select()
              .from(campaignRecipients)
              .where(eq(campaignRecipients.campaignId, rec.campaignId));

            const deliveredCount = allRecs.filter((r) => r.status === 'delivered' || r.status === 'read').length;
            const readCount = allRecs.filter((r) => r.status === 'read').length;
            const failedCount = allRecs.filter((r) => r.status === 'failed').length;
            await db
              .update(campaigns)
              .set({ deliveredCount, readCount, failedCount })
              .where(eq(campaigns.id, rec.campaignId));
          }
        }

        // Handle incoming STOP opt-out message
        const incoming = value?.messages || [];
        for (const msg of incoming) {
          const textBody = String(msg?.text?.body || '').trim().toUpperCase();
          if (textBody === 'STOP' || textBody === 'UNSUBSCRIBE') {
            const fromPhone = normalizePhoneE164(String(msg.from || ''));
            if (fromPhone) {
              await db
                .update(contacts)
                .set({ whatsappOptIn: false, whatsappOptOutAt: new Date() })
                .where(eq(contacts.phone, fromPhone));
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.sendStatus(500);
  }
});

// Authenticated User Profile & Preferences
app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    res.json({
      user: dbUser,
      integrations: sanitizeIntegration(integration),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
});

app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const {
      displayName,
      companyName,
      notifyCampaignComplete,
      notifyDeliveryFailures,
      dailySendLimit,
    } = req.body;

    const updated = await db
      .update(users)
      .set({
        ...(displayName !== undefined ? { displayName: String(displayName).trim() } : {}),
        ...(companyName !== undefined ? { companyName: String(companyName).trim() } : {}),
        ...(notifyCampaignComplete !== undefined ? { notifyCampaignComplete: Boolean(notifyCampaignComplete) } : {}),
        ...(notifyDeliveryFailures !== undefined ? { notifyDeliveryFailures: Boolean(notifyDeliveryFailures) } : {}),
        ...(dailySendLimit !== undefined
          ? { dailySendLimit: Math.max(10, Math.min(10000, Number(dailySendLimit) || 500)) }
          : {}),
      })
      .where(eq(users.id, dbUser.id))
      .returning();

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'settings_updated',
      details: 'Updated workspace profile and notification preferences.',
    });

    res.json({ user: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

// Integrations: WhatsApp Business API & Email Provider
app.get('/api/integrations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    res.json({ integrations: sanitizeIntegration(integration) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load integrations' });
  }
});

app.put('/api/integrations/whatsapp', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const {
      mode,
      businessAccountId,
      phoneNumberId,
      displayPhone,
      accessToken,
      disconnect,
    } = req.body;

    if (disconnect) {
      const updated = await db
        .update(integrations)
        .set({
          whatsappConnected: false,
          whatsappMode: 'demo',
          whatsappAccessToken: null,
          updatedAt: new Date(),
        })
        .where(eq(integrations.userId, dbUser.id))
        .returning();

      await db.insert(auditLogs).values({
        userId: dbUser.id,
        action: 'whatsapp_disconnected',
        channel: 'whatsapp',
        details: 'Disconnected WhatsApp Business API credentials.',
      });

      return res.json({ integrations: sanitizeIntegration(updated[0]) });
    }

    const nextMode = mode === 'live' ? 'live' : 'demo';
    if (nextMode === 'live' && (!phoneNumberId || (!accessToken && !req.body.keepExistingToken))) {
      const [existing] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.userId, dbUser.id))
        .limit(1);
      if (!existing?.whatsappAccessToken && !accessToken) {
        return res.status(400).json({
          error: 'Phone Number ID and Permanent Access Token are required for Live WhatsApp Cloud API mode.',
        });
      }
    }

    const [existing] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    const updated = await db
      .update(integrations)
      .set({
        whatsappConnected: true,
        whatsappMode: nextMode,
        whatsappBusinessAccountId: businessAccountId ?? existing?.whatsappBusinessAccountId ?? null,
        whatsappPhoneNumberId: phoneNumberId ?? existing?.whatsappPhoneNumberId ?? null,
        whatsappDisplayPhone: displayPhone ?? existing?.whatsappDisplayPhone ?? null,
        ...(accessToken ? { whatsappAccessToken: String(accessToken).trim() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(integrations.userId, dbUser.id))
      .returning();

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'whatsapp_connected',
      channel: 'whatsapp',
      details: `Configured WhatsApp Business in ${nextMode.toUpperCase()} mode.`,
    });

    res.json({ integrations: sanitizeIntegration(updated[0]) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update WhatsApp settings' });
  }
});

app.put('/api/integrations/email', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const {
      mode,
      provider,
      fromAddress,
      fromName,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      apiKey,
      disconnect,
    } = req.body;

    if (disconnect) {
      const updated = await db
        .update(integrations)
        .set({
          emailConnected: false,
          emailMode: 'demo',
          smtpPass: null,
          emailApiKey: null,
          updatedAt: new Date(),
        })
        .where(eq(integrations.userId, dbUser.id))
        .returning();

      await db.insert(auditLogs).values({
        userId: dbUser.id,
        action: 'email_disconnected',
        channel: 'email',
        details: 'Disconnected email provider credentials.',
      });

      return res.json({ integrations: sanitizeIntegration(updated[0]) });
    }

    if (!fromAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fromAddress).trim())) {
      return res.status(400).json({ error: 'Please enter a valid sender email address.' });
    }

    const nextMode = mode === 'live' ? 'live' : 'demo';
    const nextProvider = provider || 'gmail_smtp';
    const [existing] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    if (nextMode === 'live') {
      if (nextProvider === 'resend') {
        if (!apiKey && !existing?.emailApiKey) {
          return res.status(400).json({ error: 'Resend API Key is required for Live Resend mode.' });
        }
      } else {
        const finalHost = smtpHost || existing?.smtpHost || (nextProvider === 'gmail_smtp' ? 'smtp.gmail.com' : '');
        const finalUser = smtpUser || fromAddress;
        if (!finalHost || !finalUser || (!smtpPass && !existing?.smtpPass)) {
          return res.status(400).json({
            error: 'SMTP Host, Username, and App Password / SMTP Password are required for Live SMTP mode.',
          });
        }
      }
    }

    const updated = await db
      .update(integrations)
      .set({
        emailConnected: true,
        emailMode: nextMode,
        emailProvider: nextProvider,
        emailFromAddress: String(fromAddress).trim(),
        emailFromName: fromName ? String(fromName).trim() : dbUser.displayName,
        smtpHost:
          smtpHost ||
          (nextProvider === 'gmail_smtp' ? 'smtp.gmail.com' : existing?.smtpHost || null),
        smtpPort: Number(smtpPort) || (nextProvider === 'gmail_smtp' ? 465 : existing?.smtpPort || 587),
        smtpUser: smtpUser || String(fromAddress).trim(),
        ...(smtpPass ? { smtpPass: String(smtpPass).trim() } : {}),
        ...(apiKey ? { emailApiKey: String(apiKey).trim() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(integrations.userId, dbUser.id))
      .returning();

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'email_connected',
      channel: 'email',
      details: `Connected sender email ${fromAddress} (${nextProvider}, ${nextMode.toUpperCase()} mode).`,
    });

    res.json({ integrations: sanitizeIntegration(updated[0]) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update email connection' });
  }
});

// Dashboard Summary
app.get('/api/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    await processDueScheduledCampaigns(dbUser.id, getAppBaseUrl(req));

    const userContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, dbUser.id));

    const userCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, dbUser.id))
      .orderBy(desc(campaigns.createdAt));

    const recentLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, dbUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8);

    const whatsappSent = userCampaigns
      .filter((c) => c.channel === 'whatsapp')
      .reduce((acc, c) => acc + c.sentCount, 0);

    const emailsSent = userCampaigns
      .filter((c) => c.channel === 'email')
      .reduce((acc, c) => acc + c.sentCount, 0);

    const successfulDeliveries = userCampaigns.reduce(
      (acc, c) => acc + Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount),
      0
    );

    const failedMessages = userCampaigns.reduce(
      (acc, c) => acc + c.failedCount + c.bouncedCount,
      0
    );

    const waCampaigns = userCampaigns.filter((c) => c.channel === 'whatsapp');
    const emailCampaigns = userCampaigns.filter((c) => c.channel === 'email');

    const whatsappDelivered = waCampaigns.reduce(
      (acc, c) => acc + Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount),
      0
    );
    const emailDelivered = emailCampaigns.reduce(
      (acc, c) => acc + Math.max(c.deliveredCount, c.sentCount - c.failedCount - c.bouncedCount),
      0
    );

    res.json({
      stats: {
        totalContacts: userContacts.length,
        whatsappOptedIn: userContacts.filter((c) => c.whatsappOptIn && !c.whatsappOptOutAt).length,
        emailOptedIn: userContacts.filter((c) => c.emailOptIn && !c.suppressedEmail && !c.emailUnsubscribedAt).length,
        whatsappSent,
        emailsSent,
        successfulDeliveries,
        failedMessages,
      },
      channelBreakdown: {
        whatsappDelivered,
        emailDelivered,
        scheduledCount: userCampaigns.filter((c) => c.status === 'scheduled' || c.status === 'paused').length,
        suppressedCount: userContacts.filter((c) => c.suppressedEmail || Boolean(c.emailUnsubscribedAt)).length,
        whatsappOptOutCount: userContacts.filter((c) => Boolean(c.whatsappOptOutAt)).length,
      },
      recentCampaigns: userCampaigns.slice(0, 8),
      recentActivity: recentLogs,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load dashboard' });
  }
});

// Test Channel Connection (Live API / SMTP verification)
app.post('/api/integrations/test-connection', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const channel = req.body.channel === 'email' ? 'email' : 'whatsapp';
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    if (channel === 'whatsapp') {
      if (!integration?.whatsappConnected || integration.whatsappMode !== 'live') {
        return res.json({
          ok: true,
          mode: 'demo',
          details: 'Demo Mode active — WhatsApp dispatches are safely simulated.',
        });
      }
      if (!integration.whatsappPhoneNumberId || !integration.whatsappAccessToken) {
        return res.status(400).json({ error: 'Missing WhatsApp Phone Number ID or Access Token.' });
      }
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${integration.whatsappPhoneNumberId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${integration.whatsappAccessToken}` } }
      );
      const data: any = await resp.json();
      if (!resp.ok) {
        return res.status(400).json({
          error: data?.error?.message || `Meta Graph API returned HTTP ${resp.status}`,
        });
      }
      return res.json({
        ok: true,
        mode: 'live',
        details: `Verified Meta number: ${data.display_phone_number || integration.whatsappPhoneNumberId}${data.verified_name ? ` (${data.verified_name})` : ''}`,
      });
    }

    // Email verification
    if (!integration?.emailConnected) {
      return res.status(400).json({ error: 'Email sender not configured yet.' });
    }
    if (integration.emailMode !== 'live') {
      return res.json({
        ok: true,
        mode: 'demo',
        details: `Demo Mode active for sender ${integration.emailFromAddress}.`,
      });
    }
    if (integration.emailProvider === 'resend') {
      if (!integration.emailApiKey) {
        return res.status(400).json({ error: 'Missing Resend API key.' });
      }
      const resp = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${integration.emailApiKey}` },
      });
      if (!resp.ok) {
        return res.status(400).json({ error: `Resend API verification failed (${resp.status})` });
      }
      return res.json({
        ok: true,
        mode: 'live',
        details: `Resend API key verified for ${integration.emailFromAddress}.`,
      });
    }

    const port = integration.smtpPort || 465;
    const transporter = nodemailer.createTransport({
      host: integration.smtpHost || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: integration.smtpUser || integration.emailFromAddress || '',
        pass: integration.smtpPass || '',
      },
    });
    await transporter.verify();
    return res.json({
      ok: true,
      mode: 'live',
      details: `SMTP handshake verified on ${integration.smtpHost || 'smtp.gmail.com'}:${port}.`,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Connection test failed' });
  }
});

// Contact Groups
app.get('/api/groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const rows = await db
      .select()
      .from(contactGroups)
      .where(eq(contactGroups.userId, dbUser.id));
    res.json({ groups: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

app.post('/api/groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    const [created] = await db
      .insert(contactGroups)
      .values({
        userId: dbUser.id,
        name,
        description: req.body.description ? String(req.body.description).trim() : null,
        isDefault: false,
      })
      .returning();

    res.status(201).json({ group: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create group' });
  }
});

app.delete('/api/groups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    await db
      .delete(contactGroups)
      .where(and(eq(contactGroups.id, id), eq(contactGroups.userId, dbUser.id)));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete group' });
  }
});

// Contacts CRUD + Import
app.get('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, dbUser.id))
      .orderBy(desc(contacts.createdAt));
    res.json({ contacts: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch contacts' });
  }
});

app.post('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const name = String(req.body.name || '').trim();
    const phone = req.body.phone ? normalizePhoneE164(String(req.body.phone)) : null;
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;

    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: 'Provide at least a phone number or email address' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const tags = Array.isArray(req.body.tags)
      ? req.body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];
    const groupIds = Array.isArray(req.body.groupIds)
      ? req.body.groupIds.map((id: unknown) => Number(id)).filter(Boolean)
      : [];

    const [created] = await db
      .insert(contacts)
      .values({
        userId: dbUser.id,
        name,
        phone: phone || null,
        email: email || null,
        tags,
        groupIds,
        whatsappOptIn: Boolean(req.body.whatsappOptIn),
        emailOptIn: Boolean(req.body.emailOptIn),
        source: 'manual',
      })
      .returning();

    res.status(201).json({ contact: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create contact' });
  }
});

app.patch('/api/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const {
      name,
      phone,
      email,
      tags,
      groupIds,
      whatsappOptIn,
      emailOptIn,
      suppressedEmail,
    } = req.body;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const updated = await db
      .update(contacts)
      .set({
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(phone !== undefined ? { phone: phone ? normalizePhoneE164(String(phone)) : null } : {}),
        ...(email !== undefined ? { email: email ? String(email).trim().toLowerCase() : null } : {}),
        ...(Array.isArray(tags) ? { tags: tags.map((t: unknown) => String(t).trim()).filter(Boolean) } : {}),
        ...(Array.isArray(groupIds) ? { groupIds: groupIds.map((g: unknown) => Number(g)).filter(Boolean) } : {}),
        ...(whatsappOptIn !== undefined
          ? {
              whatsappOptIn: Boolean(whatsappOptIn),
              whatsappOptOutAt: Boolean(whatsappOptIn) ? null : new Date(),
            }
          : {}),
        ...(emailOptIn !== undefined
          ? {
              emailOptIn: Boolean(emailOptIn),
              emailUnsubscribedAt: Boolean(emailOptIn) ? null : new Date(),
              ...(Boolean(emailOptIn) ? { suppressedEmail: false } : {}),
            }
          : {}),
        ...(suppressedEmail !== undefined ? { suppressedEmail: Boolean(suppressedEmail) } : {}),
      })
      .where(and(eq(contacts.id, id), eq(contacts.userId, dbUser.id)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({ contact: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update contact' });
  }
});

app.delete('/api/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    await db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, dbUser.id)));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete contact' });
  }
});

app.post('/api/contacts/import', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const rows: any[] = Array.isArray(req.body.contacts) ? req.body.contacts : [];
    const source = req.body.source === 'excel' ? 'excel' : 'csv';
    const defaultGroupIds = Array.isArray(req.body.groupIds)
      ? req.body.groupIds.map((id: unknown) => Number(id)).filter(Boolean)
      : [];

    if (!rows.length) {
      return res.status(400).json({ error: 'No contacts found in file' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecords: (typeof contacts.$inferInsert)[] = [];
    let skipped = 0;

    for (const r of rows) {
      const name = String(r.name || '').trim();
      const phone = r.phone ? normalizePhoneE164(String(r.phone)) : null;
      const email = r.email ? String(r.email).trim().toLowerCase() : null;
      if (!name || (!phone && !email)) {
        skipped++;
        continue;
      }
      if (email && !emailRegex.test(email)) {
        skipped++;
        continue;
      }

      const tags = Array.isArray(r.tags)
        ? r.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
        : String(r.tags || '')
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean);

      // Important: Do NOT automatically treat imported contacts as opted-in recipients!
      validRecords.push({
        userId: dbUser.id,
        name,
        phone: phone || null,
        email: email || null,
        tags,
        groupIds: defaultGroupIds,
        whatsappOptIn: false,
        emailOptIn: false,
        source,
      });
    }

    if (!validRecords.length) {
      return res.status(400).json({
        error: 'No valid contact rows could be imported. Ensure each row has a name and valid phone or email.',
      });
    }

    const inserted = await db.insert(contacts).values(validRecords).returning();

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'contacts_imported',
      details: `Imported ${inserted.length} contacts via ${source.toUpperCase()} (${skipped} invalid rows skipped). Consent defaulted to opted-out.`,
    });

    res.status(201).json({
      importedCount: inserted.length,
      skippedCount: skipped,
      contacts: inserted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to import contacts' });
  }
});

app.post('/api/contacts/bulk-action', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const ids: number[] = Array.isArray(req.body.ids)
      ? req.body.ids.map((id: unknown) => Number(id)).filter(Boolean)
      : [];
    const action = String(req.body.action || '');
    const groupId = req.body.groupId ? Number(req.body.groupId) : null;

    if (!ids.length) {
      return res.status(400).json({ error: 'Select at least one contact.' });
    }

    if (action === 'delete') {
      await db
        .delete(contacts)
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
      return res.json({ ok: true, updatedCount: ids.length });
    }

    if (action === 'whatsapp_opt_in') {
      await db
        .update(contacts)
        .set({ whatsappOptIn: true, whatsappOptOutAt: null })
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
    } else if (action === 'whatsapp_opt_out') {
      await db
        .update(contacts)
        .set({ whatsappOptIn: false, whatsappOptOutAt: new Date() })
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
    } else if (action === 'email_opt_in') {
      await db
        .update(contacts)
        .set({ emailOptIn: true, emailUnsubscribedAt: null, suppressedEmail: false })
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
    } else if (action === 'email_opt_out') {
      await db
        .update(contacts)
        .set({ emailOptIn: false, emailUnsubscribedAt: new Date() })
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
    } else if (action === 'add_group' && groupId) {
      const targetRows = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));
      for (const row of targetRows) {
        const nextGroups = Array.from(new Set([...(row.groupIds || []), groupId]));
        await db
          .update(contacts)
          .set({ groupIds: nextGroups })
          .where(eq(contacts.id, row.id));
      }
    } else {
      return res.status(400).json({ error: 'Unsupported bulk action.' });
    }

    const refreshed = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));

    res.json({ ok: true, contacts: refreshed });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Bulk action failed' });
  }
});

app.get('/api/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) {
      return res.json({ contacts: [], campaigns: [], templates: [] });
    }
    const [allContacts, allCampaigns, allTemplates] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.userId, dbUser.id)),
      db.select().from(campaigns).where(eq(campaigns.userId, dbUser.id)).orderBy(desc(campaigns.createdAt)),
      db.select().from(templates).where(eq(templates.userId, dbUser.id)),
    ]);

    res.json({
      contacts: allContacts
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q)
        )
        .slice(0, 5),
      campaigns: allCampaigns
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 5),
      templates: allTemplates
        .filter((t) => t.name.toLowerCase().includes(q))
        .slice(0, 5),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Search failed' });
  }
});

// Templates CRUD
app.get('/api/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, dbUser.id))
      .orderBy(desc(templates.updatedAt));
    res.json({ templates: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch templates' });
  }
});

app.post('/api/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const {
      name,
      channel,
      templateCategory,
      metaTemplateName,
      metaLanguage,
      metaApprovalStatus,
      subject,
      body,
    } = req.body;

    if (!name || !channel || !body) {
      return res.status(400).json({ error: 'Name, channel, and message body are required' });
    }

    const [created] = await db
      .insert(templates)
      .values({
        userId: dbUser.id,
        name: String(name).trim(),
        channel: channel === 'email' ? 'email' : 'whatsapp',
        templateCategory:
          channel === 'whatsapp' && templateCategory === 'whatsapp_approved'
            ? 'whatsapp_approved'
            : 'draft',
        metaTemplateName: metaTemplateName ? String(metaTemplateName).trim() : null,
        metaLanguage: metaLanguage ? String(metaLanguage).trim() : 'en_US',
        metaApprovalStatus: metaApprovalStatus || (templateCategory === 'whatsapp_approved' ? 'approved' : 'draft'),
        subject: subject ? String(subject).trim() : null,
        body: String(body),
      })
      .returning();

    res.status(201).json({ template: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save template' });
  }
});

app.patch('/api/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const {
      name,
      templateCategory,
      metaTemplateName,
      metaLanguage,
      metaApprovalStatus,
      subject,
      body,
    } = req.body;

    const updated = await db
      .update(templates)
      .set({
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(templateCategory !== undefined ? { templateCategory } : {}),
        ...(metaTemplateName !== undefined ? { metaTemplateName } : {}),
        ...(metaLanguage !== undefined ? { metaLanguage } : {}),
        ...(metaApprovalStatus !== undefined ? { metaApprovalStatus } : {}),
        ...(subject !== undefined ? { subject } : {}),
        ...(body !== undefined ? { body: String(body) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(templates.id, id), eq(templates.userId, dbUser.id)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

app.delete('/api/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    await db
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, dbUser.id)));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// Campaigns + Test Sends
app.post('/api/campaigns/test-send', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const { channel, destination, subject, body, fromEmail } = req.body;
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    if (channel === 'whatsapp') {
      const rendered = personalizeMessage(String(body || ''), {
        name: dbUser.displayName || 'Test Recipient',
        phone: String(destination || ''),
      });
      const result = await sendWhatsAppMessage({
        integration,
        toPhone: String(destination || ''),
        body: rendered,
      });
      if (!result.success) {
        return res.status(400).json({ error: result.errorMessage || 'Test WhatsApp send failed' });
      }
      return res.json({
        ok: true,
        simulated: result.simulated,
        messageId: result.providerMessageId,
      });
    }

    const sender = fromEmail || integration?.emailFromAddress;
    if (!sender) {
      return res.status(400).json({
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Please connect or provide a sender email address first.',
      });
    }

    const rendered = personalizeMessage(String(body || ''), {
      name: dbUser.displayName || 'Test Recipient',
      email: String(destination || ''),
    });
    const result = await sendEmailMessage({
      integration,
      fromEmail: sender,
      toEmail: String(destination || ''),
      subject: personalizeMessage(String(subject || 'ConnectFlow Test Email'), {
        name: dbUser.displayName || 'Test Recipient',
        email: String(destination || ''),
      }),
      htmlBody: rendered,
    });
    if (!result.success) {
      return res.status(400).json({ error: result.errorMessage || 'Test email send failed' });
    }
    return res.json({
      ok: true,
      simulated: result.simulated,
      messageId: result.providerMessageId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Test send failed' });
  }
});

app.get('/api/campaigns', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    await processDueScheduledCampaigns(dbUser.id, getAppBaseUrl(req));
    const rows = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, dbUser.id))
      .orderBy(desc(campaigns.createdAt));
    res.json({ campaigns: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
});

app.get('/api/campaigns/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, dbUser.id)))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const recipients = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaign.id));

    res.json({ campaign, recipients });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch campaign details' });
  }
});

app.post('/api/campaigns', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const {
      name,
      channel,
      fromEmail,
      subject,
      body,
      templateId,
      contactIds,
      scheduledAt,
      idempotencyKey,
    } = req.body;

    if (!name || !channel || !body) {
      return res.status(400).json({ error: 'Campaign name, channel, and message body are required' });
    }

    if (idempotencyKey) {
      const existing = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.userId, dbUser.id),
            eq(campaigns.idempotencyKey, String(idempotencyKey))
          )
        )
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({
          error: 'Duplicate campaign submission prevented.',
          campaign: existing[0],
        });
      }
    }

    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, dbUser.id))
      .limit(1);

    if (channel === 'email' && !fromEmail && !integration?.emailFromAddress) {
      return res.status(400).json({
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Connect a sender email address before sending an email campaign.',
      });
    }

    const ids: number[] = Array.isArray(contactIds)
      ? contactIds.map((id: unknown) => Number(id)).filter(Boolean)
      : [];

    if (!ids.length) {
      return res.status(400).json({ error: 'Select at least one opted-in recipient' });
    }

    const selectedContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.userId, dbUser.id), inArray(contacts.id, ids)));

    // Enforce strict per-channel opt-in and suppression list!
    const eligibleContacts = selectedContacts.filter((c) => {
      if (channel === 'whatsapp') {
        return c.whatsappOptIn && !c.whatsappOptOutAt && Boolean(c.phone);
      }
      return c.emailOptIn && !c.suppressedEmail && !c.emailUnsubscribedAt && Boolean(c.email);
    });

    if (!eligibleContacts.length) {
      return res.status(400).json({
        error: `None of the selected contacts are eligible or opted-in for ${channel === 'whatsapp' ? 'WhatsApp' : 'Email'}.`,
      });
    }

    if (eligibleContacts.length > dbUser.dailySendLimit) {
      return res.status(400).json({
        error: `Recipient count (${eligibleContacts.length}) exceeds your configured daily limit (${dbUser.dailySendLimit}).`,
      });
    }

    const isScheduled = Boolean(scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000);
    const executionMode =
      channel === 'whatsapp'
        ? integration?.whatsappConnected && integration.whatsappMode === 'live'
          ? 'live'
          : 'demo'
        : integration?.emailConnected && integration.emailMode === 'live'
          ? 'live'
          : 'demo';

    const [created] = await db
      .insert(campaigns)
      .values({
        userId: dbUser.id,
        name: String(name).trim(),
        channel: channel === 'email' ? 'email' : 'whatsapp',
        fromEmail:
          channel === 'email'
            ? String(fromEmail || integration?.emailFromAddress || dbUser.email).trim()
            : null,
        subject: channel === 'email' ? String(subject || 'Update from ConnectFlow') : null,
        body: String(body),
        templateId: templateId ? Number(templateId) : null,
        executionMode,
        status: isScheduled ? 'scheduled' : 'sending',
        scheduledAt: isScheduled ? new Date(scheduledAt) : null,
        totalRecipients: eligibleContacts.length,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
      })
      .returning();

    await db.insert(campaignRecipients).values(
      eligibleContacts.map((c) => ({
        campaignId: created.id,
        contactId: c.id,
        contactName: c.name,
        destination: channel === 'whatsapp' ? c.phone! : c.email!,
        renderedBody: personalizeMessage(String(body), c),
        status: 'queued',
        isSimulated: executionMode === 'demo',
      }))
    );

    const appBaseUrl = getAppBaseUrl(req);
    if (isScheduled) {
      await db.insert(auditLogs).values({
        userId: dbUser.id,
        action: 'campaign_scheduled',
        channel: created.channel,
        details: `Scheduled "${created.name}" for ${eligibleContacts.length} recipients at ${new Date(scheduledAt).toLocaleString()}.`,
      });
      const delayMs = new Date(scheduledAt).getTime() - Date.now();
      if (delayMs > 0 && delayMs < 24 * 60 * 60 * 1000) {
        setTimeout(() => {
          void executeCampaignById(created.id, appBaseUrl);
        }, delayMs);
      }
      return res.status(201).json({ campaign: created });
    }

    await executeCampaignById(created.id, appBaseUrl);
    const [completed] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, created.id))
      .limit(1);

    res.status(201).json({ campaign: completed || created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create campaign' });
  }
});

app.post('/api/campaigns/:id/duplicate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const [orig] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, dbUser.id)))
      .limit(1);

    if (!orig) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const origRecipients = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, orig.id));

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [dup] = await db
      .insert(campaigns)
      .values({
        userId: dbUser.id,
        name: `${orig.name} (Copy)`,
        channel: orig.channel,
        fromEmail: orig.fromEmail,
        subject: orig.subject,
        body: orig.body,
        templateId: orig.templateId,
        executionMode: orig.executionMode,
        status: 'scheduled',
        scheduledAt: futureDate,
        totalRecipients: origRecipients.length,
      })
      .returning();

    if (origRecipients.length > 0) {
      await db.insert(campaignRecipients).values(
        origRecipients.map((r) => ({
          campaignId: dup.id,
          contactId: r.contactId,
          contactName: r.contactName,
          destination: r.destination,
          renderedBody: r.renderedBody,
          status: 'queued',
          isSimulated: dup.executionMode === 'demo',
        }))
      );
    }

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'campaign_duplicated',
      channel: dup.channel,
      details: `Duplicated "${orig.name}" as "${dup.name}" (scheduled for review).`,
    });

    res.status(201).json({ campaign: dup });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to duplicate campaign' });
  }
});

app.post('/api/campaigns/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const nextStatus = req.body.status;
    if (!['paused', 'scheduled', 'cancelled', 'run_now'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid status transition' });
    }

    if (nextStatus === 'run_now') {
      await executeCampaignById(id, getAppBaseUrl(req));
      const [updated] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.userId, dbUser.id)))
        .limit(1);
      return res.json({ campaign: updated });
    }

    const updated = await db
      .update(campaigns)
      .set({ status: nextStatus })
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, dbUser.id)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: `campaign_${nextStatus}`,
      channel: updated[0].channel,
      details: `Updated "${updated[0].name}" status to ${nextStatus}.`,
    });

    res.json({ campaign: updated[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update campaign status' });
  }
});

// Retry only failed / bounced recipients on an existing campaign
app.post('/api/campaigns/:id/retry-failed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const id = Number(req.params.id);
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, dbUser.id)))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const retryRows = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.campaignId, id),
          inArray(campaignRecipients.status, ['failed', 'bounced'])
        )
      );

    if (!retryRows.length) {
      return res.status(400).json({ error: 'No failed or bounced recipients to retry.' });
    }

    await db
      .update(campaignRecipients)
      .set({ status: 'queued', errorMessage: null, updatedAt: new Date() })
      .where(
        and(
          eq(campaignRecipients.campaignId, id),
          inArray(campaignRecipients.status, ['failed', 'bounced'])
        )
      );

    await db
      .update(campaigns)
      .set({ status: 'sending' })
      .where(eq(campaigns.id, id));

    await executeCampaignById(id, getAppBaseUrl(req));

    const [updatedCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);

    const updatedRecipients = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id));

    await db.insert(auditLogs).values({
      userId: dbUser.id,
      action: 'campaign_retried',
      channel: campaign.channel,
      details: `Retried ${retryRows.length} failed/bounced recipient(s) on "${campaign.name}".`,
    });

    res.json({ campaign: updatedCampaign, recipients: updatedRecipients });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Retry failed' });
  }
});

app.get('/api/audit-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = await resolveDbUser(req);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, dbUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    res.json({ logs: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ConnectFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
