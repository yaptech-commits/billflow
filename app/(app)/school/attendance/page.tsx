"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  AttendanceRecord,
  getStudents,
  getAttendance,
  recordAttendance,
  deleteAttendance,
} from "@/lib/school-db";
import { getBusinessProfile, BusinessProfile } from "@/lib/db";
import { CheckSquare, Calendar, Search, Trash2, Plus, Check, X, AlertCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";

export default function AttendancePage() {
  const { businessId, role } = useAuth();
  const propertyId = "default_property";
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedClass, setSelectedClass] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form for marking individual attendance
  const [form, setForm] = useState({
    studentId: "",
    status: "present" as "present" | "absent" | "late" | "excused",
    remarks: "",
  });

  const loadData = async () => {
    if (!businessId) return;
    const [stList, attList, prof] = await Promise.all([
      getStudents(businessId, propertyId),
      getAttendance(businessId, propertyId, selectedDate),
      getBusinessProfile(businessId),
    ]);
    setStudents(stList);
    setAttendance(attList);
    setBusinessProfile(prof);
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId, selectedDate]);

  const filteredStudents = students.filter((s) => {
    if (selectedClass !== "All" && s.classGrade !== selectedClass) return false;
    return true;
  });

  const classesList = Array.from(new Set(students.map((s) => s.classGrade)));

  const handleMarkStatus = async (studentId: string, status: "present" | "absent" | "late" | "excused") => {
    if (!businessId) return;
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    try {
      // Check if already recorded for today
      const existing = attendance.find((a) => a.studentId === studentId && a.date === selectedDate);
      if (existing && existing.id) {
        await deleteAttendance(existing.id);
      }

      await recordAttendance({
        businessId,
        propertyId,
        studentId: student.id!,
        studentName: student.fullName,
        classGrade: student.classGrade,
        date: selectedDate,
        status,
        remarks: "",
      });
      toast.success(`Marked ${student.fullName} as ${status}`);
      loadData();
    } catch (err) {
      toast.error("Failed to record attendance.");
    }
  };

  const handleBulkMark = async (status: "present" | "absent") => {
    if (!businessId) return;
    try {
      for (const st of filteredStudents) {
        const existing = attendance.find((a) => a.studentId === st.id && a.date === selectedDate);
        if (existing && existing.id) {
          await deleteAttendance(existing.id);
        }
        await recordAttendance({
          businessId,
          propertyId,
          studentId: st.id!,
          studentName: st.fullName,
          classGrade: st.classGrade,
          date: selectedDate,
          status,
        });
      }
      toast.success(`Bulk marked ${filteredStudents.length} students as ${status}`);
      loadData();
    } catch {
      toast.error("Bulk action failed.");
    }
  };

  const getStudentStatusToday = (studentId: string) => {
    const record = attendance.find((a) => a.studentId === studentId && a.date === selectedDate);
    return record ? record.status : null;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border p-6 rounded-xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold font-grotesk text-white flex items-center gap-2">
            <CheckSquare className="text-gold" /> Daily Attendance Register
          </h1>
          <p className="text-xs text-muted mt-1">
            Track student attendance, absences, and punctuality for {businessProfile?.businessName || "School"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Filter Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            >
              <option value="All">All Classes</option>
              {classesList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-card/40 border border-border p-4 rounded-xl">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">
            Total Enrolled: <strong className="text-gold">{filteredStudents.length}</strong>
          </span>
          <span className="text-sm font-medium text-emerald-400">
            Present: {filteredStudents.filter((s) => getStudentStatusToday(s.id!) === "present").length}
          </span>
          <span className="text-sm font-medium text-rose-400">
            Absent: {filteredStudents.filter((s) => getStudentStatusToday(s.id!) === "absent").length}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleBulkMark("present")}
            className="btn-ghost border border-emerald-500/40 text-emerald-400 text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-500/10"
          >
            Mark All Present
          </button>
          <button
            onClick={() => handleBulkMark("absent")}
            className="btn-ghost border border-rose-500/40 text-rose-400 text-xs px-3 py-1.5 rounded-lg hover:bg-rose-500/10"
          >
            Mark All Absent
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-background/50 text-xs font-semibold text-muted">
                <th className="p-4">Admission No.</th>
                <th className="p-4">Student Name</th>
                <th className="p-4">Class</th>
                <th className="p-4">Today's Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No students found for this class filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const status = getStudentStatusToday(st.id!);
                  return (
                    <tr key={st.id} className="hover:bg-accent/20 transition-colors">
                      <td className="p-4 font-mono text-xs text-gold">{st.admissionNumber}</td>
                      <td className="p-4 font-medium text-foreground">{st.fullName}</td>
                      <td className="p-4 text-muted">{st.classGrade}</td>
                      <td className="p-4">
                        {status === "present" && (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-medium">
                            Present
                          </span>
                        )}
                        {status === "absent" && (
                          <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full text-xs font-medium">
                            Absent
                          </span>
                        )}
                        {status === "late" && (
                          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full text-xs font-medium">
                            Late
                          </span>
                        )}
                        {status === "excused" && (
                          <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full text-xs font-medium">
                            Excused
                          </span>
                        )}
                        {!status && (
                          <span className="text-xs text-muted italic">Unmarked</span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-1">
                        <button
                          onClick={() => handleMarkStatus(st.id!, "present")}
                          className={`px-2.5 py-1 text-xs rounded font-medium border ${
                            status === "present"
                              ? "bg-emerald-500 text-black border-emerald-500"
                              : "border-border text-muted hover:border-emerald-500 hover:text-emerald-400"
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleMarkStatus(st.id!, "absent")}
                          className={`px-2.5 py-1 text-xs rounded font-medium border ${
                            status === "absent"
                              ? "bg-rose-500 text-white border-rose-500"
                              : "border-border text-muted hover:border-rose-500 hover:text-rose-400"
                          }`}
                        >
                          Absent
                        </button>
                        <button
                          onClick={() => handleMarkStatus(st.id!, "late")}
                          className={`px-2.5 py-1 text-xs rounded font-medium border ${
                            status === "late"
                              ? "bg-amber-500 text-black border-amber-500"
                              : "border-border text-muted hover:border-amber-500 hover:text-amber-400"
                          }`}
                        >
                          Late
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
