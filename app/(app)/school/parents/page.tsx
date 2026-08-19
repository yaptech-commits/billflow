"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  ParentLink,
  getStudents,
  getParentLinks,
  createParentLink,
  revokeParentLink,
} from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { toast } from "react-hot-toast";
import { Users, Mail, Phone, UserCheck, ShieldCheck, Plus, Trash2, Search, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function SchoolParentsPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || "default_property";
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<ParentLink[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  useEffect(() => {
    if (businessId) {
      loadData();
    }
  }, [businessId]);

  const loadData = async () => {
    if (!businessId) return;
    const currentBusinessId = businessId;
    try {
      setLoading(true);
      const [fetchedStudents, fetchedParents, profile] = await Promise.all([
        getStudents(currentBusinessId, propertyId),
        getParentLinks(currentBusinessId, propertyId),
        getBusinessProfile(currentBusinessId),
      ]);
      setStudents(fetchedStudents);
      setParents(fetchedParents);
      setBusinessProfile(profile);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load parent directory.");
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = students.find((s) => s.id === studentId);
    if (student) {
      setParentName(student.guardianName || "");
      setParentEmail(student.guardianEmail || "");
      setParentPhone(student.guardianPhone || "");
    }
  };

  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedStudentId || !parentEmail.trim()) {
      toast.error("Please select a student and provide a guardian email.");
      return;
    }
    const student = students.find((s) => s.id === selectedStudentId);
    if (!student) {
      toast.error("Selected student not found.");
      return;
    }

    try {
      await createParentLink({
        businessId,
        propertyId,
        studentId: student.id!,
        studentName: student.fullName,
        parentEmail,
        parentName: parentName || student.guardianName,
        parentPhone: parentPhone || student.guardianPhone,
      });
      toast.success("Parent portal access granted successfully.");
      setIsModalOpen(false);
      setSelectedStudentId("");
      setParentName("");
      setParentEmail("");
      setParentPhone("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create parent account.");
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!confirm("Are you sure you want to revoke parent portal access?")) return;
    try {
      await revokeParentLink(linkId);
      toast.success("Parent portal access revoked.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke access.");
    }
  };

  // Merge students with their parent links
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const parentMap = new Map(parents.map((p) => [p.studentId, p]));

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.guardianName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.guardianEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="text-gold" /> Parents & Guardian Directory
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage guardian profiles captured during student registration and monitor parent portal access.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 self-start md:self-auto"
        >
          <Plus size={18} /> Grant Portal Access
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Total Students</p>
          <p className="text-2xl font-bold text-white mt-1">{students.length}</p>
        </div>
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Guardians on Record</p>
          <p className="text-2xl font-bold text-gold mt-1">
            {students.filter((s) => s.guardianEmail || s.guardianPhone).length}
          </p>
        </div>
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Active Portal Logins</p>
          <p className="text-2xl font-bold text-green mt-1">{parents.length}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="card bg-white/5 border border-border p-4 rounded-xl flex items-center gap-3">
        <Search className="text-muted" size={20} />
        <input
          type="text"
          placeholder="Search by student name, admission number, guardian name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none text-white w-full text-sm placeholder:text-muted"
        />
      </div>

      {/* Directory Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading parent directory...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <Users size={48} className="mx-auto text-muted/40 mb-3" />
            <p className="text-base font-medium">No students or guardians found</p>
            <p className="text-xs mt-1">Register students with guardian details to populate this directory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-white/5 text-muted uppercase text-xs tracking-wider">
                  <th className="p-4">Student</th>
                  <th className="p-4">Class</th>
                  <th className="p-4">Guardian Name</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">Portal Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((student) => {
                  const portalLink = parentMap.get(student.id!);
                  return (
                    <tr key={student.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <p className="font-semibold text-white">{student.fullName}</p>
                        <p className="text-xs text-muted">Adm: {student.admissionNumber}</p>
                      </td>
                      <td className="p-4">
                        <span className="bg-gold/10 text-gold text-xs px-2.5 py-1 rounded-full font-medium">
                          {student.classGrade}
                        </span>
                      </td>
                      <td className="p-4 text-white font-medium">
                        {student.guardianName || <span className="text-muted italic">Not specified</span>}
                      </td>
                      <td className="p-4">
                        {student.guardianEmail ? (
                          <div className="flex items-center gap-1.5 text-xs text-surface mb-1">
                            <Mail size={13} className="text-muted" /> {student.guardianEmail}
                          </div>
                        ) : null}
                        {student.guardianPhone ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            <Phone size={13} /> {student.guardianPhone}
                          </div>
                        ) : (
                          <span className="text-xs text-muted italic">No phone</span>
                        )}
                      </td>
                      <td className="p-4">
                        {portalLink ? (
                          <span className="inline-flex items-center gap-1 bg-green/10 text-green text-xs px-2.5 py-1 rounded-full font-medium">
                            <ShieldCheck size={12} /> Active Access
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-white/5 text-muted text-xs px-2.5 py-1 rounded-full">
                            Not Linked
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {portalLink ? (
                          <button
                            onClick={() => handleRevoke(portalLink.id!)}
                            className="text-red-400 hover:text-red-300 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Revoke Access
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              handleStudentSelect(student.id!);
                              setIsModalOpen(true);
                            }}
                            className="text-gold hover:text-gold/80 text-xs font-medium bg-gold/10 hover:bg-gold/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Grant Access
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant Portal Access Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Grant Parent Portal Access">
        <div className="p-6 space-y-6 max-w-lg w-full">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="text-gold" /> Grant Parent Portal Access
            </h2>
            <button
              onClick={() => setIsModalOpen(false)}
              className="text-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreateParent} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Select Student *
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => handleStudentSelect(e.target.value)}
                required
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
              >
                <option value="" className="bg-surface text-white">-- Select Student --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id} className="bg-surface text-white">
                    {s.fullName} ({s.admissionNumber} - {s.classGrade})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Guardian Full Name
              </label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Mr. John Doe"
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Guardian Email (Portal Login) *
              </label>
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                required
                placeholder="guardian@example.com"
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
              />
              <p className="text-xs text-muted mt-1">
                The guardian will sign in at <span className="text-gold">/school/portal</span> using this email address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Guardian Phone Number
              </label>
              <input
                type="text"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="e.g. +233 24 000 0000"
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save & Enable Access
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
