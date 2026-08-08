"use client";
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Update Profile
      await updateProfile(user, { displayName: businessName });

      // 3. Create Business Profile & Initial Staff Record (Owner)
      const businessId = `biz_${user.uid}`;
      
      // Create business record
      await setDoc(doc(db, "businesses", businessId), {
        businessName,
        ownerUid: user.uid,
        email,
        status: "pending", // New accounts require approval
        createdAt: serverTimestamp(),
        currency: "GHS",
        taxRate: 0,
        taxInclusive: false
      });

      // Create staff record for owner
      await setDoc(doc(db, "staff", `staff_${user.uid}`), {
        businessId,
        staffUid: user.uid,
        email,
        role: "owner",
        status: "active",
        createdAt: serverTimestamp()
      });

      toast.success("Account created! Waiting for admin approval.");
      router.push("/auth/login?error=Account pending approval. Contact BillFlow Official for approval.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      toast.error(msg.replace("Firebase: ", "").replace(/ \(auth.*\)\.?/, ""));
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
            <div className="mb-4 flex justify-center">
              <img src="/images/logo.png" alt="BillFlow Logo" className="h-32 w-auto" />
            </div>
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
