import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <DashboardOverview
      role={(session.user as any).role || 'VIEWER'}
      userName={session.user?.name || 'Nguoi dung'}
    />
  );
}
