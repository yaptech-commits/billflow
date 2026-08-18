"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  FeeStructure,
  StudentFee,
  getStudents,
  getFeeStructures,
  createFeeStructure,
  deleteFeeStructure,
  assignFeeToStudent,
  getStudentFees,
  recordStudentFeePayment,
  enqueueSchoolNotification,
  DEFAULT_PROPERTY_ID,
} from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { toast } from "react-hot-toast";
import { DollarSign, Plus, FileText, CheckCircle2, Clock, AlertCircle, CreditCard, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function FeesPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [students, setStudents] = useState<Student[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  const [isStructOpen, setIsStructOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<StudentFee | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const [structForm, setStructForm] = useState({
    title: "",
    classGrade: "All",
    amount: 1000,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  });

  const [assignForm, setAssignForm] = useState({
    studentId: "",
    feeStructureId: "",
  });

  const loadData = async () => {
    if (!businessId) return;
    const [stList, fsList, sfList, prof] = await Promise.all([
      getStudents(businessId, propertyId),
      getFeeStructures(businessId, propertyId),
      getStudentFees(businessId, propertyId),
      getBusinessProfile(businessId),
    ]);
    setStudents(stList);
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
        amount: struct.amount,
        dueDate: struct.dueDate,
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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee || !selectedFee.id) return;
    try {
      await recordStudentFeePayment(selectedFee.id, payAmount);
      const student = students.find((item) => item.id === selectedFee.studentId);
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

  const totalBilled = studentFees.reduce((acc, f) => acc + f.amount, 0);
  const totalCollected = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
  const totalOutstanding = totalBilled - totalCollected;

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
        <div className="flex gap-2">
          <button onClick={() => setIsStructOpen(true)} className="btn-ghost border border-border flex items-center gap-2">
            <Plus size={16} /> New Fee Item
          </button>
          <button onClick={() => setIsAssignOpen(true)} className="btn-primary flex items-center gap-2">
            <CreditCard size={16} /> Assign Fee to Student
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
                        <td className="py-3 px-3 text-right">
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

      {/* Assign Fee Modal */}
      <Modal open={isAssignOpen} onClose={() => setIsAssignOpen(false)} title="Assign Fee to Student">
        <form onSubmit={handleAssignFee} className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Select Student *</label>
            <select
              required
              value={assignForm.studentId}
              onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}
              className="input-field w-full bg-surface"
            >
              <option value="">-- Choose Student --</option>
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.admissionNumber} - {st.classGrade})
                </option>
              ))}
            </select>
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
    </div>
  );
}
