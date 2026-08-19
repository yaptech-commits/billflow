"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { ShieldAlert, Search, Download, Printer, FileText, Calendar, User, Stethoscope } from "lucide-react";
import toast from "react-hot-toast";

interface ControlledLog {
  id: string;
  propertyId: string;
  productId: string;
  productName: string;
  quantityDispensed: number;
  patientName: string;
  prescriberName: string;
  dispensingStaffName: string;
  prescriptionNumber?: string;
  notes?: string;
  dispensedAt?: Timestamp;
}

export default function ControlledSubstancesPage() {
  const { currentProperty } = useAuth();
  const propertyId = currentProperty?.id || "default";

  const [logs, setLogs] = useState<ControlledLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadLogs();
  }, [propertyId]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "controlledSubstanceLogs"),
        where("propertyId", "==", propertyId)
      );
      const snap = await getDocs(q);
      const items: ControlledLog[] = [];
      snap.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ControlledLog);
      });
      items.sort((a, b) => {
        const tA = a.dispensedAt?.toMillis() || 0;
        const tB = b.dispensedAt?.toMillis() || 0;
        return tB - tA;
      });
      setLogs(items);
    } catch (err) {
      console.error("Error loading controlled substance logs:", err);
      toast.error("Failed to load controlled substance logs");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.prescriberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.prescriptionNumber && l.prescriptionNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportCSV = () => {
    const headers = ["Date", "Product", "Quantity", "Patient", "Prescriber", "Staff", "Prescription #", "Notes"];
    const rows = filteredLogs.map((l) => [
      l.dispensedAt ? new Date(l.dispensedAt.toDate()).toLocaleDateString() : "N/A",
      `"${l.productName}"`,
      l.quantityDispensed,
      `"${l.patientName}"`,
      `"${l.prescriberName}"`,
      `"${l.dispensingStaffName}"`,
      `"${l.prescriptionNumber || ""}"`,
      `"${l.notes || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encodedUri;
    a.download = `controlled-substances-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("CSV exported successfully");
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print register");
      return;
    }
    const htmlRows = filteredLogs
      .map(
        (log) => `
        <tr>
          <td>${log.dispensedAt ? new Date(log.dispensedAt.toDate()).toLocaleDateString() : "N/A"}</td>
          <td>${log.productName}</td>
          <td>${log.quantityDispensed}</td>
          <td>${log.patientName}</td>
          <td>${log.prescriberName}</td>
          <td>${log.dispensingStaffName}</td>
          <td>${log.prescriptionNumber || "-"}</td>
        </tr>
      `
      )
      .join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Controlled Substances Register</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Controlled Substances Register</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Patient</th>
                <th>Prescriber</th>
                <th>Staff</th>
                <th>Prescription #</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-6 rounded-2xl border border-border">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-amber-400" size={24} /> Controlled Substances Register
          </h1>
          <p className="text-sm text-muted">
            Auditable statutory log for prescription-required and controlled medications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportCSV} className="btn-secondary text-xs flex items-center gap-1.5">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={handlePrint} className="btn-primary text-xs flex items-center gap-1.5">
            <Printer size={14} /> Print Register
          </button>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 bg-card border border-border rounded-xl md:col-span-2 flex items-center gap-3">
          <Search size={18} className="text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by medication, patient, prescriber, or prescription #..."
            className="w-full bg-transparent text-white text-sm outline-none placeholder-muted"
          />
        </div>
        <div className="card p-4 bg-card border border-border rounded-xl flex items-center justify-between">
          <span className="text-xs text-muted">Total Dispensed Records</span>
          <span className="text-lg font-bold text-amber-400 font-mono">{filteredLogs.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted">Loading controlled substance logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-muted space-y-2">
            <FileText size={36} className="mx-auto text-muted/50" />
            <p className="text-sm font-medium text-white">No controlled substance records found</p>
            <p className="text-xs">Dispensed controlled medications will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted bg-white/[0.02]">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Medication</th>
                  <th className="py-3 px-4">Qty</th>
                  <th className="py-3 px-4">Patient Name</th>
                  <th className="py-3 px-4">Prescriber</th>
                  <th className="py-3 px-4">Prescription #</th>
                  <th className="py-3 px-4">Dispensed By</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-muted font-mono whitespace-nowrap">
                      {log.dispensedAt ? new Date(log.dispensedAt.toDate()).toLocaleString() : "N/A"}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">{log.productName}</td>
                    <td className="py-3 px-4 font-mono text-amber-400 font-bold">{log.quantityDispensed}</td>
                    <td className="py-3 px-4 text-white flex items-center gap-1.5">
                      <User size={12} className="text-muted" /> {log.patientName}
                    </td>
                    <td className="py-3 px-4 text-muted flex items-center gap-1.5">
                      <Stethoscope size={12} className="text-muted" /> {log.prescriberName}
                    </td>
                    <td className="py-3 px-4 font-mono text-white">{log.prescriptionNumber || "—"}</td>
                    <td className="py-3 px-4 text-muted">{log.dispensingStaffName}</td>
                    <td className="py-3 px-4 text-muted truncate max-w-[180px]">{log.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
