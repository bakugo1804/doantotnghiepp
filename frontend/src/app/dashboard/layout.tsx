import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { DraggableChatbox } from '@/components/chat/DraggableChatbox';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar role={(session.user as any).role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header user={session.user} />
        <main className="app-main custom-scrollbar flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
      <DraggableChatbox />
    </div>
  );
}
