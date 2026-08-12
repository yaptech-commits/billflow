# Multi-Business-Type Architecture & Scoping in BillFlow

## Unified Architecture Powers Diverse Commercial Verticals Without Siloed Repositories
- BillFlow centralizes core financial engines—POS, Invoices, Payments, and Reports—into a single modular React and Firebase application.
- Business type configuration (`business-type-config.ts`) dynamically gates navigation items, sidebar groups, and operational modules per account.
- Property-aware data models (`propertyId`) ensure multi-property scalability while maintaining strict tenant isolation via `businessId`.
- Super Administrator controls enable granular module toggling and business-type assignment across General Retail, Pharmacy, Hotel, and Cold Store operations.

## Hotel Business Mode Delivers Complete Property Management and Front-Desk POS
- Room inventory and seasonal rate plans manage room numbers, floors, capacity, amenities, and dynamic pricing rules.
- Date-range overlap engines prevent double-booking by evaluating check-in and check-out intervals rather than simple stock quantities.
- Front-Desk Room POS connects room status tiles (*Free*, *Reserved*, *Occupied*, *Dirty*) directly with existing product inventory and guest folios.
- Automated night audits post nightly room charges and occupancy taxes while generating audit-trailed folio adjustments and partial payment logs.

## Specialized Verticals Extend Core Infrastructure Seamlessly
- Pharmacy operations integrate drug-specific nomenclature, dosage forms, classifications, batch expiry tracking, and prescription linkage.
- Cold Store monitoring tracks perishable SKU freshness, storage temperature telemetry, wastage logging, and threshold alerts.
- General business accounts retain full retail POS, shift drawer reconciliation, and Bluetooth thermal printing (58mm/80mm).
- Modular dashboard extensions conditionally display specialized operational metrics based on each business account's active module flags.

## Account-Scoped Financial Governance Secures Invoices, Payments, and Reports
- All business types—including specialized Hotel and Cold Store accounts—maintain mandatory access to Invoices, Payments, and Reports.
- Tenant scoping (`businessId`) ensures businesses view strictly their own ledger data, completely isolating records between distinct tenants.
- Role-based permissions gate sensitive ledger functions, allowing owners and managers full visibility while restricting salespersons to their own sales scope (`onlyUserId`).
- Recharts-powered analytics aggregate paid invoice totals, payment method distributions, and revenue trends in real time without requiring compound composite indexes.
