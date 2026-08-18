"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#16161F",
          color: "#E8E8F0",
          border: "1px solid #1E1E2E",
          borderRadius: "10px",
          fontSize: "13px",
        },
      }}
    />
  );
}
