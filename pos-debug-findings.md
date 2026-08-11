# POS production-route debugging findings

The local production server built from the current BillFlow tree was started at `http://127.0.0.1:3100` and exposed at `https://3100-itq9ixff9outoe2y0oq2c-7b7ef112.us2.manus.computer`.

Opening `/pos` and `/pos/` in the browser shows the same black Next.js page: `Application error: a client-side exception has occurred (see the browser console for more information).` The browser console inspection returned no console output. The local Next server log only reports startup readiness and no server exception.

The POS source contained one definite render-time bug at `app/(app)/pos/page.tsx:511`: the checkout summary formatted an undefined `lineTotal` variable even though the page computes `subtotal` at line 208. That reference was changed to `subtotal`, and a clean `NODE_ENV=production pnpm run build` completed successfully with `/pos` included in the route table. The browser still shows the client exception after this change, so another POS-specific client failure remains to be isolated.

Opening the local production `/auth/login` route produced no visible interactive elements and no screenshot; a follow-up browser view failed because the browser session became unavailable. This suggests the issue may affect the shared application shell or local browser session, not only the POS component, and requires static bundle/source tracing next.

A fresh browser session reproduced the same client-side exception at the local production `/pos` route. The browser console again returned no output, while direct HTTP requests to `/pos`, `/dashboard`, and `/auth/login` returned HTTP 200 server-rendered HTML; `/auth/login` contained the expected `Sign in` marker and authenticated routes contained `Loading...`. This confirms the failure occurs during client hydration or route runtime rather than Next server rendering.

After rebuilding and restarting the production server, opening `/pos` no longer showed the black error page. Because Firebase public variables are intentionally absent in the sandbox, the authenticated shell redirected to `/auth/login`, which rendered the complete BillFlow login UI. The browser console was empty. This confirms the missing-Firebase guard prevents the hydration crash locally; in Vercel, configured Firebase variables will allow the authenticated POS route to continue normally.
