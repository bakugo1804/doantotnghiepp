import { ImportExcel } from '@/components/excel/ImportExcel';

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhập từ file (Excel / PDF / Ảnh chụp)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Đọc dữ liệu tờ khai từ tệp Excel, tệp PDF, hoặc ảnh chụp tờ khai bản giấy đã điền tay.
        </p>
      </div>
      <ImportExcel />
    </div>
  );
}
