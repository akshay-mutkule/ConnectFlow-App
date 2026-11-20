import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  users,
  integrations,
  contactGroups,
  templates,
  auditLogs,
} from './schema.ts';

const DEFAULT_GROUPS = [
  { name: 'Friends', description: 'Personal friends and close network' },
  { name: 'Family', description: 'Family members and relatives' },
  { name: 'Customers', description: 'Active customers and buyers' },
  { name: 'Business', description: 'Partners, vendors, and B2B leads' },
  { name: 'Employees', description: 'Internal team and staff members' },
];

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    const upserted = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    const userRecord = upserted[0];

    if (existing.length === 0) {
      await db
        .insert(integrations)
        .values({
          userId: userRecord.id,
          whatsappConnected: false,
          whatsappMode: 'demo',
          emailConnected: false,
          emailMode: 'demo',
          emailProvider: 'gmail_smtp',
          emailFromAddress: email,
          emailFromName: displayName || email.split('@')[0],
        })
        .onConflictDoNothing();

      await db.insert(contactGroups).values(
        DEFAULT_GROUPS.map((g) => ({
          userId: userRecord.id,
          name: g.name,
          description: g.description,
          isDefault: true,
        }))
      );

      await db.insert(templates).values([
        {
          userId: userRecord.id,
          name: 'Account Update Notice (Approved)',
          channel: 'whatsapp',
          templateCategory: 'whatsapp_approved',
          metaTemplateName: 'account_update_notice',
          metaLanguage: 'en_US',
          metaApprovalStatus: 'approved',
          body: 'Hello {{name}},\n\nHope you are doing well. We have an important update regarding your account on {{phone}}.\n\nThank you!',
        },
        {
          userId: userRecord.id,
          name: 'Appointment Reminder (Approved)',
          channel: 'whatsapp',
          templateCategory: 'whatsapp_approved',
          metaTemplateName: 'appointment_reminder_v1',
          metaLanguage: 'en_US',
          metaApprovalStatus: 'approved',
          body: 'Hi {{name}}, this is a friendly reminder for your upcoming session. Reply STOP to opt out.',
        },
        {
          userId: userRecord.id,
          name: 'Quick Follow-up Draft',
          channel: 'whatsapp',
          templateCategory: 'draft',
          body: 'Hello {{name}},\n\nJust checking in to see if you had any questions about our latest update.\n\nBest regards!',
        },
        {
          userId: userRecord.id,
          name: 'Monthly Product Newsletter',
          channel: 'email',
          templateCategory: 'draft',
          subject: 'Important updates for {{name}}',
          body: '<p>Hello {{name}},</p><p>Thank you for staying connected with us. Here is a summary of our latest product updates and announcements prepared for {{email}}.</p><p>Best regards,<br/>ConnectFlow Team</p>',
        },
      ]);

      await db.insert(auditLogs).values({
        userId: userRecord.id,
        action: 'workspace_initialized',
        details: 'Created workspace profile, default contact groups, and starter templates.',
      });
    }

    return userRecord;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}
