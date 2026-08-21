# BillFlow School Email & SMS Webhook Configuration Guide

This guide details how to configure live external email and SMS dispatch for BillFlow school admissions, fee receipts, parent announcements, and teacher activation invitations.

## 1. Environment Variables Required

Configure the following variables in your Vercel project settings (or server `.env`):

| Variable Name | Description | Example |
|---|---|---|
| `SCHOOL_EMAIL_WEBHOOK_URL` | Endpoint URL for the email delivery service (e.g., Resend, SendGrid, or custom webhook) | `https://api.resend.com/emails` |
| `SCHOOL_EMAIL_API_KEY` | Bearer token or API key for authenticating with your email provider | `re_123456789_abcdef` |
| `SCHOOL_SMS_WEBHOOK_URL` | Endpoint URL for SMS delivery (e.g., Twilio, Hubtel, or custom gateway) | `https://api.twilio.com/2010-04-01/Accounts/...` |
| `SCHOOL_SMS_API_KEY` | API key or basic auth token for the SMS gateway | `AC...` |

---

## 2. Default Fallback Behavior

If `SCHOOL_EMAIL_WEBHOOK_URL` is omitted or not configured:
- BillFlow automatically logs outbound notification payloads to Firestore (`notificationLogs`).
- The Admin Dashboard and Notification Retry cron job (`/api/cron/retry-notifications`) track delivery attempts.
- No unhandled runtime exceptions occur; system stability is preserved.

---

## 3. Teacher Activation Flow

When an administrator creates a teacher profile on the **School → Teachers** page:
1. A property-scoped `pending` teacher record is stored in Firestore.
2. The admin is provided with a secure activation link or password reset instruction.
3. Once the teacher signs in using their registered email, their account resolves against the staff index with proper role boundaries.
