'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AtSign, Check, Loader2, Ship, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,29}$/;

const schema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  username: z
    .string()
    .min(1, 'Vui lòng nhập tên đăng nhập')
    .regex(USERNAME_PATTERN, 'Bắt đầu bằng chữ cái, 3-30 ký tự, chỉ gồm chữ thường, số và . _ -'),
  // Giữ đúng bằng ngưỡng bên đăng nhập (backend/src/common/username.ts).
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  phone: z
    .string()
    .optional()
    .refine((value) => !value || /^0\d{9}$/.test(value.replace(/[\s.-]/g, '')), {
      message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
    }),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', username: '', password: '', phone: '' },
  });

  const email = watch('email');
  const username = watch('username');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string } | null>(null);

  // Gợi ý tên đăng nhập từ email cho tới khi người dùng tự gõ vào ô này.
  useEffect(() => {
    if (usernameTouched) return;
    const suggestion = (email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    setValue('username', USERNAME_PATTERN.test(suggestion) ? suggestion : '');
  }, [email, usernameTouched, setValue]);

  // Hỏi máy chủ xem tên đã có ai dùng chưa, chờ 400ms để không gọi mỗi lần gõ phím.
  useEffect(() => {
    if (!username || !USERNAME_PATTERN.test(username)) {
      setUsernameStatus(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/auth/check-username', { params: { username } });
        if (!cancelled) setUsernameStatus(response.data);
      } catch {
        if (!cancelled) setUsernameStatus(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  const onSubmit = async (data: FormData) => {
    setError('');
    setSuccessMessage('');
    try {
      await api.post('/auth/register', {
        fullName: data.fullName,
        email: data.email,
        username: data.username,
        password: data.password,
        phone: data.phone ? data.phone.replace(/[\s.-]/g, '') : undefined,
      });
      setSuccessMessage('Tạo tài khoản thành công! Đang chuyển tới trang đăng nhập...');
      setTimeout(() => router.push('/login?registered=1'), 1200);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Đăng ký thất bại');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#0f2f52_0%,#0a1f34_45%,#081524_100%)] px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-3xl border border-cyan-100/20 bg-cyan-950/40 p-8 text-cyan-50 backdrop-blur-md">
          <div className="mb-10 flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-400/20 p-3"><Ship className="h-7 w-7" /></div>
            <div>
              <h1 className="text-2xl font-bold">Customs Workspace</h1>
              <p className="text-sm text-cyan-100/80">Hệ thống quản lý tờ khai hải quan của doanh nghiệp</p>
            </div>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-cyan-100/90">
            <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/40 p-4">
              <p className="font-semibold text-white">Đăng ký nhân viên</p>
              <p className="mt-2">Tài khoản mới được tạo với quyền Nhân viên. Giám đốc có thể nâng quyền cho bạn trong phần Quản trị.</p>
            </div>
            <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/40 p-4">
              <p className="font-semibold text-white">Phân quyền rõ ràng</p>
              <p className="mt-2">Giám đốc toàn quyền quản lý; Nhân viên tạo & xử lý tờ khai; Người xem chỉ theo dõi.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Tạo tài khoản</h2>
            <p className="mt-1 text-sm text-slate-500">Điền thông tin để tạo tài khoản nhân viên.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Họ và tên</label>
              <input {...register('fullName')} type="text" placeholder="Nguyễn Văn A"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input {...register('email')} type="email" placeholder="email@company.vn"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Số điện thoại</label>
                <input {...register('phone')} type="tel" placeholder="0901234567"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                {errors.phone && <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tên đăng nhập</label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('username')}
                  onInput={() => setUsernameTouched(true)}
                  type="text"
                  autoComplete="username"
                  placeholder="nguyenvana"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {usernameStatus && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus.available ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 text-rose-600" />
                    )}
                  </span>
                )}
              </div>
              {errors.username ? (
                <p className="mt-1 text-xs text-rose-600">{errors.username.message}</p>
              ) : usernameStatus && !usernameStatus.available ? (
                <p className="mt-1 text-xs text-rose-600">{usernameStatus.reason}</p>
              ) : usernameStatus?.available ? (
                <p className="mt-1 text-xs text-emerald-600">Tên đăng nhập có thể sử dụng</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Dùng để đăng nhập thay cho email, ví dụ: nguyenvana</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Mật khẩu</label>
              <input {...register('password')} type="password" placeholder="Tối thiểu 6 ký tự"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            {successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div>}

            <button type="submit" disabled={isSubmitting}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Đang xử lý...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" />Tạo tài khoản</span>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Đã có tài khoản? <a href="/login" className="font-semibold text-blue-600 hover:underline">Đăng nhập</a>
          </p>
        </section>
      </div>
    </div>
  );
}
