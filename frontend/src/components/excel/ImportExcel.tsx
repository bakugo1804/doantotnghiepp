'use client';
import { useRef, useState } from 'react';
import { aiApi, reportsApi, downloadBlob } from '@/lib/api';
import { CustomsForm } from '@/components/customs/CustomsForm';
import type { CustomsRecord } from '@/types';
import { normalizeCurrency, DEFAULT_EXCHANGE_RATE } from '@/lib/money';
import { normalizeHsCode } from '@/lib/tax-rules';
import { FileSpreadsheet, FileText, Loader2, Camera, AlertTriangle } from 'lucide-react';

type Step = 'upload' | 'review';

/**
 * Nhập tờ khai từ tệp Excel, tệp PDF hoặc ảnh chụp bản giấy đã điền tay.
 *
 * Bước kiểm tra dùng ĐÚNG form của trang tạo tờ khai (CustomsForm) chứ không dựng
 * một biểu mẫu riêng. Trước đây trang này có form riêng, và nó lệch khỏi form chính:
 * thiếu trường, thiếu kiểm tra dữ liệu, hiển thị VAT cố định 10% trong khi trang tạo
 * tờ khai đã suy thuế theo mã HS và xuất xứ. Người dùng nhập cùng một lô hàng bằng
 * hai đường sẽ thấy hai con số thuế khác nhau.
 *
 * Dùng chung form cũng có nghĩa là dùng chung mọi thứ đi kèm: gợi ý tên công ty,
 * danh mục mã HS, chuyển đổi USD/VND, và việc backend tự bổ sung mã HS mới vào danh
 * mục sau khi lưu.
 */
export function ImportExcel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromImage, setFromImage] = useState(false);
  const [prefill, setPrefill] = useState<Partial<CustomsRecord> | null>(null);
  /** Ô mà máy chủ đọc hai lần ra hai kết quả khác nhau - cần soi lại trước tiên. */
  const [uncertain, setUncertain] = useState<string[]>([]);

  /** Đưa dữ liệu đọc được về đúng hình dạng một tờ khai, để nạp vào form chính. */
  const toRecordShape = (data: any): Partial<CustomsRecord> => ({
    // Số tờ khai do cơ quan hải quan cấp: đọc được thì giữ nguyên, không đọc được
    // thì để trống cho người dùng nhập - form chính bắt buộc phải có số này.
    recordNo: data.recordNo || '',
    entryDate: data.entryDate || undefined,
    exitDate: data.exitDate || undefined,
    flightNo: data.flightNo || '',
    transportType: data.transportType || 'ROAD',
    journeys: (data.journeys || []).map((leg: any, index: number) => ({
      id: `parsed-${index}`,
      legNumber: leg.legNumber || index + 1,
      // Giữ nguyên giá trị rỗng khi máy chủ không xác định được phương thức: form sẽ
      // hiện "chưa đọc được, hãy chọn" và chặn lưu. Điền sẵn 'ROAD' như trước là biến
      // một ô chưa đọc được thành một câu trả lời trông như chắc chắn.
      transportType: leg.transportType || '',
      origin: leg.origin || '',
      destination: leg.destination || '',
    })),
    leg1Origin: data.journeys?.[0]?.origin || '',
    leg1Destination: data.journeys?.[0]?.destination || '',
    exporterName: data.exporterName || '',
    exporterAddress: data.exporterAddress || '',
    exporterCountry: data.exporterCountry || 'CN',
    importerName: data.importerName || '',
    importerAddress: data.importerAddress || '',
    importerCountry: data.importerCountry || 'VN',
    invoiceNo: data.invoiceNo || '',
    billOfLading: data.billOfLading || '',
    containerNo: data.containerNo || '',
    currency: normalizeCurrency(data.currency),
    exchangeRate: Number(data.exchangeRate) > 0 ? Number(data.exchangeRate) : DEFAULT_EXCHANGE_RATE,
    notes: data.notes || '',
    materials: (data.materials || []).map((material: any, index: number) => ({
      id: `parsed-${index}`,
      itemNo: material.itemNo || index + 1,
      hsCode: normalizeHsCode(material.hsCode),
      description: material.description || '',
      quantity: Number(material.quantity) || 0,
      unit: material.unit || 'cái',
      unitPrice: Number(material.unitPrice) || 0,
      origin: material.origin || '',
      weight: material.weight ?? null,
    })) as any,
  });

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    // Ảnh chụp phải nhờ mô hình thị giác đọc chữ viết tay nên chậm hơn hẳn đọc tệp
    // số; cần nói trước để người dùng không tưởng là treo.
    const isImage = /^image\//i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
    setFromImage(isImage);
    try {
      const res = await aiApi.parseFile(file);
      setPrefill(toRecordShape(res.data));
      setUncertain(Array.isArray(res.data?.uncertain) ? res.data.uncertain : []);
      setStep('review');
    } catch (e: any) {
      // Lỗi từ máy chủ nói rõ hơn nhiều (chưa cài mô hình, ảnh quá lớn, mô hình
      // trả về dữ liệu không đọc được), nên ưu tiên hiện nguyên văn.
      const fromServer = e.response?.data?.message;
      if (fromServer) setError(String(Array.isArray(fromServer) ? fromServer[0] : fromServer));
      else if (isImage) setError('Không đọc được ảnh. Hãy chụp lại rõ hơn: đủ sáng, chụp thẳng, lấy trọn cả tờ khai trong khung.');
      else setError('Không thể đọc file. Vui lòng dùng đúng mẫu (Excel .xlsx hoặc PDF có lớp văn bản) và kiểm tra định dạng.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = async () => {
    const res = await reportsApi.getTemplate();
    downloadBlob(res.data, 'mau-to-khai-hai-quan.xlsx');
  };
  const downloadTemplatePdf = async () => {
    const res = await reportsApi.getTemplatePdf();
    downloadBlob(res.data, 'mau-to-khai-hai-quan.pdf');
  };

  const notice = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <p className="font-medium">
          Dữ liệu dưới đây được đọc từ {fromImage ? 'ảnh chụp tờ khai bản giấy' : 'tệp bạn vừa tải lên'}. Kiểm tra lại rồi bấm lưu để tạo tờ khai.
        </p>
        <button
          type="button"
          onClick={() => { setStep('upload'); setPrefill(null); setError(''); setFromImage(false); setUncertain([]); }}
          className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
        >
          Chọn tệp khác
        </button>
      </div>

      {/* Đọc chữ viết tay không bao giờ chắc chắn 100%. Bước xem trước này là bắt
          buộc phải rà lại, nên nói thẳng ra thay vì để người dùng tin tưởng rồi
          bấm lưu với số sai. */}
      {fromImage && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {uncertain.length > 0
                ? `Có ${uncertain.length} ô cần bạn soi lại - đã tô viền vàng bên dưới.`
                : 'Hãy đối chiếu lại với bản giấy trước khi lưu.'}
            </p>
            <p className="mt-1 text-amber-700">
              {uncertain.length > 0
                ? 'Bảng hàng hoá được đọc hai lần; những ô hai lần cho ra hai kết quả khác nhau được tô vàng vì đó là chỗ dễ sai nhất. Các ô còn lại hai lần đọc đều khớp.'
                : 'Chữ viết tay dễ bị đọc lệch, nhất là chữ số (0/6, 1/7) và mã HS. Bảng hàng hoá đã được đọc hai lần và hai lần đều khớp nhau.'}
            </p>
            <p className="mt-1 text-amber-700">
              Ô nào nhận dạng không chắc sẽ được để trống thay vì đoán bừa - trong đó có số tờ khai, bạn cần tự nhập.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (step === 'review' && prefill) {
    return <CustomsForm prefill={prefill} prefillNotice={notice} uncertainFields={uncertain} />;
  }

  return (
    <div className="space-y-6">
      {/* Tải mẫu */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-blue-800">📋 Tải mẫu tờ khai hải quan chuẩn</p>
          <p className="text-sm text-blue-700">In mẫu này ra để điền tay, rồi chụp ảnh tải lên cũng được.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm">
            <FileSpreadsheet className="h-4 w-4" /> Mẫu Excel
          </button>
          <button onClick={downloadTemplatePdf} className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition text-sm">
            <FileText className="h-4 w-4" /> Mẫu PDF
          </button>
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="bg-white border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-16 text-center cursor-pointer transition group"
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <p className="text-gray-600">{fromImage ? 'Đang nhận dạng chữ trên ảnh...' : 'Đang đọc file...'}</p>
            {fromImage && (
              <p className="max-w-md text-sm text-gray-400">
                Đọc ảnh viết tay mất lâu hơn đọc tệp Excel/PDF: thường khoảng 15 giây, lần đầu sau khi bật máy chậm hơn
                (30-40 giây) vì phải nạp mô hình. Vui lòng đừng đóng trang.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-gray-300 transition group-hover:text-blue-500">
              <FileSpreadsheet className="h-14 w-14" />
              <Camera className="h-14 w-14" />
            </div>
            <p className="text-lg font-medium text-gray-700">Kéo thả hoặc click để upload</p>
            <p className="text-gray-400 text-sm">Hỗ trợ Excel (.xlsx, .xls), PDF (.pdf) và ảnh chụp tờ khai giấy (.jpg, .png, .webp)</p>
            <p className="max-w-lg text-xs text-gray-400">
              Chụp tờ khai đã điền tay: đặt tờ khai trên mặt phẳng, đủ sáng, chụp thẳng từ trên xuống và lấy trọn cả tờ trong khung.
            </p>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{error}</div>}
    </div>
  );
}
