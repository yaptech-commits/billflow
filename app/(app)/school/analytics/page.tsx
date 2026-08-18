"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Assessment,
  AttendanceRecord,
  buildTermAnalytics,
  DEFAULT_PROPERTY_ID,
  getAssessments,
  getAttendance,
  getAvailableTerms,
  getStudents,
  Student,
} from "@/lib/school-db";
import { getBusinessProfile, BusinessProfile } from "@/lib/db";
import { BarChart3, Download, RefreshCw, Users, TrendingUp, CalendarCheck2 } from "lucide-react";
import toast from "react-hot-toast";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SchoolAnalyticsPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [studentList, assessmentList, attendanceList, profile] = await Promise.all([
        getStudents(businessId, propertyId),
        getAssessments(businessId, propertyId),
        getAttendance(businessId, propertyId),
        getBusinessProfile(businessId),
      ]);
      setStudents(studentList);
      setAssessments(assessmentList);
      setAttendance(attendanceList);
      setBusinessProfile(profile);
      const availableTerms = getAvailableTerms(assessmentList, attendanceList);
      setTerms(availableTerms);
      setSelectedTerm((current) => current && availableTerms.includes(current) ? current : availableTerms[0] || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load term analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [businessId, propertyId]);

  const analytics = useMemo(
    () => buildTermAnalytics(students, assessments, attendance, selectedTerm),
    [students, assessments, attendance, selectedTerm],
  );

  const exportAnalytics = () => {
    const rows = [
      ["Student", "Class", "Average score", "Pass rate", "Attendance rate", "Present", "Absent", "Late"],
      ...analytics.students.map((row) => [row.studentName, row.classGrade, String(row.averageScore), String(row.passRate), String(row.attendanceRate), String(row.presentDays), String(row.absentDays), String(row.lateDays)]),
    ];
    downloadCsv(`billflow-school-analytics-${selectedTerm || "all-terms"}.csv`, rows);
  };

  if (role !== "owner" && role !== "superadmin") {
    return <div className="card max-w-xl"><p className="text-muted">Term analytics are available to school owners and Super Admin users.</p></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div><p className="text-xs uppercase tracking-widest text-gold mb-2">School Management</p><h1 className="text-3xl font-grotesk font-semibold text-white flex items-center gap-2"><BarChart3 className="text-gold" /> Term performance analytics</h1><p className="text-sm text-muted mt-2">{businessProfile?.businessName || "School"} · {propertyId} · Only entered records are included.</p></div>
        <div className="flex gap-2 items-center"><select value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} className="input-field min-w-[170px]"><option value="">All recorded terms</option>{terms.map((term) => <option key={term} value={term}>{term}</option>)}</select><button onClick={exportAnalytics} disabled={!analytics.students.length} className="btn-ghost flex items-center gap-2"><Download size={15} /> Export CSV</button><button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button></div>
      </div>

      {loading ? <div className="card py-16 text-center text-muted">Loading analytics…</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="card"><p className="text-xs text-muted flex items-center gap-2"><Users size={14} /> Students in scope</p><p className="text-2xl text-white font-semibold mt-2">{analytics.studentCount}</p></div><div className="card"><p className="text-xs text-muted flex items-center gap-2"><TrendingUp size={14} /> Average score</p><p className="text-2xl text-white font-semibold mt-2">{analytics.averageScore}%</p></div><div className="card"><p className="text-xs text-muted">Pass rate</p><p className="text-2xl text-emerald-300 font-semibold mt-2">{analytics.passRate}%</p></div><div className="card"><p className="text-xs text-muted flex items-center gap-2"><CalendarCheck2 size={14} /> Attendance rate</p><p className="text-2xl text-sky-300 font-semibold mt-2">{analytics.attendanceRate}%</p></div></div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><section className="card"><h2 className="font-grotesk font-semibold text-white mb-4">Class averages</h2><div className="space-y-3">{Object.entries(analytics.classAverages).length ? Object.entries(analytics.classAverages).map(([classGrade, score]) => <div key={classGrade} className="flex items-center gap-3"><span className="w-32 text-sm text-surface truncate">{classGrade}</span><div className="flex-1 h-2 bg-border rounded-full overflow-hidden"><div className="h-full bg-gold rounded-full" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} /></div><span className="text-sm text-white font-semibold w-12 text-right">{score}%</span></div>) : <p className="text-sm text-muted">No graded assessments recorded for this term.</p>}</div></section><section className="card"><h2 className="font-grotesk font-semibold text-white mb-4">Subject averages</h2><div className="grid grid-cols-2 gap-3">{Object.entries(analytics.subjectAverages).length ? Object.entries(analytics.subjectAverages).map(([subject, score]) => <div key={subject} className="border border-border rounded-lg p-3"><p className="text-xs text-muted truncate">{subject}</p><p className="text-lg text-white font-semibold mt-1">{score}%</p></div>) : <p className="text-sm text-muted col-span-2">No subject results recorded for this term.</p>}</div></section></div>

          <section className="card"><div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="font-grotesk font-semibold text-white">Student performance detail</h2><p className="text-xs text-muted mt-1">Use this table to identify support needs without exposing data outside the current property.</p></div><span className="text-xs text-muted">{selectedTerm || "All recorded terms"}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted uppercase"><th className="py-3">Student</th><th className="py-3">Class</th><th className="py-3">Average</th><th className="py-3">Pass rate</th><th className="py-3">Attendance</th><th className="py-3">Present</th><th className="py-3">Absent</th><th className="py-3">Late</th></tr></thead><tbody className="divide-y divide-border">{analytics.students.map((row) => <tr key={row.studentId}><td className="py-3 text-white font-medium">{row.studentName}</td><td className="py-3">{row.classGrade}</td><td className="py-3">{row.assessmentCount ? `${row.averageScore}%` : "—"}</td><td className="py-3">{row.assessmentCount ? `${row.passRate}%` : "—"}</td><td className="py-3 text-sky-300">{row.attendanceDays ? `${row.attendanceRate}%` : "—"}</td><td className="py-3 text-emerald-300">{row.presentDays}</td><td className="py-3 text-rose-300">{row.absentDays}</td><td className="py-3 text-amber-300">{row.lateDays}</td></tr>)}{!analytics.students.length && <tr><td colSpan={8} className="py-8 text-center text-muted">No student records available for this property.</td></tr>}</tbody></table></div></section>
        </>
      )}
    </div>
  );
}
