# POS Receipt Preview Overflow Fix

- [ ] Update `components/BrandedDocument.tsx` and `lib/print-receipt.ts` so the preview container scales to fit mobile modal viewports (`max-w-full`, `box-sizing: border-box`, `overflow-x: hidden`).
- [ ] Ensure `width={58}` and `width={80}` render compact thermal layouts that fit narrow screens without horizontal clipping.
- [ ] Verify production build across all routes.
- [ ] Commit and push the fix using `ayindenabawisdom@gmail.com`.
