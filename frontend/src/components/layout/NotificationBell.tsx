'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Mail } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

type Notification = {
  id: string;
  subject: string;
  content: string;
  source: string;
  link?: string | null;
  isRead: boolean;
  receivedAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list().then((r) => r.data),
    refetchInterval: 30000, // tự làm mới mỗi 30s
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead().then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Mở bảng ra là coi như đã xem: trước đây phải bấm dấu tick trên từng dòng mới
  // tắt được chấm đỏ, nên đọc hết rồi mà con số vẫn còn nguyên.
  useEffect(() => {
    if (!open || unreadCount === 0 || markAllRead.isPending) return;
    // Chờ một nhịp để người dùng kịp thấy dòng nào đang là mới (nền xanh nhạt).
    const timer = setTimeout(() => markAllRead.mutate(), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unreadCount]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = (notification: Notification) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        title="Thông báo"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
            <p className="font-semibold text-gray-900 dark:text-slate-100">Thông báo</p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                <Mail className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                Chưa có thông báo nào.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                    n.isRead ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/60 dark:bg-sky-500/5'
                  }`}
                >
                  <div className={`mt-0.5 rounded-lg p-2 ${n.isRead ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{n.subject}</p>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400">{n.content}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{formatRelativeTime(n.receivedAt)}</p>
                  </div>
                  {!n.isRead && <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
