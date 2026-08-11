# 58MM/80MM Receipt Width Selector Restoration

- [ ] Restore the `receiptWidth` state (`58` | `80`) in `app/(app)/pos/page.tsx`.
- [ ] Add back the 58MM and 80MM selection buttons in the POS "Sale Successful" modal.
- [ ] Pass `width={receiptWidth}` into `BrandedDocument` so the modal preview and thermal print function respect the user's selected width.
- [ ] Ensure the reference invoice design adapts cleanly to both thermal (58mm/80mm) and A4 widths, and verify with a clean production build.
- [ ] Commit and push changes using `ayindenabawisdom@gmail.com`.
