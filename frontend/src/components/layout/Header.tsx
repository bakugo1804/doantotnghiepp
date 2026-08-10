'use client';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Languages, LogOut, MoonStar, PanelLeft, SunMedium, User } from 'lucide-react';
import { useAppPreferences } from '@/components/settings/AppPreferencesProvider';
import { useLocale } from '@/components/settings/LocaleProvider';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { usersApi } from '@/lib/api';
import type { User as UserProfile } from '@/types';

export function Header({ user }: { user: any }) {
  const { locale, toggleLocale } = useLocale();
  const { theme, toggleTheme, toggleSidebar } = useAppPreferences();

  // Ảnh đại diện không nằm trong phiên đăng nhập (xem lý do ở route NextAuth),
  // nên lấy từ hồ sơ người dùng. Dùng chung queryKey với trang Cài đặt để đổi
  // ảnh xong là header cập nhật ngay.
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => usersApi.getMe().then((response) => response.data),
  });
  const avatar = profile?.avatarUrl || user?.image || user?.avatarUrl;
  const text = locale === 'vi'
    ? {
        greeting: 'Xin chào,',
        fallbackUser: 'Người dùng',
        signOut: 'Đăng xuất',
        language: 'Ngôn ngữ',
        theme: 'Giao diện',
        menu: 'Thu gọn menu',
      }
    : {
        greeting: 'Hello,',
        fallbackUser: 'User',
        signOut: 'Sign out',
        language: 'Language',
        theme: 'Theme',
        menu: 'Toggle menu',
      };

  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 md:px-6">
      <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-300"
          title={text.menu}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div>
        <p className="text-sm text-gray-500">{text.greeting}</p>
        <p className="font-semibold text-gray-900 dark:text-slate-100">{user?.name || user?.fullName || text.fallbackUser}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-300"
          title={text.theme}
        >
          {theme === 'dark' ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
          <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>

        <button
          onClick={toggleLocale}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-300"
          title={text.language}
        >
          <Languages className="h-4 w-4" />
          {locale.toUpperCase()}
        </button>

        <NotificationBell />

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-800">
          {avatar ? (
            <img
              src={avatar}
              alt={user?.name || user?.fullName || text.fallbackUser}
              className="h-9 w-9 rounded-full border border-white/40 object-cover shadow-sm"
            />
          ) : (
            <div className="rounded-full bg-blue-100 p-2 dark:bg-sky-500/15">
              <User className="h-4 w-4 text-blue-600" />
            </div>
          )}
          <div className="hidden text-sm sm:block">
            <p className="font-medium text-gray-900 dark:text-slate-100">{user?.name || user?.fullName || text.fallbackUser}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{(user as any)?.role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="ml-2 rounded-xl p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            title={text.signOut}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      </div>
    </header>
  );
}
