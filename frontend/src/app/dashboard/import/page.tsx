import { ImportExcel } from '@/components/excel/ImportExcel';

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhập từ file (Excel / PDF)</h1>
      </div>
      <ImportExcel />
    </div>
  );
}
