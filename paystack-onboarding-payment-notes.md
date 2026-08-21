# Paystack onboarding payment implementation notes

Verified against official Paystack documentation on 2026-08-21.

Paystack supports webhooks for payment status updates. Webhooks are POST endpoints that should acknowledge with HTTP 200, and Paystack recommends webhooks over client callbacks or polling. Webhook requests carry an `x-paystack-signature` HMAC SHA512 signature generated with the Paystack secret key; the server must validate the signature before processing. Paystack retries unacknowledged live events for up to 72 hours. The relevant successful payment event is `charge.success`.

Paystack's payment flow requires transaction initialization from the backend, returning an authorization URL/access code to the client, completion in Paystack Checkout/Popup, and server-side verification before delivering value. The server must validate both the transaction status (`data.status`) and the amount (`data.amount`, expressed in the currency subunit). The callback URL alone is not proof of payment.

Paystack lists Mobile Money as a supported payment channel in supported markets, including Ghana. The implementation should route MoMo through Paystack's hosted/secure flow or server-side charge API, never expose the secret key in the browser, and auto-approve a pending BillFlow business only after a verified server-side success result with matching reference, amount, currency, and onboarding metadata.

Sources:
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/payments/accept-payments/
- https://paystack.com/docs/payments/payment-channels/
- https://paystack.com/docs/payments/verify-payments/

## Production configuration

Set these server-side environment variables in the BillFlow/Vercel project settings; do not expose them to the browser or commit their values:

- `PAYSTACK_SECRET_KEY`: the Paystack secret key used by the server for transaction initialization, verification, and webhook signature validation.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: preferred direct email delivery settings. The from-address must be verified with the email provider.
- `SCHOOL_EMAIL_WEBHOOK_URL` and, optionally, `SCHOOL_EMAIL_WEBHOOK_SECRET`: fallback email webhook settings when Resend is not used.

Configure the Paystack webhook URL as `https://<your-billflow-domain>/api/onboarding/payment/webhook`. The implementation accepts only signed `charge.success` events whose onboarding metadata, reference, GHS currency, and amount match the BillFlow onboarding invoice. Cash registrations remain pending until a Super Admin confirms them. Provider credentials and webhook configuration are required before live Mobile Money auto-approval and direct email delivery can occur.
