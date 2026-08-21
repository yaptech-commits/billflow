"use client";
export const dynamic = "force-dynamic";

// Style reminder: Preserve BillFlow's branded blue glassmorphism surface, white inputs, navy CTA, and mobile-first spacing.
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPagesForBusinessType } from "@/lib/business-type-config";
import { ManagementPlan } from "@/lib/management-plans";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessType, setBusinessType] = useState<"general" | "pharmacy" | "hotel" | "coldstore" | "school">("general");
  const [selectedPlan, setSelectedPlan] = useState<ManagementPlan | "">("");
  const [proBusinessScale, setProBusinessScale] = useState<"large" | "small">("large");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      toast.error("Please select a management plan to continue.");
      return;
    }
    setLoading(true);
    try {
      const firebaseAuth = auth;
      const firestore = db;
      if (!firebaseAuth || !firestore) {
        throw new Error("Firebase is not configured for this deployment. Please contact the BillFlow administrator.");
      }

      // 1. Create User
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      const user = userCredential.user;

      // 2. Update Profile
      await updateProfile(user, { displayName: businessName });

      // 3. Create Business Profile & Initial Staff Record (Owner)
      const businessId = `biz_${user.uid}`;
      
      // Create business record with automatically assigned pages based on business type
      const allowedPages = getPagesForBusinessType(businessType as any);
      await setDoc(doc(firestore, "businesses", businessId), {
        businessName,
        businessType,
        ownerUid: user.uid,
        email,
        status: "pending", // New accounts require payment/approval
        allowedPages, // Auto-assign pages based on business type
        createdAt: serverTimestamp(),
        managementPlan: selectedPlan,
        proBusinessScale: selectedPlan === "pro" ? proBusinessScale : null,
        currency: "GHS",
        taxRate: 0,
        taxInclusive: false,
        paymentStatus: "pending",
        onboardingPaymentMethod: null,
      });

      // Keep the owner-scoped profile in sync so server-side payment verification
      // can approve the same account without relying on client-only state.
      await setDoc(doc(firestore, "businessProfiles", user.uid), {
        businessId,
        ownerUid: user.uid,
        businessName,
        businessType,
        email,
        ownerEmail: email,
        status: "pending",
        allowedPages,
        managementPlan: selectedPlan,
        proBusinessScale: selectedPlan === "pro" ? proBusinessScale : null,
        currency: "GHS",
        paymentStatus: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Owners are resolved from their businessProfiles/{uid} document. Do not
      // create an owner staff document here: staff is reserved for invited
      // salespeople and Firestore intentionally rejects owner-role staff writes.
      toast.success("Account created! Continue to payment.");
      const onboardingQuery = new URLSearchParams({
        businessId,
        plan: selectedPlan,
        ...(selectedPlan === "pro" ? { scale: proBusinessScale } : {}),
      });
      try {
        sessionStorage.setItem("billflow:onboarding-plan", JSON.stringify({
          businessId,
          managementPlan: selectedPlan,
          proBusinessScale: selectedPlan === "pro" ? proBusinessScale : null,
        }));
      } catch {
        // Session storage is only a client-side fallback; server-side pricing remains authoritative.
      }
      const onboardingUrl = `/auth/onboarding-payment?${onboardingQuery.toString()}`;
      // Use a full navigation here so the new Firebase session and pending
      // profile cannot race with the App Router transition.
      window.location.replace(onboardingUrl);
    } catch (err: unknown) {
      const firebaseError = err as { code?: unknown; message?: unknown } | null;
      const rawMessage = typeof firebaseError?.message === "string"
        ? firebaseError.message
        : typeof firebaseError?.code === "string"
          ? firebaseError.code
          : "Signup failed";
      const normalizedCode = typeof firebaseError?.code === "string" ? firebaseError.code : "";
      const msg = rawMessage
        .replace(/^Firebase:\s*/i, "")
        .replace(/\s*\(auth\/[^)]+\)\.?$/i, "")
        .trim();
      const friendlyMessage = normalizedCode.includes("auth/email-already-in-use")
        ? "This email already has a BillFlow account. Please sign in or use another email."
        : normalizedCode.includes("auth/invalid-email")
          ? "Enter a valid email address."
          : normalizedCode.includes("auth/weak-password")
            ? "Choose a stronger password with at least 6 characters."
            : msg || "Signup failed. Please try again.";
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 bg-[#0066FF]">
      {/* Abstract Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400 rounded-full blur-[120px] opacity-50 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[150px] opacity-40"></div>
      
      <div className="relative z-10 w-full max-w-[500px]">
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-[40px] p-8 md:p-12 shadow-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-white text-4xl font-bold tracking-tight mb-2">Create Account</h1>
            <p className="text-white/70">Join BillFlow and manage your business</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            <div className="space-y-2">
              <label className="text-white text-lg font-medium block">Business Name</label>
              <input
                className="w-full bg-white rounded-xl px-4 py-3 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                type="text"
                placeholder="Paddy's & More Fashion Hub"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-white text-lg font-medium block">Business Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBusinessType("general")}
                  className={`py-3 px-4 rounded-xl border text-base font-semibold transition-all ${
                    businessType === "general"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  General Business
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessType("pharmacy")}
                  className={`py-3 px-4 rounded-xl border text-base font-semibold transition-all ${
                    businessType === "pharmacy"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  Pharmacy
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessType("hotel")}
                  className={`py-3 px-4 rounded-xl border text-base font-semibold transition-all ${
                    businessType === "hotel"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  Hotel
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessType("coldstore")}
                  className={`py-3 px-4 rounded-xl border text-base font-semibold transition-all ${
                    businessType === "coldstore"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  Coldstore
                </button>
                <button
                  type="button"
                  onClick={() => setBusinessType("school")}
                  className={`py-3 px-4 rounded-xl border text-base font-semibold transition-all ${
                    businessType === "school"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  School
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-white text-lg font-medium block">Select Plan</label>
              <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Select a BillFlow management plan">
                <button
                  type="button"
                  aria-pressed={selectedPlan === "pro"}
                  onClick={() => setSelectedPlan("pro")}
                  className={`min-h-[112px] rounded-xl border px-4 py-3 text-left transition-all ${
                    selectedPlan === "pro"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  <span className="block text-base font-bold">Pro Management</span>
                  <span className={`mt-1 block text-xs ${selectedPlan === "pro" ? "text-[#0066FF]/75" : "text-white/70"}`}>
                    Lifetime activation
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={selectedPlan === "standard"}
                  onClick={() => setSelectedPlan("standard")}
                  className={`min-h-[112px] rounded-xl border px-4 py-3 text-left transition-all ${
                    selectedPlan === "standard"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  <span className="block text-base font-bold">Standard Management</span>
                  <span className={`mt-1 block text-xs ${selectedPlan === "standard" ? "text-[#0066FF]/75" : "text-white/70"}`}>
                    Monthly renewal
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={selectedPlan === "demo"}
                  onClick={() => setSelectedPlan("demo")}
                  className={`min-h-[112px] rounded-xl border px-4 py-3 text-left transition-all ${
                    selectedPlan === "demo"
                      ? "border-white bg-white text-[#0066FF] shadow-md"
                      : "border-white/30 bg-white/10 text-white hover:border-white/60"
                  }`}
                >
                  <span className="block text-base font-bold">Demo Management</span>
                  <span className={`mt-1 block text-xs ${selectedPlan === "demo" ? "text-[#0066FF]/75" : "text-white/70"}`}>
                    Explore BillFlow first
                  </span>
                </button>
              </div>

              {selectedPlan === "pro" && (
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold">Pro Management</p>
                      <p className="mt-1 text-sm text-white/70">Package: Lifetime Activation (Monthly Database Upgrade)</p>
                    </div>
                    <span className="whitespace-nowrap text-lg font-bold">3,500 GH₵</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2">
                      <span className="text-white/70">Startup Price</span>
                      <span className="font-semibold">3,500 GH₵</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-white/70">Monthly Database Upgrade</span>
                      <span className="font-semibold">{proBusinessScale === "large" ? "500" : "300"} GH₵ / month</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Business scale (optional)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setProBusinessScale("large")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                          proBusinessScale === "large" ? "border-white bg-white text-[#0066FF]" : "border-white/25 text-white hover:border-white/60"
                        }`}
                      >
                        Large scale · 500 GH₵
                      </button>
                      <button
                        type="button"
                        onClick={() => setProBusinessScale("small")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                          proBusinessScale === "small" ? "border-white bg-white text-[#0066FF]" : "border-white/25 text-white hover:border-white/60"
                        }`}
                      >
                        Small scale · 300 GH₵
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedPlan === "standard" && (
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold">Standard Management</p>
                      <p className="mt-1 text-sm text-white/70">Package: Monthly Renewal</p>
                    </div>
                    <span className="whitespace-nowrap text-lg font-bold">1,500 GH₵</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2">
                      <span className="text-white/70">Startup Price</span>
                      <span className="font-semibold">1,500 GH₵</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-white/70">Monthly Renewal</span>
                      <span className="font-semibold">300 GH₵ / month</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedPlan === "demo" && (
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white/80">
                  <p className="font-bold text-white">Demo Management selected</p>
                  <p className="mt-1">Use this option to request a BillFlow demonstration before choosing a paid management plan.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-white text-lg font-medium block">Email Address</label>
              <input
                className="w-full bg-white rounded-xl px-4 py-3 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                type="email"
                placeholder="username@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-white text-lg font-medium block">Password</label>
              <div className="relative">
                <input
                  className="w-full bg-white rounded-xl px-4 py-3 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-[#002B5B] text-white rounded-xl py-4 text-xl font-bold hover:bg-[#001f42] transition-all shadow-lg active:scale-[0.98] mt-4"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="text-center text-white/90 text-lg mt-8">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-white font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
