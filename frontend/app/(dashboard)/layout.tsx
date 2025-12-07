import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Home, Plus, List } from 'lucide-react';
import GlobalGradient from '@/components/GlobalGradient';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0c0c0c]">
      <GlobalGradient />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b0b]/90 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-[#3ecf8e]">
            InterviewPrep AI
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-gray-300 hover:text-white transition"
            >
              <List className="w-4 h-4" />
              Dashboard
            </Link>
            <Link
              href="/create-interview"
              className="flex items-center gap-2 text-gray-300 hover:text-white transition"
            >
              <Plus className="w-4 h-4" />
              New Interview
            </Link>
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
