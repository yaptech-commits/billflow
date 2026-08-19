'use client';

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { DEFAULT_PROPERTY_ID, getStudents, Student } from "@/lib/school-db";
import { FileCheck2, Printer, Search, Users, RefreshCw, Phone, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { formatAdmissionDate, initials } from "@/lib/school-admission-letter";

export default function SchoolAdmissionsPage() {
  const { businessId, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
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
      setStudents(ordered);
      setBusinessProfile(profile);
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
  const logoDataUrl = typeof businessProfile?.logoDataUrl === "string" && /^(data:image\/|https?:\/\/)/i.test(businessProfile.logoDataUrl)
    ? businessProfile.logoDataUrl
    : "";

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
            </div>
          ) : (
            <div className="h-full min-h-[320px] flex items-center justify-center text-muted text-sm text-center">Register a student to create the first admission record.</div>
          )}
        </section>
      </div>

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
