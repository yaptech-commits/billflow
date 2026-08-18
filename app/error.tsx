"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold mb-3">Something went wrong!</h2>
      <p className="text-muted text-sm mb-6 max-w-md">
        An unexpected error occurred while rendering this page.
      </p>
      <button
        onClick={() => reset()}
        className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
