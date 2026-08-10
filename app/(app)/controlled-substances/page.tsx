"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getControlledSubstanceLogsForBusiness, createControlledSubstanceLog } from "@/lib/pharmacy-db";
import { ControlledSubstanceLog } from "@/lib/db";
import { Plus, Search, Download, Printer, Eye } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";

export default function ControlledSubstancesPage() {
  const { businessId, user } = useAuth();
  const [logs, setLogs] = useState<ControlledSubstanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewLogModal, setShowNewLogModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ControlledSubstanceLog | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (businessId) {
      fetchLogs();
    }
  }, [businessId]);

  const fetchLogs = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getControlledSubstanceLogsForBusiness(businessId);
      setLogs(data);
    } catch (err) {
      toast.error("Failed to fetch controlled substance logs");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.productName.toLowerCase().includes(search.toLowerCase()) ||
      log.patientName.toLowerCase().includes(search.toLowerCase()) ||
      log.prescriberName.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handlePrint = () => {
    const printContent = generatePrintContent();
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleExport = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controlled-substances-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const generatePrintContent = () => {
    const html = `
      <html>
        <head>
          <title>Controlled Substances Register</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
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
              ${filteredLogs.map(log => `
                <tr>
                  <td>${log.dispensedAt ? new Date(log.dispensedAt.toDate()).toLocaleDateString() : "N/A"}</td>
                  <td>${log.productName}</td>
                  <td>${log.quantityDispensed}</td>
                  <td>${log.patientName}</td>
                  <td>${log.prescriberName}</td>
                  <td>${log.dispensingStaffName}</td>
                  <td>${log.prescriptionNumber || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    return html;
  };

  const generateCSV = () => {
    const headers = ["Date", "Product", "Quantity", "Patient", "Prescriber", "Staff", "Prescription #", "Notes"];
    const rows = filteredLogs.map(log => [
      log.dispensedAt ? new Date(log.dispensedAt.toDate()).toLocaleDateString() : "N/A",
      log.productName,
      log.quantityDispensed,
      log.patientName,
      log.prescriberName,
      log.dispensingStaffName,
      log.prescriptionNumber || "-",
      log.notes || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    return csv;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Controlled Substances Register</h1>
          <p className="text-muted text-sm mt-1">Regulatory compliance log for narcotic and controlled drugs</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="btn-ghost flex items-center gap-2"
            title="Print Register"
          >
            <Printer size={18} /> Print
          </button>
          <button
            onClick={handleExport}
            className="btn-ghost flex items-center gap-2"
            title="Export as CSV"
          >
            <Download size={18} /> Export
          </button>
          <button
            onClick={() => setShowNewLogModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} /> New Entry
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input pl-10 w-full"
          placeholder="Search by product, patient, or prescriber..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-muted animate-pulse">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-muted">No controlled substance logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Product</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Qty</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Patient</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Prescriber</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Staff</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Prescription #</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 text-surface">
                      {log.dispensedAt ? new Date(log.dispensedAt.toDate()).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="py-3 px-4 font-medium text-surface">{log.productName}</td>
                    <td className="py-3 px-4 text-surface">{log.quantityDispensed}</td>
                    <td className="py-3 px-4 text-surface">{log.patientName}</td>
                    <td className="py-3 px-4 text-surface">{log.prescriberName}</td>
                    <td className="py-3 px-4 text-surface">{log.dispensingStaffName}</td>
                    <td className="py-3 px-4 text-surface">{log.prescriptionNumber || "-"}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          setSelectedLog(log);
                          setShowDetailsModal(true);
                        }}
                        className="p-2 bg-white/5 text-muted hover:text-gold rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Log Modal */}
      <Modal open={showNewLogModal} onClose={() => setShowNewLogModal(false)} title="Record Controlled Substance Dispensing">
        <NewLogForm 
          businessId={businessId} 
          staffName={user?.displayName || "Unknown"} 
          staffId={user?.uid || ""} 
          onSuccess={() => { setShowNewLogModal(false); fetchLogs(); }} 
        />
      </Modal>

      {/* Log Details Modal */}
      <Modal open={showDetailsModal} onClose={() => setShowDetailsModal(false)} title="Dispensing Details">
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Product</p>
                <p className="font-bold text-surface">{selectedLog.productName}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Quantity</p>
                <p className="font-bold text-surface">{selectedLog.quantityDispensed}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Patient</p>
                <p className="font-bold text-surface">{selectedLog.patientName}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Patient ID</p>
                <p className="font-bold text-surface">{selectedLog.patientId || "-"}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Prescriber</p>
                <p className="font-bold text-surface">{selectedLog.prescriberName}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Prescription #</p>
                <p className="font-bold text-surface">{selectedLog.prescriptionNumber || "-"}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Dispensing Staff</p>
                <p className="font-bold text-surface">{selectedLog.dispensingStaffName}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Date</p>
                <p className="font-bold text-surface">
                  {selectedLog.dispensedAt ? new Date(selectedLog.dispensedAt.toDate()).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>

            {selectedLog.notes && (
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted mb-1">Notes</p>
                <p className="text-sm text-surface">{selectedLog.notes}</p>
              </div>
            )}

            <button className="btn-ghost w-full" onClick={() => setShowDetailsModal(false)}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NewLogForm({ businessId, staffName, staffId, onSuccess }: { businessId: string; staffName: string; staffId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    productName: "",
    productId: "",
    quantityDispensed: 1,
    patientName: "",
    patientId: "",
    prescriberName: "",
    prescriberId: "",
    prescriptionNumber: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createControlledSubstanceLog({
        businessId,
        productId: form.productId || "unknown",
        productName: form.productName,
        quantityDispensed: form.quantityDispensed,
        patientId: form.patientId,
        patientName: form.patientName,
        prescriberId: form.prescriberId,
        prescriberName: form.prescriberName,
        dispensingStaffId: staffId,
        dispensingStaffName: staffName,
        prescriptionNumber: form.prescriptionNumber,
        notes: form.notes,
        dispensedAt: new Date() as any,
      });
      toast.success("Controlled substance log recorded");
      onSuccess();
    } catch (err) {
      toast.error("Failed to record log");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Product Name</label>
          <input
            className="input"
            type="text"
            placeholder="e.g., Morphine 10mg"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="label">Quantity Dispensed</label>
          <input
            className="input"
            type="number"
            min="1"
            value={form.quantityDispensed}
            onChange={(e) => setForm({ ...form, quantityDispensed: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Patient Name</label>
          <input
            className="input"
            type="text"
            placeholder="Full name"
            value={form.patientName}
            onChange={(e) => setForm({ ...form, patientName: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="label">Patient ID</label>
          <input
            className="input"
            type="text"
            placeholder="Optional"
            value={form.patientId}
            onChange={(e) => setForm({ ...form, patientId: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prescriber Name</label>
          <input
            className="input"
            type="text"
            placeholder="Doctor/Prescriber name"
            value={form.prescriberName}
            onChange={(e) => setForm({ ...form, prescriberName: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="label">Prescription Number</label>
          <input
            className="input"
            type="text"
            placeholder="Optional"
            value={form.prescriptionNumber}
            onChange={(e) => setForm({ ...form, prescriptionNumber: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          placeholder="Add any additional notes..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "Recording..." : "Record Dispensing"}
        </button>
      </div>
    </form>
  );
}
