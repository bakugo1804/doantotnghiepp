'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  Calculator,
  Check,
  FileText,
  Package,
  Plus,
  Route,
  Ship,
  Trash2,
} from 'lucide-react';
import { useCreateCustoms, useCustomsOne, useUpdateCustoms } from '@/hooks/useCustoms';
import { useHsCodes } from '@/hooks/useHsCodes';
import { useMessages } from '@/hooks/useMessages';
import { companiesApi, customsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { convertMoney, DEFAULT_EXCHANGE_RATE, formatMoney, normalizeCurrency } from '@/lib/money';
import { isValidHsCode, normalizeHsCode, previewTotals } from '@/lib/tax-rules';
import { COUNTRIES, LOCATION_SUGGESTIONS, UNITS, unitLabel } from '@/lib/reference-data';
import type { CreateJourneyDto, CustomsRecord, TransportType } from '@/types';

type MaterialRow = {
  itemNo: number;
  hsCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  origin: string;
  /** Trọng lượng (kg) - có trên biểu mẫu xuất ra nên phải khai được ở đây. */
  weight: string;
};

type FieldErrors = Record<string, string>;

const emptyMaterial = (itemNo: number): MaterialRow => ({
  itemNo,
  hsCode: '',
  description: '',
  quantity: 1,
  unit: 'cái',
  unitPrice: 0,
  origin: 'CN',
  weight: '',
});

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/** Phần khung của một nhóm trường, để form dài vẫn đọc được theo từng bước. */
function Section({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon: typeof FileText;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

/**
 * Form khai báo, dùng cho cả tạo mới và sửa.
 *
 * Trước đây chỉ có đường tạo mới, nên một tờ khai đã lưu là không sửa được ở bất
 * kỳ trạng thái nào - gõ sai một chữ cũng phải xoá đi khai lại từ đầu. Truyền
 * `recordId` vào là form chuyển sang chế độ sửa: nạp sẵn dữ liệu cũ và lưu bằng
 * PATCH thay vì POST.
 *
 * `prefill` dùng cho đường nhập liệu từ tệp Excel, PDF hoặc ảnh chụp: dữ liệu đọc
 * được đổ vào ĐÚNG form này thay vì một biểu mẫu riêng. Trước đây trang "Nhập từ
 * file" tự dựng một form rút gọn, nên nó thiếu trường, thiếu kiểm tra dữ liệu và
 * hiển thị VAT mặc định 10% trong khi trang tạo tờ khai đã suy thuế từ mã HS - cùng
 * một lô hàng mà hai đường nhập cho ra hai con số thuế khác nhau.
 */
export function CustomsForm({
  recordId,
  prefill,
  prefillNotice,
}: {
  recordId?: string;
  /** Dữ liệu điền sẵn, cùng hình dạng với một tờ khai đã lưu. */
  prefill?: Partial<CustomsRecord> | null;
  /** Lời nhắc hiện trên đầu form, ví dụ cảnh báo dữ liệu đọc từ chữ viết tay. */
  prefillNotice?: React.ReactNode;
} = {}) {
  const router = useRouter();
  const createCustoms = useCreateCustoms();
  const updateCustoms = useUpdateCustoms();
  const msg = useMessages();
  const isEditing = Boolean(recordId);
  const { data: existing, isLoading: loadingRecord } = useCustomsOne(recordId ?? '');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const [recordNo, setRecordNo] = useState('');
  const [recordNoTaken, setRecordNoTaken] = useState(false);
  const [checkingRecordNo, setCheckingRecordNo] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [exitDate, setExitDate] = useState('');
  // Đồng tiền của đơn giá được chọn ngay tại bảng vật tư - đó là chỗ người dùng
  // đang gõ số tiền, chứ không phải ở khối tổng hợp cuối form.
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);

  const [exporterName, setExporterName] = useState('');
  const [exporterCountry, setExporterCountry] = useState('CN');
  const [exporterAddress, setExporterAddress] = useState('');
  const [importerName, setImporterName] = useState('');
  const [importerCountry, setImporterCountry] = useState('VN');
  const [importerAddress, setImporterAddress] = useState('');

  const [invoiceNo, setInvoiceNo] = useState('');
  const [billOfLading, setBillOfLading] = useState('');
  const [containerNo, setContainerNo] = useState('');
  // Số hiệu chuyến có ô riêng trên biểu mẫu Excel/PDF, nhưng form nhập tay lại
  // không hỏi tới, nên mọi tờ khai tạo bằng tay xuất ra đều để trống ô đó.
  const [flightNo, setFlightNo] = useState('');
  const [notes, setNotes] = useState('');

  const [journeys, setJourneys] = useState<CreateJourneyDto[]>([
    { legNumber: 1, transportType: 'SEA', origin: '', destination: '' },
  ]);
  const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial(1)]);

  // Danh bạ công ty để gợi ý tên, tránh mỗi lần gõ một biến thể khác nhau.
  const { data: companies = [] } = useQuery({
    queryKey: ['companies-options'],
    queryFn: () => companiesApi.getAll().then((response) => response.data),
  });
  const companyNames: string[] = useMemo(
    () => (Array.isArray(companies) ? companies : companies?.data ?? []).map((company: any) => company.name),
    [companies],
  );

  // Danh mục mã HS lấy từ cơ sở dữ liệu. Mã chưa có trong danh mục vẫn gõ tay
  // được, và sẽ được backend tự bổ sung vào danh mục sau khi lưu tờ khai.
  const { data: hsCodes = [] } = useHsCodes();
  const hsCodeByCode = useMemo(() => new Map(hsCodes.map((item) => [item.code, item])), [hsCodes]);

  /**
   * Chọn mã HS đã có trong danh mục thì điền luôn tên hàng và đơn vị.
   *
   * Ô mô tả để trống mới được điền tự động - người dùng đã gõ tên riêng cho lô
   * hàng thì không ghi đè lên.
   */
  const applyHsCode = (index: number, rawCode: string) => {
    setMaterials((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const known = hsCodeByCode.get(normalizeHsCode(rawCode));
        if (!known) return { ...row, hsCode: rawCode };
        return {
          ...row,
          hsCode: rawCode,
          description: row.description.trim() ? row.description : known.description,
          unit: known.defaultUnit || row.unit,
        };
      }),
    );
  };

  // Nạp dữ liệu vào form - đúng một lần cho mỗi nguồn dữ liệu.
  //
  // React Query tự tải lại khi cửa sổ được focus lại; nếu nạp lại mỗi lần dữ liệu
  // về thì người dùng chuyển sang tab khác rồi quay lại là mất sạch phần đang gõ.
  //
  // Hai nguồn đi qua CÙNG một đoạn nạp: tờ khai đã lưu (chế độ sửa) và dữ liệu đọc
  // từ tệp/ảnh. Nhờ vậy không thể xảy ra chuyện một nguồn điền thiếu trường so với
  // nguồn kia.
  const prefilledId = useRef<string | null>(null);
  const prefillSource = (existing as CustomsRecord | undefined) ?? prefill ?? null;
  const prefillKey = recordId ?? (prefill ? 'prefill' : null);
  useEffect(() => {
    if (!prefillSource || prefilledId.current === prefillKey) return;
    prefilledId.current = prefillKey;
    const record = prefillSource as CustomsRecord;
    setRecordNo(record.recordNo || '');
    // Nguồn không có ngày thì để trống, KHÔNG lấy ngày hôm nay: dữ liệu đọc từ ảnh
    // có thể không đọc ra ngày, mà một ngày trông hợp lý sẵn trong ô thì người dùng
    // bấm lưu luôn. Ô trống sẽ bị bộ kiểm tra chặn lại và buộc điền tay.
    setEntryDate(toDateInput(record.entryDate));
    setExitDate(toDateInput(record.exitDate));
    setCurrency(normalizeCurrency(record.currency));
    setExchangeRate(Number(record.exchangeRate) > 0 ? Number(record.exchangeRate) : DEFAULT_EXCHANGE_RATE);
    setExporterName(record.exporterName || '');
    setExporterCountry((record.exporterCountry || 'CN').toUpperCase());
    setExporterAddress(record.exporterAddress || '');
    setImporterName(record.importerName || '');
    setImporterCountry((record.importerCountry || 'VN').toUpperCase());
    setImporterAddress(record.importerAddress || '');
    setInvoiceNo(record.invoiceNo || '');
    setBillOfLading(record.billOfLading || '');
    setContainerNo(record.containerNo || '');
    setFlightNo(record.flightNo || record.vesselName || record.trainNo || '');
    setNotes(record.notes || '');

    const legs = (record.journeys ?? []).length
      ? [...record.journeys!]
          .sort((a, b) => a.legNumber - b.legNumber)
          .map((leg, index) => ({
            legNumber: index + 1,
            transportType: leg.transportType,
            origin: leg.origin || '',
            destination: leg.destination || '',
          }))
      : [
          {
            legNumber: 1,
            transportType: (record.transportType || 'SEA') as TransportType,
            origin: record.leg1Origin || '',
            destination: record.leg1Destination || '',
          },
        ];
    setJourneys(legs);

    setMaterials(
      (record.materials ?? []).length
        ? record.materials.map((material, index) => ({
            itemNo: index + 1,
            hsCode: material.hsCode || '',
            description: material.description || '',
            quantity: Number(material.quantity) || 0,
            unit: material.unit || 'cái',
            unitPrice: Number(material.unitPrice) || 0,
            origin: (material.origin || '').toUpperCase(),
            weight: material.weight != null ? String(material.weight) : '',
          }))
        : [emptyMaterial(1)],
    );
  }, [prefillSource, prefillKey]);

  useEffect(() => {
    const value = recordNo.trim();
    // Khi sửa, số tờ khai của chính nó không phải là trùng.
    if (!value || value === (existing as CustomsRecord | undefined)?.recordNo) {
      setRecordNoTaken(false);
      setCheckingRecordNo(false);
      return;
    }
    setCheckingRecordNo(true);
    const timer = setTimeout(async () => {
      try {
        const response = await customsApi.checkRecordNo(value);
        setRecordNoTaken(!response.data.available);
      } catch {
        setRecordNoTaken(false);
      } finally {
        setCheckingRecordNo(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [recordNo, existing]);

  /** Đồng tiền còn lại, để cạnh mỗi số tiền cho biết nó tương đương bao nhiêu. */
  const otherCurrency = normalizeCurrency(currency) === 'USD' ? 'VND' : 'USD';

  /** Số ngày vận chuyển - cách trực quan nhất để thấy hai mốc ngày là đầu và cuối hành trình. */
  const transportDays = useMemo(() => {
    if (!entryDate || !exitDate) return null;
    const days = Math.round((new Date(exitDate).getTime() - new Date(entryDate).getTime()) / 86_400_000);
    return Number.isFinite(days) && days >= 0 ? days : null;
  }, [entryDate, exitDate]);

  /**
   * Toàn bộ số liệu tài chính được SUY RA từ hàng hoá đang khai, không còn nhập tay.
   *
   * Thuế nhập khẩu và VAT tra theo mã HS + xuất xứ của từng dòng hàng, phí vận
   * chuyển tính theo tổng trọng lượng và tuyến - dùng đúng công thức của backend
   * (lib/tax-rules.ts) nên con số ở đây khớp với con số sau khi lưu.
   */
  const totals = useMemo(
    () =>
      previewTotals(
        materials.map((material) => ({
          hsCode: material.hsCode,
          quantity: Number(material.quantity) || 0,
          unitPrice: Number(material.unitPrice) || 0,
          origin: material.origin,
          weight: material.weight === '' ? null : Number(material.weight),
        })),
        {
          exporterCountry,
          importerCountry,
          transportType: journeys[0]?.transportType,
          distanceKm: 0,
          currency,
          exchangeRate,
        },
      ),
    [materials, exporterCountry, importerCountry, journeys, currency, exchangeRate],
  );

  const updateJourney = (legNumber: number, field: keyof CreateJourneyDto, value: string | number | TransportType) => {
    setJourneys((current) => current.map((leg) => (leg.legNumber === legNumber ? { ...leg, [field]: value } : leg)));
  };
  const addJourney = () => {
    if (journeys.length >= 10) return;
    const next = Math.max(...journeys.map((leg) => leg.legNumber), 0) + 1;
    setJourneys((current) => [...current, { legNumber: next, transportType: 'ROAD', origin: '', destination: '' }]);
  };
  const removeJourney = (legNumber: number) => {
    if (journeys.length > 1) setJourneys((current) => current.filter((leg) => leg.legNumber !== legNumber));
  };

  const setMaterial = (index: number, key: keyof MaterialRow, value: any) => {
    setMaterials((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const addMaterial = () => setMaterials((current) => [...current, emptyMaterial(current.length + 1)]);
  const removeMaterial = (index: number) =>
    setMaterials((current) => current.filter((_, i) => i !== index).map((row, i) => ({ ...row, itemNo: i + 1 })));

  const validate = () => {
    const errors: FieldErrors = {};

    // Số tờ khai là bắt buộc: đây là mã định danh hồ sơ do cơ quan hải quan cấp,
    // hệ thống không được phép tự bịa ra một số rồi coi như đã khai báo.
    if (!recordNo.trim()) errors.recordNo = 'Bắt buộc nhập số tờ khai';
    else if (recordNoTaken) errors.recordNo = 'Số tờ khai này đã tồn tại trong hệ thống';

    // Nhãn phải trùng với nhãn của chính hai ô đó trên form, và trùng với biểu mẫu
    // Excel/PDF: "bắt đầu / kết thúc vận chuyển", không phải "nhập cảnh / xuất cảnh".
    if (!entryDate) errors.entryDate = 'Bắt buộc chọn ngày bắt đầu vận chuyển';
    if (exitDate && exitDate < entryDate) {
      errors.exitDate = 'Ngày kết thúc vận chuyển không thể trước ngày bắt đầu';
    }

    if (!exporterName.trim()) errors.exporterName = 'Bắt buộc nhập nhà xuất khẩu';
    if (!importerName.trim()) errors.importerName = 'Bắt buộc nhập nhà nhập khẩu';

    journeys.forEach((leg) => {
      if (!leg.origin.trim()) errors[`leg-${leg.legNumber}-origin`] = 'Thiếu điểm đi';
      if (!leg.destination.trim()) errors[`leg-${leg.legNumber}-destination`] = 'Thiếu điểm đến';
    });

    materials.forEach((material, index) => {
      if (!material.description.trim()) errors[`material-${index}-description`] = 'Thiếu mô tả hàng hoá';
      if (!(Number(material.quantity) > 0)) errors[`material-${index}-quantity`] = 'Số lượng phải lớn hơn 0';
      if (Number(material.unitPrice) < 0) errors[`material-${index}-unitPrice`] = 'Đơn giá không hợp lệ';
      // Mã HS quyết định thuế suất, nên gõ sai định dạng là tính sai tiền thuế.
      if (material.hsCode.trim() && !isValidHsCode(material.hsCode)) {
        errors[`material-${index}-hsCode`] = 'Mã HS phải có 4-10 chữ số';
      }
      // Không có trọng lượng thì phí vận chuyển rơi về mức tối thiểu 1kg.
      if (material.weight.trim() === '' || !(Number(material.weight) > 0)) {
        errors[`material-${index}-weight`] = 'Nhập trọng lượng (kg) để tính đúng phí vận chuyển';
      }
    });

    return errors;
  };

  const submit = () => {
    setError('');
    setSubmitted(true);
    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError(`Còn ${Object.keys(errors).length} trường chưa hợp lệ, vui lòng kiểm tra các ô được tô đỏ.`);
      // Cuộn tới ô lỗi đầu tiên: form dài nên lỗi có thể nằm ngoài màn hình.
      const firstErrorKey = Object.keys(errors)[0];
      document.querySelector(`[data-field="${firstErrorKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const payload = {
      recordNo: recordNo.trim(),
      entryDate,
      exitDate: exitDate || undefined,
      transportType: journeys[0]?.transportType || 'SEA',
      journeys,
      leg1Origin: journeys[0]?.origin || '',
      leg1Destination: journeys[0]?.destination || '',
      leg2Origin: journeys[1]?.origin,
      leg2Destination: journeys[1]?.destination,
      exporterName: exporterName.trim(),
      exporterCountry,
      exporterAddress: exporterAddress.trim() || undefined,
      importerName: importerName.trim(),
      importerCountry,
      importerAddress: importerAddress.trim() || undefined,
      invoiceNo: invoiceNo.trim() || undefined,
      billOfLading: billOfLading.trim() || undefined,
      containerNo: containerNo.trim() || undefined,
      flightNo: flightNo.trim() || undefined,
      notes: notes.trim() || undefined,
      currency,
      exchangeRate,
      materials: materials.map((material, index) => ({
        itemNo: index + 1,
        // Chuẩn hoá trước khi gửi để mã trong tờ khai trùng khớp với danh mục.
        hsCode: normalizeHsCode(material.hsCode) || undefined,
        description: material.description.trim(),
        quantity: Number(material.quantity) || 0,
        unit: material.unit.trim() || 'cái',
        unitPrice: Number(material.unitPrice) || 0,
        origin: material.origin || undefined,
        weight: material.weight.trim() === '' ? undefined : Number(material.weight),
      })),
      // Thuế suất KHÔNG được gửi lên: backend suy ra từ mã HS và xuất xứ. Gửi lên
      // sẽ bị hiểu là người khai ấn định thuế suất và ghi đè toàn bộ phần tự tính.
    } as any;

    const handlers = {
      onSuccess: () => router.push(isEditing ? `/dashboard/customs/${recordId}` : '/dashboard/customs'),
      onError: (err: any) => {
        const detail = err?.response?.data?.message;
        setError((Array.isArray(detail) ? detail[0] : detail) || msg.customs.form.errorCreate);
      },
    };

    if (isEditing && recordId) updateCustoms.mutate({ id: recordId, data: payload }, handlers);
    else createCustoms.mutate(payload, handlers);
  };

  const saving = createCustoms.isPending || updateCustoms.isPending;

  // Chỉ tô đỏ sau lần bấm gửi đầu tiên - bôi đỏ ngay khi form vừa mở thì rất khó chịu.
  const errorOf = (key: string) => (submitted ? fieldErrors[key] : undefined);
  const input = 'w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2';
  const normal = 'border-slate-300 focus:border-blue-500 focus:ring-blue-100';
  const invalid = 'border-rose-500 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-100';
  const fieldClass = (key: string) => cn(input, errorOf(key) ? invalid : normal);
  const cell = 'w-full rounded-lg border px-2 py-1.5 text-sm outline-none transition focus:ring-2';
  const cellClass = (key: string) => cn(cell, errorOf(key) ? invalid : normal);

  if (isEditing && loadingRecord) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Đang tải tờ khai...</p>;
  }

  return (
    <div className="space-y-5 pb-28">
      <datalist id="company-names">
        {companyNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="hs-codes">
        {hsCodes.map((item) => (
          <option key={item.id} value={item.code}>
            {item.description}
          </option>
        ))}
      </datalist>
      {/* Tên hàng cũng gợi ý từ danh mục: nhiều người nhớ tên hàng chứ không nhớ mã. */}
      <datalist id="hs-descriptions">
        {hsCodes.map((item) => (
          <option key={item.id} value={item.description}>
            {item.code}
          </option>
        ))}
      </datalist>

      {prefillNotice}

      <Section
        icon={FileText}
        title="Thông tin chung"
        description={isEditing ? 'Đang sửa một tờ khai đã lưu' : 'Số tờ khai và thời gian thông quan'}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2" data-field="recordNo">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Số tờ khai <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <input
                value={recordNo}
                onChange={(event) => setRecordNo(event.target.value)}
                placeholder="VD: 103456789012"
                className={cn(fieldClass('recordNo'), 'pr-10 font-mono')}
              />
              {recordNo.trim() && !checkingRecordNo && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {recordNoTaken ? (
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                  ) : (
                    <Check className="h-4 w-4 text-emerald-600" />
                  )}
                </span>
              )}
            </div>
            <FieldError message={errorOf('recordNo')} />
          </div>

          {/* Hai mốc này là điểm ĐẦU và điểm CUỐI của hành trình vận chuyển. Không
              gọi là "nhập cảnh / xuất cảnh" vì theo nghĩa hải quan thì hàng xuất
              cảnh trước rồi mới nhập cảnh - ngược thứ tự của hai ô này. */}
          <div data-field="entryDate">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ngày bắt đầu vận chuyển <span className="text-rose-600">*</span>
            </label>
            <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className={fieldClass('entryDate')} />
            <p className="mt-1 text-xs text-slate-400">Hàng rời điểm đi của chặng đầu tiên</p>
            <FieldError message={errorOf('entryDate')} />
          </div>

          <div data-field="exitDate">
            <label className="mb-1 block text-sm font-medium text-slate-700">Ngày kết thúc vận chuyển</label>
            <input type="date" value={exitDate} onChange={(event) => setExitDate(event.target.value)} className={fieldClass('exitDate')} />
            <p className="mt-1 text-xs text-slate-400">
              Hàng tới điểm đến của chặng cuối
              {transportDays != null && <span className="font-medium text-slate-500"> · {transportDays} ngày</span>}
            </p>
            <FieldError message={errorOf('exitDate')} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số hiệu chuyến (bay / tàu)</label>
            <input value={flightNo} onChange={(event) => setFlightNo(event.target.value)} placeholder="VN-418 / MV EVER GIVEN" className={cn(input, normal)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số hoá đơn thương mại</label>
            <input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="INV-2026-0001" className={cn(input, normal)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số vận đơn (B/L, AWB)</label>
            <input value={billOfLading} onChange={(event) => setBillOfLading(event.target.value)} placeholder="MAEU123456789" className={cn(input, normal)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số container</label>
            <input value={containerNo} onChange={(event) => setContainerNo(event.target.value)} placeholder="TCLU1234567" className={cn(input, normal)} />
          </div>
        </div>
      </Section>

      <Section icon={Building2} title="Bên xuất khẩu & bên nhập khẩu" description="Thông tin doanh nghiệp hai đầu giao dịch">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nhà xuất khẩu</p>
            <div data-field="exporterName">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Tên đơn vị <span className="text-rose-600">*</span>
              </label>
              <input
                value={exporterName}
                onChange={(event) => setExporterName(event.target.value)}
                list="company-names"
                placeholder="Chọn từ danh bạ hoặc nhập mới"
                className={fieldClass('exporterName')}
              />
              <FieldError message={errorOf('exporterName')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Quốc gia</label>
              <select value={exporterCountry} onChange={(event) => setExporterCountry(event.target.value)} className={cn(input, normal)}>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Địa chỉ</label>
              <input value={exporterAddress} onChange={(event) => setExporterAddress(event.target.value)} className={cn(input, normal)} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nhà nhập khẩu</p>
            <div data-field="importerName">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Tên đơn vị <span className="text-rose-600">*</span>
              </label>
              <input
                value={importerName}
                onChange={(event) => setImporterName(event.target.value)}
                list="company-names"
                placeholder="Chọn từ danh bạ hoặc nhập mới"
                className={fieldClass('importerName')}
              />
              <FieldError message={errorOf('importerName')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Quốc gia</label>
              <select value={importerCountry} onChange={(event) => setImporterCountry(event.target.value)} className={cn(input, normal)}>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.code})
                  </option>
                ))}
              </select>
              {/* Quốc gia nhập khẩu quyết định hàng có phải chịu thuế nhập khẩu hay
                  không: cùng nước với xuất xứ thì thuế nhập khẩu bằng 0. */}
              <p className="mt-1 text-xs text-slate-400">
                Quyết định thuế nhập khẩu của lô hàng — hiện đang áp {totals.importDutyRate}% (VAT {totals.vatRate}%)
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Địa chỉ</label>
              <input value={importerAddress} onChange={(event) => setImporterAddress(event.target.value)} className={cn(input, normal)} />
            </div>
          </div>
        </div>
      </Section>

      <Section
        icon={Route}
        title="Hành trình vận chuyển"
        description="Khai báo từng chặng theo đúng thứ tự di chuyển"
        action={
          journeys.length < 10 && (
            <button
              type="button"
              onClick={addJourney}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              <Plus className="h-4 w-4" /> Thêm chặng
            </button>
          )
        }
      >
        <div className="space-y-3">
          {journeys.map((leg, index) => (
            <div key={leg.legNumber} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  Chặng {index + 1}
                </span>
                {journeys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeJourney(leg.legNumber)}
                    className="inline-flex items-center gap-1 rounded p-1 text-xs text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" /> Xoá
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Phương thức</label>
                  <select
                    value={leg.transportType}
                    onChange={(event) => updateJourney(leg.legNumber, 'transportType', event.target.value as TransportType)}
                    className={cn(cell, normal)}
                  >
                    {(['SEA', 'AIR', 'ROAD', 'RAIL'] as const).map((type) => (
                      <option key={type} value={type}>
                        {msg.customs.transportTypes[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div data-field={`leg-${leg.legNumber}-origin`}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Điểm đi</label>
                  <input
                    value={leg.origin}
                    onChange={(event) => updateJourney(leg.legNumber, 'origin', event.target.value)}
                    list={`locations-${leg.transportType}`}
                    placeholder="Cảng / sân bay / cửa khẩu"
                    className={cellClass(`leg-${leg.legNumber}-origin`)}
                  />
                  <FieldError message={errorOf(`leg-${leg.legNumber}-origin`)} />
                </div>
                <div data-field={`leg-${leg.legNumber}-destination`}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Điểm đến</label>
                  <input
                    value={leg.destination}
                    onChange={(event) => updateJourney(leg.legNumber, 'destination', event.target.value)}
                    list={`locations-${leg.transportType}`}
                    placeholder="Cảng / sân bay / cửa khẩu"
                    className={cellClass(`leg-${leg.legNumber}-destination`)}
                  />
                  <FieldError message={errorOf(`leg-${leg.legNumber}-destination`)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {Object.entries(LOCATION_SUGGESTIONS).map(([type, places]) => (
          <datalist key={type} id={`locations-${type}`}>
            {places.map((place) => (
              <option key={place} value={place} />
            ))}
          </datalist>
        ))}
      </Section>

      <Section
        icon={Package}
        title={`Danh sách vật tư (${materials.length})`}
        description="Mã HS quyết định thuế suất của từng dòng hàng; trọng lượng quyết định phí vận chuyển"
        action={
          <div className="flex flex-wrap items-center gap-3">
            {/* Đồng tiền của đơn giá nằm ngay đây, cạnh ô đang gõ số tiền. Đổi
                đồng tiền thì đổi luôn nhãn cột "Đơn giá" bên dưới. */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Đơn giá theo
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 font-medium">
                {(['USD', 'VND'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCurrency(code)}
                    aria-pressed={currency === code}
                    className={cn(
                      'px-2.5 py-1 transition',
                      currency === code ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={addMaterial}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Thêm vật tư
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['STT', 'Mã HS', 'Mô tả hàng hoá *', 'Số lượng *', 'Đơn vị', `Đơn giá (${currency}) *`, 'Xuất xứ', 'Trọng lượng (kg)', 'Thuế suất', 'Thành tiền', ''].map((head) => (
                  <th key={head} className="px-2 py-2 text-left text-xs font-semibold text-slate-600">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((material, index) => {
                const line = totals.lines[index];
                const known = hsCodeByCode.get(normalizeHsCode(material.hsCode));
                return (
                  <tr key={index} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        value={material.hsCode}
                        onChange={(event) => applyHsCode(index, event.target.value)}
                        list="hs-codes"
                        placeholder="8471.30"
                        title="Chọn từ danh mục hoặc gõ mã mới - mã mới sẽ được tự thêm vào danh mục khi lưu"
                        className={cn(cell, normal, 'w-28 font-mono')}
                      />
                      {material.hsCode.trim() && (
                        <p className={cn('mt-1 text-[11px]', known ? 'text-emerald-600' : 'text-amber-600')}>
                          {known ? 'Đã có trong danh mục' : 'Mã mới → sẽ tự thêm vào danh mục'}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2" data-field={`material-${index}-description`}>
                      <input
                        value={material.description}
                        onChange={(event) => setMaterial(index, 'description', event.target.value)}
                        list="hs-descriptions"
                        placeholder="Tên hàng hoá"
                        className={cn(cellClass(`material-${index}-description`), 'w-56')}
                      />
                      <FieldError message={errorOf(`material-${index}-description`)} />
                    </td>
                    <td className="px-2 py-2" data-field={`material-${index}-quantity`}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={material.quantity}
                        onChange={(event) => setMaterial(index, 'quantity', Number(event.target.value))}
                        className={cn(cellClass(`material-${index}-quantity`), 'w-24 tabular-nums')}
                      />
                      <FieldError message={errorOf(`material-${index}-quantity`)} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={material.unit}
                        onChange={(event) => setMaterial(index, 'unit', event.target.value)}
                        className={cn(cell, normal, 'w-24')}
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unitLabel(unit)}
                          </option>
                        ))}
                        {/* Đơn vị đọc từ file có thể không nằm trong danh mục;
                            thiếu option này thì select rơi về giá trị đầu và làm
                            sai đơn vị đã khai. */}
                        {material.unit && !UNITS.includes(material.unit as any) && (
                          <option value={material.unit}>{unitLabel(material.unit)}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-2" data-field={`material-${index}-unitPrice`}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={material.unitPrice}
                        onChange={(event) => setMaterial(index, 'unitPrice', Number(event.target.value))}
                        className={cn(cellClass(`material-${index}-unitPrice`), 'w-28 tabular-nums')}
                      />
                      <FieldError message={errorOf(`material-${index}-unitPrice`)} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={material.origin}
                        onChange={(event) => setMaterial(index, 'origin', event.target.value)}
                        className={cn(cell, normal, 'w-32')}
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.flag} {country.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2" data-field={`material-${index}-weight`}>
                      {/* Trọng lượng là biến chính của phí vận chuyển, nên đây là
                          trường bắt buộc chứ không còn là ô tuỳ chọn: bỏ trống thì
                          hệ thống phải tính phí theo mức tối thiểu 1kg và con số
                          đó gần như luôn sai. */}
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={material.weight}
                        onChange={(event) => setMaterial(index, 'weight', event.target.value)}
                        placeholder="0"
                        className={cn(cellClass(`material-${index}-weight`), 'w-24 tabular-nums')}
                      />
                      <FieldError message={errorOf(`material-${index}-weight`)} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">
                      {line && (
                        <>
                          <span className="block">VAT {line.vatRate}%</span>
                          <span className="block">NK {line.dutyRate}%</span>
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap pt-4 text-right font-medium tabular-nums text-slate-900">
                      {formatMoney(line?.totalPrice ?? 0, currency)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeMaterial(index)}
                        disabled={materials.length <= 1}
                        title={materials.length <= 1 ? 'Tờ khai phải có ít nhất một vật tư' : 'Xoá vật tư'}
                        className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={Calculator}
        title="Tổng hợp tài chính"
        description="Toàn bộ thuế và phí do hệ thống tự tính từ hàng hoá đã khai"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          {/* Khối này chỉ còn Ghi chú: đồng tiền đã chuyển về cạnh ô đơn giá, còn
              thuế suất và phí thì không nhập tay nữa nên không có gì để điền. */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={8}
              placeholder="Lưu ý về hồ sơ, chứng từ kèm theo..."
              className={cn(input, normal, 'resize-y')}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <dl className="space-y-2.5 text-sm">
              {[
                { label: 'Trị giá hàng hoá', value: totals.totalValue },
                {
                  label: `Thuế nhập khẩu (${totals.importDutyRate}%)`,
                  value: totals.importDutyAmount,
                  hint: totals.importDutyRate === 0 ? 'Hàng cùng nước xuất xứ - không chịu thuế nhập khẩu' : undefined,
                },
                { label: `Thuế VAT (${totals.vatRate}%)`, value: totals.vatAmount, hint: 'Tính trên trị giá đã có thuế nhập khẩu' },
                {
                  label: 'Phí vận chuyển',
                  value: totals.shippingFee,
                  hint: `${totals.totalWeight.toLocaleString('vi-VN')} kg · ~${totals.distanceKm.toLocaleString('vi-VN')} km · ${msg.customs.transportTypes[(journeys[0]?.transportType ?? 'SEA') as TransportType]}`,
                },
              ].map((line) => (
                <div key={line.label} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-600">
                    {line.label}
                    {line.hint && <span className="block text-[11px] text-slate-400">{line.hint}</span>}
                  </dt>
                  <dd className="shrink-0 text-right">
                    <span className="font-medium tabular-nums text-slate-900">{formatMoney(line.value, currency)}</span>
                    <span className="block text-xs tabular-nums text-slate-500">
                      ≈ {formatMoney(convertMoney(line.value, currency, otherCurrency, exchangeRate), otherCurrency)}
                    </span>
                  </dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-3 border-t border-slate-300 pt-2.5">
                <dt className="font-semibold text-slate-900">Tổng thanh toán</dt>
                <dd className="text-right">
                  <span className="block text-lg font-semibold tabular-nums text-blue-700">{formatMoney(totals.totalPayable, currency)}</span>
                  {/* Đây là câu hỏi người dùng luôn phải tự tính bằng máy tính tay:
                      "USD này là bao nhiêu tiền Việt?". Hiện luôn cả hai đơn vị. */}
                  <span className="block text-xs tabular-nums text-slate-500">
                    ≈ {formatMoney(convertMoney(totals.totalPayable, currency, otherCurrency, exchangeRate), otherCurrency)}
                  </span>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Thuế suất tra theo mã HS và xuất xứ của từng dòng hàng; phí vận chuyển theo trọng lượng và tuyến{' '}
              {exporterCountry} → {importerCountry}. Tỷ giá quy đổi: 1 USD = {exchangeRate.toLocaleString('vi-VN')} ₫.
            </p>
          </div>
        </div>
      </Section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Thanh hành động dính đáy: form dài, không nên bắt cuộn xuống cuối mới lưu được */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Ship className="h-4 w-4" />
          {materials.length} vật tư · {journeys.length} chặng · {totals.totalWeight.toLocaleString('vi-VN')} kg ·{' '}
          <span className="font-medium text-slate-900">{formatMoney(totals.totalPayable, currency)}</span>
          <span className="text-slate-400">
            (≈ {formatMoney(convertMoney(totals.totalPayable, currency, otherCurrency, exchangeRate), otherCurrency)})
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(isEditing ? `/dashboard/customs/${recordId}` : '/dashboard/customs')}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Lưu tờ khai'}
          </button>
        </div>
      </div>
    </div>
  );
}
