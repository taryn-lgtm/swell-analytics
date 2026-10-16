import Link from "next/link";

export default function NavBar() {
  return (
    <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-8">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">
          <span className="text-cyan-400">WSL</span> Analytics
        </Link>
        <nav className="flex gap-6 text-sm text-slate-300">
          <Link href="/" className="hover:text-white transition-colors">
            Events
          </Link>
          <Link href="/rankings/2025" className="hover:text-white transition-colors">
            Rankings
          </Link>
          <Link href="/athletes" className="hover:text-white transition-colors">
            Athletes
          </Link>
        </nav>
      </div>
    </header>
  );
}
