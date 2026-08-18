"use client";

/**
 * BillFlow Parent Portal style reminder: keep the public school experience calm,
 * mobile-first, and task-led. Use a single indigo action surface, generous
 * spacing, clear status colors, and never expose the registered-student list
 * before a guardian performs a lookup.
 */

import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Award,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronRight,
  DollarSign,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Printer,
  Search,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

export const dynamic = "force-dynamic";

type PortalCandidate = {
  id: string;
  fullName: string;
  admissionNumber: string;
  classGrade: string;
  status: string;
};

type PortalStudent = PortalCandidate & {
  businessId: string;
  propertyId: string;
};

type PortalAttendance = {
  id: string;
  date: string;
  status: "present" | "absent" | "late" | "excused";
  remarks?: string;
};

type PortalFee = {
  id: string;
  feeTitle: string;
  amount: number;
  amountPaid: number;
  balance: number;
  status: "unpaid" | "partial" | "paid";
  dueDate?: string;
  term?: string;
};

type PortalSubject = {
  name: string;
  score: number;
  grade: string;
  remarks?: string;
};

type PortalReportCard = {
  id: string;
  term: string;
  classGrade: string;
  subjects: PortalSubject[];
  averageScore: number;
  overallGrade: string;
  publishedAt?: string | null;
};

type PortalAnnouncement = {
  id: string;
  title: string;
  message: string;
  targetClass?: string;
  createdAt?: string | null;
};

type PortalDashboard = {
  student: PortalStudent;
  school: {
    name: string;
    propertyName?: string;
    logoDataUrl?: string;
    portalAccentColor?: string;
    currency?: string;
  };
  attendance: PortalAttendance[];
  fees: PortalFee[];
  assessments: PortalSubject[];
  reportCards: PortalReportCard[];
  announcements: PortalAnnouncement[];
};

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function money(value: number, currency = "GHS") {
  return `${currency === "GHS" ? "GH₵" : currency} ${Number(value || 0).toFixed(2)}`;
}

function readableTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#0F172A" : "#FFFFFF";
}

function statusClasses(status: PortalAttendance["status"]) {
  if (status === "present" || status === "excused") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "absent") return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  return "bg-amber-500/10 text-amber-300 border-amber-500/20";
}

const portalFeatures: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: BookOpen, title: "Class details", description: "See your ward's current class information." },
  { icon: Calendar, title: "Attendance", description: "Review attendance records and status history." },
  { icon: FileText, title: "Reports and fees", description: "View academic reports and fee statements." },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] || character));
}

export default function SchoolParentPortal() {
  const [lookup, setLookup] = useState("");
  const [candidates, setCandidates] = useState<PortalCandidate[]>([]);
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportCard, setReportCard] = useState<PortalReportCard | null>(null);

  const attendanceSummary = useMemo(() => {
    const total = dashboard?.attendance.length || 0;
    const present = dashboard?.attendance.filter((item) => item.status === "present" || item.status === "excused").length || 0;
    const absent = dashboard?.attendance.filter((item) => item.status === "absent").length || 0;
    const late = dashboard?.attendance.filter((item) => item.status === "late").length || 0;
    return { total, present, absent, late, rate: total ? Math.round((present / total) * 100) : 0 };
  }, [dashboard]);

  const outstandingFees = useMemo(
    () => dashboard?.fees.reduce((total, fee) => total + Number(fee.balance || 0), 0) || 0,
    [dashboard],
  );

  const averageScore = useMemo(() => {
    const scores = dashboard?.assessments.map((subject) => Number(subject.score || 0)) || [];
    return scores.length ? (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(1) : "—";
  }, [dashboard]);

  async function lookupStudent(event?: FormEvent, studentId?: string) {
    event?.preventDefault();
    const value = lookup.trim();
    if (value.length < 2) {
      toast.error("Enter a Student ID or Ward Name.");
      return;
    }

    setLoading(true);
    setCandidates([]);
    try {
      const response = await fetch("/api/school/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: value, ...(studentId ? { studentId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No matching student found.");

      if (payload.candidates) {
        setCandidates(payload.candidates);
        toast("More than one student matched. Select the correct ward below.");
        return;
      }

      setDashboard(payload.dashboard);
      setLookup(payload.dashboard.student.fullName);
    } catch (error: any) {
      setDashboard(null);
      setCandidates([]);
      toast.error(error.message || "Could not open the student dashboard.");
    } finally {
      setLoading(false);
    }
  }

  function resetPortal() {
    setDashboard(null);
    setCandidates([]);
    setReportCard(null);
    setLookup("");
  }

  const portalAccent = dashboard?.school.portalAccentColor || "#4F46E5";
  const portalAccentText = readableTextColor(portalAccent);
  const portalTheme = { "--portal-accent": portalAccent } as CSSProperties;

  const portalStats: Array<{ icon: LucideIcon; label: string; value: string; helper: string; color: string }> = dashboard ? [
    { icon: Calendar, label: "Attendance rate", value: `${attendanceSummary.rate}%`, helper: `${attendanceSummary.present} present · ${attendanceSummary.absent} absent`, color: "text-indigo-300" },
    { icon: Award, label: "Average score", value: averageScore === "—" ? "—" : `${averageScore}%`, helper: `${dashboard.assessments.length} subject record${dashboard.assessments.length === 1 ? "" : "s"}`, color: "text-amber-300" },
    { icon: DollarSign, label: "Outstanding fees", value: money(outstandingFees, dashboard.school.currency), helper: `${dashboard.fees.length} fee statement${dashboard.fees.length === 1 ? "" : "s"}`, color: "text-emerald-300" },
    { icon: Bell, label: "School updates", value: String(dashboard.announcements.length), helper: "Relevant announcements", color: "text-sky-300" },
  ] : [];

  function printReportCard(card: PortalReportCard) {
    if (!dashboard) return;
    const subjects = card.subjects.map((subject) => `
      <tr><td>${escapeHtml(subject.name)}</td><td>${subject.score}</td><td>${escapeHtml(subject.grade)}</td><td>${escapeHtml(subject.remarks || "—")}</td></tr>
    `).join("");
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error("Please allow pop-ups to download the report card.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(dashboard.student.fullName)} - ${escapeHtml(card.term)}</title><style>
      body{font-family:Arial,sans-serif;color:#172033;padding:32px;max-width:800px;margin:auto}h1{margin:0 0 4px}p{color:#596579}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #d7dce5;padding:10px;text-align:left}th{background:#eef2f7}td:nth-child(2),td:nth-child(3){text-align:center}.summary{display:flex;justify-content:space-between;margin-top:24px;padding:16px;background:#f5f7fa;border-radius:10px}@media print{body{padding:0}}
    </style></head><body><h1>${escapeHtml(dashboard.school.name)}</h1><p>Official termly academic report card</p><hr><p><strong>Student:</strong> ${escapeHtml(dashboard.student.fullName)}<br><strong>Student ID:</strong> ${escapeHtml(dashboard.student.admissionNumber)}<br><strong>Class:</strong> ${escapeHtml(card.classGrade)}<br><strong>Term:</strong> ${escapeHtml(card.term)}</p><div class="summary"><strong>Average: ${card.averageScore}</strong><strong>Overall grade: ${escapeHtml(card.overallGrade)}</strong></div><table><thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${subjects}</tbody></table><script>window.onload=()=>{window.print()}</script></body></html>`);
    win.document.close();
  }

  return (
    <div style={portalTheme} className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/85 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div style={{ borderColor: `${portalAccent}55`, backgroundColor: `${portalAccent}22`, color: portalAccent }} className="flex h-10 w-10 items-center justify-center rounded-xl border">
              {dashboard?.school.logoDataUrl ? <img src={dashboard.school.logoDataUrl} alt={`${dashboard.school.name || "School"} logo`} className="h-8 w-8 rounded-lg object-contain" /> : <GraduationCap className="h-6 w-6" />}
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-base font-bold tracking-tight text-white sm:text-lg">
                {dashboard?.school.name || "School Parent Portal"}
                <span style={{ borderColor: `${portalAccent}55`, backgroundColor: `${portalAccent}22`, color: portalAccent }} className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">Parent Portal</span>
              </h1>
              <p className="text-[11px] text-slate-400">Student access without email or password</p>
            </div>
          </div>
          {dashboard ? (
            <button onClick={resetPortal} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700">
              <LogOut className="h-3.5 w-3.5" /> Switch student
            </button>
          ) : (
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 sm:flex">
              <ShieldCheck className="h-4 w-4" /> Property-scoped access
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        {!dashboard ? (
          <section className="mx-auto max-w-4xl">
            <div style={{ backgroundColor: portalAccent }} className="relative overflow-hidden rounded-[2rem] border border-white/20 px-6 py-12 text-center shadow-2xl shadow-indigo-950/40 sm:px-12 sm:py-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-slate-950/20 blur-3xl" />
              <div className="relative space-y-5">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg">
                  <GraduationCap style={{ color: portalAccentText }} className="h-9 w-9" />
                </div>
                <div className="space-y-3">
                  <p style={{ color: portalAccentText }} className="text-xs font-bold uppercase tracking-[0.22em] opacity-75">Guardian access</p>
                  <h2 style={{ color: portalAccentText }} className="text-3xl font-black tracking-tight sm:text-5xl">View your ward&apos;s school journey</h2>
                  <p style={{ color: portalAccentText }} className="mx-auto max-w-2xl text-sm leading-6 opacity-75 sm:text-base">
                    Enter the student&apos;s ID or full name below. No email, password, or separate parent account is required.
                  </p>
                </div>
                <form onSubmit={lookupStudent} className="mx-auto flex max-w-2xl flex-col gap-3 pt-3 sm:flex-row">
                  <label className="sr-only" htmlFor="student-lookup">Student ID or Ward Name</label>
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="student-lookup"
                      value={lookup}
                      onChange={(event) => setLookup(event.target.value)}
                      placeholder="Student ID or Ward Name"
                      autoComplete="off"
                      className="w-full rounded-2xl border border-white/20 bg-white px-12 py-4 text-base text-slate-900 outline-none ring-[var(--portal-accent)] placeholder:text-slate-400 focus:ring-4"
                    />
                  </div>
                  <button disabled={loading} type="submit" style={{ backgroundColor: "#020617" }} className="flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-lg transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-70">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRightIcon />}
                    {loading ? "Opening..." : "Open dashboard"}
                  </button>
                </form>
                <div style={{ color: portalAccentText }} className="flex items-center justify-center gap-2 pt-2 text-xs opacity-75">
                  <ShieldCheck className="h-4 w-4" /> Your results are limited to the student&apos;s school property.
                </div>
              </div>
            </div>

            {candidates.length > 0 && (
              <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl sm:p-6">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-xl bg-amber-500/10 p-2 text-amber-300"><AlertCircle className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-bold text-white">Select the correct student</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">More than one record matched that name. Confirm the Student ID and class before opening the dashboard.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {candidates.map((candidate) => (
                    <button key={candidate.id} onClick={() => lookupStudent(undefined, candidate.id)} className="group flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-indigo-500/50 hover:bg-slate-950">
                      <span>
                        <span className="block font-semibold text-white group-hover:text-indigo-200">{candidate.fullName}</span>
                        <span className="mt-1 block text-xs text-slate-400">ID: <span className="font-mono text-slate-300">{candidate.admissionNumber || "Not assigned"}</span> · Class: {candidate.classGrade || "Unassigned"}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-indigo-300" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 pt-8 sm:grid-cols-3">
              {portalFeatures.map(({ icon: FeatureIcon, title, description }) => (
                <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"><FeatureIcon style={{ color: portalAccent }} className="mb-3 h-5 w-5" /><h3 className="text-sm font-bold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-8">
            <div className="flex flex-col justify-between gap-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl sm:flex-row sm:items-center sm:p-8">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-xl font-black text-indigo-200">{dashboard.student.fullName.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black text-white">{dashboard.student.fullName}</h2><span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 font-mono text-xs text-indigo-200">{dashboard.student.admissionNumber || "No ID"}</span></div>
                  <p className="mt-1 text-sm text-slate-400">Class: <span className="font-semibold text-white">{dashboard.student.classGrade || "Unassigned"}</span><span className="mx-2 text-slate-600">•</span> Status: <span className="font-semibold capitalize text-emerald-300">{dashboard.student.status}</span></p>
                </div>
              </div>
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"><Printer className="h-4 w-4" /> Print summary</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {portalStats.map(({ icon: StatIcon, label, value, helper, color }) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">{label}</span><StatIcon className={`h-5 w-5 ${color}`} /></div><p className="mt-3 text-2xl font-black text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div>
              ))}
            </div>

            <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-8">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                  <div className="mb-5 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold text-white"><Calendar className="h-5 w-5 text-indigo-300" /> Attendance records</h3><span className="text-xs text-slate-500">{attendanceSummary.total} logged</span></div>
                  {dashboard.attendance.length === 0 ? <EmptyState message="No attendance records have been published yet." /> : <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{dashboard.attendance.map((record) => <div key={record.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs"><span className="text-slate-300">{formatDate(record.date)}</span><span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold uppercase ${statusClasses(record.status)}`}>{record.status === "present" || record.status === "excused" ? <CheckCircle className="h-3.5 w-3.5" /> : record.status === "absent" ? <XCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{record.status}</span></div>)}</div>}
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                  <div className="mb-5 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold text-white"><Award className="h-5 w-5 text-amber-300" /> Academic performance</h3><span className="text-xs text-slate-500">{dashboard.reportCards.length} term{dashboard.reportCards.length === 1 ? "" : "s"}</span></div>
                  {dashboard.reportCards.length === 0 ? <EmptyState message="No report card has been published for this student yet." /> : <div className="space-y-4">{dashboard.reportCards.map((card) => <div key={card.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h4 className="font-bold text-white">{card.term}</h4><p className="mt-1 text-xs text-slate-500">Class: {card.classGrade} · Published: {formatDate(card.publishedAt)}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">{card.averageScore}% · {card.overallGrade}</span><button onClick={() => setReportCard(card)} className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20">View report</button></div></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{card.subjects.map((subject) => <div key={`${card.id}-${subject.name}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><p className="truncate text-xs text-slate-500">{subject.name}</p><p className="mt-1 font-bold text-white">{subject.score} <span className="text-amber-300">({subject.grade})</span></p></div>)}</div></div>)}</div>}
                </div>
              </div>

              <div className="space-y-8">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6"><h3 className="mb-5 flex items-center gap-2 font-bold text-white"><DollarSign className="h-5 w-5 text-emerald-300" /> Fee statements</h3>{dashboard.fees.length === 0 ? <EmptyState message="No fee statements are available yet." /> : <div className="space-y-3">{dashboard.fees.map((fee) => <div key={fee.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-white">{fee.feeTitle}</h4><p className="mt-1 text-xs text-slate-500">{fee.term || "Term not specified"}{fee.dueDate ? ` · Due ${formatDate(fee.dueDate)}` : ""}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${fee.status === "paid" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : fee.status === "partial" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>{fee.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-500">Total</p><p className="mt-1 font-semibold text-white">{money(fee.amount, dashboard.school.currency)}</p></div><div><p className="text-slate-500">Balance</p><p className="mt-1 font-semibold text-rose-300">{money(fee.balance, dashboard.school.currency)}</p></div></div></div>)}</div>}</div>
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6"><h3 className="mb-5 flex items-center gap-2 font-bold text-white"><Bell className="h-5 w-5 text-sky-300" /> School announcements</h3>{dashboard.announcements.length === 0 ? <EmptyState message="No announcements for this student right now." /> : <div className="space-y-3">{dashboard.announcements.map((announcement) => <div key={announcement.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><h4 className="text-sm font-bold text-white">{announcement.title}</h4><span className="shrink-0 text-[10px] text-slate-500">{formatDate(announcement.createdAt)}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{announcement.message}</p></div>)}</div>}</div>
              </div>
            </div>
          </section>
        )}
      </main>

      {reportCard && dashboard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <div className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-300">{dashboard.school.name}</p><h3 className="mt-1 text-xl font-black text-white">{reportCard.term} report card</h3><p className="mt-1 text-xs text-slate-400">{dashboard.student.fullName} · {dashboard.student.admissionNumber || "No ID"} · {reportCard.classGrade}</p></div><button onClick={() => setReportCard(null)} aria-label="Close report card" className="rounded-xl bg-slate-800 px-3 py-2 text-slate-400 hover:text-white">✕</button></div>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">Subject</th><th className="p-3 text-center">Score</th><th className="p-3 text-center">Grade</th><th className="p-3">Remarks</th></tr></thead><tbody className="divide-y divide-slate-800">{reportCard.subjects.map((subject) => <tr key={subject.name}><td className="p-3 font-semibold text-white">{subject.name}</td><td className="p-3 text-center text-indigo-200">{subject.score}</td><td className="p-3 text-center font-bold text-amber-300">{subject.grade}</td><td className="p-3 text-slate-400">{subject.remarks || "—"}</td></tr>)}</tbody></table></div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><span className="text-sm font-bold text-white">Average: {reportCard.averageScore}%</span><span className="text-sm font-bold text-amber-300">Overall grade: {reportCard.overallGrade}</span></div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => printReportCard(reportCard)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"><Printer className="h-4 w-4" /> Print / download</button><button onClick={() => setReportCard(null)} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 px-5 py-10 text-center"><User className="h-8 w-8 text-slate-700" /><p className="mt-3 text-xs text-slate-500">{message}</p></div>;
}

function ArrowRightIcon() {
  return <ChevronRight className="h-5 w-5" />;
}
