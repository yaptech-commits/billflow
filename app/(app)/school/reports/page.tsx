"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  Assessment,
  AttendanceRecord,
  getStudents,
  getAssessments,
  saveAssessment,
  deleteAssessment,
  getAttendance,
  enqueueSchoolNotification,
  DEFAULT_PROPERTY_ID,
} from "@/lib/school-db";
import { getBusinessProfile, BusinessProfile } from "@/lib/db";
import { Award, FileText, Printer, Plus, Trash2, Search, BookOpen, CheckCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

export default function SchoolReportsPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1, 2026");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // New Assessment Form
  const [form, setForm] = useState({
    studentId: "",
    subject: "",
    classScore: 30,
    examScore: 65,
    remarks: "Good performance",
  });

  const loadData = async () => {
    if (!businessId) return;
    const [stList, assList, attList, prof] = await Promise.all([
      getStudents(businessId, propertyId),
      getAssessments(businessId, propertyId, undefined, selectedTerm),
      getAttendance(businessId, propertyId, undefined, selectedTerm),
      getBusinessProfile(businessId),
    ]);
    setStudents(stList);
    setAssessments(assList);
    setAttendance(attList);
    setBusinessProfile(prof);

    if (stList.length > 0 && !selectedStudentId) {
      setSelectedStudentId(stList[0].id!);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId, selectedTerm]);

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !form.studentId || !form.subject) {
      toast.error("Please fill in student and subject.");
      return;
    }

    const st = students.find((s) => s.id === form.studentId);
    if (!st) return;

    try {
      await saveAssessment({
        businessId,
        propertyId,
        studentId: st.id!,
        studentName: st.fullName,
        classGrade: st.classGrade,
        term: selectedTerm,
        subject: form.subject,
        classScore: Number(form.classScore),
        examScore: Number(form.examScore),
        remarks: form.remarks,
      });
      toast.success("Assessment score saved successfully.");
      setIsAddModalOpen(false);
      setForm({ studentId: "", subject: "", classScore: 30, examScore: 65, remarks: "Good performance" });
      loadData();
    } catch {
      toast.error("Failed to save assessment.");
    }
  };

  const handlePublishReportCard = async () => {
    if (!businessId || !activeStudent) return;
    if (!activeStudent.guardianEmail && !activeStudent.guardianPhone) {
      toast.error("Add a guardian email or phone before publishing this report card.");
      return;
    }
    try {
      await enqueueSchoolNotification({
        businessId,
        propertyId,
        studentId: activeStudent.id!,
        studentName: activeStudent.fullName,
        recipientEmail: activeStudent.guardianEmail,
        recipientPhone: activeStudent.guardianPhone,
        title: "Report card published",
        message: `${selectedTerm} report card for ${activeStudent.fullName} is now available in the BillFlow parent portal.`,
        type: "report_card_published",
        channels: ["in_app", "email", "sms"],
      });
      toast.success("Guardian notification queued.");
    } catch (err: any) {
      toast.error(err.message || "Could not publish the report card notification.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAssessment(id);
      toast.success("Assessment deleted.");
      loadData();
    } catch {
      toast.error("Failed to delete assessment.");
    }
  };

  const activeStudent = students.find((s) => s.id === selectedStudentId);
  const studentAssessments = assessments.filter((a) => a.studentId === selectedStudentId);

  // Calculate GPA / Totals
  const totalScoreSum = studentAssessments.reduce((acc, curr) => acc + (curr.totalScore || 0), 0);
  const averageScore = studentAssessments.length > 0 ? (totalScoreSum / studentAssessments.length).toFixed(1) : "0.0";

  // Attendance stats for student
  const studentAttendance = attendance.filter((a) => a.studentId === selectedStudentId);
  const totalPresent = studentAttendance.filter((a) => a.status === "present").length;
  const totalAbsent = studentAttendance.filter((a) => a.status === "absent").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border p-6 rounded-xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold font-grotesk text-white flex items-center gap-2">
            <Award className="text-gold" /> Academic Report Cards & Assessments
          </h1>
          <p className="text-xs text-muted mt-1">
            Manage subject scores, calculate term grades, and generate automated student report cards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Academic Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            >
              <option value="Term 1, 2026">Term 1, 2026</option>
              <option value="Term 2, 2026">Term 2, 2026</option>
              <option value="Term 3, 2026">Term 3, 2026</option>
            </select>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-gold flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg mt-5"
          >
            <Plus size={16} /> Record Subject Score
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Student Sidebar List */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-foreground px-2">Select Student</h2>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {students.map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id!)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex justify-between items-center ${
                  selectedStudentId === st.id
                    ? "bg-gold text-black font-bold"
                    : "text-foreground hover:bg-accent/30"
                }`}
              >
                <div>
                  <div>{st.fullName}</div>
                  <div className={`text-[10px] ${selectedStudentId === st.id ? "text-black/70" : "text-muted"}`}>
                    {st.admissionNumber} • {st.classGrade}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Report Card Preview Area */}
        <div className="lg:col-span-3 space-y-6">
          {activeStudent ? (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {businessProfile?.businessName || "School Report Card"}
                  </h3>
                  <p className="text-xs text-muted">{selectedTerm} Official Academic Evaluation</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePublishReportCard}
                    className="btn-primary text-xs px-3 py-2 rounded-lg"
                  >
                    Notify guardian
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="btn-ghost border border-border text-xs px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-accent/40 text-foreground"
                  >
                    <Printer size={14} /> Print / Export PDF
                  </button>
                </div>
              </div>

              {/* Student Metadata Card */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-background/50 p-4 rounded-lg border border-border text-xs">
                <div>
                  <span className="text-muted block">Student Name</span>
                  <strong className="text-foreground text-sm">{activeStudent.fullName}</strong>
                </div>
                <div>
                  <span className="text-muted block">Admission No.</span>
                  <strong className="text-gold font-mono">{activeStudent.admissionNumber}</strong>
                </div>
                <div>
                  <span className="text-muted block">Class / Grade</span>
                  <strong className="text-foreground">{activeStudent.classGrade}</strong>
                </div>
                <div>
                  <span className="text-muted block">Overall Average</span>
                  <strong className="text-emerald-400 text-sm">{averageScore}%</strong>
                </div>
              </div>

              {/* Subjects & Grades Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-background/50 text-xs font-semibold text-muted">
                      <th className="p-3">Subject</th>
                      <th className="p-3 text-center">Class Score (40%)</th>
                      <th className="p-3 text-center">Exam Score (60%)</th>
                      <th className="p-3 text-center">Total (100%)</th>
                      <th className="p-3 text-center">Grade</th>
                      <th className="p-3">Remarks</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {studentAssessments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted text-xs">
                          No assessment scores recorded for this student in {selectedTerm}.
                        </td>
                      </tr>
                    ) : (
                      studentAssessments.map((ass) => (
                        <tr key={ass.id} className="hover:bg-accent/20">
                          <td className="p-3 font-medium text-foreground">{ass.subject}</td>
                          <td className="p-3 text-center">{ass.classScore}</td>
                          <td className="p-3 text-center">{ass.examScore}</td>
                          <td className="p-3 text-center font-bold text-gold">{ass.totalScore}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 bg-gold/10 text-gold border border-gold/30 rounded text-xs font-bold">
                              {ass.grade}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-muted">{ass.remarks}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDelete(ass.id!)}
                              className="text-muted hover:text-rose-400 p-1"
                              title="Delete Score"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border text-xs">
                <div className="bg-background/40 p-4 rounded-lg border border-border space-y-1">
                  <div className="text-muted font-medium">Attendance Summary</div>
                  <div className="flex justify-between">
                    <span>Days Present:</span>
                    <strong className="text-emerald-400">{totalPresent}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Days Absent:</span>
                    <strong className="text-rose-400">{totalAbsent}</strong>
                  </div>
                </div>
                <div className="bg-background/40 p-4 rounded-lg border border-border space-y-1">
                  <div className="text-muted font-medium">Principal's Remarks</div>
                  <p className="text-foreground italic">
                    {Number(averageScore) >= 70
                      ? "Excellent academic performance! Keep up the brilliant work."
                      : Number(averageScore) >= 50
                      ? "Satisfactory performance. More effort needed in weaker subjects."
                      : "Needs significant academic improvement and regular attendance."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted">
              Select a student from the sidebar to view their report card.
            </div>
          )}
        </div>
      </div>

      {/* Add Assessment Modal */}
      <Modal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Record Subject Score">
        <form onSubmit={handleSaveAssessment} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Student</label>
            <select
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            >
              <option value="">Select Student...</option>
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.classGrade})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Subject Name</label>
            <input
              type="text"
              placeholder="e.g. Mathematics, English, Science"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Class Score (Max 40)</label>
              <input
                type="number"
                max={40}
                min={0}
                value={form.classScore}
                onChange={(e) => setForm({ ...form, classScore: Number(e.target.value) })}
                required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Exam Score (Max 60)</label>
              <input
                type="number"
                max={60}
                min={0}
                value={form.examScore}
                onChange={(e) => setForm({ ...form, examScore: Number(e.target.value) })}
                required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Teacher Remarks</label>
            <input
              type="text"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button type="submit" className="btn-gold px-4 py-2 rounded-lg text-xs font-semibold">
              Save Assessment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
