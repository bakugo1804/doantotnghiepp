'use client';
import { useRef, useState } from 'react';
import { reportsApi, downloadBlob } from '@/lib/api';
import { FileSpreadsheet, FileText, ArrowRight, Loader2 } from 'lucide-react';

type Mode = 'excel-to-pdf' | 'pdf-to-excel';

function ConvertCard({ mode }: { mode: Mode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneName, setDoneName] = useState('');

  const isExcelToPdf = mode === 'excel-to-pdf';
  const accept = isExcelToPdf ? '.xlsx,.xls' : '.pdf';
  const fromLabel = isExcelToPdf ? 'Excel' : 'PDF';
  const toLabel = isExcelToPdf ? 'PDF' : 'Excel';
  const FromIcon = isExcelToPdf ? FileSpreadsheet : FileText;
  const ToIcon = isExcelToPdf ? FileText : FileSpreadsheet;

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    setDoneName('');
    try {
      const res = isExcelToPdf ? await reportsApi.excelToPdf(file) : await reportsApi.pdfToExcel(file);
      const outName = isExcelToPdf ? 'to-khai-chuyen-doi.pdf' : 'to-khai-chuyen-doi.xlsx';
      downloadBlob(res.data, outName);
      setDoneName(outName);
    } catch (e: any) {
      setError('Chuyển đổi thất bại. Hãy chắc chắn file đúng định dạng và theo mẫu tờ khai.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-center gap-4 mb-5">
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-2xl bg-blue-50 p-4 text-blue-600"><FromIcon className="h-8 w-8" /></div>
          <span className="text-sm font-medium text-gray-700">{fromLabel}</span>
        </div>
        <ArrowRight className="h-6 w-6 text-gray-400" />
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-2xl bg-rose-50 p-4 text-rose-600"><ToIcon className="h-8 w-8" /></div>
          <span className="text-sm font-medium text-gray-700">{toLabel}</span>
        </div>
      </div>

      <h3 className="text-center font-semibold text-gray-800 mb-1">Chuyển {fromLabel} → {toLabel}</h3>
      <p className="text-center text-sm text-gray-500 mb-4">Tải lên file {fromLabel} theo mẫu, hệ thống trả về file {toLabel}.</p>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl py-8 text-gray-600 transition disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-6 w-6 animate-spin text-blue-500" /> : <FromIcon className="h-6 w-6" />}
        {loading ? 'Đang chuyển đổi...' : `Chọn file ${fromLabel}`}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {doneName && <p className="mt-3 text-sm text-green-600 text-center">✓ Đã tạo & tải về: {doneName}</p>}
      {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
    </div>
  );
}

export default function ConvertPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Chuyển đổi file</h1>
        <p className="text-gray-500 text-sm mt-1">Chuyển đổi qua lại giữa Excel và PDF theo mẫu tờ khai hải quan (không lưu vào hệ thống).</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ConvertCard mode="excel-to-pdf" />
        <ConvertCard mode="pdf-to-excel" />
      </div>
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Lưu ý: Chuyển đổi hoạt động tốt nhất với file theo đúng mẫu tờ khai. Với PDF, phần bảng hàng hóa/hành trình đọc theo lớp văn bản nên có thể cần kiểm tra lại.
      </div>
    </div>
  );
}
