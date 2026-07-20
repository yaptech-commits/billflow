# Salesperson Access Policy

BillFlow applies **least privilege** to staff whose `/staffIndex/{uid}` document has `role: "salesperson"` and `status: "active"`. The frontend provides only the permitted UX, while Firestore rules independently deny direct access to every other business collection.

## Route policy

| Role | Allowed protected routes | Default route | All other protected routes |
|---|---|---|---|
| Owner | All existing application routes | `/dashboard` | Allowed |
| Salesperson | `/pos`, `/clients` | `/pos` | Redirect to `/pos` without rendering the requested page |

The sidebar and route guard use one shared allowlist so navigation visibility and direct-URL behavior cannot drift apart.

## Firestore policy

| Collection | Owner | Salesperson | Reason |
|---|---|---|---|
| `clients` | Read and write within the owner’s business | Read and write within the assigned business | Required by the Clients section |
| `staffIndex` | Manage entries for the owner’s business | Read own entry only | Required to resolve role and business membership |
| `products` | Read and write | Denied | POS receives a sanitized catalog from an authenticated server endpoint, preventing direct access to cost, supplier, and inventory-management fields |
| `businessProfiles` | Read and write | Denied | POS receives only receipt-safe profile fields from the server endpoint |
| `invoices`, `payments`, `stockMovements`, `shifts` | Read and write as required by owner workflows | Denied directly | POS creates and updates these records through an authenticated server transaction after role, business, input, stock, and shift validation |
| `suppliers`, `purchaseOrders`, `creditNotes`, `vouchers`, `staff` | Owner-only, except a user’s narrowly scoped invitation claim where applicable | Denied for normal active-staff use | Explicitly outside the salesperson role |
| Any unmatched collection | Denied | Denied | Default-deny posture |

Firestore reads operate at document granularity and cannot conceal selected fields inside a readable document.[1] Consequently, granting direct salesperson reads on `products` would also expose inventory-management fields such as cost and supplier references. The POS catalog is therefore returned by a trusted server endpoint, while direct Firestore product access remains owner-only. Firebase documents that server SDKs bypass Firestore rules, so the endpoint must verify the Firebase ID token and re-check `/staffIndex/{uid}` before every operation.[2]

## Security invariants

A salesperson request is authorized only when the caller has a valid Firebase ID token and an active `staffIndex` record whose `businessId` matches every affected document. POS sale values are derived from authoritative product and business-profile records rather than client-supplied prices. Checkout writes the invoice, payment, stock decrements, stock-movement audit records, and shift totals in one server transaction. Role-resolution errors fail closed and never promote a staff user to owner.

## References

[1]: https://firebase.google.com/docs/firestore/security/rules-fields "Firebase: Control access to specific fields"
[2]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firebase: Writing conditions for Cloud Firestore Security Rules"
