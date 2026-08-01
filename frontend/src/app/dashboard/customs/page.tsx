import { CustomsTable } from '@/components/customs/CustomsTable';

export default function CustomsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tờ khai hải quan</h1>
          <p className="text-gray-500 text-sm mt-1">Quản lý danh sách tờ khai xuất nhập khẩu</p>
        </div>
        <a
          href="/dashboard/customs/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          + Tạo tờ khai mới
        </a>
      </div>
      <CustomsTable />
    </div>
  );
}
