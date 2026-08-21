# BillFlow Client Launch Runbook

This runbook is the minimum operational checklist for onboarding a client account. It complements the automated `pnpm verify:readiness` command and the production health endpoint at `/api/health`.

## Before onboarding

- Confirm the deployment is built from the intended `main` commit.
- Confirm Firebase Admin credentials, Firestore, and the production domain are configured.
- Configure `RESEND_API_KEY` and the verified sender identity if email delivery is enabled.
- Configure payment-provider credentials and webhook signing/verification settings before collecting online payments.
- Confirm the Vercel Hobby-compatible notification retry schedule is acceptable. The current fallback is once daily; upgrade to a plan that supports higher-frequency cron if same-day retries are a client requirement.
- Confirm scheduled Firestore backups are enabled in the Firebase/GCP project and perform a restore drill in a non-production project.

## Client onboarding

1. Create the business profile and choose the business type.
2. Configure the property identifier, currency, tax settings, logo, receipt width, and public-facing contact details.
3. Create the owner account and verify the owner email.
4. Add staff and teachers using least-privilege page permissions. Teachers begin as pending profiles and are linked when they sign in with the invited email.
5. Import products, drugs, rooms, classes, students, or opening balances using a reviewed template.
6. Run a test POS sale, invoice, payment, receipt print, export, and offline recovery cycle.
7. Review the security and system alert feed and resolve any critical event before go-live.

## Daily operations

- Check `/api/health` or the administrator health panel for Firestore and provider configuration status.
- Review failed notification deliveries, payment webhook failures, offline sync failures, and security events.
- Reconcile payment-provider records against BillFlow payments and investigate duplicates or unexplained adjustments.
- Review stock exceptions, expired or near-expiry batches, room-status exceptions, and school fee discrepancies.

## Incident response

1. Capture the timestamp, business ID, property ID, affected record, and visible error without copying secrets or payment credentials.
2. Preserve the relevant security event, sync failure, or payment reference.
3. Pause the affected workflow if duplicate writes or data corruption are suspected.
4. Use the latest known-good deployment or rollback procedure only after confirming the database state is safe.
5. Record the resolution and client communication in the support log.

## Data and privacy controls

- Never place passwords, Firebase tokens, payment credentials, or full identity documents in logs.
- Export only the requesting business's invoices, payments, and inventory.
- Retain student, parent, guest, and customer information only for the documented business purpose and retention period.
- Remove or suspend former staff and teacher access promptly.
- Use the Parent Portal's privacy-safe errors and rate limits; never disclose whether an unverified student record exists.

## Pilot exit criteria

A client is ready to leave pilot only after successful completion of the automated readiness check, tenant-isolation review, backup restore drill, payment reconciliation, offline recovery test, staff activation test, and owner sign-off on business-specific settings.
