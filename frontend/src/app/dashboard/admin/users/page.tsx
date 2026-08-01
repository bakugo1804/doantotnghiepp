'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Search, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useDeleteUser, useUpdateUser, useUsersList } from '@/hooks/useUsers';
import { formatDate } from '@/lib/utils';
import type { Role, User } from '@/types';

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentRole = (session?.user as any)?.role as Role | undefined;
  const canDeleteUsers = currentRole === 'ADMIN' || currentRole === 'DIRECTOR';
  const canSetAdminRole = currentRole === 'ADMIN';
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', phone: '', newPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const { data: users = [], isLoading } = useUsersList();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const filteredUsers = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();

    return users.filter((user: User) => {
      const matchesSearch = !keyword
        || user.fullName.toLowerCase().includes(keyword)
        || user.email.toLowerCase().includes(keyword)
        || (user.phone || '').toLowerCase().includes(keyword);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' && user.isActive)
        || (statusFilter === 'LOCKED' && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, deferredSearch, roleFilter, statusFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user: User) => user.isActive).length,
    admins: users.filter((user: User) => user.role === 'ADMIN').length,
    directors: users.filter((user: User) => user.role === 'DIRECTOR').length,
    locked: users.filter((user: User) => !user.isActive).length,
  }), [users]);

  const handleRoleChange = (user: User, role: Role) => {
    updateUser.mutate({ id: user.id, data: { role } });
  };

  const handleToggleActive = (user: User) => {
    updateUser.mutate({ id: user.id, data: { isActive: !user.isActive } });
  };

  const handleDelete = (user: User) => {
    const confirmed = window.confirm(`Xóa tài khoản ${user.fullName}? Hành động này không hoàn tác.`);
    if (!confirmed) return;
    deleteUser.mutate(user.id);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({ fullName: user.fullName || '', email: user.email || '', phone: user.phone || '', newPassword: '' });
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
          phone: editForm.phone.trim() || undefined,
          ...(editForm.newPassword.trim() && { password: editForm.newPassword.trim() }),
        },
      },
      { onSuccess: () => setEditingUser(null) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng</h1>
        <p className="text-gray-500 text-sm mt-1">
          {currentRole === 'DIRECTOR'
            ? 'Duyệt tài khoản nhân viên, phân quyền trong công ty và khóa mở khóa tài khoản.'
            : 'Lọc, điều chỉnh vai trò, khóa mở khóa và dọn dẹp tài khoản không còn sử dụng.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tổng tài khoản', value: counts.total, tone: 'bg-slate-50 text-slate-700' },
          { label: 'Đang hoạt động', value: counts.active, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'Quản trị viên', value: counts.admins, tone: 'bg-violet-50 text-violet-700' },
          { label: 'Giám đốc', value: counts.directors, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Đang khóa', value: counts.locked, tone: 'bg-rose-50 text-rose-700' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.tone}`}>{item.label}</span>
            <p className="mt-4 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo họ tên, email, số điện thoại"
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as 'ALL' | Role)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">Tất cả vai trò</option>
            <option value="ADMIN">Giám đốc</option>
            <option value="DIRECTOR">Quản lý</option>
            <option value="STAFF">Nhân viên</option>
            <option value="VIEWER">Người xem</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'LOCKED')}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="LOCKED">Đang khóa</option>
          </select>
        </div>
      </div>

      {(updateUser.error || deleteUser.error) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Không thể cập nhật người dùng. Vui lòng thử lại.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b">
            {['Họ tên', 'Email', 'Vai trò', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">Không tìm thấy tài khoản phù hợp.</td></tr>
            ) : filteredUsers.map((u: User) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                <td className="px-4 py-3 font-medium">
                  <div>{u.fullName}</div>
                  <div className="mt-1 text-xs text-gray-400">{u.phone || 'Chưa cập nhật số điện thoại'}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(event) => handleRoleChange(u, event.target.value as Role)}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    disabled={updateUser.isPending || (currentRole === 'DIRECTOR' && u.role === 'ADMIN')}
                  >
                    {canSetAdminRole && <option value="ADMIN">Giám đốc</option>}
                    <option value="DIRECTOR">Quản lý</option>
                    <option value="STAFF">Nhân viên</option>
                    <option value="VIEWER">Người xem</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.isActive ? 'Hoạt động' : 'Bị khóa'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={updateUser.isPending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${u.isActive ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                    >
                      {u.isActive ? 'Khóa' : 'Mở khóa'}
                    </button>
                    {canDeleteUsers && u.id !== (session?.user as any)?.id && (
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={deleteUser.isPending}
                        className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-200"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Sửa thông tin tài khoản</h3>
              <button onClick={() => setEditingUser(null)} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Họ và tên</label>
                <input value={editForm.fullName} onChange={(e) => setEditForm((c) => ({ ...c, fullName: e.target.value }))} className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input value={editForm.email} onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))} className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Số điện thoại</label>
                <input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Mật khẩu mới
                  <span className="ml-1 text-xs font-normal text-gray-400">(để trống nếu không đổi)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm((c) => ({ ...c, newPassword: e.target.value }))}
                    placeholder="Nhập mật khẩu mới..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSaveEdit} disabled={updateUser.isPending || !editForm.fullName.trim() || !editForm.email.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
                Lưu thay đổi
              </button>
              <button onClick={() => setEditingUser(null)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
