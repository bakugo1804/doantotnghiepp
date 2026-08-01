'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateCustoms } from '@/hooks/useCustoms';
import { useMessages } from '@/hooks/useMessages';
import { customsApi } from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import type { CreateJourneyDto, TransportType } from '@/types';

type MaterialRow = { itemNo: number; hsCode?: string; description: string; quantity: number; unit: string; unitPrice: number; origin?: string };

export function CustomsForm() {
  const router = useRouter();
  const createCustoms = useCreateCustoms();
  const msg = useMessages();
  const [error, setError] = useState('');
  const [recordNo, setRecordNo] = useState('');
  const [recordNoTaken, setRecordNoTaken] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [exporterName, setExporterName] = useState('');
  const [importerName, setImporterName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [journeys, setJourneys] = useState<CreateJourneyDto[]>([
    { legNumber: 1, transportType: 'ROAD', origin: '', destination: '' },
  ]);
  const [materials, setMaterials] = useState<MaterialRow[]>([
    { itemNo: 1, hsCode: '', description: '', quantity: 1, unit: 'kg', unitPrice: 0, origin: '' },
  ]);

  useEffect(() => {
    const value = recordNo.trim();
    if (!value) { setRecordNoTaken(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await customsApi.checkRecordNo(value);
        setRecordNoTaken(!res.data.available);
      } catch { setRecordNoTaken(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [recordNo]);

  const updateJourney = (legNumber: number, field: keyof CreateJourneyDto, value: string | number | TransportType) => {
    setJourneys((current) => current.map((j) => (j.legNumber === legNumber ? { ...j, [field]: value } : j)));
  };
  const addJourney = () => {
    if (journeys.length < 10) {
      const next = Math.max(...journeys.map((j) => j.legNumber), 0) + 1;
      setJourneys((current) => [...current, { legNumber: next, transportType: 'ROAD', origin: '', destination: '' }]);
    }
  };
  const removeJourney = (legNumber: number) => {
    if (journeys.length > 1) setJourneys((current) => current.filter((j) => j.legNumber !== legNumber));
  };

  const setMaterial = (index: number, key: keyof MaterialRow, value: any) => {
    setMaterials((current) => current.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  };
  const addMaterial = () => setMaterials((current) => [...current, { itemNo: current.length + 1, hsCode: '', description: '', quantity: 1, unit: 'kg', unitPrice: 0, origin: '' }]);
  const removeMaterial = (index: number) => setMaterials((current) => current.filter((_, i) => i !== index).map((m, i) => ({ ...m, itemNo: i + 1 })));

  const submit = () => {
    setError('');
    if (!journeys.every((j) => j.origin && j.destination)) { setError(msg.customs.form.errorCreateLeg); return; }
    if (!exporterName || !importerName || materials.some((m) => !m.description.trim())) { setError(msg.customs.form.errorRequired); return; }
    if (recordNoTaken) { setError('Số tờ khai đã tồn tại. Vui lòng nhập số khác hoặc để trống để hệ thống tự sinh.'); return; }

    const submitData: any = {
      entryDate,
      transportType: journeys[0]?.transportType || 'ROAD',
      journeys,
      leg1Origin: journeys[0]?.origin || '',
      leg1Destination: journeys[0]?.destination || '',
      leg2Origin: journeys[1]?.origin,
      leg2Destination: journeys[1]?.destination,
      exporterName,
      importerName,
      currency,
      materials: materials.map((m, i) => ({
        itemNo: i + 1,
        hsCode: m.hsCode?.trim() || undefined,
        description: m.description.trim(),
        quantity: Number(m.quantity) || 0,
        unit: m.unit?.trim() || 'cái',
        unitPrice: Number(m.unitPrice) || 0,
        origin: m.origin?.trim() || undefined,
      })),
    };
    if (recordNo.trim()) submitData.recordNo = recordNo.trim();

    createCustoms.mutate(submitData, {
      onSuccess: () => router.push('/dashboard/customs'),
      onError: (err: any) => setError(err?.response?.data?.message || msg.customs.form.errorCreate),
    });
  };

  const cell = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const bigInput = 'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Số tờ khai (để trống = tự sinh)</label>
          <input value={recordNo} onChange={(e) => setRecordNo(e.target.value)} placeholder="VD: TK2026-001"
            className={`${bigInput} ${recordNoTaken ? 'border-red-500 ring-2 ring-red-100' : ''}`} />
          {recordNoTaken && <p className="text-red-600 text-xs mt-1">⚠ Số tờ khai đã tồn tại, vui lòng nhập số khác.</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{msg.customs.form.entryDate}</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={bigInput} />
        </div>
      </div>

      {/* Hành trình */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">{msg.customs.form.legsInfo}</p>
          {journeys.length < 10 && (
            <button type="button" onClick={addJourney} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700">
              <Plus className="h-4 w-4" /> {msg.customs.form.addLeg}
            </button>
          )}
        </div>
        <div className="space-y-4">
          {journeys.map((journey) => (
            <div key={journey.legNumber} className="rounded-lg border border-gray-300 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{msg.customs.form.legLabel.replace('{index}', String(journey.legNumber))}</p>
                {journeys.length > 1 && (
                  <button type="button" onClick={() => removeJourney(journey.legNumber)} className="inline-flex items-center gap-1 rounded text-xs text-red-600 transition hover:bg-red-50 p-1">
                    <Trash2 className="h-4 w-4" /> {msg.customs.form.removeLeg}
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{msg.customs.form.legTransport}</label>
                  <select value={journey.transportType} onChange={(e) => updateJourney(journey.legNumber, 'transportType', e.target.value as TransportType)} className={cell}>
                    {(['AIR', 'SEA', 'RAIL', 'ROAD'] as const).map((type) => (
                      <option key={type} value={type}>{msg.customs.transportTypes[type]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{msg.customs.form.legOrigin}</label>
                  <input value={journey.origin} onChange={(e) => updateJourney(journey.legNumber, 'origin', e.target.value)} placeholder={msg.customs.form.legOrigin} className={cell} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{msg.customs.form.legDestination}</label>
                  <input value={journey.destination} onChange={(e) => updateJourney(journey.legNumber, 'destination', e.target.value)} placeholder={msg.customs.form.legDestination} className={cell} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{msg.customs.form.exporterName}</label>
          <input value={exporterName} onChange={(e) => setExporterName(e.target.value)} className={bigInput} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{msg.customs.form.importerName}</label>
          <input value={importerName} onChange={(e) => setImporterName(e.target.value)} className={bigInput} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tiền tệ</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={bigInput}>
            <option value="USD">USD</option>
            <option value="VND">VND</option>
          </select>
        </div>
      </div>

      {/* Vật tư (nhiều dòng) */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">{msg.customs.form.materialInfo} ({materials.length} dòng)</p>
          <button type="button" onClick={addMaterial} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Thêm dòng
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white">
                {['STT', 'Mã HS', 'Mô tả hàng hóa', 'Số lượng', 'ĐV', 'Đơn giá', 'Xuất xứ', ''].map((h) => (
                  <th key={h} className="text-left px-2 py-2 text-xs font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1.5"><input value={m.hsCode} onChange={(e) => setMaterial(i, 'hsCode', e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5"><input value={m.description} onChange={(e) => setMaterial(i, 'description', e.target.value)} className="w-56 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" value={m.quantity} onChange={(e) => setMaterial(i, 'quantity', Number(e.target.value))} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5"><input value={m.unit} onChange={(e) => setMaterial(i, 'unit', e.target.value)} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" value={m.unitPrice} onChange={(e) => setMaterial(i, 'unitPrice', Number(e.target.value))} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5"><input value={m.origin} onChange={(e) => setMaterial(i, 'origin', e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => removeMaterial(i)} disabled={materials.length <= 1} className="rounded p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30" title="Xóa dòng">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="mt-5 flex gap-3">
        <button onClick={submit} disabled={createCustoms.isPending || recordNoTaken} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
          {createCustoms.isPending ? msg.customs.form.submitPending : msg.customs.form.submit}
        </button>
        <button onClick={() => router.push('/dashboard/customs')} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
          {msg.customs.form.cancel}
        </button>
      </div>
    </div>
  );
}
