'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Search, ShieldCheck, UserX, Users as UsersIcon, X, Zap } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useDeleteUser, useUpdateUser, useUsersList } from '@/hooks/useUsers';
import {
  formatDate,
  formatRelativeTime,
  isRecentlyOnline,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  roleLabel,
} from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Role, User } from '@/types';

/** Số ngày coi là "còn hoạt động gần đây" trên ô thống kê. */
const ACTIVE_WINDOW_DAYS = 7;

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const currentRole = (session?.user as any)?.role as Role | undefined;
  const canDeleteUsers = currentRole === 'ADMIN' || currentRole === 'DIRECTOR';
  const canSetAdminRole = currentRole === 'ADMIN';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', username: '', phone: '', newPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const { data: users = [], isLoading } = useUsersList();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const filteredUsers = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();

    return users.filter((user: User) => {
      const matchesSearch =
        !keyword ||
        user.fullName.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword) ||
        ((user as any).username || '').toLowerCase().includes(keyword) ||
        (user.phone || '').toLowerCase().includes(keyword);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && user.isActive) ||
        (statusFilter === 'LOCKED' && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, deferredSearch, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const threshold = Date.now() - ACTIVE_WINDOW_DAYS * 86400000;
    return {
      total: users.length,
      unlocked: users.filter((user: User) => user.isActive).length,
      // Đây mới là con số phản ánh ai thực sự dùng hệ thống. Ô "đang hoạt động"
      // trước kia chỉ đếm tài khoản chưa bị khoá, nên lúc nào cũng gần bằng tổng.
      recentlyActive: users.filter((user: User) => {
        const last = (user as any).lastLoginAt;
        return last && new Date(last).getTime() >= threshold;
      }).length,
      locked: users.filter((user: User) => !user.isActive).length,
    };
  }, [users]);

  const serverError = (updateUser.error || deleteUser.error) as any;
  const errorMessage =
    serverError?.response?.data?.message ||
    (serverError ? 'Không thể cập nhật người dùng. Vui lòng thử lại.' : null);

  const handleRoleChange = (user: User, role: Role) => {
    updateUser.mutate({ id: user.id, data: { role } });
  };

  const handleToggleActive = (user: User) => {
    updateUser.mutate({ id: user.id, data: { isActive: !user.isActive } });
  };

  const handleDelete = (user: User) => {
    const confirmed = window.confirm(`Xoá tài khoản ${user.fullName}? Hành động này không hoàn tác.`);
    if (!confirmed) return;
    deleteUser.mutate(user.id);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      username: (user as any).username || '',
      phone: user.phone || '',
      newPassword: '',
    });
    setShowPassword(false);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    updateUser.mutate(
      {
        id: editingUser.id,
        data: {
          fullName: editForm.fullName.trim(),
          email: editForm.email.trim(),
          username: editForm.username.trim().toLowerCase(),
          phone: editForm.phone.trim() || undefined,
          ...(editForm.newPassword.trim() && { password: editForm.newPassword.trim() }),
        },
      },
      { onSuccess: () => setEditingUser(null) },
    );
  };

  const statCards = [
    { label: 'Tổng tài khoản', value: counts.total, icon: UsersIcon, tone: 'bg-slate-50 text-slate-600' },
    { label: `Đăng nhập ${ACTIVE_WINDOW_DAYS} ngày qua`, value: counts.recentlyActive, icon: Zap, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Được phép đăng nhập', value: counts.unlocked, icon: ShieldCheck, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Đang khoá', value: counts.locked, icon: UserX, tone: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý người dùng</h1>
        <p className="mt-1 text-sm text-slate-500">
          {currentRole === 'DIRECTOR'
            ? 'Duyệt tài khoản nhân viên, phân quyền trong phòng ban và khoá/mở khoá tài khoản.'
            : 'Lọc, điều chỉnh vai trò, khoá/mở khoá và dọn dẹp tài khoản không còn sử dụng.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-slate-500">{label}</span>
              <span className={`rounded-lg p-2 ${tone}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo họ tên, tên đăng nhập, email, số điện thoại"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as 'ALL' | Role)}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">Tất cả vai trò</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'LOCKED')}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Được phép đăng nhập</option>
            <option value="LOCKED">Đang khoá</option>
          </select>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Người dùng', 'Tên đăng nhập', 'Vai trò', 'Trạng thái', 'Hoạt động gần nhất', 'Ngày tạo', 'Thao tác'].map((head) => (
                  <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    Không tìm thấy tài khoản phù hợp.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: User) => {
                  const lastLoginAt = (user as any).lastLoginAt as string | null;
                  const online = isRecentlyOnline(lastLoginAt);
                  const isSelf = user.id === currentUserId;

                  return (
                    <tr key={user.id} className="border-b border-slate-100 align-top transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          {user.fullName}
                          {isSelf && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              Bạn
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{user.email}</div>
                        <div className="text-xs text-slate-400">{user.phone || 'Chưa có số điện thoại'}</div>
                      </td>

                      <td className="px-4 py-3">
                        <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {(user as any).username || '—'}
                        </code>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(event) => handleRoleChange(user, event.target.value as Role)}
                          title={ROLE_DESCRIPTIONS[user.role]}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                          disabled={updateUser.isPending || (currentRole === 'DIRECTOR' && user.role === 'ADMIN')}
                        >
                          {ROLE_ORDER.filter((role) => role !== 'ADMIN' || canSetAdminRole).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {user.isActive ? 'Mở khoá' : 'Đã khoá'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {lastLoginAt ? (
                          <span className="flex items-center gap-1.5 text-xs text-slate-600">
                            {online && (
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                                title="Vừa truy cập"
                              />
                            )}
                            {formatRelativeTime(lastLoginAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Chưa từng đăng nhập</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.createdAt)}</td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </button>
                          {/* Tự khoá mình sẽ khiến chính người đang thao tác mất quyền truy cập */}
                          {!isSelf && (
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={updateUser.isPending}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                user.isActive
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              }`}
                            >
                              {user.isActive ? 'Khoá' : 'Mở khoá'}
                            </button>
                          )}
                          {canDeleteUsers && !isSelf && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={deleteUser.isPending}
                              className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-200"
                            >
                              Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Sửa thông tin tài khoản</h3>
                <p className="text-xs text-slate-500">{roleLabel(editingUser.role)}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Họ và tên</label>
                <input
                  value={editForm.fullName}
                  onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tên đăng nhập</label>
                <input
                  value={editForm.username}
                  onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="nguyenvana"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-xs text-slate-400">Người dùng có thể đăng nhập bằng tên này hoặc bằng email.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  value={editForm.email}
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Số điện thoại</label>
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Mật khẩu mới
                  <span className="ml-1 text-xs font-normal text-slate-400">(để trống nếu không đổi)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editForm.newPassword}
                    onChange={(event) => setEditForm((current) => ({ ...current, newPassword: event.target.value }))}
                    placeholder="Nhập mật khẩu mới..."
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveEdit}
                disabled={updateUser.isPending || !editForm.fullName.trim() || !editForm.email.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                Lưu thay đổi
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
