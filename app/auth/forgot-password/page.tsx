"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
      toast.success("Reset link sent to your email!");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast.error(msg.replace("Firebase: ", "").replace(/ \(auth.*\)\.?/, ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center mb-16 justify-center">
          <img src="/images/lockup.png" alt="BillFlow Logo" className="h-40 w-auto" />
        </div>

        <div className="card">
          <Link href="/auth/login" className="flex items-center gap-1.5 text-xs text-muted hover:text-gold mb-6 transition-colors">
            <ArrowLeft size={14} /> Back to login
          </Link>

          <h1 className="text-xl font-bold text-white mb-1">Reset password</h1>
          <p className="text-muted text-sm mb-6">
            {sent 
              ? "Check your email for a link to reset your password. If you don't see it, check your spam folder." 
              : "Enter your email address and we'll send you a link to reset your password."}
          </p>

          {!sent && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? "Sending link..." : "Send Reset Link"}
              </button>
            </form>
          )}

          {sent && (
            <button 
              onClick={() => setSent(false)} 
              className="btn-ghost w-full justify-center text-xs"
            >
              Try another email
            </button>
          )}
        </div>

        <p className="text-center text-muted text-xs mt-6">
          Y.A.P Multimedia & Tech · Ghana 🇬🇭
        </p>
      </div>
    </div>
  );
}
