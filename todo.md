# Owner Logo and Live POS Search Fix

- [ ] Update `components/BrandedDocument.tsx` so `BillFlowMark` (or the reference invoice header mark) displays the business owner's logo (`profile.logoDataUrl`) when present, falling back to a clean initial badge instead of hardcoded BillFlow branding.
- [ ] Inspect POS product search state and dropdown filtering in `app/(app)/pos/page.tsx` to ensure typing any product name immediately shows matching items in real time.
- [ ] Run production build and verify both changes.
- [ ] Commit and push using `ayindenabawisdom@gmail.com`.
