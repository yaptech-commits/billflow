# Suggested Upgrades Implementation

## Classes page

### Classes enhancements

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
