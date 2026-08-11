'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { CalendarDays, ListTodo, Plus, Trash2, Filter } from 'lucide-react';
import { usersApi } from '@/lib/api';
import { useLocale } from '@/components/settings/LocaleProvider';
import { useCreateTask, useDeleteTask, useTasksList, useUpdateTask } from '@/hooks/useTasks';
import { formatDateTime, roleLabel } from '@/lib/utils';
import type { Task, TaskStatus, User } from '@/types';

const todayValue = new Date().toISOString().slice(0, 10);

/** Khoảng thời gian của danh sách nhiệm vụ. */
type TaskRange = 'TODAY' | 'PICKED' | 'ALL';

export default function TasksPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canAssignTasks = role === 'ADMIN' || role === 'DIRECTOR';
  const { locale } = useLocale();
  const isVietnamese = locale === 'vi';

  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [assignedToId, setAssignedToId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Bộ lọc danh sách (dành cho Giám đốc/Quản lý)
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  /**
   * Khoảng thời gian của danh sách nhiệm vụ.
   *
   * Trước đây chỗ này là một ô tích ghi "Chỉ ngày 2026-08-10" - ngày đó chỉ là giá
   * trị đang có trong ô chọn ngày phía trên (ô vốn dùng để đặt ngày cho nhiệm vụ
   * mới), nên nhãn hiện ra một ngày ngẫu nhiên không nói lên điều gì. Ba lựa chọn
   * dưới đây nói thẳng ra khoảng thời gian đang xem.
   */
  const [range, setRange] = useState<TaskRange>('ALL');

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['task-users'],
    queryFn: () => usersApi.getAll().then((response) => response.data),
    enabled: canAssignTasks,
  });

  const rangeDate = range === 'TODAY' ? todayValue : range === 'PICKED' ? selectedDate : undefined;

  const { data: tasks = [], isLoading } = useTasksList({
    date: rangeDate,
    assignedToId: canAssignTasks && filterAssignee ? filterAssignee : undefined,
    status: filterStatus || undefined,
  });

  const selectedAssigneeName = users.find((u) => u.id === filterAssignee)?.fullName;

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const summary = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((task: Task) => task.status === 'TODO').length,
    progress: tasks.filter((task: Task) => task.status === 'IN_PROGRESS').length,
    done: tasks.filter((task: Task) => task.status === 'DONE').length,
  }), [tasks]);

  const handleCreateTask = () => {
    if (!title.trim() || !selectedDate || (!assignedToId && canAssignTasks)) return;

    createTask.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      workDate: new Date(`${selectedDate}T08:00:00`).toISOString(),
      assignedToId: canAssignTasks ? assignedToId : (session?.user as any)?.id,
    }, {
      onSuccess: () => {
        setTitle('');
        setDescription('');
      },
    });
  };

  const handleStatusChange = (task: Task, status: TaskStatus) => {
    updateTask.mutate({ id: task.id, data: { status } });
  };

  const handleDeleteTask = (task: Task) => {
    if (!window.confirm(isVietnamese ? `Xóa nhiệm vụ "${task.title}"?` : `Delete task "${task.title}"?`)) return;
    deleteTask.mutate(task.id);
  };

  const statusLabel = (status: TaskStatus) => {
    if (isVietnamese) {
      return status === 'TODO' ? 'Chưa bắt đầu' : status === 'IN_PROGRESS' ? 'Đang làm' : 'Hoàn thành';
    }
    return status === 'TODO' ? 'Todo' : status === 'IN_PROGRESS' ? 'In progress' : 'Done';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isVietnamese ? 'Giao việc trong ngày' : 'Daily task board'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isVietnamese
            ? 'Theo dõi hôm nay mỗi nhân viên cần xử lý nhiệm vụ gì và cập nhật trạng thái ngay trên bảng này.'
            : 'Track what each staff member needs to handle today and update progress directly on this board.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: isVietnamese ? 'Tổng nhiệm vụ' : 'Total tasks', value: summary.total },
          { label: isVietnamese ? 'Chưa bắt đầu' : 'Todo', value: summary.todo },
          { label: isVietnamese ? 'Đang làm' : 'In progress', value: summary.progress },
          { label: isVietnamese ? 'Hoàn thành' : 'Done', value: summary.done },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Bộ lọc & tạo nhiệm vụ' : 'Filters & task creation'}</h2>
            </div>
          </div>

          <div className="space-y-4">
            {/* Ô này quyết định ngày làm việc của nhiệm vụ sắp tạo. Không ghi rõ thì
                người dùng tưởng nó là bộ lọc danh sách. */}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {isVietnamese ? 'Ngày làm việc của nhiệm vụ' : 'Work date for the new task'}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {canAssignTasks && (
              <select
                value={assignedToId}
                onChange={(event) => setAssignedToId(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{isVietnamese ? 'Chọn nhân viên để tạo task' : 'Select assignee for new task'}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.fullName} • {user.role}</option>
                ))}
              </select>
            )}

            {canAssignTasks && (
              <>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={isVietnamese ? 'Tên nhiệm vụ' : 'Task title'}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={isVietnamese ? 'Mô tả chi tiết cần làm' : 'Detailed task description'}
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  onClick={handleCreateTask}
                  disabled={createTask.isPending || !title.trim() || !assignedToId}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {isVietnamese ? 'Giao nhiệm vụ' : 'Assign task'}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><ListTodo className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isVietnamese ? 'Danh sách nhiệm vụ' : 'Task list'}</h2>
              <p className="text-sm text-gray-500">
                {selectedAssigneeName
                  ? (isVietnamese ? `Nhiệm vụ của: ${selectedAssigneeName}` : `Tasks of: ${selectedAssigneeName}`)
                  : (isVietnamese ? 'Lọc theo nhân viên và trạng thái.' : 'Filter by assignee and status.')}
              </p>
            </div>
          </div>

          {canAssignTasks && (
            <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Filter className="h-3.5 w-3.5" /> {isVietnamese ? 'Bộ lọc' : 'Filters'}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="">{isVietnamese ? 'Tất cả nhân viên' : 'All assignees'}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName} • {roleLabel(u.role)}</option>
                  ))}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="">{isVietnamese ? 'Mọi trạng thái' : 'Any status'}</option>
                  <option value="TODO">{statusLabel('TODO')}</option>
                  <option value="IN_PROGRESS">{statusLabel('IN_PROGRESS')}</option>
                  <option value="DONE">{statusLabel('DONE')}</option>
                </select>
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value as TaskRange)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">{isVietnamese ? 'Tất cả các ngày' : 'All dates'}</option>
                  <option value="TODAY">{isVietnamese ? 'Chỉ hôm nay' : 'Today only'}</option>
                  <option value="PICKED">
                    {isVietnamese ? `Theo ngày đã chọn (${selectedDate})` : `Selected date (${selectedDate})`}
                  </option>
                </select>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-gray-500">{isVietnamese ? 'Đang tải nhiệm vụ...' : 'Loading tasks...'}</p>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              {range === 'ALL'
                ? isVietnamese
                  ? 'Chưa có nhiệm vụ nào khớp với bộ lọc hiện tại.'
                  : 'No tasks match the current filters.'
                : isVietnamese
                  ? `Chưa có nhiệm vụ nào cho ngày ${rangeDate}.`
                  : `No tasks scheduled for ${rangeDate}.`}
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task: Task) => (
                <div key={task.id} className="rounded-2xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {task.assignedTo?.fullName}{task.assignedTo?.role ? ` • ${roleLabel(task.assignedTo.role)}` : ''}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{task.description || (isVietnamese ? 'Không có mô tả chi tiết.' : 'No detailed description provided.')}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatDateTime(task.workDate)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={task.status}
                        onChange={(event) => handleStatusChange(task, event.target.value as TaskStatus)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="TODO">{statusLabel('TODO')}</option>
                        <option value="IN_PROGRESS">{statusLabel('IN_PROGRESS')}</option>
                        <option value="DONE">{statusLabel('DONE')}</option>
                      </select>

                      {canAssignTasks && (
                        <button
                          onClick={() => handleDeleteTask(task)}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                          {isVietnamese ? 'Xóa' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}