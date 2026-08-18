import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccount) {
    const serviceAccount = JSON.parse(rawServiceAccount);
    return initializeApp({ credential: cert(serviceAccount) });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export async function verifyServerFirebaseToken(token: string) {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin credentials are not configured");
  return getAuth(app).verifyIdToken(token);
}
