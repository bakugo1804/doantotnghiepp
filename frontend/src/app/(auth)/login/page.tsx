'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  Ship,
  ArrowRight,
  FileText,
  Bot,
  Calculator,
  BarChart3,
  Users,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});
type FormData = z.infer<typeof schema>;

const FEATURES = [
  { icon: FileText, title: 'Quản lý tờ khai xuất nhập khẩu', desc: 'Tạo, theo dõi và xử lý hồ sơ hải quan tập trung một nơi.' },
  { icon: Bot, title: 'AI đọc file Excel tự động', desc: 'Tải lên file Excel, hệ thống tự trích xuất dữ liệu tờ khai.' },
  { icon: Calculator, title: 'Tự động tính thuế VAT & phí', desc: 'Tính toán thuế, phí vận chuyển theo quốc gia và khoảng cách.' },
  { icon: BarChart3, title: 'Báo cáo & xuất Excel', desc: 'Thống kê trực quan, xuất báo cáo tờ khai ra file Excel.' },
  { icon: Users, title: 'Phân quyền theo công ty', desc: 'Giám đốc quản lý nhân viên, nhân viên xử lý nghiệp vụ.' },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    const result = await signIn('credentials', { ...data, redirect: false });
    if (result?.error) setError('Email hoặc mật khẩu không đúng');
    else router.push('/dashboard/customs');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-2xl shadow-lg shadow-blue-500/30">
              <Ship className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Hải Quan Manager</h1>
              <p className="text-slate-400 text-sm">Hệ thống quản lý xuất nhập khẩu</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Giải pháp quản lý hải quan <span className="text-cyan-400">toàn diện</span>
          </h2>
          <p className="text-slate-300 text-base mb-10 max-w-md">
            Số hóa toàn bộ quy trình khai báo hải quan — từ nhập liệu thông minh bằng AI,
            tự động tính thuế, đến báo cáo và phân quyền theo từng doanh nghiệp.
          </p>

          <div className="space-y-3 max-w-md">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition hover:border-cyan-400/30 hover:bg-white/10">
                  <div className="rounded-xl bg-cyan-400/15 p-2 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{f.title}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-slate-400 text-sm">
          <ShieldCheck className="h-4 w-4" />
          © 2026 Customs Management
        </div>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Logo cho mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-2.5 rounded-xl">
              <Ship className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Hải Quan Manager</h1>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Đăng nhập</h1>
            <p className="text-gray-600">Chào mừng trở lại! Vui lòng đăng nhập để tiếp tục.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="Nhập email của bạn"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition"
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mật khẩu</label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition"
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <p className="text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-gray-600 text-center">
              Chưa có tài khoản?{' '}
              <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
                Đăng ký ngay
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
