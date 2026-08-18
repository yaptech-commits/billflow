"use client";

// BillFlow School Classes: dark operational layout, gold active accents, compact tables,
// and property-scoped student data. This page groups existing Student records only;
// it never duplicates or mutates enrollment data.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_PROPERTY_ID,
  getAttendance,
  getSchoolClasses,
  getStudents,
  promoteClassStudents,
  saveSchoolClass,
  AttendanceRecord,
  SchoolClass,
  Student,
} from "@/lib/school-db";
import { getBusinessProfile, getStaff, BusinessProfile, Staff } from "@/lib/db";
import {
  ArrowRight,
  ChevronDown,
  Download,
  GraduationCap,
  Grid3X3,
  RefreshCw,
  Save,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SchoolClassesPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [selectedClass, setSelectedClass] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [teacherSelections, setTeacherSelections] = useState<Record<string, string>>({});
  const [promotionSelections, setPromotionSelections] = useState<Record<string, string>>({});
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);
  const [promotingClass, setPromotingClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [studentList, profile, classList, attendanceList, staffList] = await Promise.all([
        getStudents(businessId, propertyId),
        getBusinessProfile(businessId),
        getSchoolClasses(businessId, propertyId),
        getAttendance(businessId, propertyId, attendanceDate),
        getStaff(businessId),
      ]);
      setStudents(studentList);
      setSchoolClasses(classList);
      setAttendance(attendanceList);
      setStaff(staffList);
      setBusinessProfile(profile);
      setTeacherSelections((current) => {
        const next = { ...current };
        classList.forEach((schoolClass) => { next[schoolClass.name] = schoolClass.teacherId || ""; });
        return next;
      });
      setSelectedClass((current) => {
        if (current === "all") return current;
        return studentList.some((student) => student.classGrade === current) ? current : "all";
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [businessId, propertyId, attendanceDate]);

  const classGroups = useMemo(() => {
    const groups = new Map<string, Student[]>();
    students.forEach((student) => {
      const className = student.classGrade?.trim() || "Unassigned";
      const existing = groups.get(className) || [];
      existing.push(student);
      groups.set(className, existing);
    });
    return Array.from(groups.entries())
      .map(([className, classStudents]) => {
        const schoolClass = schoolClasses.find((item) => item.name === className);
        const attendanceByStudent = new Map<string, AttendanceRecord>();
        attendance.filter((record) => (record.classGrade?.trim() || "Unassigned") === className).forEach((record) => {
          attendanceByStudent.set(record.studentId, record);
        });
        const attendanceSummary = {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          unmarked: 0,
        };
        attendanceByStudent.forEach((record) => { attendanceSummary[record.status] += 1; });
        const activeCount = classStudents.filter((student) => student.status === "active").length;
        attendanceSummary.unmarked = Math.max(activeCount - attendanceByStudent.size, 0);
        return {
          className,
          students: [...classStudents].sort((a, b) => a.fullName.localeCompare(b.fullName)),
          activeCount,
          teacher: schoolClass,
          attendanceSummary,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));
  }, [students, schoolClasses, attendance]);

  const selectedStudents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return students
      .filter((student) => selectedClass === "all" || (student.classGrade?.trim() || "Unassigned") === selectedClass)
      .filter((student) => {
        if (!normalizedSearch) return true;
        return [student.fullName, student.admissionNumber, student.classGrade, student.guardianName]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, selectedClass, searchTerm]);

  const saveTeacherAssignment = async (className: string) => {
    if (!businessId) return;
    const teacherId = teacherSelections[className] || "";
    const teacher = staff.find((member) => member.id === teacherId);
    setSavingTeacher(className);
    try {
      await saveSchoolClass({
        businessId,
        propertyId,
        name: className,
        teacherId: teacher?.id,
        teacherName: teacher?.email,
        teacherEmail: teacher?.email,
      });
      toast.success(teacher ? `${teacher.email} assigned to ${className}` : `Teacher cleared for ${className}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save class teacher");
    } finally {
      setSavingTeacher(null);
    }
  };

  const promoteStudents = async (className: string) => {
    if (!businessId) return;
    const destination = promotionSelections[className] || "";
    if (!destination) {
      toast.error("Choose a destination class first");
      return;
    }
    if (!window.confirm(`Promote all active students in ${className} to ${destination}?`)) return;
    setPromotingClass(className);
    try {
      const count = await promoteClassStudents(businessId, propertyId, className, destination);
      toast.success(count ? `${count} student${count === 1 ? "" : "s"} promoted to ${destination}` : "No active students needed promotion");
      setPromotionSelections((current) => ({ ...current, [className]: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not promote class students");
    } finally {
      setPromotingClass(null);
    }
  };

  const exportClasses = () => {
    const rows = [
      ["Class", "Admission number", "Student", "Status", "Guardian", "Guardian phone", "Guardian email"],
      ...selectedStudents.map((student) => [
        student.classGrade || "Unassigned",
        student.admissionNumber,
        student.fullName,
        student.status,
        student.guardianName,
        student.guardianPhone,
        student.guardianEmail || "",
      ]),
    ];
    downloadCsv(`billflow-school-classes-${selectedClass === "all" ? "all" : selectedClass}.csv`, rows);
  };

  if (role !== "owner" && role !== "super_admin") {
    return <div className="card max-w-xl"><p className="text-muted">Classes are available to school owners and Super Admin users.</p></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold mb-2">School Management</p>
          <h1 className="text-3xl font-grotesk font-semibold text-white flex items-center gap-2">
            <GraduationCap className="text-gold" /> Classes
          </h1>
          <p className="text-sm text-muted mt-2">{businessProfile?.businessName || "School"} · {propertyId} · All class groups and enrolled students in this property.</p>
        </div>
          <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted flex items-center gap-2">Attendance date
            <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} className="input-field text-xs" />
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search students or class..."
              className="input-field pl-9 w-[230px]"
              aria-label="Search students or classes"
            />
          </div>
          <button onClick={exportClasses} disabled={!selectedStudents.length} className="btn-ghost flex items-center gap-2">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {loading ? <div className="card py-16 text-center text-muted">Loading classes…</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card"><p className="text-xs text-muted flex items-center gap-2"><Grid3X3 size={14} /> Classes</p><p className="text-2xl text-white font-semibold mt-2">{classGroups.length}</p></div>
            <div className="card"><p className="text-xs text-muted flex items-center gap-2"><Users size={14} /> Students in scope</p><p className="text-2xl text-white font-semibold mt-2">{students.length}</p></div>
            <div className="card"><p className="text-xs text-muted flex items-center gap-2"><UserRound size={14} /> Active students</p><p className="text-2xl text-emerald-300 font-semibold mt-2">{students.filter((student) => student.status === "active").length}</p></div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6 items-start">
            <section className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between gap-3">
                <div><h2 className="font-grotesk font-semibold text-white">Class groups</h2><p className="text-xs text-muted mt-1">Select a class to view its students.</p></div>
                <span className="text-xs text-muted">{classGroups.length}</span>
              </div>
              <div className="p-2 space-y-1">
                <button onClick={() => setSelectedClass("all")} className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${selectedClass === "all" ? "bg-gold text-black font-semibold" : "text-surface hover:bg-white/5"}`}>
                  <span>All classes</span><span className="text-xs">{students.length}</span>
                </button>
                {classGroups.map((group) => (
                  <button key={group.className} onClick={() => setSelectedClass(group.className)} className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${selectedClass === group.className ? "bg-gold text-black font-semibold" : "text-surface hover:bg-white/5"}`}>
                    <span className="truncate pr-3">{group.className}</span><span className="text-xs">{group.students.length}</span>
                  </button>
                ))}
                {!classGroups.length && <p className="text-sm text-muted text-center py-6">No classes yet.</p>}
              </div>
            </section>

            <section className="card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div><h2 className="font-grotesk font-semibold text-white">{selectedClass === "all" ? "All students" : selectedClass}</h2><p className="text-xs text-muted mt-1">{selectedStudents.length} student{selectedStudents.length === 1 ? "" : "s"} shown from the selected property.</p></div>
                <Link href="/school/students" className="btn-ghost inline-flex items-center gap-2 w-fit">Manage students <ArrowRight size={15} /></Link>
              </div>
              <div className="space-y-2 mb-5">
                {classGroups.filter((group) => selectedClass === "all" || group.className === selectedClass).map((group) => (
                  <div key={group.className} className="border border-border rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedClasses((current) => ({ ...current, [group.className]: !current[group.className] }))} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5">
                      <span className="flex items-center gap-3"><ChevronDown size={15} className={`text-gold transition-transform ${expandedClasses[group.className] ? "rotate-180" : ""}`} /><span className="text-white font-medium">{group.className}</span></span>
                      <span className="text-xs text-muted">{group.activeCount} active · {group.students.length} total</span>
                    </button>
                    <div className="px-4 py-3 border-t border-border bg-white/[0.02] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted">Teacher: <span className="text-surface">{group.teacher?.teacherName || "Not assigned"}</span></p>
                        <p className="text-[11px] text-muted">Attendance · {attendanceDate}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                        <span className="text-emerald-300">Present {group.attendanceSummary.present}</span>
                        <span className="text-red-300">Absent {group.attendanceSummary.absent}</span>
                        <span className="text-amber-300">Late {group.attendanceSummary.late}</span>
                        <span className="text-sky-300">Excused {group.attendanceSummary.excused}</span>
                        <span className="text-muted">Unmarked {group.attendanceSummary.unmarked}</span>
                      </div>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                        <select
                          value={teacherSelections[group.className] || ""}
                          onChange={(event) => setTeacherSelections((current) => ({ ...current, [group.className]: event.target.value }))}
                          className="input-field text-xs min-w-[190px]"
                          aria-label={`Teacher for ${group.className}`}
                        >
                          <option value="">No teacher assigned</option>
                          {staff.filter((member) => member.status === "active" && member.id).map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}
                        </select>
                        <button onClick={() => saveTeacherAssignment(group.className)} disabled={savingTeacher === group.className} className="btn-ghost inline-flex items-center gap-2 text-xs">
                          <Save size={14} /> {savingTeacher === group.className ? "Saving…" : "Save teacher"}
                        </button>
                        <div className="flex items-center gap-2 lg:ml-auto">
                          <select
                            value={promotionSelections[group.className] || ""}
                            onChange={(event) => setPromotionSelections((current) => ({ ...current, [group.className]: event.target.value }))}
                            className="input-field text-xs min-w-[170px]"
                            aria-label={`Promotion destination for ${group.className}`}
                          >
                            <option value="">Promote to…</option>
                            {classGroups.filter((candidate) => candidate.className !== group.className).map((candidate) => <option key={candidate.className} value={candidate.className}>{candidate.className}</option>)}
                          </select>
                          <button onClick={() => promoteStudents(group.className)} disabled={!promotionSelections[group.className] || promotingClass === group.className} className="btn-primary text-xs whitespace-nowrap">
                            {promotingClass === group.className ? "Promoting…" : "Promote active"}
                          </button>
                        </div>
                      </div>
                    </div>
                    {expandedClasses[group.className] && <div className="px-4 pb-3 text-xs text-muted">Use the student table below to manage records, guardian links, and enrollment details for this class.</div>}
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted uppercase"><th className="py-3">Student</th><th className="py-3">Admission #</th><th className="py-3">Class</th><th className="py-3">Status</th><th className="py-3">Guardian</th><th className="py-3 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {selectedStudents.map((student) => <tr key={student.id}><td className="py-3 text-white font-medium">{student.fullName}</td><td className="py-3">{student.admissionNumber}</td><td className="py-3">{student.classGrade || "Unassigned"}</td><td className="py-3"><span className={student.status === "active" ? "text-emerald-300" : "text-muted"}>{student.status}</span></td><td className="py-3">{student.guardianName || "—"}</td><td className="py-3 text-right"><Link href="/school/students" className="text-gold hover:text-white inline-flex items-center gap-1">Open <ArrowRight size={14} /></Link></td></tr>)}
                    {!selectedStudents.length && <tr><td colSpan={6} className="py-10 text-center text-muted">No students match this class or search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
