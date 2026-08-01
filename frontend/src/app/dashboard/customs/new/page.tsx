import { CustomsForm } from '@/components/customs/CustomsForm';

export default function NewCustomsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tạo tờ khai mới</h1>
        <p className="text-gray-500 text-sm mt-1">Điền thông tin tờ khai hải quan xuất nhập khẩu</p>
      </div>
      <CustomsForm />
    </div>
  );
}
