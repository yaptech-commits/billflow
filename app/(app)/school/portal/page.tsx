"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AttendanceRecord,
  Assessment,
  buildTermAnalytics,
  DEFAULT_PROPERTY_ID,
  getAssessmentsByStudentIds,
  getAttendanceByStudentIds,
  getAvailableTerms,
  getSchoolNotificationsForStudents,
  getStudentFeesByIds,
  getStudentsByIds,
  SchoolNotification,
  Student,
  StudentFee,
} from "@/lib/school-db";
import { getBusinessProfile, BusinessProfile } from "@/lib/db";
import { Bell, BookOpenCheck, CalendarCheck2, CreditCard, FileText, Printer, RefreshCw, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";

function money(amount: number, profile: BusinessProfile | null) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: profile?.currency || "GHS",
    maximumFractionDigits: 2,
  }).format(amount);
}

function dateLabel(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  return String(value);
}

export default function ParentPortalPage() {
  const { user, role, businessId, propertyId, parentStudentIds } = useAuth();
  const scopedPropertyId = propertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [notifications, setNotifications] = useState<SchoolNotification[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!businessId || !parentStudentIds.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [studentList, feeList, attendanceList, assessmentList, notificationList, profile] = await Promise.all([
        getStudentsByIds(businessId, parentStudentIds, scopedPropertyId),
        getStudentFeesByIds(businessId, parentStudentIds, scopedPropertyId),
        getAttendanceByStudentIds(businessId, parentStudentIds, scopedPropertyId),
        getAssessmentsByStudentIds(businessId, parentStudentIds, scopedPropertyId),
        getSchoolNotificationsForStudents(businessId, parentStudentIds, scopedPropertyId, user?.email || undefined),
        getBusinessProfile(businessId),
      ]);
      setStudents(studentList);
      setFees(feeList);
      setAttendance(attendanceList);
      setAssessments(assessmentList);
      setNotifications(notificationList);
      setBusinessProfile(profile);
      const availableTerms = getAvailableTerms(assessmentList, attendanceList);
      setTerms(availableTerms);
      setSelectedTerm((current) => current && availableTerms.includes(current) ? current : availableTerms[0] || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load your school portal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [businessId, scopedPropertyId, parentStudentIds.join(","), user?.email]);

  const analytics = useMemo(
    () => buildTermAnalytics(students, assessments, attendance, selectedTerm),
    [students, assessments, attendance, selectedTerm],
  );

  const outstanding = useMemo(
    () => fees.reduce((sum, fee) => sum + Math.max(0, fee.amount - (fee.amountPaid || 0)), 0),
    [fees],
  );
  const unreadNotifications = notifications.filter((notification) => notification.status !== "read").length;

  if (role !== "parent") {
    return <div className="card max-w-xl"><p className="text-muted">This area is available to verified parents and guardians only.</p></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold mb-2">Parent Portal</p>
          <h1 className="text-3xl font-grotesk font-semibold text-white">Your school updates in one place</h1>
          <p className="text-sm text-muted mt-2">{businessProfile?.businessName || "School"} · Property {scopedPropertyId}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2"><Printer size={15} /> Print summary</button>
          <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="card py-16 text-center text-muted">Loading your linked students…</div>
      ) : !students.length ? (
        <div className="card py-16 text-center"><p className="text-white font-semibold">No student profile is linked yet.</p><p className="text-muted text-sm mt-2">Ask the school administrator to verify your guardian email and link your account.</p></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card"><p className="text-xs text-muted">Linked students</p><p className="text-2xl text-white font-grotesk font-semibold mt-2">{students.length}</p><p className="text-xs text-muted mt-1">Verified for this property</p></div>
            <div className="card"><p className="text-xs text-muted">Outstanding fees</p><p className="text-2xl text-amber-300 font-grotesk font-semibold mt-2">{money(outstanding, businessProfile)}</p><p className="text-xs text-muted mt-1">Across linked students</p></div>
            <div className="card"><p className="text-xs text-muted">Attendance rate</p><p className="text-2xl text-emerald-300 font-grotesk font-semibold mt-2">{analytics.attendanceRate}%</p><p className="text-xs text-muted mt-1">{selectedTerm || "All recorded terms"}</p></div>
            <div className="card"><p className="text-xs text-muted">Notifications</p><p className="text-2xl text-sky-300 font-grotesk font-semibold mt-2">{unreadNotifications}</p><p className="text-xs text-muted mt-1">Unread updates</p></div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-6">
            <section className="card space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-grotesk font-semibold text-white flex items-center gap-2"><BookOpenCheck size={18} className="text-gold" /> Linked students</h2><p className="text-xs text-muted mt-1">Only students explicitly linked to this parent account are shown.</p></div>
                <select value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} className="input-field text-xs max-w-[170px]">
                  <option value="">All recorded terms</option>
                  {terms.map((term) => <option value={term} key={term}>{term}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                {analytics.students.map((student) => (
                  <div key={student.studentId} className="border border-border rounded-lg p-4 bg-background/30">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div><p className="font-semibold text-white">{student.studentName}</p><p className="text-xs text-muted mt-1">{student.classGrade} · {students.find((item) => item.id === student.studentId)?.admissionNumber || ""}</p></div>
                      <div className="grid grid-cols-3 gap-5 text-right"><div><p className="text-[10px] text-muted uppercase">Average</p><p className="text-lg text-white font-semibold">{student.assessmentCount ? `${student.averageScore}%` : "—"}</p></div><div><p className="text-[10px] text-muted uppercase">Attendance</p><p className="text-lg text-emerald-300 font-semibold">{student.attendanceDays ? `${student.attendanceRate}%` : "—"}</p></div><div><p className="text-[10px] text-muted uppercase">Fees due</p><p className="text-lg text-amber-300 font-semibold">{money(fees.filter((fee) => fee.studentId === student.studentId).reduce((sum, fee) => sum + Math.max(0, fee.amount - (fee.amountPaid || 0)), 0), businessProfile)}</p></div></div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border text-xs text-muted flex flex-wrap gap-4"><span>{student.assessmentCount} subject result{student.assessmentCount === 1 ? "" : "s"}</span><span>{student.presentDays} present</span><span>{student.absentDays} absent</span><span>{student.lateDays} late</span></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card space-y-4">
              <div><h2 className="font-grotesk font-semibold text-white flex items-center gap-2"><TrendingUp size={18} className="text-gold" /> Term performance</h2><p className="text-xs text-muted mt-1">Aggregated only from records the school has entered.</p></div>
              <div className="grid grid-cols-2 gap-3"><div className="bg-background/30 border border-border rounded-lg p-3"><p className="text-xs text-muted">Average score</p><p className="text-xl text-white font-semibold mt-1">{analytics.averageScore}%</p></div><div className="bg-background/30 border border-border rounded-lg p-3"><p className="text-xs text-muted">Pass rate</p><p className="text-xl text-emerald-300 font-semibold mt-1">{analytics.passRate}%</p></div></div>
              <div className="space-y-2"><p className="text-xs text-muted uppercase tracking-widest">Subject averages</p>{Object.entries(analytics.subjectAverages).length ? Object.entries(analytics.subjectAverages).map(([subject, score]) => <div key={subject} className="flex justify-between text-sm"><span className="text-surface">{subject}</span><span className="text-white font-semibold">{score}%</span></div>) : <p className="text-sm text-muted">No report-card results recorded for this term.</p>}</div>
            </section>
          </div>

          <section className="card space-y-4">
            <div><h2 className="font-grotesk font-semibold text-white flex items-center gap-2"><CreditCard size={18} className="text-gold" /> Fee balances</h2><p className="text-xs text-muted mt-1">This view is read-only. Contact the school for payment arrangements.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted uppercase"><th className="py-3">Student</th><th className="py-3">Fee</th><th className="py-3">Due date</th><th className="py-3">Billed</th><th className="py-3">Paid</th><th className="py-3">Balance</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-border">{fees.length ? fees.map((fee) => <tr key={fee.id}><td className="py-3 text-white">{fee.studentName}</td><td className="py-3">{fee.feeTitle}</td><td className="py-3 text-muted">{fee.dueDate}</td><td className="py-3">{money(fee.amount, businessProfile)}</td><td className="py-3 text-emerald-300">{money(fee.amountPaid || 0, businessProfile)}</td><td className="py-3 text-amber-300">{money(Math.max(0, fee.amount - (fee.amountPaid || 0)), businessProfile)}</td><td className="py-3 capitalize">{fee.status}</td></tr>) : <tr><td colSpan={7} className="py-8 text-center text-muted">No fee records have been assigned.</td></tr>}</tbody></table></div>
          </section>

          <section id="notifications" className="card space-y-4">
            <div><h2 className="font-grotesk font-semibold text-white flex items-center gap-2"><Bell size={18} className="text-gold" /> Notifications</h2><p className="text-xs text-muted mt-1">Attendance, fee, and report-card updates sent to your verified contact details.</p></div>
            <div className="space-y-3">{notifications.length ? notifications.map((notification) => <div key={notification.id} className="flex gap-3 border border-border rounded-lg p-3"><div className="mt-0.5 text-gold"><CalendarCheck2 size={16} /></div><div className="flex-1"><div className="flex flex-col sm:flex-row sm:justify-between gap-1"><p className="text-sm text-white font-semibold">{notification.title}</p><span className="text-[11px] text-muted">{dateLabel(notification.createdAt)}</span></div><p className="text-xs text-muted mt-1">{notification.message}</p><p className="text-[11px] text-gold mt-2">{notification.studentName} · {notification.status}</p></div></div>) : <p className="text-sm text-muted">No notifications yet. The school will send updates here when enabled.</p>}</div>
          </section>

          <section className="card flex items-start gap-3"><FileText size={18} className="text-gold mt-0.5" /><div><p className="text-sm text-white font-semibold">Report cards</p><p className="text-xs text-muted mt-1">Use the print action above to save the visible student summaries and term results as a PDF from your browser. A school-generated report-card download can be added when a storage provider is configured.</p></div></section>
        </>
      )}
    </div>
  );
}
