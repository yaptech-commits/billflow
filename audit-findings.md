# BillFlow General Audit Findings

## Scope
This audit reviews the Next.js application, server API routes, Firebase/Admin data access, public Parent Portal, POS transaction paths, school notification delivery, and tenant/business authorization boundaries. Findings below are limited to issues verified from repository code rather than inferred from runtime behavior.

## Verified Findings

### Critical: unauthenticated admin migration endpoint
`app/api/admin/migrate-business-pages/route.ts` accepts `POST` without authentication or authorization and can update every business document. Any caller who can reach the deployment can trigger a privileged database-wide mutation.

**Planned fix:** require a revocation-checked Firebase token and restrict the operation to the canonical super-admin authorization path. Add bounded batch processing and idempotent behavior.

### High: public Parent Portal payment trusts mutable browser context
`app/api/school/portal/payment/route.ts` accepts `businessId`, `propertyId`, `studentId`, `feeId`, and `amount` from the browser. It cross-checks these values against the fee record, but it does not bind the payment confirmation to a server-issued portal session or verify Paystack transaction metadata. A leaked fee ID/reference can be replayed or used to probe payment state across public requests.

**Planned fix:** issue a short-lived signed portal session from successful lookup, require it during payment confirmation, derive business/property/student scope from the signed session, require provider metadata/reference consistency, and make payment references idempotent across fee/business scope.

### High: notification dispatch API authenticates only the Firebase token
`app/api/school/notifications/dispatch/route.ts` verifies that a caller has a valid Firebase token but accepts arbitrary `businessId`, `propertyId`, recipient, student, and notification payload values. This allows an authenticated user to attempt outbound webhook delivery for another business or property.

**Planned fix:** load the referenced notification server-side and require the caller to manage its business/property scope before dispatching; use stored content rather than trusting caller-provided recipient/content fields.

### Medium: hard-coded super-admin identity in manual retry authorization
`app/api/school/notifications/manual-retry/route.ts` contains a hard-coded super-admin email in addition to role checks. This is brittle and can become an authorization bypass if the identity changes or is reused.

**Planned fix:** use the canonical server-side super-admin role/allowlist mechanism and remove the embedded personal email.

### Medium: product/POS property isolation is inconsistent
Products and several inventory-facing helpers carry `propertyId`, but the POS transaction path primarily validates `businessId`; property checks are only applied to hotel folio context. In a multi-property business, a staff actor could potentially sell or mutate a product belonging to another property if the client obtains its document ID.

**Planned fix:** enforce the actor/profile property scope for property-aware products, invoices, payments, stock movements, and related reads/writes while preserving explicit super-admin scope.

## Verification Plan

1. Run static checks and the production build after each fix set.
2. Add focused negative-path checks for unauthenticated migration, cross-business notification dispatch, unsigned portal payment, and cross-property POS product access.
3. Review remaining medium/low risks and document any deployment-dependent controls that cannot be verified locally.

## Additional Verified Findings

### Critical: build configuration suppresses TypeScript and ESLint failures
`next.config.js` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to `true`. This allows production builds to succeed while shipping type errors and lint violations.

**Planned fix:** remove both suppression flags and make the build fail on actionable errors. Any existing baseline errors will be fixed or explicitly isolated before delivery.

### High: Firebase token helper does not check revocation
`verifyServerFirebaseToken()` calls `verifyIdToken(token)` without revocation checking, while `requireServerActor()` uses `verifyIdToken(token, true)`. Protected school notification routes relying on the weaker helper may continue accepting revoked sessions until token expiry.

**Planned fix:** use revocation-checked verification for privileged server routes and resolve actor/business scope from server-side records.

### High: admin migration route is fully unauthenticated
Confirmed directly in `app/api/admin/migrate-business-pages/route.ts`; there is no authorization header parsing or role check before reading and updating all businesses.

### High: public portal lookup enumerates and exposes sensitive school data
`app/api/school/portal/route.ts` scans all students when no ID is supplied and returns candidate names, IDs, class details, and full dashboard data after weak name/ID matching. It also returns school `paystackPublicKey`, which is expected for client payment initialization but should only be coupled to a server-issued, short-lived portal session.

### High: public payment confirmation lacks a signed portal session
Confirmed directly in `app/api/school/portal/payment/route.ts`; the request body supplies the entire student/business/property/fee scope. Provider verification checks only success and requested amount, not provider metadata or a server-issued payment intent/session.

### Medium: notification dispatch is authenticated but not authorized to the stored notification
`app/api/school/notifications/dispatch/route.ts` verifies a Firebase token, then dispatches the caller-provided payload without loading `schoolNotifications/{notificationId}` or checking that the actor owns the notification's business/property.

### Medium: hard-coded personal super-admin email remains in role resolution
`lib/db.ts` and the manual retry route use `wisdomasaare41@gmail.com` as a super-admin signal. This is brittle and should be replaced by a server-managed role/allowlist or Firebase custom claim.

### Medium: property scoping is not uniform in product/POS paths
`Product` includes optional `propertyId`, but the server POS transaction validates products by `businessId` only except for hotel folio context. Client-side helpers also query by business without consistently adding property filters. This can mix inventory across properties within one business.

### Review note
Firestore rules default-deny unknown collections, but the privileged Admin SDK API routes bypass those rules, so server route authorization remains mandatory even where Firestore rules are restrictive.

### Additional Verified Findings

#### High: manual offline sync bypasses authentication and targets missing endpoints
The Settings manual sync action posts sales to `/api/pos/sales` without a Firebase bearer token and posts queued invoices/payments to `/api/invoices` and `/api/payments`, but the repository contains no corresponding route handlers. These queues therefore cannot be replayed successfully and the sales request is rejected by the protected API.

**Fix:** route manual sale replay through the authenticated `createPosSale` client helper; remove dead invoice/payment HTTP handlers from the manual sync trigger until a server-side model exists, and report unsupported queue entries instead of claiming a successful sync.

#### Medium: regular POS clients omit property context and card/momo provider references violate UUID idempotency validation
Regular POS calls do not include a general `propertyId`, leaving scope inference dependent on server actor state, and the Paystack callback uses the provider reference directly as `idempotencyKey` even though the server requires a UUID.

**Fix:** add the active profile property ID to regular POS payloads and generate a UUID idempotency key separately from the provider reference.

#### Medium: provider-readiness endpoint used valid-token-only authorization
The school notification configuration endpoint exposed deployment readiness to any valid Firebase token, including users outside the owning business/property scope.

**Fix:** require the canonical revocation-checked owner or super-admin actor guard.

### High: hotel POS checkout trusts client-supplied reservation and room IDs
The POS route accepts `hotelContext.reservationId` and `hotelContext.roomId` from the client and updates those records during checkout without first reading and validating their business, property, guest, and room relationships inside the transaction.

**Fix:** load the reservation and room documents in the transaction, require they belong to the authenticated business/property, and verify the guest and room identifiers match the submitted folio context before allowing folio writes or checkout status transitions.
