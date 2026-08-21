# Suggested Upgrades Implementation

## School Admissions Page
- [x] Create an Admissions page inside the grouped School Management features.
- [x] Automatically list students from the existing property-scoped student records after registration.
- [x] Add a printable admission letter for each student with school branding and admission details.
- [x] Add Admissions to the School sidebar group and preserve existing student registration behavior.
- [x] Build, verify, promote, commit, and push the Admissions implementation with author email `ayindenabawisdom@gmail.com`.

## Automatic Student ID on Registration
- [x] Generate a Student ID automatically when a student is registered.
- [x] Guarantee uniqueness within the business/property and preserve existing IDs for current students.
- [x] Show the generated ID in the registration result and student record while keeping Parent Portal lookup compatible.
- [x] Build, verify, commit, and push the automatic Student ID implementation with author email `ayindenabawisdom@gmail.com`.

## School Navigation: Announcements Grouping
- [x] Add Announcements to the grouped School Management feature list in the sidebar.
- [x] Preserve the existing `/school/announcements` composer route and school-only access rules.
- [x] Ensure Announcements appears for the appropriate school owner and Super Admin views without becoming a separate top-level module.
- [x] Build, verify, commit, and push the navigation correction with author email `ayindenabawisdom@gmail.com`.

## School Announcements Page
- [x] Add a dedicated administrator page for composing announcements to parents.
- [x] Support school-wide or class-targeted audiences with property-aware student and guardian selection.
- [x] Add preview, publish, and delivery-state handling using the existing announcement and notification helpers.
- [x] Preserve delivery tracking and parent-visible announcements in the existing portal.
- [x] Build, verify, commit, and push the announcements page with author email `ayindenabawisdom@gmail.com`.

## School Bulk Fee Assignment by Class
- [x] Add a Bulk Assign Fees to Class action under School Fees & Billing.
- [x] Select a property-scoped class and fee structure, then assign the fee to all matching students.
- [x] Prevent duplicate fee assignments for the same student, fee structure, term, and property.
- [x] Show assignment results with created, skipped, and failed counts while preserving individual assignment behavior.
- [x] Build, verify, commit, and push the bulk class fee assignment implementation with author email `ayindenabawisdom@gmail.com`.

## Parent Portal Pay Fees
- [x] Add a Pay Fees action when the selected ward has an outstanding fee balance.
- [x] Reuse the existing BillFlow payment provider flow and link payment metadata to the student, fee statement, business, and property.
- [x] Handle payment loading, success, cancellation, and failure states without marking fees paid from the client alone.
- [x] Show confirmation/receipt details after the backend confirms payment and preserve the existing report and fee dashboard behavior.
- [x] Build, verify, commit, and push the Parent Portal payment implementation with author email `ayindenabawisdom@gmail.com`.

## Parent Portal Accent Color Customization
- [x] Add an owner setting to customize the Parent Portal accent color using the existing business profile branding settings.
- [x] Apply the saved accent color to the Parent Portal landing page without changing the main BillFlow login or unrelated modules.
- [x] Preserve readable contrast and use the existing default accent when no custom color is configured.
- [x] Build, verify, commit, and push the Parent Portal accent-color implementation with author email `ayindenabawisdom@gmail.com`.

## Parent Portal School Branding
- [x] Replace the fixed `BillFlow School` header label with the configured school/business name.
- [x] Display the configured school logo in the Parent Portal header with a safe fallback when none is saved.
- [x] Keep branding property-aware and avoid changing the main BillFlow login or unrelated pages.
- [x] Verify the branded Parent Portal build and live route, then commit and push with author email `ayindenabawisdom@gmail.com`.

## Deployed Parent Portal Verification
- [x] Inspect `https://billflow-blue.vercel.app/school/portal` directly and record whether it still serves the old login flow.
- [x] Compare the deployed result with the pushed `fix/super-admin-school-grouping` branch and identify the deployment branch/version mismatch if present.
- [x] Correct and push the exact source used by the live Vercel deployment, then recheck the URL.
- [x] Report the confirmed live result to the user.

## Parent Portal Student ID/Name-Only Access
- [x] Replace email/password login with a landing-page lookup accepting Student ID or Ward Name only.
- [x] Match lookups against property-scoped student records and prevent cross-property results.
- [x] Open the selected student's portal dashboard without requiring an AuthContext parent session.
- [x] Handle duplicate ward names by requiring the parent to select the intended student before opening the dashboard.
- [x] Verify attendance, fees, performance, report cards, and announcements are populated from the selected student.
- [x] Commit and push the implementation with author email `ayindenabawisdom@gmail.com`.

## Parent Portal Scope Correction
- [x] Restore the main BillFlow staff/owner login and unrelated guardian-page wording to their previous behavior.
- [x] Keep the Student ID/Name-only access change limited to `/school/portal` and its property-scoped lookup API.
- [x] Verify the Parent Portal landing page opens the selected student dashboard without parent email/password login.
- [x] Commit and push the scoped correction with author email `ayindenabawisdom@gmail.com`.

## Parent Portal 404 Route & Navigation Fix
- [x] Identify why Vercel returned 404 on `/school/portal` (route grouping `(app)` vs flat URL structure).
- [x] Relocate portal page from `app/(app)/school/portal/page.tsx` to `app/school/portal/page.tsx` so the URL `/school/portal` is directly accessible without routing middleware/grouping constraints.
- [x] Verify production build compatibility and successful push with `ayindenabawisdom@gmail.com`.

## Parent Portal Report Card Viewing & Download
- [x] Design report card review modal on Parent Portal displaying termly grades, remarks, teacher notes, and attendance summaries.
- [x] Integrate HTML/PDF-ready printable document generation using BillFlow receipt printing patterns (`downloadReceipt`).
- [x] Connect report card viewer to property-scoped student report card records.
- [x] Verify production build compatibility, type safety, and property scoping.
- [x] Commit and push the Parent Portal report card update with `ayindenabawisdom@gmail.com`.

## Parent Portal Fee Payment Integration (Mobile Money & Cards)
- [x] Design secure fee payment modal on Parent Portal supporting Mobile Money (MTN, Vodafone, AirtelTigo) and Credit/Debit Cards.
- [x] Integrate amount entry, provider reference collection, and cash/payment confirmation handling.
- [x] Connect parent payments to existing property-scoped student fee ledger and payment history logs.
- [x] Verify production build compatibility, type safety, and property isolation.
- [x] Commit and push the Parent Portal payment update with `ayindenabawisdom@gmail.com`.

## Parent Portal Landing Page & Ward ID Login
- [x] Design parent portal landing page layout with ward name and student ID lookup (`/school/portal`).
- [x] Implement secure ward matching against property-scoped student records with attendance, fee balance, and performance overview.
- [x] Add quick demo ward profiles for instant parent previewing.
- [x] Verify production build compatibility, type safety, and property scoping.
- [x] Commit and push the Parent Portal landing page update with `ayindenabawisdom@gmail.com`.

## SMS Notification Delivery Tracking
- [x] Define SMS delivery attempt schema and recipient-level tracking status (`sent`, `failed`, `pending`) with timestamp and provider message reference.
- [x] Extend notification dispatcher and announcement data model to record SMS delivery logs per guardian.
- [x] Add administrator-facing delivery tracking dashboard on the announcements page with success/failure breakdown.
- [x] Verify propertyId scoping, TypeScript type safety, and production build compatibility.
- [x] Commit and push SMS delivery tracking update with `ayindenabawisdom@gmail.com`.

## Authentication & Parent Portal Preview
- [x] Investigate deployed Firebase authentication failure (`INVALID_LOGIN_CREDENTIALS`).
- [x] Identify that deployed Firebase project requires a registered parent account or test demo bypass for previewing.
- [x] Implement a Parent Demo / Quick-Login option for instant parent portal previewing.
- [x] Verify successful sign-in and parent portal preview rendering.
- [x] Commit and push the fix with `ayindenabawisdom@gmail.com`.

## Termly student payment statements

- [x] Inspect the existing student fee payment history data and export utilities.
- [x] Define term-aware statement aggregation with student, class, charges, payments, and balance.
- [x] Add a downloadable statement document for each student without duplicating payment records.
- [x] Add statement access to the school fee ledger with a term selector.
- [x] Verify propertyId scoping, TypeScript, production build, and downloaded output.
- [x] Commit and push the payment statement update with `ayindenabawisdom@gmail.com`.

## Fee payment receipt student and class details

- [ ] Inspect the existing fee payment receipt print/download implementation and student-fee fields.
- [ ] Include student name and class details in the visible receipt header/details.
- [ ] Ensure both print and download/export output contain the same student and class information.
- [ ] Preserve existing payment totals, receipt identifiers, and payment persistence.
- [ ] Verify TypeScript, production build, and receipt rendering behavior.
- [ ] Commit and push the receipt update with `ayindenabawisdom@gmail.com`.

## Fee assignment class selector

- [x] Inspect the existing Assign Fee to Student modal and property-aware student/class loading.
- [x] Add a class selector above the student selector.
- [x] Filter the student dropdown by the selected class and reset invalid student selections.
- [x] Preserve the existing fee assignment persistence and permissions.
- [x] Verify TypeScript, production build, and route behavior.
- [ ] Commit and push the fee-assignment class selector with `ayindenabawisdom@gmail.com`.

## School dashboard quick actions

- [x] Inspect the School dashboard section and existing student/attendance routes.
- [x] Add a Register new student quick-action button linking to the existing student form.
- [x] Add a Record attendance quick-action button linking to the existing attendance register.
- [x] Ensure actions are visible only within the School dashboard context and respect existing permissions.
- [x] Verify TypeScript, production build, and route behavior.
- [ ] Commit and push the quick-action update with `ayindenabawisdom@gmail.com`.

## School dashboard statistics

- [x] Inspect the existing dashboard and school collections/helpers.
- [x] Add property-scoped metrics for students, classes, attendance, fees, payments, and report cards.
- [x] Render school statistics only for school accounts and Super Admin school context.
- [x] Add loading, empty, refresh, and error states without fabricated values.
- [x] Verify TypeScript, production build, permissions, and property_id filters.
- [ ] Commit and push the school dashboard statistics update with `ayindenabawisdom@gmail.com`.

## Classes page

### Classes enhancements

#### Class management

- [x] Add create-class form with property-aware class metadata and optional teacher assignment.
- [x] Add edit-class workflow for class name and teacher changes.
- [x] Keep empty classes visible and preserve student grouping after edits.
- [x] Prevent duplicate class names within the same business and property.
- [x] Verify TypeScript, production build, permissions, and route behavior.
- [ ] Commit and push class create/edit changes with `ayindenabawisdom@gmail.com`.


- [x] Add property-aware class metadata with teacher assignment fields.
- [x] Add owner/Super Admin controls to assign or change a class teacher.
- [x] Add a guarded bulk promotion workflow with explicit source and destination classes.
- [x] Add daily attendance summary metrics for every class.
- [x] Verify property_id scoping, permissions, TypeScript, production build, and route behavior.
- [ ] Commit and push the Classes enhancements with `ayindenabawisdom@gmail.com`.


- [x] Inspect the existing property-aware student schema and query helpers.
- [x] Add a Classes page that groups students by class and shows class/student counts.
- [x] Add class selection and student detail rows without duplicating student records.
- [x] Link Classes under the School group for Super Admin and school owners.
- [x] Verify TypeScript, production build, route links, and property_id filters.
- [ ] Commit and push the BillFlow Classes page.


- [ ] **Mobile Thermal Bluetooth & Web Bluetooth Printing**: Add direct Web Bluetooth API printing support for 58mm and 80mm ESC/POS thermal printers in the POS success modal.
- [ ] **Barcode Scanner Integration**: Implement continuous keyboard/USB scanner event listeners (`keypress` / barcode prefix / Enter detection) for instant product barcode lookup at POS checkout.
- [ ] **Shift-Drawer Reconciliation**: Build cash-drawer audit breakdowns, expected vs. actual cash counts, multi-currency cash/momo/card reconciliation, and discrepancy reporting into the shift closing modal.
- [ ] **Production Verification & Push**: Run type checks, production build, commit with `ayindenabawisdom@gmail.com`, and push to GitHub.


## Super Admin business-type navigation grouping
- [x] Define General, Pharmacy, Hotel, and Administration page groups.
- [x] Add collapsible grouped sections for Super Admin navigation.
- [x] Preserve existing owner/staff filtering and hotel/pharmacy gating.
- [x] Validate TypeScript and route behavior.
- [x] Commit and push the navigation update.

**Design decision:** In Super Admin global view, show all page groups. When a business is selected, keep all groups visible so Super Admin retains global access, while visually highlighting the selected business type where possible.

**Style reminder:** BillFlow uses a dark operational sidebar with gold active states, compact spacing, and accessible icon labels. Group headers should reinforce hierarchy without introducing a second visual language.


## Hotel Room POS
- [x] Map existing POS cart, tax, payment, receipt, invoice, and product-charge helpers.
- [x] Build a hotel-only Room POS page with Free, Reserved, and Occupied room sections.
- [x] Connect room selection to reservation, check-in, folio, partial-payment, and checkout flows.
- [x] Reuse existing products for minibar, food, laundry, and service charges.
- [x] Verify permissions, TypeScript, route behavior, and billing persistence.
- [x] Commit and push the Room POS implementation.

**Structural decision:** Room availability remains date-range based and room status remains reservation/housekeeping based; the Room POS page is only a front-desk entry point into those existing records and the existing POS billing pipeline.


## Modular Business Dashboard
- [ ] Map existing dashboard cards, charts, activity panels, and business module data sources.
- [ ] Extend the existing dashboard with conditional General, Hotel, Pharmacy, and Cold Store sections.
- [ ] Add clickable links for module metrics and preserve pure Hotel-only dashboard behavior.
- [ ] Verify TypeScript, dashboard routes, permissions, and module gating.
- [ ] Commit and push the modular dashboard implementation.


## Shared Financial Pages Access & Data Scope
- [x] Audit business-type page maps in business-type-config.ts and sidebar gating.
- [x] Ensure Invoices, Payments, and Reports are present for Hotel, Pharmacy, Cold Store, and General business accounts.
- [x] Verify that data queries filter strictly by businessId and salesperson scope.
- [x] Validate TypeScript compilation, commit, and push changes to main.

## Narrow Teachers School-Grouping Release
- [ ] Confirm `c3d911e` contains only the Teachers page and School sidebar grouping delta.
- [ ] Apply only that delta to `main` without merging the broader feature branch.
- [ ] Build, push, and verify the narrow release.

## Teacher Profile Creation
- [ ] Inspect the existing staff creation flow and administrator permissions.
- [ ] Add secure property-scoped teacher profile creation using the existing staff model.
- [ ] Add the create-teacher form and success/error feedback to `/school/teachers`.
- [ ] Run production verification, commit, and push the implementation.

## Registration Plan Selection
- [x] Inspect the registration page (`app/auth/signup/page.tsx`)
- [x] Add "Select Plan" section with "Pro Management", "Standard Management", and "Demo Management"
- [x] Implement interactive pricing details for Pro Management (Lifetime Activation, Startup Price: 3,500 GHS, Monthly Database Upgrade: 500 GHS large scale / 300 GHS small scale)
- [x] Implement interactive pricing details for Standard Management (Monthly Renewal, Startup Price: 1,500 GHS, Monthly Renewal: 300 GHS)
- [x] Verify plan interactions in the browser and production build with `pnpm run build`
- [x] Commit and push with author email `ayindenabawisdom@gmail.com`

## Super Admin Plan Visibility and Onboarding Invoice
- [x] Inspect the Super Admin business view and account approval billing path.
- [x] Show each business's selected management plan and relevant pricing as a Super Admin badge.
- [x] Generate one startup-fee onboarding invoice when a business account is approved, using the selected plan and preserving auditability.
- [x] Verify the approval path and production build; browser admin verification requires a signed-in Super Admin session.
- [x] Commit and push the scoped changes with author email `ayindenabawisdom@gmail.com`.

## Scope Boundary
- [x] Do not implement the separate in-app plan upgrade workflow.

## Registration Onboarding Payment and Invoice Receipt
- [x] Inspect the existing payment provider, email delivery, signup, and approval flows before extending them.
- [x] Add a post-registration payment step with Cash and Mobile Money choices, preserving the selected plan and startup amount.
- [x] Keep cash registrations pending for administrator confirmation and never auto-approve from a client-side signal.
- [x] Add verified Mobile Money confirmation handling that auto-approves the account only after a trusted provider/webhook result.
- [x] Email the onboarding invoice receipt to the registered business email with delivery status and retry-safe handling.
- [x] Verify payment, approval, email, webhook security, and production behavior; unauthenticated routes return 401 and the production build passes.
- [x] Commit and push with author email `ayindenabawisdom@gmail.com`.

## Registration Payment Scope Boundary
- [x] Do not implement the separate plan upgrade workflow.
- [x] Add a dedicated cash-payment amount field on the onboarding payment page and carry the entered amount into the pending cash record.

## Billing History, Receipt Downloads, and Provider Setup
- [x] Inspect the existing tenant-scoped payment and invoice data access, receipt builders, settings surfaces, and Paystack webhook configuration.
- [x] Add an owner-facing billing history view for onboarding invoices and payments.
- [x] Add secure downloadable or printable paid onboarding receipts.
- [x] Add live provider environment-variable and Paystack webhook setup guidance in the settings surface and project documentation.
- [x] Verify tenant isolation safeguards, receipt rendering contract, webhook protection, and the production build.
- [x] Commit and push the follow-up changes with author email `ayindenabawisdom@gmail.com`.

## Follow-up Scope Boundary
- [x] Do not implement the separate in-app plan upgrade workflow.

## Registration Submit Error Fix
- [x] Reproduce the registration submit failure and inspect client/server logs and response details.
- [x] Trace the signup validation, Firebase account creation, business/profile writes, and payment-page redirect path.
- [x] Apply the smallest secure fix and preserve pending-payment/account-approval safeguards.
- [x] Verify the registration-to-payment handoff contract and production build; `pnpm run build` and `git diff --check` pass.
- [x] Commit and push the fix with author email `ayindenabawisdom@gmail.com`; commit `2431d0ae07847883c374312eb56b8a13c6918d24`.

## Registration-to-Payment Redirect Correction
- [x] Inspect the current signup success handler, selected-plan persistence, and onboarding payment route contract.
- [x] Reproduce why account creation does not navigate to `/auth/onboarding-payment` after plan selection: the global auth provider treated the newly created pending profile as a login-blocking approval error and signed the user out.
- [x] Fix the redirect using a route-scoped pending-onboarding exception with cancellation-safe auth lifecycle handling; tenant isolation and approval/payment safeguards remain enforced outside onboarding.
- [x] Verify the redirect path, production build, and relevant error handling; `pnpm run build` and `git diff --check` pass.
- [ ] Commit and push the correction with author email `ayindenabawisdom@gmail.com`.

## Registration Redirect Follow-up
- [x] Inspect the deployed signup/payment route and confirm whether the latest redirect fix is live.
- [x] Trace the remaining auth, Firestore, and browser navigation risk after account creation; the destination route was healthy, while the client-router transition remained interruptible.
- [x] Implement and verify a stronger redirect handoff with `window.location.replace()` after account creation; payment and approval controls remain preserved.
- [ ] Commit and push the follow-up fix with author email `ayindenabawisdom@gmail.com`.

## Permanent Email and Account Deletion
- [x] Audit existing owner, staff, and super-admin deletion paths and enumerate all email-linked Firestore collections and auth records.
- [x] Define secure permanent-deletion rules: verified Firebase ID token, Super Admin or self-owner authorization, exact confirmation phrase, idempotent missing-auth handling, and protection for the Super Admin account.
- [x] Implement server-side deletion of the Firebase Auth user and all tenant-owned database records, indexes, invitations, payment/onboarding records, and business-scoped references; staff deletion also removes the linked login and access index.
- [x] Verify deletion behavior without inserting test data; `pnpm run build` and `git diff --check` pass.
- [x] Commit and push with author email `ayindenabawisdom@gmail.com`; commit `2d16b0ea7aef792b2e2c71ed1c09b09dc6f5af81`.

## Plan-Based Onboarding Payment Amount
- [x] Inspect the selected-plan pricing source and onboarding cash amount state.
- [x] Populate the cash amount from the authenticated selected plan's trusted startup price and keep it synchronized with plan context.
- [x] Preserve valid Cash handling and the full canonical Mobile Money invoice amount; invalid empty/zero Cash submissions remain blocked.
- [x] Verify the payment route and production build; `pnpm run build` and `git diff --check` pass. Commit and push remain pending.

## Existing Paystack Account Configuration
- [ ] Inspect current Paystack environment-variable names, payment routes, and production webhook path.
- [ ] Confirm the production BillFlow domain and obtain the Paystack secret through secure deployment settings, never chat.
- [ ] Configure the existing Paystack account for Mobile Money receiving and verified webhook settlement.
- [ ] Verify configuration without performing a real payment, document redeploy requirements, and push any configuration-documentation changes with author email `ayindenabawisdom@gmail.com`.

## Shared Paystack Webhook Routing for DataFlow and BillFlow
- [x] Inspect the DataFlow repository/backend webhook endpoint and BillFlow Paystack metadata and signatures.
- [x] Define event ownership routing, signature verification, replay protection, and idempotent forwarding without exposing secrets.
- [x] Implement the shared webhook handler while preserving existing DataFlow settlement behavior and adding BillFlow onboarding settlement.
- [x] Validate the router with `node --check index.js` and `git diff --check`; document the exact Paystack webhook URL and deployment environment requirements.
- [x] Commit and push the DataFlow repository change with author email `ayindenabawisdom@gmail.com`; commit `7814039`.
- [x] Add `BILLFLOW_WEBHOOK_URL` to the DataFlow Render service and redeploy before changing the Paystack Live Webhook URL; the user confirmed completion.

## Vercel Firebase Admin Runtime Compatibility
- [x] Confirmed BillFlow API routes were failing in production with `ERR_REQUIRE_ESM` from `jwks-rsa@4` loading `jose@6` through Firebase Admin 14.
- [x] Pinned `firebase-admin` to `13.6.0`, which uses `jwks-rsa@3.2.x` and CommonJS-compatible `jose@4.15.x`.
- [x] Verified `pnpm run build`, `git diff --check`, and the dependency tree.
- [x] Confirmed the new Vercel deployment now serves `/api/health` and `/api/onboarding/payment/webhook` with HTTP 200; no real payment was initiated.
- [x] Complete final Paystack shared-webhook rollout verification after confirming `BILLFLOW_WEBHOOK_URL` is present in Render; no real payment was initiated.

## Selected Plan Handoff and Automatic Amount Population Follow-up
- [x] Trace why the payment page reports that the selected plan could not be loaded after registration: the payment page depended only on a pricing API response and showed an empty field when that request failed or lagged.
- [x] Preserve the selected plan and business identifier across registration-to-payment navigation through URL parameters and a session-scoped fallback for existing pending accounts.
- [x] Automatically populate the Cash amount from the canonical plan price when available, with server-side invoice pricing remaining authoritative at submission.
- [x] Verify the production route contract and build; `pnpm run build` and `git diff --check` pass. Commit and push remain pending.
