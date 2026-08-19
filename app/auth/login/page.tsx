"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, Suspense } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff, Github } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams?.get("error");
    if (error) {
      toast.error(error, { duration: 6000 });
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured || !auth) {
      toast.error("Firebase is not configured for this deployment. Please contact the BillFlow administrator.", { duration: 6000 });
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
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
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-blue-300 rounded-full blur-[100px] opacity-30"></div>
      
      {/* Floating 3D-like shapes (simplified) */}
      <div className="absolute top-[10%] right-[20%] w-24 h-24 border-[12px] border-white/20 rounded-full rotate-45"></div>
      <div className="absolute bottom-[20%] left-[10%] w-32 h-32 bg-gradient-to-br from-white/20 to-transparent rounded-2xl rotate-12 blur-sm"></div>

      <div className="relative z-10 w-full max-w-[450px]">
        {/* Glassmorphism Card */}
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-[40px] p-8 md:p-12 shadow-2xl">
          {/* Logo Area */}
          <div className="mb-8 flex flex-col items-center">
            <img src="/billflow-logo.png" alt="BillFlow" className="w-32 h-32 object-contain mb-6 drop-shadow-2xl" />
            <h1 className="text-white text-4xl font-bold tracking-tight">Login</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-white text-lg font-medium block">Email</label>
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
                  placeholder="Password"
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
              <div className="flex justify-start">
                <Link href="/auth/forgot-password" title="Forgot Password?" className="text-white/80 text-sm hover:text-white transition-colors">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-[#002B5B] text-white rounded-xl py-4 text-xl font-bold hover:bg-[#001f42] transition-all shadow-lg active:scale-[0.98]"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-8">
            <div className="mb-4">
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  try {
                    setEmail("parent.demo@billflow.app");
                    setPassword("BillFlow2026!");
                    await signInWithEmailAndPassword(auth!, "parent.demo@billflow.app", "BillFlow2026!");
                    router.push("/school/portal");
                  } catch {
                    try {
                      // Create demo parent account on the fly if not exists
                      const { createUserWithEmailAndPassword } = await import("firebase/auth");
                      await createUserWithEmailAndPassword(auth!, "parent.demo@billflow.app", "BillFlow2026!");
                      router.push("/school/portal");
                    } catch (err: any) {
                      toast.error("Demo login: " + (err.message || "Please use valid credentials"));
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 text-base font-bold transition-all shadow-lg flex items-center justify-center gap-2"
              >
                🎓 Instant Parent Portal Demo Login
              </button>
            </div>

            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <span className="relative z-10 bg-transparent px-4 text-white/70 text-sm">or continue with</span>
            </div>

            <div className="flex justify-center">
              {/* Google */}
              <button className="flex items-center justify-center bg-white rounded-xl py-3 px-8 hover:bg-gray-100 transition-all shadow-md w-full max-w-[200px]">
                <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-gray-600 font-medium">Google</span>
              </button>
            </div>
          </div>

          <p className="text-center text-white/90 text-lg mt-10">
            Don't have an account?{" "}
            <Link href="/auth/signup" className="text-white font-bold hover:underline">
              Register for free
            </Link>
          </p>
        </div>

        <p className="text-center text-white/60 text-sm mt-8 flex items-center justify-center gap-2">
          Y.A.P Multimedia & Tech · Ghana 🇬🇭
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0066FF] flex items-center justify-center text-white">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
