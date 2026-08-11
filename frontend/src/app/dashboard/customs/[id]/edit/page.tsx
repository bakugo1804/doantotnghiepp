'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CustomsForm } from '@/components/customs/CustomsForm';

export default function EditCustomsPage() {
  const { id } = useParams();
  const recordId = String(id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/dashboard/customs/${recordId}`}
          className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100"
          title="Về chi tiết tờ khai"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sửa tờ khai</h1>
          <p className="mt-1 text-sm text-gray-500">
            Thay đổi được lưu lại trong nhật ký xử lý của tờ khai, kèm tên người sửa.
          </p>
        </div>
      </div>
      <CustomsForm recordId={recordId} />
    </div>
  );
}
