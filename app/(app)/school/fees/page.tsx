"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  SchoolClass,
  FeeStructure,
  StudentFee,
  FeePaymentLogEntry,
  getStudents,
  getSchoolClasses,
  getFeeStructures,
  createFeeStructure,
  deleteFeeStructure,
  assignFeeToStudent,
  bulkAssignFeeToClass,
  getStudentFees,
  getStudentFeePayments,
  recordStudentFeePaymentDetailed,
  enqueueSchoolNotification,
  DEFAULT_PROPERTY_ID,
} from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { printReceipt, downloadReceipt } from "@/lib/print-receipt";
import { toast } from "react-hot-toast";
import { DollarSign, Plus, FileText, CheckCircle2, Clock, AlertCircle, CreditCard, X, Users } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function FeesPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statementStudentId, setStatementStudentId] = useState("");
  const [statementTerm, setStatementTerm] = useState("Term 1");
  const [statementData, setStatementData] = useState<{
    student: Student;
    fees: StudentFee[];
    payments: FeePaymentLogEntry[];
    totalBilled: number;
    totalPaid: number;
    balance: number;
    term: string;
  } | null>(null);

  const [isStructOpen, setIsStructOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<StudentFee | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [paymentReceipt, setPaymentReceipt] = useState<{
    receiptNumber: string;
    issuedAt: Date;
    studentName: string;
    classGrade: string;
    feeTitle: string;
    amount: number;
    paymentAmount: number;
    totalPaid: number;
    balance: number;
  } | null>(null);

  const [structForm, setStructForm] = useState({
    title: "",
    classGrade: "All",
    amount: 1000,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    term: "Term 1",
  });

  const [assignForm, setAssignForm] = useState({
    classGrade: "",
    studentId: "",
    feeStructureId: "",
  });
  const [bulkAssignForm, setBulkAssignForm] = useState({
    classGrade: "",
    feeStructureId: "",
  });

  const loadData = async () => {
    if (!businessId) return;
    const [stList, classList, fsList, sfList, prof] = await Promise.all([
      getStudents(businessId, propertyId),
      getSchoolClasses(businessId, propertyId),
      getFeeStructures(businessId, propertyId),
      getStudentFees(businessId, propertyId),
      getBusinessProfile(businessId),
    ]);
    setStudents(stList);
    setClasses(classList);
    setFeeStructures(fsList);
    setStudentFees(sfList);
    setBusinessProfile(prof);
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId]);

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    try {
      await createFeeStructure({
        businessId,
        propertyId: propertyId || "default_property",
        ...structForm,
      });
      toast.success("Fee structure created.");
      setIsStructOpen(false);
      setStructForm({
        title: "",
        classGrade: "All",
        amount: 1000,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        term: "Term 1",
      });
      loadData();
    } catch (err) {
      toast.error("Failed to create fee structure.");
    }
  };

  const handleAssignFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !assignForm.studentId || !assignForm.feeStructureId) return;
    const student = students.find((s) => s.id === assignForm.studentId);
    const struct = feeStructures.find((f) => f.id === assignForm.feeStructureId);
    if (!student || !struct) return;

    try {
      await assignFeeToStudent({
        businessId,
        propertyId: propertyId || "default_property",
        studentId: student.id || "",
        studentName: student.fullName,
        classGrade: student.classGrade,
        feeTitle: struct.title,
        feeStructureId: struct.id,
        amount: struct.amount,
        dueDate: struct.dueDate,
        term: struct.term || "Term 1",
      });
      if (student.guardianEmail || student.guardianPhone) {
        await enqueueSchoolNotification({
          businessId,
          propertyId,
          studentId: student.id || "",
          studentName: student.fullName,
          recipientEmail: student.guardianEmail,
          recipientPhone: student.guardianPhone,
          title: "New school fee assigned",
          message: `${struct.title} of ${struct.amount.toFixed(2)} has been assigned to ${student.fullName}. Due ${struct.dueDate}.`,
          type: "fee_assigned",
          channels: ["in_app", "email", "sms"],
        });
      }
      toast.success(`Assigned ${struct.title} to ${student.fullName}`);
      setIsAssignOpen(false);
      loadData();
    } catch (err) {
      toast.error("Failed to assign fee.");
    }
  };

  const handleBulkAssignFees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !bulkAssignForm.classGrade || !bulkAssignForm.feeStructureId) return;
    const struct = feeStructures.find((feeStructure) => feeStructure.id === bulkAssignForm.feeStructureId);
    if (!struct) return;

    setIsBulkAssigning(true);
    try {
      const result = await bulkAssignFeeToClass({
        businessId,
        propertyId,
        students,
        feeStructure: struct,
        classGrade: bulkAssignForm.classGrade,
      });
      const createdStudentIds = new Set(result.createdStudentIds);
      const createdStudents = students.filter((student) => createdStudentIds.has(student.id || ""));
      await Promise.allSettled(
        createdStudents
          .filter((student) => student.guardianEmail || student.guardianPhone)
          .map((student) =>
            enqueueSchoolNotification({
              businessId,
              propertyId,
              studentId: student.id || "",
              studentName: student.fullName,
              recipientEmail: student.guardianEmail,
              recipientPhone: student.guardianPhone,
              title: "New school fee assigned",
              message: `${struct.title} of ${struct.amount.toFixed(2)} has been assigned to ${student.fullName}. Due ${struct.dueDate}.`,
              type: "fee_assigned",
              channels: ["in_app", "email", "sms"],
            }),
          ),
      );
      toast.success(
        result.createdCount > 0
          ? `Assigned ${struct.title} to ${result.createdCount} student${result.createdCount === 1 ? "" : "s"}. ${result.skippedCount} duplicate${result.skippedCount === 1 ? "" : "s"} skipped.`
          : `No new assignments created. ${result.skippedCount} existing fee${result.skippedCount === 1 ? "" : "s"} skipped.`,
      );
      setIsBulkAssignOpen(false);
      setBulkAssignForm({ classGrade: "", feeStructureId: "" });
      await loadData();
    } catch (err) {
      toast.error("Failed to assign fees to the selected class.");
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee || !selectedFee.id) return;
    try {
      const updatedFee = await recordStudentFeePaymentDetailed(selectedFee.id, payAmount, "Cash", selectedFee.term || "Term 1");
      const student = students.find((item) => item.id === selectedFee.studentId);
      const issuedAt = new Date();
      setPaymentReceipt({
        receiptNumber: `FEE-${issuedAt.getTime().toString(36).toUpperCase()}`,
        issuedAt,
        studentName: student?.fullName || selectedFee.studentName,
        classGrade: student?.classGrade || selectedFee.classGrade || "Not assigned",
        feeTitle: selectedFee.feeTitle,
        amount: updatedFee.amount,
        paymentAmount: payAmount,
        totalPaid: updatedFee.amountPaid || 0,
        balance: Math.max(0, updatedFee.amount - (updatedFee.amountPaid || 0)),
      });
      if (student && (student.guardianEmail || student.guardianPhone)) {
        await enqueueSchoolNotification({
          businessId: businessId || "",
          propertyId,
          studentId: student.id || selectedFee.studentId,
          studentName: student.fullName,
          recipientEmail: student.guardianEmail,
          recipientPhone: student.guardianPhone,
          title: "School fee payment received",
          message: `A payment of ${payAmount.toFixed(2)} was recorded for ${selectedFee.feeTitle}.`,
          type: "fee_payment",
          channels: ["in_app", "email", "sms"],
        });
      }
      toast.success("Fee payment recorded successfully.");
      setIsPayOpen(false);
      setSelectedFee(null);
      setPayAmount(0);
      loadData();
    } catch (err) {
      toast.error("Failed to record payment.");
    }
  };

  const classOptions = Array.from(new Set([
    ...classes.map((item) => item.name),
    ...students.map((item) => item.classGrade).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));
  const assignableStudents = assignForm.classGrade
    ? students.filter((student) => student.classGrade === assignForm.classGrade)
    : students;
  const bulkAssignableStudents = bulkAssignForm.classGrade
    ? students.filter((student) => student.classGrade === bulkAssignForm.classGrade)
    : [];
  const bulkFeeStructures = bulkAssignForm.classGrade
    ? feeStructures.filter((feeStructure) => feeStructure.classGrade === "All" || feeStructure.classGrade === bulkAssignForm.classGrade)
    : [];
  const selectedBulkStructure = bulkFeeStructures.find((feeStructure) => feeStructure.id === bulkAssignForm.feeStructureId);
  const totalBilled = studentFees.reduce((acc, f) => acc + f.amount, 0);
  const totalCollected = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
  const totalOutstanding = totalBilled - totalCollected;

  const prepareStatement = async (student: Student, term: string) => {
    if (!businessId || !student.id) return;
    const feesForTerm = studentFees.filter((fee) => fee.studentId === student.id && (term === "Full Academic Year" || !fee.term || fee.term === term));
    const payments = await getStudentFeePayments(businessId, propertyId, student.id, term);
    const billed = feesForTerm.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
    const paidFromFees = feesForTerm.reduce((sum, fee) => sum + Number(fee.amountPaid || 0), 0);
    const paidFromLogs = payments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    setStatementData({
      student,
      fees: feesForTerm,
      payments,
      totalBilled: billed,
      totalPaid: paidFromLogs || paidFromFees,
      balance: Math.max(0, billed - (paidFromLogs || paidFromFees)),
      term,
    });
  };

  const receiptData = paymentReceipt
    ? {
        documentTitle: "FEE RECEIPT",
        invoiceNumber: paymentReceipt.receiptNumber,
        issuedAt: paymentReceipt.issuedAt,
        dueDate: paymentReceipt.issuedAt,
        items: [{
          productName: paymentReceipt.feeTitle,
          quantity: 1,
          unitPrice: paymentReceipt.amount,
        }],
        subtotal: paymentReceipt.amount,
        taxAmount: 0,
        total: paymentReceipt.amount,
        amountPaid: paymentReceipt.paymentAmount,
        customerName: paymentReceipt.studentName,
        studentName: paymentReceipt.studentName,
        classGrade: paymentReceipt.classGrade,
        businessName: businessProfile?.businessName,
        footerNote: `Payment received: ${paymentReceipt.paymentAmount.toLocaleString()} • Balance remaining: ${paymentReceipt.balance.toLocaleString()}`,
        currencyCode: businessProfile?.currency || "GHS",
      }
    : null;

  const handlePrintPaymentReceipt = () => {
    if (receiptData) printReceipt(receiptData);
  };

  const handleDownloadPaymentReceipt = () => {
    if (!receiptData || !paymentReceipt) return;
    downloadReceipt(receiptData, `${paymentReceipt.receiptNumber}.html`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-grotesk text-white flex items-center gap-2">
            <DollarSign className="text-gold" /> Fee Billing & Payments
          </h1>
          <p className="text-xs text-muted mt-1">
            Manage term fees, student billing, fee structures, and collection receipts for {businessProfile?.businessName || "School"}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setIsStatementOpen(true)} className="btn-ghost border border-border flex items-center gap-2">
            <FileText size={16} /> Termly Statement
          </button>
          <button onClick={() => setIsStructOpen(true)} className="btn-ghost border border-border flex items-center gap-2">
            <Plus size={16} /> New Fee Item
          </button>
          <button onClick={() => setIsAssignOpen(true)} className="btn-primary flex items-center gap-2">
            <CreditCard size={16} /> Assign Fee to Student
          </button>
          <button onClick={() => setIsBulkAssignOpen(true)} className="btn-ghost border border-gold/50 text-gold flex items-center gap-2">
            <Users size={16} /> Bulk Assign to Class
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card space-y-1">
          <span className="text-xs text-muted uppercase font-mono">Total Billed</span>
          <div className="text-2xl font-bold font-grotesk text-white">
            {businessProfile?.currency || "$"}{totalBilled.toLocaleString()}
          </div>
        </div>
        <div className="card space-y-1">
          <span className="text-xs text-muted uppercase font-mono">Total Collected</span>
          <div className="text-2xl font-bold font-grotesk text-emerald-400">
            {businessProfile?.currency || "$"}{totalCollected.toLocaleString()}
          </div>
        </div>
        <div className="card space-y-1">
          <span className="text-xs text-muted uppercase font-mono">Outstanding Balance</span>
          <div className="text-2xl font-bold font-grotesk text-amber-400">
            {businessProfile?.currency || "$"}{totalOutstanding.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fee Structures Column */}
        <div className="card space-y-4 lg:col-span-1">
          <div className="flex justify-between items-center">
            <h2 className="font-grotesk font-semibold text-white">Fee Structures</h2>
          </div>
          <div className="space-y-3">
            {feeStructures.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No fee structures defined yet.</p>
            ) : (
              feeStructures.map((fs) => (
                <div key={fs.id} className="p-3 bg-surface-hover/30 rounded-lg border border-border space-y-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white text-sm">{fs.title}</h3>
                      <span className="text-xs text-muted">Class: {fs.classGrade}</span>
                    </div>
                    <span className="font-mono text-gold font-bold">
                      {businessProfile?.currency || "$"}{fs.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted pt-2 border-t border-border/50">
                    <span>Due: {fs.dueDate}</span>
                    <button
                      onClick={async () => {
                        if (fs.id) {
                          await deleteFeeStructure(fs.id);
                          toast.success("Fee structure deleted.");
                          loadData();
                        }
                      }}
                      className="text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Student Fee Ledger Column */}
        <div className="card space-y-4 lg:col-span-2">
          <h2 className="font-grotesk font-semibold text-white">Student Fee Ledger ({studentFees.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-muted uppercase">
                  <th className="py-3 px-3">Student</th>
                  <th className="py-3 px-3">Fee Item</th>
                  <th className="py-3 px-3">Billed</th>
                  <th className="py-3 px-3">Paid</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {studentFees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted">
                      No student fee accounts assigned yet.
                    </td>
                  </tr>
                ) : (
                  studentFees.map((sf) => {
                    const balance = sf.amount - (sf.amountPaid || 0);
                    return (
                      <tr key={sf.id} className="hover:bg-surface-hover/50">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{sf.studentName}</div>
                          <span className="text-xs text-muted">{sf.classGrade}</span>
                        </td>
                        <td className="py-3 px-3 text-xs">{sf.feeTitle}</td>
                        <td className="py-3 px-3 font-mono">{businessProfile?.currency || "$"}{sf.amount.toLocaleString()}</td>
                        <td className="py-3 px-3 font-mono text-emerald-400">
                          {businessProfile?.currency || "$"}{(sf.amountPaid || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              sf.status === "paid"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : sf.status === "partial"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {sf.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right space-x-2">
                          <button
                            onClick={() => {
                              const st = students.find((s) => s.id === sf.studentId);
                              if (st) {
                                void prepareStatement(st, "Term 1");
                              }
                            }}
                            className="px-3 py-1 bg-surface-hover/80 text-white hover:bg-surface-hover rounded text-xs font-semibold border border-border"
                          >
                            Statement
                          </button>
                          {sf.status !== "paid" && (
                            <button
                              onClick={() => {
                                setSelectedFee(sf);
                                setPayAmount(balance);
                                setIsPayOpen(true);
                              }}
                              className="px-3 py-1 bg-gold/10 text-gold hover:bg-gold/20 rounded text-xs font-semibold"
                            >
                              Record Payment
                            </button>
                          )}
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

      {/* New Fee Structure Modal */}
      <Modal open={isStructOpen} onClose={() => setIsStructOpen(false)} title="Create Fee Structure">
        <form onSubmit={handleCreateStructure} className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Fee Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. First Term Tuition"
              value={structForm.title}
              onChange={(e) => setStructForm({ ...structForm, title: e.target.value })}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Class / Grade *</label>
            <select
              value={structForm.classGrade}
              onChange={(e) => setStructForm({ ...structForm, classGrade: e.target.value })}
              className="input-field w-full bg-surface"
            >
              <option value="All">All Classes / School-wide</option>
              <option value="Nursery">Nursery</option>
              <option value="Kindergarten">Kindergarten</option>
              <option value="Grade 1">Grade 1</option>
              <option value="Grade 2">Grade 2</option>
              <option value="Grade 3">Grade 3</option>
              <option value="Grade 4">Grade 4</option>
              <option value="Grade 5">Grade 5</option>
              <option value="Grade 6">Grade 6</option>
              <option value="Junior High 1">Junior High 1</option>
              <option value="Junior High 2">Junior High 2</option>
              <option value="Junior High 3">Junior High 3</option>
              <option value="Senior High 1">Senior High 1</option>
              <option value="Senior High 2">Senior High 2</option>
              <option value="Senior High 3">Senior High 3</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Amount ({businessProfile?.currency || "$"}) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={structForm.amount}
                onChange={(e) => setStructForm({ ...structForm, amount: parseFloat(e.target.value) || 0 })}
                className="input-field w-full font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Due Date *</label>
              <input
                type="date"
                required
                value={structForm.dueDate}
                onChange={(e) => setStructForm({ ...structForm, dueDate: e.target.value })}
                className="input-field w-full"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Academic Term *</label>
            <select
              required
              value={structForm.term}
              onChange={(e) => setStructForm({ ...structForm, term: e.target.value })}
              className="input-field w-full bg-surface"
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsStructOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Fee Structure
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Assign Fees Modal */}
      <Modal
        open={isBulkAssignOpen}
        onClose={() => {
          if (!isBulkAssigning) {
            setIsBulkAssignOpen(false);
            setBulkAssignForm({ classGrade: "", feeStructureId: "" });
          }
        }}
        title="Bulk Assign Fees to Class"
      >
        <form onSubmit={handleBulkAssignFees} className="space-y-4">
          <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs text-muted">
            Select a class and fee structure to create one fee account for every student in that class. Existing assignments for the same fee structure and term are skipped automatically.
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Select Class *</label>
            <select
              required
              value={bulkAssignForm.classGrade}
              onChange={(e) => setBulkAssignForm({ classGrade: e.target.value, feeStructureId: "" })}
              className="input-field w-full bg-surface"
              disabled={isBulkAssigning}
            >
              <option value="">-- Choose Class --</option>
              {classOptions.map((classGrade) => (
                <option key={classGrade} value={classGrade}>
                  {classGrade} ({students.filter((student) => student.classGrade === classGrade).length} students)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Select Fee Structure *</label>
            <select
              required
              value={bulkAssignForm.feeStructureId}
              onChange={(e) => setBulkAssignForm({ ...bulkAssignForm, feeStructureId: e.target.value })}
              className="input-field w-full bg-surface"
              disabled={!bulkAssignForm.classGrade || isBulkAssigning}
            >
              <option value="">{bulkAssignForm.classGrade ? "-- Choose Fee Structure --" : "-- Choose a class first --"}</option>
              {bulkFeeStructures.map((feeStructure) => (
                <option key={feeStructure.id} value={feeStructure.id}>
                  {feeStructure.title} ({businessProfile?.currency || "$"}{feeStructure.amount.toLocaleString()} - {feeStructure.classGrade})
                </option>
              ))}
            </select>
            {bulkAssignForm.classGrade && bulkFeeStructures.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">No fee structures match this class or are marked school-wide.</p>
            )}
          </div>
          {bulkAssignForm.classGrade && selectedBulkStructure && (
            <div className="rounded-lg border border-border bg-surface-hover/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Students in class</span>
                <span className="font-semibold text-white">{bulkAssignableStudents.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Fee per student</span>
                <span className="font-mono text-gold">{businessProfile?.currency || "$"}{selectedBulkStructure.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted">Total class billing</span>
                <span className="font-mono font-semibold text-white">{businessProfile?.currency || "$"}{(selectedBulkStructure.amount * bulkAssignableStudents.length).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsBulkAssignOpen(false)} className="btn-ghost" disabled={isBulkAssigning}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isBulkAssigning || bulkAssignableStudents.length === 0 || !selectedBulkStructure}>
              {isBulkAssigning ? "Assigning..." : `Assign to ${bulkAssignableStudents.length || "Class"}`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Fee Modal */}
      <Modal open={isAssignOpen} onClose={() => setIsAssignOpen(false)} title="Assign Fee to Student">
        <form onSubmit={handleAssignFee} className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Select Class *</label>
            <select
              required
              value={assignForm.classGrade}
              onChange={(e) => setAssignForm({ ...assignForm, classGrade: e.target.value, studentId: "" })}
              className="input-field w-full bg-surface"
            >
              <option value="">-- Choose Class --</option>
              {classOptions.map((classGrade) => (
                <option key={classGrade} value={classGrade}>
                  {classGrade} ({students.filter((student) => student.classGrade === classGrade).length} students)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Select Student *</label>
            <select
              required
              value={assignForm.studentId}
              onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}
              className="input-field w-full bg-surface"
              disabled={!assignForm.classGrade}
            >
              <option value="">{assignForm.classGrade ? "-- Choose Student --" : "-- Choose a class first --"}</option>
              {assignableStudents.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.admissionNumber})
                </option>
              ))}
            </select>
            {assignForm.classGrade && assignableStudents.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">No students are currently enrolled in this class.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Select Fee Structure *</label>
            <select
              required
              value={assignForm.feeStructureId}
              onChange={(e) => setAssignForm({ ...assignForm, feeStructureId: e.target.value })}
              className="input-field w-full bg-surface"
            >
              <option value="">-- Choose Fee Structure --</option>
              {feeStructures.map((fs) => (
                <option key={fs.id} value={fs.id}>
                  {fs.title} ({businessProfile?.currency || "$"}{fs.amount.toLocaleString()} - {fs.classGrade})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsAssignOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Assign Fee
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={isPayOpen} onClose={() => setIsPayOpen(false)} title={`Record Payment for ${selectedFee?.studentName}`}>
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          <div className="p-3 bg-surface-hover/30 rounded border border-border space-y-1">
            <div className="text-xs text-muted">Fee Item: <span className="text-white font-semibold">{selectedFee?.feeTitle}</span></div>
            <div className="text-xs text-muted">Total Billed: <span className="font-mono text-white">{businessProfile?.currency || "$"}{selectedFee?.amount.toLocaleString()}</span></div>
            <div className="text-xs text-muted">Already Paid: <span className="font-mono text-emerald-400">{businessProfile?.currency || "$"}{(selectedFee?.amountPaid || 0).toLocaleString()}</span></div>
            <div className="text-xs text-muted">Outstanding Balance: <span className="font-mono text-amber-400">{businessProfile?.currency || "$"}{selectedFee ? selectedFee.amount - (selectedFee.amountPaid || 0) : 0}</span></div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Payment Amount ({businessProfile?.currency || "$"}) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
              className="input-field w-full font-mono text-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsPayOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Confirm & Issue Receipt
            </button>
          </div>
        </form>
      </Modal>

      {paymentReceipt && (
        <Modal open={Boolean(paymentReceipt)} onClose={() => setPaymentReceipt(null)} title="Fee Payment Receipt">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-hover/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Receipt number</p>
                  <p className="font-mono text-sm text-white">{paymentReceipt.receiptNumber}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted">Student</p>
                  <p className="font-semibold text-white">{paymentReceipt.studentName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Class</p>
                  <p className="font-semibold text-white">{paymentReceipt.classGrade}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Fee item</p>
                  <p className="text-sm text-white">{paymentReceipt.feeTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Amount paid</p>
                  <p className="font-mono font-semibold text-emerald-400">{businessProfile?.currency || "$"}{paymentReceipt.paymentAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">The student name and class are included in both the printed receipt and downloaded HTML receipt.</p>
            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <button type="button" onClick={() => setPaymentReceipt(null)} className="btn-ghost">
                Close
              </button>
              <button type="button" onClick={handleDownloadPaymentReceipt} className="btn-ghost">
                Download receipt
              </button>
              <button type="button" onClick={handlePrintPaymentReceipt} className="btn-primary">
                Print receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Termly Statement Generator Modal */}
      <Modal open={isStatementOpen} onClose={() => setIsStatementOpen(false)} title="Generate Termly Student Payment Statement">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Select Term *</label>
            <select
              value={statementTerm}
              onChange={(e) => setStatementTerm(e.target.value)}
              className="input-field w-full bg-surface"
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
              <option value="Full Academic Year">Full Academic Year</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Select Student *</label>
            <select
              value={statementStudentId}
              onChange={(e) => setStatementStudentId(e.target.value)}
              className="input-field w-full bg-surface"
            >
              <option value="">-- Choose Student --</option>
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.classGrade} - {st.admissionNumber})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsStatementOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              disabled={!statementStudentId}
              onClick={async () => {
                const st = students.find((s) => s.id === statementStudentId);
                if (!st) return;
                await prepareStatement(st, statementTerm);
                setIsStatementOpen(false);
              }}
              className="btn-primary disabled:opacity-50"
            >
              Generate Statement
            </button>
          </div>
        </div>
      </Modal>

      {/* Student Statement Preview & Download Modal */}
      {statementData && (
        <Modal open={Boolean(statementData)} onClose={() => setStatementData(null)} title="Termly Student Payment Statement">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-hover/30 p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-white text-base">{statementData.student.fullName}</h3>
                  <p className="text-xs text-muted">Class: {statementData.student.classGrade} | Admission No: {statementData.student.admissionNumber}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase tracking-wide font-mono px-2 py-1 rounded bg-gold/10 text-gold border border-gold/20">
                    {statementData.term}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-xs">
                <div>
                  <span className="text-muted block">Total Billed</span>
                  <span className="font-mono font-semibold text-white">{businessProfile?.currency || "$"}{statementData.totalBilled.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted block">Total Paid</span>
                  <span className="font-mono font-semibold text-emerald-400">{businessProfile?.currency || "$"}{statementData.totalPaid.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted block">Balance Due</span>
                  <span className="font-mono font-semibold text-amber-400">{businessProfile?.currency || "$"}{statementData.balance.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-56 border border-border rounded">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-muted uppercase">
                  <tr>
                    <th className="py-2 px-3">Entry</th>
                    <th className="py-2 px-3">Billed</th>
                    <th className="py-2 px-3">Paid</th>
                    <th className="py-2 px-3">Status / Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statementData.fees.length === 0 && statementData.payments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted">No fee or payment records found for this student.</td>
                    </tr>
                  ) : (
                    <>
                      {statementData.fees.map((f) => (
                        <tr key={`fee-${f.id}`}>
                          <td className="py-2 px-3 font-semibold text-white">{f.feeTitle}</td>
                          <td className="py-2 px-3 font-mono">{businessProfile?.currency || "$"}{f.amount.toLocaleString()}</td>
                          <td className="py-2 px-3 font-mono text-emerald-400">{businessProfile?.currency || "$"}{(f.amountPaid || 0).toLocaleString()}</td>
                          <td className="py-2 px-3 uppercase text-[10px] font-bold text-muted">{f.status}</td>
                        </tr>
                      ))}
                      {statementData.payments.map((payment) => (
                        <tr key={`payment-${payment.id}`} className="bg-emerald-500/5">
                          <td className="py-2 px-3 text-emerald-300">Payment • {payment.feeTitle}</td>
                          <td className="py-2 px-3 text-muted">—</td>
                          <td className="py-2 px-3 font-mono text-emerald-400">{businessProfile?.currency || "$"}{payment.amountPaid.toLocaleString()}</td>
                          <td className="py-2 px-3 text-[10px] text-muted">{payment.paymentMethod || "Cash"}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button type="button" onClick={() => setStatementData(null)} className="btn-ghost">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!statementData) return;
                  const statementReceiptData = {
                    documentTitle: `STUDENT PAYMENT STATEMENT (${statementData.term.toUpperCase()})`,
                    invoiceNumber: `STM-${Date.now().toString(36).toUpperCase()}`,
                    issuedAt: new Date(),
                    dueDate: new Date(),
                    items: [
                      ...statementData.fees.map((f) => ({
                        productName: `${f.feeTitle} [${statementData.term} | Status: ${f.status.toUpperCase()}]`,
                        quantity: 1,
                        unitPrice: f.amount,
                      })),
                      ...statementData.payments.map((payment) => ({
                        productName: `Payment received • ${payment.feeTitle} [${payment.paymentMethod || "Cash"}]`,
                        quantity: 1,
                        unitPrice: -Math.abs(payment.amountPaid),
                      })),
                    ],
                    subtotal: statementData.totalBilled,
                    taxAmount: 0,
                    total: statementData.totalBilled,
                    amountPaid: statementData.totalPaid,
                    customerName: statementData.student.fullName,
                    studentName: statementData.student.fullName,
                    classGrade: statementData.student.classGrade,
                    businessName: businessProfile?.businessName || "School",
                    footerNote: `Term: ${statementData.term} • Total Billed: ${statementData.totalBilled.toLocaleString()} • Total Paid: ${statementData.totalPaid.toLocaleString()} • Balance Due: ${statementData.balance.toLocaleString()}`,
                    currencyCode: businessProfile?.currency || "GHS",
                  };
                  downloadReceipt(statementReceiptData, `Statement_${statementData.student.fullName.replace(/\s+/g, "_")}_${statementData.term.replace(/\s+/g, "")}.html`);
                  toast.success("Termly student payment statement downloaded successfully.");
                }}
                className="btn-primary flex items-center gap-2"
              >
                <FileText size={16} /> Download Statement HTML
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
