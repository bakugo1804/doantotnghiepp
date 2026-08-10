'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useCreateCustoms } from '@/hooks/useCustoms';
import { useMessages } from '@/hooks/useMessages';
import { companiesApi, customsApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import {
  COUNTRIES,
  CURRENCIES,
  getVatRateByCountry,
  HS_CODE_SUGGESTIONS,
  LOCATION_SUGGESTIONS,
  UNITS,
} from '@/lib/reference-data';
import type { CreateJourneyDto, TransportType } from '@/types';

type MaterialRow = {
  itemNo: number;
  hsCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  origin: string;
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
});

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

export function CustomsForm() {
  const router = useRouter();
  const createCustoms = useCreateCustoms();
  const msg = useMessages();

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const [recordNo, setRecordNo] = useState('');
  const [recordNoTaken, setRecordNoTaken] = useState(false);
  const [checkingRecordNo, setCheckingRecordNo] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [exitDate, setExitDate] = useState('');
  const [currency, setCurrency] = useState('USD');

  const [exporterName, setExporterName] = useState('');
  const [exporterCountry, setExporterCountry] = useState('CN');
  const [exporterAddress, setExporterAddress] = useState('');
  const [importerName, setImporterName] = useState('');
  const [importerCountry, setImporterCountry] = useState('VN');
  const [importerAddress, setImporterAddress] = useState('');

  const [invoiceNo, setInvoiceNo] = useState('');
  const [billOfLading, setBillOfLading] = useState('');
  const [containerNo, setContainerNo] = useState('');
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

  useEffect(() => {
    const value = recordNo.trim();
    if (!value) {
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
  }, [recordNo]);

  // VAT bám theo nước nhập khẩu, giống hệt cách backend tính, nên con số xem
  // trước ở đây khớp với con số sẽ được lưu.
  const vatRate = getVatRateByCountry(importerCountry);

  const totals = useMemo(() => {
    const goodsValue = materials.reduce(
      (sum, material) => sum + (Number(material.quantity) || 0) * (Number(material.unitPrice) || 0),
      0,
    );
    const vatAmount = (goodsValue * vatRate) / 100;
    return { goodsValue, vatAmount, total: goodsValue + vatAmount };
  }, [materials, vatRate]);

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

    if (!entryDate) errors.entryDate = 'Bắt buộc chọn ngày nhập cảnh';
    if (exitDate && exitDate < entryDate) errors.exitDate = 'Ngày xuất cảnh không thể trước ngày nhập cảnh';

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

    createCustoms.mutate(
      {
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
        notes: notes.trim() || undefined,
        currency,
        materials: materials.map((material, index) => ({
          itemNo: index + 1,
          hsCode: material.hsCode.trim() || undefined,
          description: material.description.trim(),
          quantity: Number(material.quantity) || 0,
          unit: material.unit.trim() || 'cái',
          unitPrice: Number(material.unitPrice) || 0,
          origin: material.origin || undefined,
        })),
      } as any,
      {
        onSuccess: () => router.push('/dashboard/customs'),
        onError: (err: any) => setError(err?.response?.data?.message || msg.customs.form.errorCreate),
      },
    );
  };

  // Chỉ tô đỏ sau lần bấm gửi đầu tiên - bôi đỏ ngay khi form vừa mở thì rất khó chịu.
  const errorOf = (key: string) => (submitted ? fieldErrors[key] : undefined);
  const input = 'w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2';
  const normal = 'border-slate-300 focus:border-blue-500 focus:ring-blue-100';
  const invalid = 'border-rose-500 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-100';
  const fieldClass = (key: string) => cn(input, errorOf(key) ? invalid : normal);
  const cell = 'w-full rounded-lg border px-2 py-1.5 text-sm outline-none transition focus:ring-2';
  const cellClass = (key: string) => cn(cell, errorOf(key) ? invalid : normal);

  return (
    <div className="space-y-5 pb-28">
      <datalist id="company-names">
        {companyNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="hs-codes">
        {HS_CODE_SUGGESTIONS.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </datalist>

      <Section icon={FileText} title="Thông tin chung" description="Số tờ khai và thời gian thông quan">
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

          <div data-field="entryDate">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ngày nhập cảnh <span className="text-rose-600">*</span>
            </label>
            <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className={fieldClass('entryDate')} />
            <FieldError message={errorOf('entryDate')} />
          </div>

          <div data-field="exitDate">
            <label className="mb-1 block text-sm font-medium text-slate-700">Ngày xuất cảnh</label>
            <input type="date" value={exitDate} onChange={(event) => setExitDate(event.target.value)} className={fieldClass('exitDate')} />
            <FieldError message={errorOf('exitDate')} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
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
              <p className="mt-1 text-xs text-slate-400">Thuế suất VAT được áp theo quốc gia nhập khẩu: {vatRate}%</p>
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
        description="Mỗi dòng là một mặt hàng khai báo trên tờ khai"
        action={
          <button
            type="button"
            onClick={addMaterial}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Thêm vật tư
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['STT', 'Mã HS', 'Mô tả hàng hoá *', 'Số lượng *', 'Đơn vị', 'Đơn giá *', 'Xuất xứ', 'Thành tiền', ''].map((head) => (
                  <th key={head} className="px-2 py-2 text-left text-xs font-semibold text-slate-600">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((material, index) => {
                const lineTotal = (Number(material.quantity) || 0) * (Number(material.unitPrice) || 0);
                return (
                  <tr key={index} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        value={material.hsCode}
                        onChange={(event) => setMaterial(index, 'hsCode', event.target.value)}
                        list="hs-codes"
                        placeholder="8471.30"
                        className={cn(cell, normal, 'w-28 font-mono')}
                      />
                    </td>
                    <td className="px-2 py-2" data-field={`material-${index}-description`}>
                      <input
                        value={material.description}
                        onChange={(event) => setMaterial(index, 'description', event.target.value)}
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
                            {unit}
                          </option>
                        ))}
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
                    <td className="px-2 py-2 whitespace-nowrap pt-4 text-right font-medium tabular-nums text-slate-900">
                      {formatCurrency(lineTotal, currency)}
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

      <Section icon={Calculator} title="Tổng hợp tài chính" description="Số liệu tạm tính, hệ thống sẽ chốt lại khi lưu">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Đồng tiền thanh toán</label>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={cn(input, normal)}>
              {CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.symbol} {item.code} — {item.name}
                </option>
              ))}
            </select>

            <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Lưu ý về hồ sơ, chứng từ kèm theo..."
              className={cn(input, normal, 'resize-y')}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Trị giá hàng hoá</dt>
                <dd className="font-medium tabular-nums text-slate-900">{formatCurrency(totals.goodsValue, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Thuế VAT ({vatRate}%)</dt>
                <dd className="font-medium tabular-nums text-slate-900">{formatCurrency(totals.vatAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <dt>Phí vận chuyển</dt>
                <dd className="text-xs">Hệ thống tự tính theo tuyến</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-300 pt-2.5">
                <dt className="font-semibold text-slate-900">Tạm tính</dt>
                <dd className="text-lg font-semibold tabular-nums text-blue-700">
                  {formatCurrency(totals.total, currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Chưa gồm phí vận chuyển — khoản này được tính theo tuyến {exporterCountry} → {importerCountry} khi lưu.
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
          {materials.length} vật tư · {journeys.length} chặng ·{' '}
          <span className="font-medium text-slate-900">{formatCurrency(totals.total, currency)}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/dashboard/customs')}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={createCustoms.isPending}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {createCustoms.isPending ? 'Đang lưu...' : 'Lưu tờ khai'}
          </button>
        </div>
      </div>
    </div>
  );
}
