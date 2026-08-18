"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getStudents,
  getAttendanceForStudent,
  getFeeAssignmentsForStudent,
  getReportCardsForStudent,
  getSchoolAnnouncements,
  recordStudentFeePaymentDetailed,
  Student,
  AttendanceRecord,
  FeeAssignment,
  ReportCard,
  SchoolAnnouncement,
} from "@/lib/school-db";
import {
  GraduationCap,
  Search,
  ShieldCheck,
  Calendar,
  DollarSign,
  Award,
  Bell,
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  User,
  ArrowRight,
  Sparkles,
  LogOut,
  Printer,
  ChevronRight,
  Check,
  AlertCircle,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";

export default function SchoolParentPortal() {
  const { currentProperty } = useAuth();
  const propertyId = currentProperty?.id || "default";

  const [students, setStudents] = useState<Student[]>([]);
  const [announcements, setAnnouncements] = useState<SchoolAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  // Portal lookup state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Ward detailed data
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeeAssignment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loadingWardData, setLoadingWardData] = useState(false);

  // Payment integration state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activePaymentFee, setActivePaymentFee] = useState<FeeAssignment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"momo" | "card">("momo");
  const [momoProvider, setMomoProvider] = useState<"mtn" | "vodafone" | "airteltigo">("mtn");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);

  // Report card modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [activeReportCard, setActiveReportCard] = useState<ReportCard | null>(null);

  useEffect(() => {
    loadPortalData();
  }, [propertyId]);

  async function loadPortalData() {
    setLoading(true);
    try {
      const [allStudents, allAnnouncements] = await Promise.all([
        getStudents(propertyId),
        getSchoolAnnouncements(propertyId),
      ]);
      setStudents(allStudents);
      setAnnouncements(allAnnouncements);
    } catch (err) {
      console.error("Failed to load portal data:", err);
      toast.error("Failed to load school data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectWard(student: Student) {
    setSelectedStudent(student);
    setLoadingWardData(true);
    try {
      const [att, feeList, reports] = await Promise.all([
        getAttendanceForStudent(propertyId, student.id),
        getFeeAssignmentsForStudent(propertyId, student.id),
        getReportCardsForStudent(propertyId, student.id),
      ]);
      setAttendance(att);
      setFees(feeList);
      setReportCards(reports);
    } catch (err) {
      console.error("Failed to load ward details:", err);
      toast.error("Failed to load student records");
    } finally {
      setLoadingWardData(false);
    }
  }

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.guardianName && s.guardianName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              BillFlow School <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">Parent Portal</span>
            </h1>
            <p className="text-xs text-slate-400">Secure Guardian Access & Student Insights</p>
          </div>
        </div>

        {selectedStudent ? (
          <button
            onClick={() => setSelectedStudent(null)}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" /> Switch Ward / Lookup
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4" /> Property Secure Connection
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!selectedStudent ? (
          /* Landing / Lookup View */
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-4 pt-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Guardian Experience
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                Track Your Ward&apos;s Academic Journey in Real-Time
              </h2>
              <p className="text-slate-400 text-base sm:text-lg">
                Enter your ward&apos;s name or student ID below to securely access attendance records, termly fee statements, report cards, class updates, and school announcements.
              </p>

              {/* Search / Lookup Box */}
              <div className="pt-4 max-w-xl mx-auto">
                <div className="relative flex items-center">
                  <Search className="absolute left-4 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by student name or ID (e.g. STU-001)..."
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xl text-base"
                  />
                </div>
              </div>
            </div>

            {/* Quick Demo Wards / Student List */}
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-400" /> Registered Students ({filteredStudents.length})
                </h3>
                <span className="text-xs text-slate-400">Click any ward to open parent dashboard</span>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-40 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse" />
                  ))}
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8">
                  <User className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-white">No students found</h4>
                  <p className="text-xs text-slate-400 mt-1">Try searching with a different student name or ID.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => handleSelectWard(student)}
                      className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-lg">
                            {student.name.charAt(0)}
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                            {student.studentId}
                          </span>
                        </div>

                        <h4 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {student.name}
                        </h4>
                        <p className="text-xs text-indigo-400 font-medium mt-0.5">
                          Class: {student.classGrade || "Unassigned"}
                        </p>

                        <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                          <p className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-500" /> Guardian: {student.guardianName || "Not specified"}
                          </p>
                          <p className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Status: <span className="text-emerald-400 font-medium">{student.status || "Active"}</span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                        <span>Access Portal Dashboard</span>
                        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* School Announcements Preview */}
            {announcements.length > 0 && (
              <div className="space-y-4 pt-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400" /> Recent School Broadcasts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {announcements.slice(0, 4).map((ann) => (
                    <div key={ann.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 font-medium">
                          {ann.targetClass}
                        </span>
                        <span className="text-xs text-slate-500">{new Date(ann.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2">{ann.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Selected Ward Dashboard View */
          <div className="space-y-8">
            {/* Student Banner */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-2xl">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-extrabold text-white">{selectedStudent.name}</h2>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                      {selectedStudent.studentId}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Class: <span className="text-white font-medium">{selectedStudent.classGrade || "Unassigned"}</span> | Guardian: <span className="text-white font-medium">{selectedStudent.guardianName || "N/A"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  onClick={() => window.print()}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Print Summary
                </button>
              </div>
            </div>

            {loadingWardData ? (
              <div className="py-20 text-center text-slate-400">Loading student records...</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left 2 Cols: Attendance & Performance */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Attendance Overview */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-400" /> Attendance Records
                      </h3>
                      <span className="text-xs text-slate-400">Total Logged: {attendance.length}</span>
                    </div>

                    {attendance.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">No attendance records logged for this student yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {attendance.map((att) => (
                          <div key={att.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs">
                            <span className="text-slate-300 font-medium">{att.date}</span>
                            <span className={`px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                              att.status === "present"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : att.status === "absent"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              {att.status === "present" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              {att.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Report Cards / Performance */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-400" /> Academic Performance & Report Cards
                      </h3>
                      <span className="text-xs text-slate-400">Total Terms: {reportCards.length}</span>
                    </div>

                    {reportCards.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">No report cards published for this student yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {reportCards.map((rc) => (
                          <div key={rc.id} className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-white">{rc.term}</h4>
                                <p className="text-xs text-slate-400">{rc.classGrade} | Published: {new Date(rc.publishedAt).toLocaleDateString()}</p>
                              </div>
                              <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/35">
                                Overall: {rc.overallGrade || "N/A"}
                              </span>
                            </div>
                            {rc.subjects && rc.subjects.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-700/40">
                                {rc.subjects.map((sub, idx) => (
                                  <div key={idx} className="bg-slate-900/60 p-2 rounded-xl border border-slate-700/30 text-xs">
                                    <p className="text-slate-400 truncate">{sub.name}</p>
                                    <p className="font-bold text-white mt-0.5">{sub.score} ({sub.grade})</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="pt-2 flex justify-end">
                              <button
                                onClick={() => {
                                  setActiveReportCard(rc);
                                  setReportModalOpen(true);
                                }}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2"
                              >
                                <Award className="w-3.5 h-3.5" /> View & Download Report Card
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Col: Fees & Announcements */}
                <div className="space-y-8">
                  {/* Fee Balance & History with Payment Integration */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-emerald-400" /> Termly Fee Statements
                      </h3>
                    </div>

                    {fees.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">No fee assignments found.</p>
                    ) : (
                      <div className="space-y-3">
                        {fees.map((fee) => {
                          const isPaid = fee.status === "paid";
                          const isPartial = fee.status === "partial";
                          return (
                            <div key={fee.id} className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-white">{fee.term || "Termly Fee"}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  isPaid ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : isPartial ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}>
                                  {fee.status.toUpperCase()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-slate-400">
                                <span>Total: GH₵{fee.amount.toFixed(2)}</span>
                                <span className="text-rose-400 font-semibold">Balance: GH₵{fee.balance.toFixed(2)}</span>
                              </div>
                              {fee.balance > 0 && (
                                <button
                                  onClick={() => {
                                    setActivePaymentFee(fee);
                                    setPaymentAmount(fee.balance.toString());
                                    setPaymentModalOpen(true);
                                  }}
                                  className="w-full mt-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                  <DollarSign className="w-4 h-4" /> Pay Fee Online (Momo / Card)
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* School Announcements */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Bell className="w-5 h-5 text-indigo-400" /> School Broadcasts
                    </h3>
                    {announcements.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No active school announcements.</p>
                    ) : (
                      <div className="space-y-3">
                        {announcements.map((ann) => (
                          <div key={ann.id} className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-1.5">
                            <h4 className="text-xs font-bold text-white">{ann.title}</h4>
                            <p className="text-xs text-slate-400">{ann.message}</p>
                            <span className="text-[10px] text-slate-500 block">{new Date(ann.createdAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Report Card Modal */}
      {reportModalOpen && activeReportCard && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" /> Student Report Card
                </h3>
                <p className="text-xs text-slate-400">{selectedStudent.name} ({selectedStudent.studentId}) - {activeReportCard.term}</p>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div id="report-card-print-area" className="space-y-6 bg-slate-950/60 p-6 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h4 className="text-lg font-black text-white">{currentProperty?.name || "BillFlow Academy"}</h4>
                  <p className="text-xs text-slate-400">Official Termly Academic Evaluation</p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    Grade: {activeReportCard.overallGrade || "N/A"}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1">Class: {activeReportCard.classGrade}</p>
                </div>
              </div>

              {/* Subject breakdown table */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Subject Performance</h5>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3 font-semibold">Subject</th>
                        <th className="p-3 font-semibold text-center">Score</th>
                        <th className="p-3 font-semibold text-center">Grade</th>
                        <th className="p-3 font-semibold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {activeReportCard.subjects && activeReportCard.subjects.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="p-3 font-medium text-white">{sub.name}</td>
                          <td className="p-3 text-center font-bold text-indigo-300">{sub.score}</td>
                          <td className="p-3 text-center font-bold text-amber-400">{sub.grade}</td>
                          <td className="p-3 text-slate-400">{sub.remarks || "Good performance"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Teacher remarks & Attendance summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-xs font-semibold text-slate-400">Class Teacher Remarks:</span>
                  <p className="text-xs text-slate-200 italic">{activeReportCard.teacherRemarks || "Shows steady improvement and active participation."}</p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-xs font-semibold text-slate-400">Principal Remarks:</span>
                  <p className="text-xs text-slate-200 italic">{activeReportCard.principalRemarks || "Approved. Keep up the excellent work."}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const printContent = document.getElementById("report-card-print-area")?.innerHTML;
                  if (!printContent) return;
                  const win = window.open("", "_blank");
                  if (!win) {
                    toast.error("Please allow popups to download report card");
                    return;
                  }
                  win.document.write(`
                    <html>
                      <head>
                        <title>Report Card - ${selectedStudent.name} (${activeReportCard.term})</title>
                        <style>
                          body { font-family: ui-sans-serif, system-ui, sans-serif; background: #090d16; color: #f8fafc; padding: 32px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                          th, td { border: 1px solid #1e293b; padding: 10px; text-align: left; }
                          th { background: #0f172a; color: #94a3b8; }
                          .font-black { font-weight: 900; }
                          .font-bold { font-weight: 700; }
                          .text-amber-400 { color: #fbbf24; }
                          .text-indigo-300 { color: #a5b4fc; }
                        </style>
                      </head>
                      <body>
                        ${printContent}
                      </body>
                    </html>
                  `);
                  win.document.close();
                  win.focus();
                  setTimeout(() => win.print(), 500);
                }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Award className="w-4 h-4" /> Download / Print Report Card PDF
              </button>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fee Payment Modal */}
      {paymentModalOpen && activePaymentFee && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" /> Secure Fee Payment
                </h3>
                <p className="text-xs text-slate-400">Paying for {selectedStudent.name} ({activePaymentFee.term})</p>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Total Fee Assignment:</span>
                  <span className="font-semibold text-white">GH₵{activePaymentFee.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Outstanding Balance:</span>
                  <span className="font-bold text-rose-400">GH₵{activePaymentFee.balance.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("momo")}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    paymentMethod === "momo" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Mobile Money (MoMo)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    paymentMethod === "card" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Credit / Debit Card
                </button>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Payment Amount (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Enter amount"
                />
              </div>

              {paymentMethod === "momo" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Network Provider</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["mtn", "vodafone", "airteltigo"] as const).map((prov) => (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => setMomoProvider(prov)}
                          className={`py-2 text-xs uppercase font-bold rounded-xl border transition-all ${
                            momoProvider === prov
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          {prov}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">MoMo Phone Number</label>
                    <input
                      type="text"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      placeholder="e.g., 0241234567"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Card Number</label>
                    <input
                      type="text"
                      placeholder="4532 •••• •••• 8921"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">CVV</label>
                      <input
                        type="password"
                        placeholder="123"
                        maxLength={4}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={processingPayment}
                onClick={async () => {
                  const amt = parseFloat(paymentAmount);
                  if (!amt || amt <= 0) {
                    toast.error("Please enter a valid payment amount");
                    return;
                  }
                  if (amt > activePaymentFee.balance) {
                    toast.error("Payment amount cannot exceed outstanding balance");
                    return;
                  }
                  if (paymentMethod === "momo" && !paymentPhone) {
                    toast.error("Please enter your MoMo phone number");
                    return;
                  }

                  setProcessingPayment(true);
                  try {
                    const methodLabel = paymentMethod === "momo" ? `MoMo (${momoProvider.toUpperCase()})` : "Credit/Debit Card";
                    await recordStudentFeePaymentDetailed(
                      propertyId,
                      activePaymentFee.id,
                      selectedStudent.id,
                      amt,
                      methodLabel,
                      `Online payment via ${methodLabel}`
                    );
                    toast.success("Payment completed successfully!");
                    setPaymentModalOpen(false);
                    // Refresh ward data
                    await handleSelectWard(selectedStudent);
                  } catch (err) {
                    console.error("Payment failed:", err);
                    toast.error("Payment processing failed");
                  } finally {
                    setProcessingPayment(false);
                  }
                }}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
              >
                {processingPayment ? (
                  "Processing Payment..."
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" /> Pay GH₵{parseFloat(paymentAmount || "0").toFixed(2)} Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
