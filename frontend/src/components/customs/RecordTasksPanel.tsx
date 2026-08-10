'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ClipboardList, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { tasksApi, usersApi } from '@/lib/api';
import { formatDate, roleLabel } from '@/lib/utils';

type RecordTasksPanelProps = {
  recordId: string;
  recordNo: string;
};

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  TODO: { label: 'Chưa làm', color: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'Đang làm', color: 'bg-amber-100 text-amber-800' },
  DONE: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700' },
};

/**
 * Công việc gắn với một tờ khai cụ thể.
 *
 * Trước đây hai phần này tách rời: xem hồ sơ không biết ai đang phụ trách, muốn
 * giao việc phải nhớ số tờ khai rồi sang trang khác gõ lại vào phần mô tả.
 */
export function RecordTasksPanel({ recordId, recordNo }: RecordTasksPanelProps) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canAssign = role === 'ADMIN' || role === 'DIRECTOR';

  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: `Xử lý tờ khai ${recordNo}`,
    description: '',
    assignedToId: '',
    workDate: new Date().toISOString().slice(0, 10),
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'by-record', recordId],
    queryFn: () => tasksApi.getAll({ customsRecordId: recordId }).then((r) => r.data),
    enabled: !!recordId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll().then((r) => r.data),
    enabled: canAssign,
  });

  // Người xem không xử lý hồ sơ nên không nằm trong danh sách giao việc.
  const assignableUsers = (users as any[]).filter((user) => user.isActive && user.role !== 'VIEWER');

  const createTask = useMutation({
    mutationFn: (payload: any) => tasksApi.create(payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowForm(false);
      setForm((current) => ({ ...current, description: '', assignedToId: '' }));
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Không giao được việc'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => tasksApi.update(id, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const handleSubmit = () => {
    setError('');
    if (!form.title.trim() || !form.assignedToId) {
      setError('Vui lòng nhập tiêu đề và chọn người thực hiện');
      return;
    }
    createTask.mutate({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assignedToId: form.assignedToId,
      workDate: form.workDate,
      customsRecordId: recordId,
    });
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800">Nhân sự phụ trách</h2>
          {tasks.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tasks.length}</span>
          )}
        </div>
        {canAssign && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" /> Giao việc cho nhân viên
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-800">Giao việc cho tờ khai {recordNo}</p>
            <button onClick={() => setShowForm(false)} className="rounded p-1 text-slate-500 hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nội dung công việc</label>
            <input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} className={input} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Giao cho</label>
              <select value={form.assignedToId} onChange={(e) => setForm((c) => ({ ...c, assignedToId: e.target.value }))} className={input}>
                <option value="">-- Chọn nhân viên --</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} — {roleLabel(user.role)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Hạn xử lý</label>
              <input type="date" value={form.workDate} onChange={(e) => setForm((c) => ({ ...c, workDate: e.target.value }))} className={input} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ghi chú (không bắt buộc)</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} className={`${input} resize-y`} />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={createTask.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Giao việc
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="py-4 text-center text-sm text-slate-400">Đang tải...</p>
      ) : tasks.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Chưa có ai được giao xử lý tờ khai này.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task: any) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{task.assignedTo?.fullName}</span>
                  <span className="text-xs text-slate-500">{roleLabel(task.assignedTo?.role)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS[task.status]?.color ?? ''}`}>
                    {TASK_STATUS[task.status]?.label ?? task.status}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-600">{task.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Hạn {formatDate(task.workDate)} · giao bởi {task.assignedBy?.fullName}
                </p>
              </div>

              {task.status !== 'DONE' && (
                <button
                  onClick={() => updateStatus.mutate({ id: task.id, status: 'DONE' })}
                  disabled={updateStatus.isPending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu xong
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard/tasks" className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline">
        Xem toàn bộ công việc →
      </Link>
    </div>
  );
}
