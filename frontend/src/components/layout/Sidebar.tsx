'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileSearch, FileText, LayoutDashboard, ListTodo, BarChart3, Settings, Ship, Upload, Users, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppPreferences } from '@/components/settings/AppPreferencesProvider';
import { useLocale } from '@/components/settings/LocaleProvider';

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { sidebarCollapsed, toggleSidebar } = useAppPreferences();

  const copy = locale === 'vi'
    ? {
        appName: 'Hải Quan Manager',
        appDescription: 'Quản lý xuất nhập khẩu',
        workspace: 'Điều hướng',
        admin: role === 'DIRECTOR' ? 'Nhân sự công ty' : 'Quản trị',
        settings: 'Cài đặt',
        footer: '© 2026 Customs App',
        navItems: [
          { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
          { href: '/dashboard/customs', label: 'Tờ khai', icon: FileText },
          { href: '/dashboard/search', label: 'Tìm kiếm', icon: FileSearch },
          { href: '/dashboard/companies', label: 'Công ty', icon: Building2 },
          { href: '/dashboard/tasks', label: 'Giao việc', icon: ListTodo },
          { href: '/dashboard/import', label: 'Nhập từ file', icon: Upload },
          { href: '/dashboard/convert', label: 'Chuyển đổi file', icon: ArrowLeftRight },
          { href: '/dashboard/reports', label: 'Báo cáo', icon: BarChart3 },
        ],
        adminItems: [
          { href: '/dashboard/admin', label: 'Quản trị', icon: LayoutDashboard },
          { href: '/dashboard/admin/users', label: 'Người dùng', icon: Users },
        ],
      }
    : {
        appName: 'Customs Manager',
        appDescription: 'Import export operations',
        workspace: 'Workspace',
        admin: role === 'DIRECTOR' ? 'Company team' : 'Administration',
        settings: 'Settings',
        footer: '© 2026 Customs App',
        navItems: [
          { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
          { href: '/dashboard/customs', label: 'Declarations', icon: FileText },
          { href: '/dashboard/search', label: 'Search', icon: FileSearch },
          { href: '/dashboard/companies', label: 'Companies', icon: Building2 },
          { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
          { href: '/dashboard/import', label: 'Import from file', icon: Upload },
          { href: '/dashboard/convert', label: 'Convert file', icon: ArrowLeftRight },
          { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
        ],
        adminItems: [
          { href: '/dashboard/admin', label: 'Admin', icon: LayoutDashboard },
          { href: '/dashboard/admin/users', label: 'Users', icon: Users },
        ],
      };

  return (
    <aside className={cn(
      'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-[#17337b] via-[#22439b] to-[#162b63] text-white shadow-2xl transition-all duration-300 dark:from-[#081224] dark:via-[#0e1b38] dark:to-[#111827]',
      sidebarCollapsed ? 'w-20' : 'w-72',
    )}>
      <div className={cn('flex items-center border-b border-white/10', sidebarCollapsed ? 'justify-center px-3 py-5' : 'gap-3 px-5 py-5')}>
        <div className="rounded-2xl bg-white/15 p-3 shadow-lg backdrop-blur"><Ship className="h-6 w-6" /></div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="truncate font-bold text-sm">{copy.appName}</p>
            <p className="truncate text-blue-100/80 text-xs">{copy.appDescription}</p>
          </div>
        )}
      </div>

      <nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {!sidebarCollapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/70">{copy.workspace}</p>}
        {copy.navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={sidebarCollapsed ? label : undefined}
            className={cn(
              'mb-1 flex items-center rounded-2xl text-sm transition-all duration-200',
              sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-3',
              href === '/dashboard' ? pathname === href : pathname.startsWith(href)
                ? 'bg-white/18 text-white font-medium shadow-lg shadow-blue-950/20'
                : 'text-blue-100/85 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}

        {(role === 'ADMIN' || role === 'DIRECTOR') && (
          <>
            {!sidebarCollapsed && <p className="mb-2 mt-5 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/70">{copy.admin}</p>}
            {copy.adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={sidebarCollapsed ? label : undefined}
                className={cn(
                  'mb-1 flex items-center rounded-2xl text-sm transition-all duration-200',
                  sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-3',
                  pathname === href
                    ? 'bg-white/18 text-white font-medium shadow-lg shadow-blue-950/20'
                    : 'text-blue-100/85 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </>
        )}

        <div className="mt-4 border-t border-white/10 pt-4">
          <Link
            href="/dashboard/settings"
            title={sidebarCollapsed ? copy.settings : undefined}
            className={cn(
              'flex items-center rounded-2xl text-sm transition-all duration-200',
              sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-3',
              pathname === '/dashboard/settings'
                ? 'bg-white/18 text-white font-medium shadow-lg shadow-blue-950/20'
                : 'text-blue-100/85 hover:bg-white/10 hover:text-white',
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{copy.settings}</span>}
          </Link>
        </div>
      </nav>

      <div className={cn(
        'shrink-0 border-t border-white/10 bg-black/10 backdrop-blur-md',
        sidebarCollapsed ? 'px-2 py-4 text-center' : 'px-5 py-4'
      )}>
        {!sidebarCollapsed ? (
          <div className="space-y-1 text-xs text-blue-100/75">
            <p className="font-medium text-white/90">{copy.footer}</p>
            <p>Dashboard workspace</p>
          </div>
        ) : (
          <div className="text-[11px] font-semibold text-blue-100/70">2026</div>
        )}
      </div>
    </aside>
  );
}
