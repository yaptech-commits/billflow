export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-3xl font-extrabold text-white">Page Not Found</h2>
        <p className="text-sm text-slate-400">The page you are looking for does not exist or has been moved.</p>
        <a href="/" className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
          Return Home
        </a>
      </div>
    </div>
  );
}
