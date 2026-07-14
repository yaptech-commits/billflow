# BillFlow — Smart Billing SaaS for Ghana 🇬🇭

All-in-one billing web app with invoicing, MoMo payments, WiFi vouchers, and reports.

## Tech Stack
- **Next.js 14** (App Router)
- **Firebase** (Auth + Firestore)
- **Tailwind CSS**
- **Recharts** (charts)
- **Paystack** (payments)

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g. `billflow-gh`)
3. Enable **Authentication** → Email/Password
4. Enable **Firestore Database** → Start in production mode
5. Go to Project Settings → Your Apps → Add Web App
6. Copy your config values

### 3. Configure environment variables
```bash
cp .env.local.example .env.local
```
Fill in your Firebase values in `.env.local`

### 4. Set up Firestore security rules
In Firebase Console → Firestore → Rules, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{collection}/{docId} {
      allow read, write: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

### 5. Run development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Features
| Feature | Status |
|---|---|
| Email/Password Auth | ✅ |
| Dashboard with charts | ✅ |
| Invoice CRUD | ✅ |
| Client management | ✅ |
| WiFi Voucher generation | ✅ |
| MoMo + Card payment tracking | ✅ |
| Reports (revenue vs expenses) | ✅ |
| Settings + gateway toggles | ✅ |

## 🔐 Adding Paystack
1. Get your keys from [Paystack Dashboard](https://dashboard.paystack.com/#/settings/developer)
2. Add to `.env.local`
3. Use `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` in your payment component

## 🌍 Deploy to Vercel
```bash
npm install -g vercel
vercel
```
Add your `.env.local` values to Vercel's Environment Variables.

---

Built by Y.A.P Multimedia & Tech · Ghana 🇬🇭
 
\n# Deployment Trigger
