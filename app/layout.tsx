import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "react-hot-toast";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "BillFlow — Smart Billing for African Businesses",
  description: "Invoicing, MoMo payments, WiFi vouchers & reports — built for Ghana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="bg-black text-surface antialiased">
        <AuthProvider>
          {children}
          <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#16161F",
                color: "#E8E8F0",
                border: "1px solid #1E1E2E",
                borderRadius: "10px",
                fontSize: "13px",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
