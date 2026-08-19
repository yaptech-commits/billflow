import type { BusinessProfile } from "@/lib/db";

export interface AdmissionLetterStudent {
  fullName: string;
  admissionNumber: string;
  classGrade: string;
  guardianName?: string;
  status?: string;
  createdAt?: any;
}

export interface AdmissionLetterContent {
  subject: string;
  title: string;
  message: string;
  html: string;
}

export function formatAdmissionDate(value: any) {
  try {
    if (value?.toDate) return value.toDate().toLocaleDateString();
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === "string" || typeof value === "number") return new Date(value).toLocaleDateString();
  } catch {
    // Fall through to the current date when Firestore has not materialized a timestamp yet.
  }
  return new Date().toLocaleDateString();
}

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SC";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeLogoUrl(value: unknown) {
  return typeof value === "string" && /^(data:image\/|https?:\/\/)/i.test(value) ? value : "";
}

export function buildAdmissionLetterContent(
  student: AdmissionLetterStudent,
  businessProfile?: BusinessProfile | null,
  issuedAt: Date = new Date(),
): AdmissionLetterContent {
  const schoolName = businessProfile?.businessName || "School";
  const admissionDate = formatAdmissionDate(student.createdAt || issuedAt);
  const guardianName = student.guardianName || "Parent / Guardian";
  const status = student.status || "active";
  const subject = `Admission Letter · ${student.fullName} · ${schoolName}`;
  const message = [
    `Dear ${guardianName},`,
    "",
    `We are pleased to confirm the admission of ${student.fullName} to ${schoolName}.`,
    "",
    `Student ID: ${student.admissionNumber}`,
    `Class / Grade: ${student.classGrade}`,
    `Admission date: ${admissionDate}`,
    `Student status: ${status}`,
    "",
    "Please keep this letter for your records. The Student ID should be used when accessing the Parent Portal and when communicating with the school.",
    "",
    `We look forward to supporting ${student.fullName}'s learning journey.`,
    "",
    `Regards,\n${schoolName} Admissions Office`,
  ].join("\n");

  const logoUrl = safeLogoUrl(businessProfile?.logoDataUrl);
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(schoolName)} logo" style="width:72px;height:72px;object-fit:contain;display:block" />`
    : `<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;background:#111827;color:#ffffff;font-size:22px;font-weight:700;border-radius:12px">${escapeHtml(initials(schoolName))}</div>`;
  const contactLine = [businessProfile?.address, businessProfile?.phone, businessProfile?.email].filter(Boolean).map(escapeHtml).join(" · ");
  const accent = businessProfile?.accentColor && /^#[0-9a-f]{3,8}$/i.test(businessProfile.accentColor)
    ? businessProfile.accentColor
    : "#9a6500";

  const html = `
    <div style="margin:0;background:#f3f4f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#111827">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db">
        <div style="padding:28px 32px;border-bottom:2px solid #111827;display:flex;align-items:flex-start;justify-content:space-between;gap:24px">
          <div style="display:flex;align-items:center;gap:16px">
            ${logoMarkup}
            <div>
              <div style="font-size:22px;font-weight:700;line-height:1.2">${escapeHtml(schoolName)}</div>
              <div style="margin-top:6px;font-size:12px;color:#4b5563">${contactLine || "School contact details"}</div>
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#6b7280">Official document</div>
            <div style="margin-top:8px;font-size:14px;font-weight:700;color:${escapeHtml(accent)}">ADMISSION LETTER</div>
            <div style="margin-top:5px;font-size:12px;color:#6b7280">${escapeHtml(admissionDate)}</div>
          </div>
        </div>
        <div style="padding:36px 32px;font-size:15px;line-height:1.65">
          <p style="margin:0 0 20px">Dear <strong>${escapeHtml(guardianName)}</strong>,</p>
          <p style="margin:0 0 20px">We are pleased to confirm the admission of <strong>${escapeHtml(student.fullName)}</strong> to <strong>${escapeHtml(schoolName)}</strong>.</p>
          <div style="margin:24px 0;border:1px solid #d1d5db;background:#f8fafc;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
            <div><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6b7280">Student ID</div><div style="margin-top:4px;font-family:monospace;font-weight:700">${escapeHtml(student.admissionNumber)}</div></div>
            <div><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6b7280">Class / Grade</div><div style="margin-top:4px;font-weight:700">${escapeHtml(student.classGrade)}</div></div>
            <div><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6b7280">Admission date</div><div style="margin-top:4px;font-weight:700">${escapeHtml(admissionDate)}</div></div>
            <div><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6b7280">Student status</div><div style="margin-top:4px;font-weight:700;text-transform:capitalize">${escapeHtml(status)}</div></div>
          </div>
          <p style="margin:0 0 20px">Please keep this letter for your records. The Student ID should be used when accessing the Parent Portal and when communicating with the school.</p>
          <p style="margin:0">We look forward to supporting ${escapeHtml(student.fullName)}'s learning journey.</p>
        </div>
        <div style="padding:20px 32px;border-top:1px solid #d1d5db;font-size:13px;display:flex;justify-content:space-between;gap:24px">
          <div><strong>${escapeHtml(schoolName)}</strong><div style="margin-top:4px;color:#6b7280">Admissions Office</div></div>
          <div style="text-align:right;color:#6b7280"><div style="width:140px;border-bottom:1px solid #6b7280;margin:0 0 7px auto"></div>Authorized signature</div>
        </div>
      </div>
    </div>
  `.trim();

  return { subject, title: "Admission Letter", message, html };
}
