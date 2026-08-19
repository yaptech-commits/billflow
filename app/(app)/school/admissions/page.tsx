'use client';

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { DEFAULT_PROPERTY_ID, getSchoolNotificationsForStudents, getStudents, SchoolNotification, Student } from "@/lib/school-db";
import { AlertCircle, CheckCircle2, Clock3, Download, FileCheck2, History, Mail, MessageSquareText, Phone, Printer, RefreshCw, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import { formatAdmissionDate, initials } from "@/lib/school-admission-letter";

export default function SchoolAdmissionsPage() {
  const { businessId, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [admissionNotifications, setAdmissionNotifications] = useState<SchoolNotification[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!businessId) return;
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const [studentList, profile] = await Promise.all([
        getStudents(businessId, propertyId),
        getBusinessProfile(businessId),
      ]);
      const ordered = [...studentList].sort((a, b) => a.fullName.localeCompare(b.fullName));
      const notifications = studentList.length
        ? await getSchoolNotificationsForStudents(businessId, studentList.map((student) => student.id!).filter(Boolean), propertyId)
        : [];
      setStudents(ordered);
      setBusinessProfile(profile);
      setAdmissionNotifications(notifications.filter((notification) => notification.type === "admission_created"));
      setSelectedStudentId((current) => current && ordered.some((student) => student.id === current) ? current : ordered[0]?.id || "");
    } catch (error) {
      console.error(error);
      toast.error("Unable to load admissions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId]);

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => [student.fullName, student.admissionNumber, student.classGrade, student.guardianName]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [students, searchTerm]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || filteredStudents[0];
  const schoolName = businessProfile?.businessName || "School";
  const notificationForSelectedStudent = admissionNotifications.find((notification) => notification.studentId === selectedStudent?.id);
  const notificationChannelStatus = (notification: SchoolNotification, channel: string) => notification.deliveryStatus?.[channel]?.status || ((notification.status === "sent" || notification.status === "read") ? "delivered" : notification.status);
  const notificationStatusLabel = (notification: SchoolNotification) => {
    const statuses = notification.channels.filter((channel) => channel !== "in_app").map((channel) => notificationChannelStatus(notification, channel));
    if (statuses.some((status) => status === "failed")) return "Partial failure";
    if (statuses.some((status) => status === "delivered")) return "Delivered";
    return "Queued";
  };
  const logoDataUrl = typeof businessProfile?.logoDataUrl === "string" && /^(data:image\/|https?:\/\/)/i.test(businessProfile.logoDataUrl)
    ? businessProfile.logoDataUrl
    : "";

  const exportAdmissionCommunicationCsv = () => {
    if (admissionNotifications.length === 0) {
      toast("There are no admission communication records to export yet.");
      return;
    }

    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["School", "Property ID", "Student", "Student ID", "Guardian Email", "Guardian Phone", "Channels", "Channel Status", "Overall Status", "Retry Count", "Last Attempt", "Created"];
    const rows = admissionNotifications.map((notification) => {
      const channelStatuses = notification.channels
        .filter((channel) => channel !== "in_app")
        .map((channel) => `${channel}:${notificationChannelStatus(notification, channel)}`)
        .join(" | ");
      return [
        schoolName,
        propertyId,
        notification.studentName,
        notification.metadata?.admissionNumber || "",
        notification.recipientEmail || "",
        notification.recipientPhone || "",
        notification.channels.filter((channel) => channel !== "in_app").join(" + "),
        channelStatuses || "in_app:delivered",
        notificationStatusLabel(notification),
        notification.retryCount || 0,
        formatAdmissionDate(notification.lastAttemptAt),
        formatAdmissionDate(notification.createdAt),
      ].map(escapeCsv).join(",");
    });

    const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${schoolName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "school"}-admission-communications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Admission communication history exported as CSV.");
  };

  const printAdmissionLetter = () => {
    if (!selectedStudent) {
      toast.error("Select a student before printing the admission letter.");
      return;
    }
    window.print();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <style jsx global>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .admission-letter-print, .admission-letter-print * { visibility: visible !important; }
          .admission-letter-print { position: absolute !important; inset: 0 !important; width: 100% !important; min-height: 100vh !important; padding: 18mm !important; background: #fff !important; color: #111827 !important; }
          .admission-letter-print .print-logo { display: block !important; }
          .admission-letter-print .letter-muted { color: #4b5563 !important; }
          .admission-letter-print .letter-accent { color: #9a6500 !important; }
          .admission-letter-print .letter-rule { border-color: #d1d5db !important; }
          .admission-letter-print .letter-box { background: #f8fafc !important; border-color: #d1d5db !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card border border-border p-6 rounded-xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold font-grotesk text-white flex items-center gap-2">
            <FileCheck2 className="text-gold" /> Admissions
          </h1>
          <p className="text-xs text-muted mt-1">Registered students appear here automatically. Print an official admission letter for each parent.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData(true)} className="btn-ghost border border-border text-foreground text-xs px-3 py-2 rounded-lg flex items-center gap-2" disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={printAdmissionLetter} className="btn-gold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2" disabled={!selectedStudent}>
            <Printer size={15} /> Print Admission Letter
          </button>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs uppercase tracking-wider">Total Admissions</p>
          <p className="text-2xl font-bold text-white mt-1">{students.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs uppercase tracking-wider">Active Students</p>
          <p className="text-2xl font-bold text-green mt-1">{students.filter((student) => student.status === "active").length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs uppercase tracking-wider">Guardians on Record</p>
          <p className="text-2xl font-bold text-gold mt-1">{students.filter((student) => student.guardianName || student.guardianPhone || student.guardianEmail).length}</p>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-[minmax(250px,0.9fr)_minmax(0,1.6fr)] gap-6">
        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Users size={16} className="text-gold" /> Student Admissions</h2>
            <span className="text-[11px] text-muted">{filteredStudents.length} shown</span>
          </div>
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <Search size={16} className="text-muted" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, Student ID or class" className="bg-transparent border-none outline-none text-sm text-foreground w-full placeholder:text-muted" />
          </div>
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {loading ? <p className="text-sm text-muted p-4">Loading admissions...</p> : filteredStudents.length === 0 ? (
              <div className="text-center text-muted text-sm p-8">No registered students found.</div>
            ) : filteredStudents.map((student) => (
              <button key={student.id} onClick={() => setSelectedStudentId(student.id!)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedStudent?.id === student.id ? "bg-gold/15 border-gold text-white" : "border-border text-foreground hover:bg-white/5"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{student.fullName}</p>
                    <p className="text-[11px] text-muted mt-1">{student.admissionNumber} · {student.classGrade}</p>
                  </div>
                  <span className={`text-[10px] uppercase font-semibold ${student.status === "active" ? "text-green" : "text-muted"}`}>{student.status}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6">
          {selectedStudent ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gold">Admission record</p>
                <h2 className="text-2xl font-bold text-foreground mt-1">{selectedStudent.fullName}</h2>
                <p className="text-sm text-muted mt-1">{selectedStudent.admissionNumber} · {selectedStudent.classGrade}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-background/60 border border-border rounded-lg p-3"><p className="text-[10px] text-muted uppercase">Student ID</p><p className="font-mono text-gold mt-1 text-sm">{selectedStudent.admissionNumber}</p></div>
                <div className="bg-background/60 border border-border rounded-lg p-3"><p className="text-[10px] text-muted uppercase">Class</p><p className="text-foreground mt-1 text-sm font-semibold">{selectedStudent.classGrade}</p></div>
                <div className="bg-background/60 border border-border rounded-lg p-3"><p className="text-[10px] text-muted uppercase">Guardian</p><p className="text-foreground mt-1 text-sm font-semibold truncate">{selectedStudent.guardianName || "Not provided"}</p></div>
                <div className="bg-background/60 border border-border rounded-lg p-3"><p className="text-[10px] text-muted uppercase">Admitted</p><p className="text-foreground mt-1 text-sm font-semibold">{formatAdmissionDate(selectedStudent.createdAt)}</p></div>
              </div>
              <div className="border-t border-border pt-5 flex flex-wrap gap-3 text-sm text-muted">
                {selectedStudent.guardianPhone && <span className="flex items-center gap-2"><Phone size={14} /> {selectedStudent.guardianPhone}</span>}
                {selectedStudent.guardianEmail && <span className="flex items-center gap-2"><Mail size={14} /> {selectedStudent.guardianEmail}</span>}
              </div>
              <div className="bg-gold/10 border border-gold/30 rounded-lg p-4 text-sm text-foreground">
                The admission letter uses the saved school name, address, contact details, and logo from Settings. Select **Print Admission Letter** to give the parent a printable copy.
              </div>
              {notificationForSelectedStudent && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-4 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">Latest delivery: {notificationStatusLabel(notificationForSelectedStudent)}</p>
                    <p className="text-xs text-muted mt-1">Queued {formatAdmissionDate(notificationForSelectedStudent.createdAt)} via {notificationForSelectedStudent.channels.filter((channel) => channel !== "in_app").join(" + ").toUpperCase() || "in-app"}.</p>
                  </div>
                  <span className="text-xs text-muted">Tracked per property</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full min-h-[320px] flex items-center justify-center text-muted text-sm text-center">Register a student to create the first admission record.</div>
          )}
        </section>
      </div>

      <section className="no-print bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><History size={16} className="text-gold" /> Admission Letter Delivery History</h2>
            <p className="text-xs text-muted mt-1">Email and SMS delivery records for this school property. Provider secrets never appear here.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportAdmissionCommunicationCsv} className="btn-ghost border border-border text-foreground text-xs px-3 py-2 rounded-lg flex items-center gap-2" disabled={admissionNotifications.length === 0}>
              <Download size={14} /> Export CSV
            </button>
            <span className="text-[11px] text-muted">{admissionNotifications.length} notification{admissionNotifications.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        {admissionNotifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">No admission-letter notifications have been queued yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
                  <th className="py-3 pr-4 font-medium">Student</th>
                  <th className="py-3 pr-4 font-medium">Recipient</th>
                  <th className="py-3 pr-4 font-medium">Channels</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 font-medium">Queued</th>
                </tr>
              </thead>
              <tbody>
                {admissionNotifications.map((notification) => {
                  const status = notificationStatusLabel(notification);
                  const statusClass = status === "Delivered" ? "text-green" : status === "Partial failure" ? "text-red" : "text-gold";
                  return (
                    <tr key={notification.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-foreground">{notification.studentName}</p>
                        <p className="text-[11px] text-muted mt-0.5">{String(notification.metadata?.admissionNumber || "Student record")}</p>
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        <p>{notification.recipientEmail || "No email"}</p>
                        {notification.recipientPhone && <p className="text-[11px] mt-0.5">{notification.recipientPhone}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          {notification.channels.filter((channel) => channel !== "in_app").map((channel) => {
                            const channelStatus = notificationChannelStatus(notification, channel);
                            const delivered = channelStatus === "delivered";
                            const failed = channelStatus === "failed";
                            return (
                              <span key={channel} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase font-semibold ${delivered ? "bg-green/10 text-green" : failed ? "bg-red/10 text-red" : "bg-gold/10 text-gold"}`}>
                                {channel === "email" ? <Mail size={11} /> : <MessageSquareText size={11} />}
                                {channel} · {channelStatus}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className={`py-3 pr-4 font-semibold ${statusClass}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {status === "Delivered" ? <CheckCircle2 size={14} /> : status === "Partial failure" ? <AlertCircle size={14} /> : <Clock3 size={14} />}
                          {status}
                        </span>
                      </td>
                      <td className="py-3 text-muted whitespace-nowrap">{formatAdmissionDate(notification.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedStudent && (
        <section className="admission-letter-print hidden print:block bg-white text-slate-900 rounded-none border border-slate-200 p-10 max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-8 border-b-2 border-slate-800 pb-6">
            <div className="flex items-center gap-4">
              {logoDataUrl ? <img src={logoDataUrl} alt={`${schoolName} logo`} className="print-logo h-20 w-20 object-contain" /> : <div className="h-20 w-20 flex items-center justify-center bg-slate-900 text-white text-xl font-bold rounded-xl">{initials(schoolName)}</div>}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{schoolName}</h1>
                <p className="letter-muted text-sm mt-1">{businessProfile?.address || "School address"}</p>
                <p className="letter-muted text-sm">{[businessProfile?.phone, businessProfile?.email].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="letter-muted uppercase tracking-[0.18em] text-xs">Official document</p>
              <p className="letter-accent font-bold mt-2">ADMISSION LETTER</p>
              <p className="letter-muted mt-1">{formatAdmissionDate(selectedStudent.createdAt)}</p>
            </div>
          </div>
          <div className="py-10 space-y-6">
            <p>Dear <strong>{selectedStudent.guardianName || "Parent / Guardian"}</strong>,</p>
            <p>We are pleased to confirm the admission of <strong>{selectedStudent.fullName}</strong> to <strong>{schoolName}</strong>.</p>
            <div className="letter-box grid grid-cols-2 gap-4 border rounded-lg p-5 text-sm">
              <div><p className="letter-muted text-xs uppercase tracking-wider">Student ID</p><p className="font-mono font-bold mt-1">{selectedStudent.admissionNumber}</p></div>
              <div><p className="letter-muted text-xs uppercase tracking-wider">Class / Grade</p><p className="font-bold mt-1">{selectedStudent.classGrade}</p></div>
              <div><p className="letter-muted text-xs uppercase tracking-wider">Admission date</p><p className="font-bold mt-1">{formatAdmissionDate(selectedStudent.createdAt)}</p></div>
              <div><p className="letter-muted text-xs uppercase tracking-wider">Student status</p><p className="font-bold mt-1 capitalize">{selectedStudent.status}</p></div>
            </div>
            <p>Please keep this letter for your records. The Student ID should be used when accessing the Parent Portal and when communicating with the school.</p>
            <p>We look forward to supporting {selectedStudent.fullName}&apos;s learning journey.</p>
          </div>
          <div className="border-t border-slate-300 pt-6 flex justify-between items-end text-sm">
            <div><p className="font-semibold">{schoolName}</p><p className="letter-muted mt-1">Admissions Office</p></div>
            <div className="text-right"><div className="border-b border-slate-500 w-40 mb-2" /><p className="letter-muted">Authorized signature</p></div>
          </div>
        </section>
      )}
    </div>
  );
}
