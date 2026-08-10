'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { Languages, MoonStar, Save, SunMedium, Upload, UserRound } from 'lucide-react';
import { useAppPreferences } from '@/components/settings/AppPreferencesProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { usersApi } from '@/lib/api';
import { useLocale } from '@/components/settings/LocaleProvider';
import type { User } from '@/types';

/** Cạnh dài tối đa của ảnh đại diện sau khi thu nhỏ (px). */
const AVATAR_MAX_SIZE = 256;

/**
 * Thu nhỏ ảnh về khung vuông trước khi gửi lên máy chủ.
 *
 * Ảnh chụp từ điện thoại thường vài MB; mã hoá base64 rồi nhét thẳng vào JSON
 * thì vượt giới hạn kích thước request và toàn bộ thao tác lưu hồ sơ thất bại,
 * dù người dùng chỉ đổi mỗi cái ảnh.
 */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Tệp không phải là ảnh hợp lệ'));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_MAX_SIZE;
        canvas.height = AVATAR_MAX_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh'));
        // Cắt phần giữa thành hình vuông để ảnh không bị bóp méo.
        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_MAX_SIZE, AVATAR_MAX_SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useAppPreferences();
  const { data: session, update } = useSession();
  const queryClient = useQueryClient();
  const isVietnamese = locale === 'vi';
  const [accountForm, setAccountForm] = useState({ fullName: '', email: '', username: '', phone: '', password: '', avatarUrl: '' });
  const [avatarError, setAvatarError] = useState('');

  const { data: profile } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => usersApi.getMe().then((response) => response.data),
  });

  useEffect(() => {
    if (!profile) return;
    setAccountForm({
      fullName: profile.fullName || '',
      email: profile.email || '',
      username: (profile as any).username || '',
      phone: profile.phone || '',
      password: '',
      avatarUrl: profile.avatarUrl || '',
    });
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: () => usersApi.updateMe({
      fullName: accountForm.fullName.trim(),
      email: accountForm.email.trim(),
      username: accountForm.username.trim().toLowerCase(),
      phone: accountForm.phone.trim() || undefined,
      password: accountForm.password.trim() || undefined,
      avatarUrl: accountForm.avatarUrl || null,
    }).then((response) => response.data),
    onSuccess: async (user: User) => {
      setAccountForm((current) => ({ ...current, password: '' }));
      // Ảnh đại diện được đọc từ hồ sơ (query 'me'), không đi qua phiên đăng nhập.
      queryClient.setQueryData(['me'], user);
      await update({
        ...session,
        user: {
          ...(session?.user || {}),
          name: user.fullName,
          email: user.email,
          fullName: user.fullName,
          username: (user as any).username,
        },
      });
    },
  });

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    try {
      const dataUrl = await shrinkImage(file);
      setAccountForm((current) => ({ ...current, avatarUrl: dataUrl }));
    } catch (error: any) {
      setAvatarError(error?.message || (isVietnamese ? 'Không xử lý được ảnh này.' : 'Unable to process this image.'));
    } finally {
      // Cho phép chọn lại đúng tệp vừa rồi sau khi sửa lỗi.
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isVietnamese ? 'Cài đặt' : 'Settings'}</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Languages className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Ngôn ngữ hệ thống' : 'System language'}</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              {
                code: 'vi' as const,
                title: 'Tiếng Việt',
                description: 'Phù hợp với tác vụ nội bộ và biểu mẫu nghiệp vụ trong nước.',
              },
              {
                code: 'en' as const,
                title: 'English',
                description: 'Helpful when sharing flows with external or multinational teams.',
              },
            ].map((option) => {
              const active = locale === option.code;

              return (
                <button
                  key={option.code}
                  onClick={() => setLocale(option.code)}
                  className={`rounded-2xl border p-5 text-left transition ${active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{option.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {active ? (isVietnamese ? 'Đang dùng' : 'Active') : option.code.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">{theme === 'dark' ? <MoonStar className="h-5 w-5" /> : <SunMedium className="h-5 w-5" />}</div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Giao diện sáng / tối' : 'Light / dark theme'}</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              {
                code: 'light' as const,
                title: isVietnamese ? 'Chế độ sáng' : 'Light mode',
                description: isVietnamese ? 'Giao diện rõ ràng, phù hợp làm việc ban ngày.' : 'A crisp interface optimized for daytime work.',
                icon: SunMedium,
              },
              {
                code: 'dark' as const,
                title: isVietnamese ? 'Chế độ tối' : 'Dark mode',
                description: isVietnamese ? 'Giảm chói mắt, phù hợp khi làm việc thời gian dài.' : 'Reduces glare and fits longer work sessions.',
                icon: MoonStar,
              },
            ].map((option) => {
              const active = theme === option.code;
              const Icon = option.icon;

              return (
                <button
                  key={option.code}
                  onClick={() => setTheme(option.code)}
                  className={`rounded-2xl border p-5 text-left transition ${active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white/80 p-2 text-slate-700 shadow-sm dark:bg-slate-900/60 dark:text-slate-200"><Icon className="h-4 w-4" /></div>
                      <p className="font-semibold text-gray-900">{option.title}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {active ? (isVietnamese ? 'Đang dùng' : 'Active') : option.code}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </section>
        </div>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><UserRound className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Tài khoản của bạn' : 'Your account'}</h2>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {accountForm.avatarUrl ? (
                  <img src={accountForm.avatarUrl} alt="avatar" className="h-20 w-20 rounded-2xl border border-gray-200 object-cover shadow-sm" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <UserRound className="h-8 w-8" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-blue-300 hover:text-blue-700">
                  <Upload className="h-4 w-4" />
                  {isVietnamese ? 'Thay ảnh đại diện' : 'Change avatar'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input value={accountForm.fullName} onChange={(event) => setAccountForm((current) => ({ ...current, fullName: event.target.value }))} placeholder={isVietnamese ? 'Họ và tên' : 'Full name'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <input value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <input value={accountForm.username} onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))} placeholder={isVietnamese ? 'Tên đăng nhập' : 'Username'} autoComplete="username" className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <input value={accountForm.phone} onChange={(event) => setAccountForm((current) => ({ ...current, phone: event.target.value }))} placeholder={isVietnamese ? 'Số điện thoại' : 'Phone number'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <input type="password" value={accountForm.password} onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))} placeholder={isVietnamese ? 'Mật khẩu mới (để trống nếu không đổi)' : 'New password (leave blank to keep current)'} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <div>
                  <p className="text-gray-500">{isVietnamese ? 'Vai trò hiện tại' : 'Current role'}</p>
                  <p className="font-medium text-gray-900">{(session?.user as any)?.role || '-'}</p>
                </div>
                <button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending || !accountForm.fullName.trim() || !accountForm.email.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
                  <Save className="h-4 w-4" />
                  {isVietnamese ? 'Lưu thay đổi' : 'Save changes'}
                </button>
              </div>

              {avatarError && <p className="text-sm text-rose-600">{avatarError}</p>}
              {updateProfile.isError && (
                // Hiển thị đúng thông báo của máy chủ: đoán mò "email đã tồn tại"
                // khiến người dùng đi sửa email trong khi lỗi thật nằm chỗ khác.
                <p className="text-sm text-rose-600">
                  {(() => {
                    const detail = (updateProfile.error as any)?.response?.data?.message;
                    const message = Array.isArray(detail) ? detail[0] : detail;
                    return message || (isVietnamese ? 'Không thể cập nhật tài khoản.' : 'Unable to update account.');
                  })()}
                </p>
              )}
              {updateProfile.isSuccess && (
                <p className="text-sm text-emerald-600">{isVietnamese ? 'Tài khoản đã được cập nhật.' : 'Your account has been updated.'}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}