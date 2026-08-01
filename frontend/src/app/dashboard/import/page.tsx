import { ImportExcel } from '@/components/excel/ImportExcel';

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhập từ file (Excel / PDF)</h1>
        <p className="text-gray-500 text-sm mt-1">Tải mẫu tờ khai chuẩn, điền dữ liệu rồi upload — hệ thống tự đọc và hiển thị các trường</p>
      </div>
      <ImportExcel />
    </div>
  );
}
