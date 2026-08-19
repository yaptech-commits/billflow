import type { BusinessProfile } from "@/lib/db";
import { buildReceiptHtml } from "@/lib/print-receipt";

export type SchoolTemplateKey =
  | "feePaymentEmailSubject"
  | "feePaymentEmailBody"
  | "reportCardEmailSubject"
  | "reportCardEmailBody";

export type SchoolTemplateValues = {
  studentName?: string;
  classGrade?: string;
  feeTitle?: string;
  amount?: string;
  balance?: string;
  receiptNumber?: string;
  term?: string;
  averageScore?: string;
  presentDays?: string;
  absentDays?: string;
  schoolName?: string;
  portalUrl?: string;
};

export const DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES: Record<SchoolTemplateKey, string> = {
  feePaymentEmailSubject: "Payment received for {{studentName}}",
  feePaymentEmailBody: "A payment of {{amount}} has been received for {{feeTitle}} for {{studentName}} ({{classGrade}}). Receipt {{receiptNumber}}. Remaining balance: {{balance}}.",
  reportCardEmailSubject: "{{term}} report card for {{studentName}}",
  reportCardEmailBody: "The {{term}} report card for {{studentName}} ({{classGrade}}) is now available in the {{schoolName}} parent portal. Average score: {{averageScore}}. Attendance: {{presentDays}} present, {{absentDays}} absent.",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderSchoolNotificationTemplate(template: string | undefined, values: SchoolTemplateValues, fallback: string) {
  const source = template?.trim() || fallback;
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => String(values[key as keyof SchoolTemplateValues] ?? ""));
}

export function buildFeePaymentNotificationContent(params: {
  profile: BusinessProfile | null;
  studentName: string;
  classGrade: string;
  feeTitle: string;
  paymentAmount: number;
  balance: number;
  receiptNumber: string;
  issuedAt: Date;
  amount: number;
  templateSubject?: string;
  templateBody?: string;
}) {
  const schoolName = params.profile?.businessName || "School";
  const currency = params.profile?.currency || "GHS";
  const values: SchoolTemplateValues = {
    studentName: params.studentName,
    classGrade: params.classGrade,
    feeTitle: params.feeTitle,
    amount: `${currency} ${params.paymentAmount.toFixed(2)}`,
    balance: `${currency} ${params.balance.toFixed(2)}`,
    receiptNumber: params.receiptNumber,
    schoolName,
  };
  const message = renderSchoolNotificationTemplate(
    params.templateBody,
    values,
    DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES.feePaymentEmailBody,
  );
  const title = renderSchoolNotificationTemplate(
    params.templateSubject,
    values,
    DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES.feePaymentEmailSubject,
  );
  const receiptHtml = buildReceiptHtml({
    documentTitle: "FEE PAYMENT RECEIPT",
    invoiceNumber: params.receiptNumber,
    issuedAt: params.issuedAt,
    dueDate: params.issuedAt,
    items: [{ productName: params.feeTitle, quantity: 1, unitPrice: params.amount }],
    subtotal: params.amount,
    taxAmount: 0,
    total: params.amount,
    amountPaid: params.paymentAmount,
    customerName: params.studentName,
    studentName: params.studentName,
    classGrade: params.classGrade,
    businessName: schoolName,
    logoDataUrl: params.profile?.logoDataUrl,
    footerNote: `Payment received: ${params.paymentAmount.toLocaleString()} • Balance remaining: ${params.balance.toLocaleString()}`,
    currencyCode: currency,
  });

  return {
    title,
    message,
    html: `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111827"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"/>${receiptHtml}</div>`,
  };
}

export function buildReportCardNotificationContent(params: {
  profile: BusinessProfile | null;
  studentName: string;
  classGrade: string;
  term: string;
  averageScore: string;
  presentDays: number;
  absentDays: number;
  templateSubject?: string;
  templateBody?: string;
}) {
  const schoolName = params.profile?.businessName || "School";
  const values: SchoolTemplateValues = {
    studentName: params.studentName,
    classGrade: params.classGrade,
    term: params.term,
    averageScore: params.averageScore,
    presentDays: String(params.presentDays),
    absentDays: String(params.absentDays),
    schoolName,
  };
  const message = renderSchoolNotificationTemplate(
    params.templateBody,
    values,
    DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES.reportCardEmailBody,
  );
  const title = renderSchoolNotificationTemplate(
    params.templateSubject,
    values,
    DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES.reportCardEmailSubject,
  );
  const logo = typeof params.profile?.logoDataUrl === "string" && /^(data:image\/|https?:\/\/)/i.test(params.profile.logoDataUrl)
    ? `<img src="${escapeHtml(params.profile.logoDataUrl)}" alt="${escapeHtml(schoolName)} logo" style="max-height:72px;max-width:180px;object-fit:contain"/>`
    : "";
  const accent = params.profile?.accentColor || "#F5A623";
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111827;border:1px solid #e5e7eb;padding:28px"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid ${escapeHtml(accent)};padding-bottom:18px">${logo}<div style="text-align:right"><strong>${escapeHtml(schoolName)}</strong><div style="font-size:12px;color:#6b7280">${escapeHtml(params.term)} report card</div></div></div><h1 style="font-size:22px;margin:24px 0 10px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px"><div style="background:#f8fafc;padding:14px"><small>Average score</small><strong style="display:block;margin-top:6px">${escapeHtml(params.averageScore)}</strong></div><div style="background:#f8fafc;padding:14px"><small>Present days</small><strong style="display:block;margin-top:6px">${params.presentDays}</strong></div><div style="background:#f8fafc;padding:14px"><small>Absent days</small><strong style="display:block;margin-top:6px">${params.absentDays}</strong></div></div><p style="font-size:12px;color:#6b7280;margin-top:24px">Open the BillFlow Parent Portal to view the full report card.</p></div>`;
  return { title, message, html };
}

export function buildWhatsAppMessage(title: string, message: string) {
  return `${title}\n\n${message}`.trim();
}
