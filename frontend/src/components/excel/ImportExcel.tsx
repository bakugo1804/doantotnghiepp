'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { aiApi, reportsApi, downloadBlob, customsApi } from '@/lib/api';
import { FileSpreadsheet, FileText, Loader2, CheckCircle, Plus, Trash2 } from 'lucide-react';

type Step = 'upload' | 'preview' | 'done';
type TransportType = 'AIR' | 'SEA' | 'RAIL' | 'ROAD';

type MaterialForm = {
  itemNo: number;
  hsCode?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  origin?: string;
  weight?: number;
};

type JourneyForm = { legNumber: number; transportType: TransportType; origin: string; destination: string };

type CustomsForm = {
  recordNo?: string;
  entryDate: string;
  exitDate?: string;
  flightNo?: string;
  journeys: JourneyForm[];
  exporterName: string;
  exporterAddress?: string;
  importerName: string;
  importerAddress?: string;
  invoiceNo?: string;
  billOfLading?: string;
  containerNo?: string;
  currency: string;
  vatRate?: number;
  notes?: string;
  materials: MaterialForm[];
};

const TRANSPORT_OPTIONS: { value: TransportType; label: string }[] = [
  { value: 'AIR', label: 'Đường hàng không' },
  { value: 'SEA', label: 'Đường biển' },
  { value: 'RAIL', label: 'Đường sắt' },
  { value: 'ROAD', label: 'Đường bộ' },
];

const toDateInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

export function ImportExcel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CustomsForm | null>(null);
  const [error, setError] = useState('');
  const [recordNoTaken, setRecordNoTaken] = useState(false);

  // Kiểm tra trùng số tờ khai (debounce)
  useEffect(() => {
    const value = form?.recordNo?.trim();
    if (!value) {
      setRecordNoTaken(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await customsApi.checkRecordNo(value);
        setRecordNoTaken(!res.data.available);
      } catch {
        setRecordNoTaken(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form?.recordNo]);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const res = await aiApi.parseFile(file);
      const data = res.data;
      const journeys: JourneyForm[] = (data.journeys || []).map((j: any, i: number) => ({
        legNumber: j.legNumber || i + 1,
        transportType: (j.transportType || 'ROAD') as TransportType,
        origin: j.origin || '',
        destination: j.destination || '',
      }));
      setForm({
        recordNo: '',
        entryDate: toDateInput(data.entryDate) || new Date().toISOString().slice(0, 10),
        exitDate: toDateInput(data.exitDate),
        flightNo: data.flightNo || '',
        journeys: journeys.length > 0 ? journeys : [{ legNumber: 1, transportType: (data.transportType || 'ROAD') as TransportType, origin: '', destination: '' }],
        exporterName: data.exporterName || '',
        exporterAddress: data.exporterAddress || '',
        importerName: data.importerName || '',
        importerAddress: data.importerAddress || '',
        invoiceNo: data.invoiceNo || '',
        billOfLading: data.billOfLading || '',
        containerNo: data.containerNo || '',
        currency: data.currency || 'USD',
        vatRate: data.vatRate,
        notes: data.notes || '',
        materials: (data.materials || []).map((m: any, i: number) => ({
          itemNo: m.itemNo || i + 1,
          hsCode: m.hsCode || '',
          description: m.description || '',
          quantity: Number(m.quantity) || 0,
          unit: m.unit || 'cái',
          unitPrice: Number(m.unitPrice) || 0,
          origin: m.origin || '',
          weight: m.weight,
        })),
      });
      setStep('preview');
    } catch (e: any) {
      setError('Không thể đọc file. Vui lòng dùng đúng mẫu (Excel .xlsx hoặc PDF có lớp văn bản) và kiểm tra định dạng.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const setField = <K extends keyof CustomsForm>(key: K, value: CustomsForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  // ===== Hành trình =====
  const setJourney = (index: number, key: keyof JourneyForm, value: any) => {
    setForm((current) => {
      if (!current) return current;
      const journeys = [...current.journeys];
      journeys[index] = { ...journeys[index], [key]: value };
      return { ...current, journeys };
    });
  };
  const addJourney = () => {
    setForm((current) => {
      if (!current) return current;
      return { ...current, journeys: [...current.journeys, { legNumber: current.journeys.length + 1, transportType: 'ROAD', origin: '', destination: '' }] };
    });
  };
  const removeJourney = (index: number) => {
    setForm((current) => {
      if (!current) return current;
      const journeys = current.journeys.filter((_, i) => i !== index).map((j, i) => ({ ...j, legNumber: i + 1 }));
      return { ...current, journeys };
    });
  };

  // ===== Vật tư =====
  const setMaterial = (index: number, key: keyof MaterialForm, value: any) => {
    setForm((current) => {
      if (!current) return current;
      const materials = [...current.materials];
      materials[index] = { ...materials[index], [key]: value };
      return { ...current, materials };
    });
  };
  const addMaterial = () => {
    setForm((current) => {
      if (!current) return current;
      return { ...current, materials: [...current.materials, { itemNo: current.materials.length + 1, hsCode: '', description: '', quantity: 1, unit: 'cái', unitPrice: 0, origin: '' }] };
    });
  };
  const removeMaterial = (index: number) => {
    setForm((current) => {
      if (!current) return current;
      const materials = current.materials.filter((_, i) => i !== index).map((m, i) => ({ ...m, itemNo: i + 1 }));
      return { ...current, materials };
    });
  };

  const handleImport = async () => {
    if (!form) return;
    const validJourneys = form.journeys.filter((j) => j.origin.trim() && j.destination.trim());
    if (!form.exporterName.trim() || !form.importerName.trim() || validJourneys.length === 0) {
      setError('Vui lòng điền: Nhà xuất khẩu, Nhà nhập khẩu và ít nhất 1 chặng (điểm đi & đến).');
      return;
    }
    if (form.materials.length === 0 || form.materials.some((m) => !m.description.trim())) {
      setError('Cần ít nhất 1 dòng vật tư và mỗi dòng phải có mô tả.');
      return;
    }
    if (recordNoTaken) {
      setError('Số tờ khai đã tồn tại. Vui lòng nhập số khác hoặc để trống để hệ thống tự sinh.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const journeys = validJourneys.map((j, i) => ({ legNumber: i + 1, transportType: j.transportType, origin: j.origin.trim(), destination: j.destination.trim() }));
      const payload: any = {
        entryDate: new Date(form.entryDate).toISOString(),
        transportType: journeys[0].transportType,
        journeys,
        leg1Origin: journeys[0].origin,
        leg1Destination: journeys[0].destination,
        exporterName: form.exporterName.trim(),
        importerName: form.importerName.trim(),
        currency: form.currency,
        materials: form.materials.map((m, i) => ({
          itemNo: i + 1,
          hsCode: m.hsCode?.trim() || undefined,
          description: m.description.trim(),
          quantity: Number(m.quantity) || 0,
          unit: m.unit?.trim() || 'cái',
          unitPrice: Number(m.unitPrice) || 0,
          origin: m.origin?.trim() || undefined,
          weight: m.weight ? Number(m.weight) : undefined,
        })),
      };
      if (form.recordNo?.trim()) payload.recordNo = form.recordNo.trim();
      if (form.exitDate) payload.exitDate = new Date(form.exitDate).toISOString();
      if (form.flightNo?.trim()) payload.flightNo = form.flightNo.trim();
      if (form.exporterAddress?.trim()) payload.exporterAddress = form.exporterAddress.trim();
      if (form.importerAddress?.trim()) payload.importerAddress = form.importerAddress.trim();
      if (form.invoiceNo?.trim()) payload.invoiceNo = form.invoiceNo.trim();
      if (form.billOfLading?.trim()) payload.billOfLading = form.billOfLading.trim();
      if (form.containerNo?.trim()) payload.containerNo = form.containerNo.trim();
      if (form.vatRate != null && (form.vatRate as any) !== '') payload.vatRate = Number(form.vatRate);
      if (form.notes?.trim()) payload.notes = form.notes.trim();

      await customsApi.create(payload);
      setStep('done');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Lỗi nhập liệu. Vui lòng kiểm tra lại dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const res = await reportsApi.getTemplate();
    downloadBlob(res.data, 'mau-to-khai-hai-quan.xlsx');
  };
  const downloadTemplatePdf = async () => {
    const res = await reportsApi.getTemplatePdf();
    downloadBlob(res.data, 'mau-to-khai-hai-quan.pdf');
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  if (step === 'done') return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Nhập liệu thành công!</h2>
      <p className="text-gray-500 mb-6">Tờ khai đã được tạo từ file</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => router.push('/dashboard/customs')} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition">Xem danh sách tờ khai</button>
        <button onClick={() => { setStep('upload'); setForm(null); }} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg hover:bg-gray-50 transition">Nhập file khác</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tải mẫu */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-blue-800">📋 Tải mẫu tờ khai hải quan chuẩn</p>
          <p className="text-blue-600 text-sm">Đây là mẫu cố định. Điền dữ liệu vào ô bên phải mỗi nhãn (có bảng hành trình & hàng hóa nhiều dòng) rồi tải lên.</p>
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

      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="bg-white border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-16 text-center cursor-pointer transition group"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <p className="text-gray-600">Đang đọc file...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet className="h-16 w-16 text-gray-300 group-hover:text-blue-500 transition" />
              <p className="text-lg font-medium text-gray-700">Kéo thả hoặc click để upload</p>
              <p className="text-gray-400 text-sm">Hỗ trợ Excel (.xlsx, .xls) và PDF (.pdf)</p>
            </div>
          )}
        </div>
      )}

      {step === 'upload' && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{error}</div>
      )}

      {step === 'preview' && form && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-1">📝 Kiểm tra & chỉnh sửa dữ liệu</h2>
          <p className="text-sm text-gray-500 mb-4">Bạn có thể sửa các trường bên dưới trước khi tạo tờ khai.</p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Số tờ khai (để trống = tự sinh)</label>
              <input value={form.recordNo || ''} onChange={(e) => setField('recordNo', e.target.value)}
                className={`${inputCls} ${recordNoTaken ? 'border-red-500 ring-2 ring-red-100' : ''}`} placeholder="VD: TK2026-001" />
              {recordNoTaken && <p className="text-red-600 text-xs mt-1">⚠ Số tờ khai đã tồn tại, vui lòng nhập số khác.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ngày nhập cảnh</label>
              <input type="date" value={form.entryDate} onChange={(e) => setField('entryDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Số hiệu chuyến (bay/tàu)</label>
              <input value={form.flightNo} onChange={(e) => setField('flightNo', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nhà xuất khẩu</label>
              <input value={form.exporterName} onChange={(e) => setField('exporterName', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nhà nhập khẩu</label>
              <input value={form.importerName} onChange={(e) => setField('importerName', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tiền tệ</label>
              <select value={form.currency} onChange={(e) => setField('currency', e.target.value)} className={inputCls}>
                <option value="USD">USD</option>
                <option value="VND">VND</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Thuế suất VAT (%)</label>
              <input type="number" value={form.vatRate ?? ''} onChange={(e) => setField('vatRate', e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* Hành trình */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-gray-700">Hành trình vận chuyển ({form.journeys.length} chặng)</p>
            <button onClick={addJourney} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100">
              <Plus className="h-3.5 w-3.5" /> Thêm chặng
            </button>
          </div>
          <div className="space-y-2 mb-6">
            {form.journeys.map((j, i) => (
              <div key={i} className="grid grid-cols-[40px_1fr_1fr_1fr_36px] items-center gap-2">
                <span className="text-center text-sm text-gray-500">{i + 1}</span>
                <select value={j.transportType} onChange={(e) => setJourney(i, 'transportType', e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                  {TRANSPORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={j.origin} onChange={(e) => setJourney(i, 'origin', e.target.value)} placeholder="Điểm đi" className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
                <input value={j.destination} onChange={(e) => setJourney(i, 'destination', e.target.value)} placeholder="Điểm đến" className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
                <button onClick={() => removeJourney(i)} disabled={form.journeys.length <= 1} className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30" title="Xóa chặng">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Vật tư */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-gray-700">Vật tư ({form.materials.length} dòng)</p>
            <button onClick={addMaterial} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng
            </button>
          </div>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {['STT', 'Mã HS', 'Mô tả', 'SL', 'ĐV', 'Đơn giá', 'Xuất xứ', ''].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.materials.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5"><input value={m.hsCode} onChange={(e) => setMaterial(i, 'hsCode', e.target.value)} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input value={m.description} onChange={(e) => setMaterial(i, 'description', e.target.value)} className="w-48 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input type="number" value={m.quantity} onChange={(e) => setMaterial(i, 'quantity', Number(e.target.value))} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input value={m.unit} onChange={(e) => setMaterial(i, 'unit', e.target.value)} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input type="number" value={m.unitPrice} onChange={(e) => setMaterial(i, 'unitPrice', Number(e.target.value))} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input value={m.origin} onChange={(e) => setMaterial(i, 'origin', e.target.value)} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeMaterial(i)} className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50" title="Xóa dòng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {form.materials.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-6 text-center text-gray-400">Chưa có vật tư. Bấm "Thêm dòng" để thêm.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm mb-4">{error}</div>}

          <div className="flex gap-3 justify-end">
            <button onClick={() => { setStep('upload'); setForm(null); setError(''); }} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">Upload lại</button>
            <button onClick={handleImport} disabled={loading || recordNoTaken} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo tờ khai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
