export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-bold mb-3">Page Not Found</h1>
      <p className="text-muted text-sm mb-6 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <a
        href="/dashboard"
        className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
      >
        Return to Dashboard
      </a>
    </div>
  );
}
