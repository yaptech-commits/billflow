# BillFlow School Enhancements

- [ ] Inspect the current BillFlow app structure, authentication, school models, routes, permissions, and notification integrations.
- [ ] Define property_id-aware parent/guardian access and notification data models.
- [ ] Implement parent portal access for attendance, fee balances, and report cards.
- [ ] Implement automated attendance and fee notification workflows with administrator controls and delivery logs.
- [ ] Implement termly performance analytics for school accounts and Super Admin oversight.
- [ ] Run type checks, lint/build verification, and focused route/data checks.
- [ ] Commit and push all verified BillFlow changes using ayindenabawisdom@gmail.com.
- [ ] Report the completed BillFlow implementation and any required provider configuration.

## Architecture decisions

The parent portal will use Firebase email/password authentication with a new `parentLinks` collection. Each link will contain `businessId`, `propertyId`, `studentId`, the guardian email, and the claimed Firebase UID when available. The auth context will resolve parent membership by UID first and then by email, returning only the linked student IDs and property scope. Parent navigation will expose only the portal route; it will not inherit owner or salesperson pages.

All parent-facing reads will be filtered by `businessId`, `propertyId`, and the resolved linked student IDs. Firestore rules will allow a parent to read only their own link documents and the school records for linked students, while creation and updates remain owner-controlled. Existing operator pages will continue using the same school collections and billing data rather than a parallel ledger.

Automated notifications will use a durable property-aware `schoolNotifications` outbox and `notificationPreferences` document. Attendance and fee events will enqueue email/SMS/push intents and write delivery status records. The UI will support channel toggles, templates, and retry visibility. Actual external delivery requires provider credentials or a deployed server-side sender; the implementation will keep the adapter boundary explicit rather than pretending that a browser-only Firebase client can safely hold provider secrets.

Term analytics will be computed from existing assessments and attendance records for a selected `term` and `propertyId`. The operator view will show class averages, subject averages, attendance rate, pass rate, and student trend rows; the parent portal will show only the linked student’s own term summary. Super Admin oversight will use the existing `role === \"superadmin\"` convention where present and will retain cross-business access only in dedicated oversight helpers, never in parent queries.

Do not fabricate student records, grades, attendance, reviews, or performance data.

## Decisions to confirm during implementation

- Prefer existing Firebase data and auth patterns over parallel storage or billing systems.
- Keep every school query scoped by property_id and enforce parent-to-student relationships server-side or through Firestore rules where available.
- Use configurable notification adapters so email/SMS providers can be added without coupling school pages to one vendor.
- Do not fabricate student records, grades, attendance, reviews, or performance data.

## Super Admin account alignment checklist

- [ ] Confirm the deployed login failure is not caused by a missing Super Admin role mapping.
- [x] Add the user-confirmed Super Admin email to the configurable identity fallback without storing the password.
- [x] Verify all school pages remain grouped for Super Admin.
- [x] Run TypeScript and production build checks.
- [x] Commit and push the BillFlow update.

## Super Admin visibility fix checklist

- [x] Confirm the exact Super Admin role/email resolution path.
- [x] Confirm Sidebar school grouping includes Students, Fees, Attendance, Reports, Analytics, and Parent Portal.
- [x] Confirm AppLayout does not redirect Super Admin away from school routes.
- [x] Confirm route guards permit Super Admin on every school page.
- [x] Verify with TypeScript, production build, and source-level route checks.
- [ ] Commit and push the Super Admin visibility fix with the required author email.

## Implementation checklist

- [ ] Add parent-link, notification, preference, and analytics helpers to `lib/school-db.ts`.
- [ ] Extend auth context and sidebar for parent-only access.
- [ ] Add parent portal route with attendance, balances, and report-card summaries.
- [ ] Add owner controls for parent links and school notifications.
- [ ] Add event enqueue calls for attendance and fee changes.
- [ ] Add term analytics route and Super Admin-safe aggregation helpers.
- [ ] Extend Firestore rules for parent-scoped reads and owner-managed writes.
- [ ] Verify with TypeScript, build, and focused source checks.
- [ ] Commit and push with the required author email.
