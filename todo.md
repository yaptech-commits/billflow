# Suggested Upgrades Implementation

## General BillFlow Audit
- [ ] Inventory routes, build state, API handlers, roles, and data-access boundaries.
- [ ] Audit authentication, authorization, property/business scoping, secrets, and protected API routes.
- [ ] Audit payments, notifications, destructive operations, input validation, and client error handling.
- [ ] Fix verified defects without changing intended business behavior.
- [ ] Rebuild, run focused checks, document residual risks, commit, and push with author email `ayindenabawisdom@gmail.com`.

## Automatic Admission Letter Email
- [x] Trigger an admission-letter email after a student is successfully registered.
- [x] Use the existing guardian email/contact fields and property-scoped school branding.
- [x] Queue and track email delivery without blocking or falsely failing student registration.
- [x] Show an administrator-visible fallback when no valid guardian email is available.
- [x] Build, verify, promote, commit, and push the automated admission email implementation with author email `ayindenabawisdom@gmail.com`.

## Admission Communication Enhancements
- [x] Add secure provider/webhook configuration guidance and validation for school email delivery.
- [x] Add an administrator admission-letter history view with property-scoped delivery statuses and timestamps.
- [x] Add optional guardian SMS delivery alongside admission email with channel-level tracking and fallback messaging.
- [x] Build, verify, commit, and push the communication enhancements with author email `ayindenabawisdom@gmail.com`.

## Admission Communication Follow-ups
- [x] Add a branded admission-letter preview and confirm-before-dispatch flow.
- [x] Add bounded automatic retries for queued admission notifications.
- [x] Add a property-scoped CSV export for admission communication logs.
- [x] Build, verify, commit, and push the follow-up improvements with author email `ayindenabawisdom@gmail.com`.

## School Communication Extensions
- [x] Add manual re-triggering for failed admission-letter deliveries with audit tracking.
- [x] Add configurable branded templates for fee receipts and report-card notifications.
- [x] Add optional WhatsApp delivery configuration and channel-level tracking.
- [x] Build, verify, commit, and push the communication additions with author email `ayindenabawisdom@gmail.com`.

## School Admissions Page
- [x] Create an Admissions page inside the grouped School Management features.
- [x] Automatically list students from the existing property-scoped student records after registration.
- [x] Add a printable admission letter for each student with school branding and admission details.
- [x] Add Admissions to the School sidebar group and preserve existing student registration behavior.
- [x] Build, verify, promote, commit, and push the Admissions implementation with author email `ayindenabawisdom@gmail.com`.
