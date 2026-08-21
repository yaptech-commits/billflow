"use client";
export const dynamic = "force-dynamic";

// Style reminder: Preserve BillFlow's branded blue glassmorphism surface, white inputs, navy CTA, and mobile-first spacing.
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Banknote, CheckCircle2, CreditCard, Loader2, Smartphone } from "lucide-react";

function PaymentPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const businessId = searchParams?.get("businessId") || "";
  const reference = searchParams?.get("reference") || searchParams?.get("trxref") || "";
  const [user, setUser] = useState<User | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "momo" | "">("");
  const [loading, setLoading] = useState(false);
  const [confirmationState, setConfirmationState] = useState<"idle" | "confirming" | "approved" | "pending" | "error">(reference ? "confirming" : "idle");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState("GHS");
  const [cashAmount, setCashAmount] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const money = useMemo(() => {
    if (amount == null) return "your onboarding amount";
    return `${amount.toLocaleString("en-GH")} ${currency === "GHS" ? "GH₵" : currency}`;
  }, [amount, currency]);

  useEffect(() => {
    if (!reference || !businessId || !user) return;
    let cancelled = false;
    const confirmPayment = async () => {
      try {
        setConfirmationState("confirming");
        const token = await user.getIdToken();
        const response = await fetch("/api/onboarding/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ businessId, reference }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "The payment could not be confirmed.");
        if (cancelled) return;
        setAmount(Number(payload.amount || 0));
        setCurrency(payload.currency || "GHS");
        setConfirmationState("approved");
        setMessage("Payment confirmed. Your BillFlow account has been approved automatically.");
        toast.success("Payment confirmed · Account approved", { duration: 7000 });
      } catch (error) {
        if (cancelled) return;
        const text = error instanceof Error ? error.message : "The payment could not be confirmed.";
        setConfirmationState("error");
        setMessage(text);
        toast.error(text, { duration: 7000 });
      }
    };
    void confirmPayment();
    return () => { cancelled = true; };
  }, [businessId, reference, user]);

  const startPayment = async (method: "cash" | "momo") => {
    if (!businessId) {
      toast.error("Your registration session is incomplete. Please register again.");
      return;
    }
    if (!user) {
      toast.error("Your registration session has expired. Please sign in or register again.");
      return;
    }
    if (method === "cash") {
      const parsedCashAmount = Number(cashAmount);
      if (!cashAmount.trim() || !Number.isFinite(parsedCashAmount) || parsedCashAmount <= 0) {
        toast.error("Enter the cash amount you are paying.");
        return;
      }
    }
    setLoading(true);
    setPaymentMethod(method);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/onboarding/payment/initialize", {
        method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ businessId, paymentMethod: method, ...(method === "cash" ? { cashAmount: Number(cashAmount) } : {}) }),
        });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The payment step could not be started.");
      setAmount(Number(payload.amount || 0));
      setCurrency(payload.currency || "GHS");
      if (payload.cashAmount != null) setCashAmount(String(payload.cashAmount));

      if (payload.status === "checkout_ready" && payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }
      if (payload.status === "cash_pending") {
        setConfirmationState("pending");
        setMessage(payload.message || "Your cash payment is pending administrator confirmation.");
        toast.success("Cash payment request recorded", { duration: 7000 });
        if (auth) await signOut(auth);
        router.replace(`/auth/login?error=${encodeURIComponent("Cash payment request received. Your account is pending administrator confirmation.")}`);
        return;
      }
      if (payload.status === "no_payment_required") {
        setConfirmationState("approved");
        setMessage("Demo Management does not require an onboarding payment. Your account is pending administrator activation.");
        if (auth) await signOut(auth);
        router.replace(`/auth/login?error=${encodeURIComponent("Demo registration received. Contact BillFlow Official for activation.")}`);
        return;
      }
      throw new Error("The payment provider returned an unexpected response.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "The payment step could not be started.";
      toast.error(text, { duration: 7000 });
      setConfirmationState("error");
      setMessage(text);
    } finally {
      setLoading(false);
    }
  };

  if (reference && confirmationState === "confirming") {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <Loader2 className="mb-5 h-12 w-12 animate-spin text-white" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-white">Confirming your payment</h1>
          <p className="mt-3 max-w-sm text-white/75">BillFlow is checking the Mobile Money payment with the provider. Please keep this page open.</p>
        </div>
      </Shell>
    );
  }

  if (reference && confirmationState === "approved") {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-emerald-200" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-white">Payment confirmed</h1>
          <p className="mt-3 text-white/80">{message}</p>
          <p className="mt-3 text-sm text-white/60">Your paid invoice receipt has been sent or queued for your email.</p>
          <button onClick={() => router.replace("/dashboard")} className="mt-7 w-full rounded-xl bg-[#002B5B] px-4 py-3.5 text-lg font-bold text-white shadow-lg transition hover:bg-[#001f42]">Continue to BillFlow</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white">Complete your registration</h1>
        <p className="mt-2 text-white/70">Choose how you want to settle your BillFlow onboarding invoice.</p>
      </div>

      {amount != null && amount > 0 && (
        <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 p-5 text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/60">Startup amount</p>
          <p className="mt-1 text-3xl font-bold">{money}</p>
          <p className="mt-2 text-sm text-white/70">Your invoice receipt will be sent to the business email used during registration.</p>
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-white/20 bg-white/10 p-5 text-white">
        <label htmlFor="cash-amount" className="block text-sm font-semibold uppercase tracking-wide text-white/70">Cash amount you are paying (GHS)</label>
        <input
          id="cash-amount"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cashAmount}
          onChange={(event) => setCashAmount(event.target.value)}
          placeholder="Enter the amount paid"
          className="mt-2 w-full rounded-xl border border-white/25 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none ring-offset-2 placeholder:text-slate-400 focus:ring-2 focus:ring-white"
        />
        <p className="mt-2 text-xs text-white/65">This field is used for Cash payments. Mobile Money is charged for the full onboarding invoice through Paystack.</p>
      </div>

      <div className="space-y-4">
        <button type="button" onClick={() => startPayment("momo")} disabled={loading || !user} className="flex w-full items-center gap-4 rounded-2xl border border-white/25 bg-white px-5 py-4 text-left text-[#0066FF] shadow-md transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60">
          {loading && paymentMethod === "momo" ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /> : <Smartphone className="h-7 w-7" aria-hidden="true" />}
          <span><span className="block text-lg font-bold">Pay with Mobile Money</span><span className="mt-1 block text-sm text-[#0066FF]/70">Use Paystack's secure Ghana Mobile Money checkout.</span></span>
        </button>
        <button type="button" onClick={() => startPayment("cash")} disabled={loading || !user} className="flex w-full items-center gap-4 rounded-2xl border border-white/25 bg-white/10 px-5 py-4 text-left text-white transition hover:border-white/60 disabled:cursor-not-allowed disabled:opacity-60">
          {loading && paymentMethod === "cash" ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /> : <Banknote className="h-7 w-7" aria-hidden="true" />}
          <span><span className="block text-lg font-bold">Pay with Cash</span><span className="mt-1 block text-sm text-white/70">Receive the invoice by email and wait for administrator confirmation.</span></span>
        </button>
      </div>

      {confirmationState === "error" && <p className="mt-5 rounded-xl border border-red-200/30 bg-red-950/20 px-4 py-3 text-sm text-red-100">{message}</p>}
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-white/60"><CreditCard className="h-4 w-4" aria-hidden="true" />Secure server-side payment confirmation</div>
      <p className="mt-5 text-center text-sm text-white/70">Need to stop? <Link href="/auth/login" className="font-bold text-white hover:underline">Return to sign in</Link></p>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10 bg-[#0066FF]">
      <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-blue-400 opacity-50 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-blue-600 opacity-40 blur-[150px]" />
      <div className="relative z-10 w-full max-w-[500px]">
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-[40px] p-8 shadow-2xl md:p-12">{children}</div>
      </div>
    </div>
  );
}

export default function OnboardingPaymentPage() {
  return <Suspense fallback={<Shell><div className="py-16 text-center text-white">Loading payment options…</div></Shell>}><PaymentPageContent /></Suspense>;
}
