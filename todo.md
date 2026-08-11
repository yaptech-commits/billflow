# Suggested Upgrades Implementation

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
