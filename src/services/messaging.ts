import nodemailer from 'nodemailer';
import { eq, and, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  campaigns,
  campaignRecipients,
  contacts,
  integrations,
  auditLogs,
  templates,
} from '../db/schema.ts';

export function personalizeMessage(
  template: string,
  contact: { name: string; phone?: string | null; email?: string | null }
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name || 'Friend')
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email || '');
}

export function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export async function sendWhatsAppMessage(params: {
  integration: typeof integrations.$inferSelect | undefined;
  toPhone: string;
  body: string;
  metaTemplateName?: string | null;
  metaLanguage?: string | null;
  templateParams?: string[];
}): Promise<{
  success: boolean;
  simulated: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}> {
  const { integration, toPhone, body, metaTemplateName, metaLanguage, templateParams } = params;
  const formattedPhone = normalizePhoneE164(toPhone);
  if (!formattedPhone || formattedPhone.length < 8) {
    return {
      success: false,
      simulated: !integration?.whatsappConnected || integration.whatsappMode !== 'live',
      errorMessage: 'Invalid phone number format',
    };
  }

  const isLive =
    Boolean(integration?.whatsappConnected) &&
    integration?.whatsappMode === 'live' &&
    Boolean(integration?.whatsappPhoneNumberId) &&
    Boolean(integration?.whatsappAccessToken);

  if (!isLive) {
    // Clearly labelled Demo Mode simulation
    await new Promise((r) => setTimeout(r, 40));
    return {
      success: true,
      simulated: true,
      providerMessageId: `sim_wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  try {
    const recipientDigits = formattedPhone.replace(/^\+/, '');
    const url = `https://graph.facebook.com/v21.0/${integration!.whatsappPhoneNumberId}/messages`;

    const payload = metaTemplateName
      ? {
          messaging_product: 'whatsapp',
          to: recipientDigits,
          type: 'template',
          template: {
            name: metaTemplateName,
            language: { code: metaLanguage || 'en_US' },
            ...(templateParams && templateParams.length > 0
              ? {
                  components: [
                    {
                      type: 'body',
                      parameters: templateParams.map((val) => ({
                        type: 'text',
                        text: val,
                      })),
                    },
                  ],
                }
              : {}),
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientDigits,
          type: 'text',
          text: { preview_url: false, body },
        };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration!.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();
    if (!response.ok) {
      return {
        success: false,
        simulated: false,
        errorMessage: data?.error?.message || `WhatsApp API error (${response.status})`,
      };
    }

    return {
      success: true,
      simulated: false,
      providerMessageId: data?.messages?.[0]?.id || `wa_${Date.now()}`,
    };
  } catch (err: any) {
    return {
      success: false,
      simulated: false,
      errorMessage: err?.message || 'WhatsApp network request failed',
    };
  }
}

export async function sendEmailMessage(params: {
  integration: typeof integrations.$inferSelect | undefined;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  unsubscribeUrl?: string;
}): Promise<{
  success: boolean;
  simulated: boolean;
  bounced?: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}> {
  const { integration, fromEmail, toEmail, subject, htmlBody, unsubscribeUrl } = params;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(toEmail)) {
    return {
      success: false,
      simulated: !integration?.emailConnected || integration.emailMode !== 'live',
      bounced: true,
      errorMessage: 'Invalid recipient email address',
    };
  }

  const finalHtml = unsubscribeUrl
    ? `${htmlBody}<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;"/><p style="font-size:12px;color:#64748b;font-family:sans-serif;">You received this message because you opted in to communications. <a href="${unsubscribeUrl}" style="color:#2563eb;">Unsubscribe</a></p>`
    : htmlBody;

  const isSmtpLive =
    Boolean(integration?.emailConnected) &&
    integration?.emailMode === 'live' &&
    (integration.emailProvider === 'gmail_smtp' || integration.emailProvider === 'smtp') &&
    Boolean(integration.smtpHost) &&
    Boolean(integration.smtpUser) &&
    Boolean(integration.smtpPass);

  const isResendLive =
    Boolean(integration?.emailConnected) &&
    integration?.emailMode === 'live' &&
    integration.emailProvider === 'resend' &&
    Boolean(integration.emailApiKey);

  if (!isSmtpLive && !isResendLive) {
    await new Promise((r) => setTimeout(r, 40));
    return {
      success: true,
      simulated: true,
      providerMessageId: `sim_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  if (isResendLive) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integration!.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: integration!.emailFromName
            ? `${integration!.emailFromName} <${fromEmail}>`
            : fromEmail,
          to: [toEmail],
          subject,
          html: finalHtml,
        }),
      });
      const data: any = await res.json();
      if (!res.ok) {
        return {
          success: false,
          simulated: false,
          errorMessage: data?.message || `Email API error (${res.status})`,
        };
      }
      return {
        success: true,
        simulated: false,
        providerMessageId: data?.id || `resend_${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        simulated: false,
        errorMessage: err?.message || 'Resend delivery failed',
      };
    }
  }

  try {
    const port = integration!.smtpPort || 465;
    const transporter = nodemailer.createTransport({
      host: integration!.smtpHost!,
      port,
      secure: port === 465,
      auth: {
        user: integration!.smtpUser!,
        pass: integration!.smtpPass!,
      },
    });

    const info = await transporter.sendMail({
      from: integration!.emailFromName
        ? `"${integration!.emailFromName}" <${fromEmail}>`
        : fromEmail,
      to: toEmail,
      subject,
      html: finalHtml,
      headers: unsubscribeUrl
        ? { 'List-Unsubscribe': `<${unsubscribeUrl}>` }
        : undefined,
    });

    return {
      success: true,
      simulated: false,
      providerMessageId: info.messageId,
    };
  } catch (err: any) {
    const msg = err?.message || 'SMTP send failed';
    const isBounce = /550|553|554|recipient|mailbox/i.test(msg);
    return {
      success: false,
      simulated: false,
      bounced: isBounce,
      errorMessage: msg,
    };
  }
}

export async function executeCampaignById(campaignId: number, appBaseUrl: string) {
  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return;
    if (campaign.status === 'cancelled' || campaign.status === 'paused' || campaign.status === 'completed') {
      return;
    }

    await db
      .update(campaigns)
      .set({ status: 'sending' })
      .where(eq(campaigns.id, campaignId));

    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, campaign.userId))
      .limit(1);

    let waMetaTemplate: typeof templates.$inferSelect | undefined;
    if (campaign.channel === 'whatsapp' && campaign.templateId) {
      const [tpl] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, campaign.templateId))
        .limit(1);
      if (tpl && tpl.templateCategory === 'whatsapp_approved' && tpl.metaTemplateName) {
        waMetaTemplate = tpl;
      }
    }

    const recipients = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));

    for (const rec of recipients) {
      if (rec.status !== 'queued') continue;

      if (campaign.channel === 'whatsapp') {
        const templateParams: string[] = [];
        if (waMetaTemplate) {
          if (/\{\{\s*name\s*\}\}/i.test(campaign.body)) templateParams.push(rec.contactName);
          if (/\{\{\s*phone\s*\}\}/i.test(campaign.body)) templateParams.push(rec.destination);
        }

        const result = await sendWhatsAppMessage({
          integration,
          toPhone: rec.destination,
          body: rec.renderedBody,
          metaTemplateName: waMetaTemplate?.metaTemplateName || null,
          metaLanguage: waMetaTemplate?.metaLanguage || null,
          templateParams,
        });

        const nextStatus = result.success
          ? result.simulated
            ? 'delivered'
            : 'sent'
          : 'failed';

        await db
          .update(campaignRecipients)
          .set({
            status: nextStatus,
            providerMessageId: result.providerMessageId || null,
            errorMessage: result.errorMessage || null,
            isSimulated: result.simulated,
            updatedAt: new Date(),
          })
          .where(eq(campaignRecipients.id, rec.id));
      } else {
        const unsubUrl = rec.contactId
          ? `${appBaseUrl.replace(/\/$/, '')}/api/unsubscribe?cid=${rec.contactId}&u=${campaign.userId}`
          : undefined;

        const personalizedSubject = personalizeMessage(campaign.subject || 'Update from ConnectFlow', {
          name: rec.contactName,
          email: rec.destination,
        });

        const result = await sendEmailMessage({
          integration,
          fromEmail: campaign.fromEmail || integration?.emailFromAddress || 'noreply@connectflow.app',
          toEmail: rec.destination,
          subject: personalizedSubject,
          htmlBody: rec.renderedBody,
          unsubscribeUrl: unsubUrl,
        });

        const nextStatus = result.success
          ? result.simulated
            ? 'delivered'
            : 'sent'
          : result.bounced
            ? 'bounced'
            : 'failed';

        await db
          .update(campaignRecipients)
          .set({
            status: nextStatus,
            providerMessageId: result.providerMessageId || null,
            errorMessage: result.errorMessage || null,
            isSimulated: result.simulated,
            updatedAt: new Date(),
          })
          .where(eq(campaignRecipients.id, rec.id));
      }

      // Gentle rate-limit pacing between bulk sends
      await new Promise((r) => setTimeout(r, 60));
    }

    // Recompute exact totals across all recipient rows (supports retries cleanly)
    const allRecs = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));

    const sentCount = allRecs.filter((r) =>
      ['sent', 'delivered', 'read'].includes(r.status)
    ).length;
    const deliveredCount = allRecs.filter((r) =>
      ['delivered', 'read'].includes(r.status)
    ).length;
    const readCount = allRecs.filter((r) => r.status === 'read').length;
    const bouncedCount = allRecs.filter((r) => r.status === 'bounced').length;
    const failedCount = allRecs.filter((r) => r.status === 'failed').length;

    const finalStatus =
      sentCount === 0 && (failedCount > 0 || bouncedCount > 0) ? 'failed' : 'completed';

    await db
      .update(campaigns)
      .set({
        status: finalStatus,
        sentCount,
        deliveredCount,
        readCount,
        bouncedCount,
        failedCount,
        completedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    await db.insert(auditLogs).values({
      userId: campaign.userId,
      action: finalStatus === 'completed' ? 'campaign_dispatched' : 'campaign_failed',
      channel: campaign.channel,
      details: `${campaign.name} (${campaign.executionMode.toUpperCase()}): ${sentCount} sent, ${deliveredCount} delivered, ${failedCount + bouncedCount} failed.`,
    });
  } catch (error) {
    console.error(`Failed executing campaign ${campaignId}:`, error);
    await db
      .update(campaigns)
      .set({ status: 'failed' })
      .where(eq(campaigns.id, campaignId));
  }
}

export async function processDueScheduledCampaigns(userId: number, appBaseUrl: string) {
  try {
    const due = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.userId, userId),
          eq(campaigns.status, 'scheduled'),
          lte(campaigns.scheduledAt, new Date())
        )
      );

    for (const c of due) {
      await executeCampaignById(c.id, appBaseUrl);
    }
  } catch (error) {
    console.error('Failed processing due scheduled campaigns:', error);
  }
}

export async function markContactUnsubscribed(contactId: number, userId: number, channel: 'email' | 'whatsapp') {
  try {
    if (channel === 'email') {
      await db
        .update(contacts)
        .set({
          emailOptIn: false,
          suppressedEmail: true,
          emailUnsubscribedAt: new Date(),
        })
        .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
    } else {
      await db
        .update(contacts)
        .set({
          whatsappOptIn: false,
          whatsappOptOutAt: new Date(),
        })
        .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
    }
  } catch (error) {
    console.error('Failed marking contact unsubscribed:', error);
  }
}
