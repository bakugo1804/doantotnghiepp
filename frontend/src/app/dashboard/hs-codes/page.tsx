'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Barcode, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useCreateHsCode, useDeleteHsCode, useHsCodes, useUpdateHsCode } from '@/hooks/useHsCodes';
import { UNITS, unitLabel } from '@/lib/reference-data';
import { getVatRateByHsCode, isValidHsCode, normalizeHsCode } from '@/lib/tax-rules';
import type { HsCode } from '@/types';

type FormState = { code: string; description: string; defaultUnit: string; vatRate: string; notes: string };

const emptyForm: FormState = { code: '', description: '', defaultUnit: '', vatRate: '', notes: '' };

/**
 * Danh mục mã HS của doanh nghiệp.
 *
 * Mã HS quyết định thuế suất của từng dòng hàng trên tờ khai, nên nó là dữ liệu
 * nghiệp vụ chứ không phải gợi ý cho vui. Trang này để nhân viên quản lý danh mục
 * đó; ngoài ra mọi mã mới khai trên tờ khai đều tự chảy về đây.
 */
export default function HsCodesPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canEdit = role === 'ADMIN' || role === 'DIRECTOR' || role === 'STAFF';
  const canDelete = role === 'ADMIN' || role === 'DIRECTOR';

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<HsCode | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [onlyAuto, setOnlyAuto] = useState(false);

  const { data: hsCodes = [], isLoading } = useHsCodes(deferredSearch);
  const createHsCode = useCreateHsCode();
  const updateHsCode = useUpdateHsCode();
  const deleteHsCode = useDeleteHsCode();

  const rows = useMemo(() => (onlyAuto ? hsCodes.filter((item) => item.autoCreated) : hsCodes), [hsCodes, onlyAuto]);
  const autoCount = useMemo(() => hsCodes.filter((item) => item.autoCreated).length, [hsCodes]);

  const toPayload = (form: FormState) => ({
    code: normalizeHsCode(form.code),
    description: form.description.trim(),
    defaultUnit: form.defaultUnit || null,
    // Để trống nghĩa là "suy theo chương mã HS", khác hẳn với việc ấn định 0%.
    vatRate: form.vatRate.trim() === '' ? null : Number(form.vatRate),
    notes: form.notes.trim() || null,
  });

  const openEdit = (item: HsCode) => {
    setEditing(item);
    setEditForm({
      code: item.code,
      description: item.description,
      defaultUnit: item.defaultUnit || '',
      vatRate: item.vatRate == null ? '' : String(item.vatRate),
      notes: item.notes || '',
    });
  };

  const handleDelete = (item: HsCode) => {
    if (!window.confirm(`Xoá mã HS ${item.code} — ${item.description}?`)) return;
    deleteHsCode.mutate(item.id);
  };

  const createValid = isValidHsCode(createForm.code) && createForm.description.trim().length > 0;
  const editValid = isValidHsCode(editForm.code) && editForm.description.trim().length > 0;

  const errorMessage = (error: unknown) => {
    const detail = (error as any)?.response?.data?.message;
    return Array.isArray(detail) ? detail[0] : detail;
  };

  const field = 'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Danh mục mã HS</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mã HS quyết định thuế suất VAT và thuế nhập khẩu của từng dòng hàng. Mã mới khai trên tờ khai sẽ tự được
          thêm vào đây để lần sau chọn lại.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tổng số mã', value: hsCodes.length },
          { label: 'Tự sinh từ tờ khai', value: autoCount },
          { label: 'Đã dùng trên tờ khai', value: hsCodes.filter((item) => item.usageCount > 0).length },
          { label: 'Có thuế suất riêng', value: hsCodes.filter((item) => item.vatRate != null).length },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Plus className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-gray-900">Thêm mã HS</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <input
                value={createForm.code}
                onChange={(event) => setCreateForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="Mã HS (vd 8471.30)"
                className={`${field} font-mono`}
              />
              {createForm.code.trim() && !isValidHsCode(createForm.code) && (
                <p className="mt-1 text-xs text-rose-600">Mã HS phải có 4-10 chữ số</p>
              )}
              {isValidHsCode(createForm.code) && createForm.vatRate.trim() === '' && (
                <p className="mt-1 text-xs text-slate-400">Suy theo chương: VAT {getVatRateByHsCode(createForm.code)}%</p>
              )}
            </div>
            <input
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Tên hàng hoá"
              className={`${field} xl:col-span-2`}
            />
            <select
              value={createForm.defaultUnit}
              onChange={(event) => setCreateForm((current) => ({ ...current, defaultUnit: event.target.value }))}
              className={field}
            >
              <option value="">Đơn vị mặc định —</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>{unitLabel(unit)}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={createForm.vatRate}
              onChange={(event) => setCreateForm((current) => ({ ...current, vatRate: event.target.value }))}
              placeholder="VAT % (để trống = tự suy)"
              className={`${field} tabular-nums`}
            />
            <textarea
              value={createForm.notes}
              onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Ghi chú"
              rows={2}
              className={`${field} xl:col-span-5`}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => createHsCode.mutate(toPayload(createForm), { onSuccess: () => setCreateForm(emptyForm) })}
              disabled={createHsCode.isPending || !createValid}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Lưu mã HS
            </button>
            {createHsCode.isError && <p className="text-sm text-rose-600">{errorMessage(createHsCode.error) || 'Không thể thêm mã HS.'}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã hoặc tên hàng hoá..."
            className="w-full rounded-2xl border border-gray-300 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={onlyAuto} onChange={(event) => setOnlyAuto(event.target.checked)} />
          Chỉ mã tự sinh cần rà lại
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {['Mã HS', 'Tên hàng hoá', 'Đơn vị', 'VAT', 'Đang dùng', 'Ghi chú', ''].map((head) => (
                <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Đang tải danh mục...</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  {search ? 'Không có mã HS nào khớp với từ khoá.' : 'Danh mục còn trống. Thêm mã đầu tiên ở khung phía trên.'}
                </td>
              </tr>
            ) : rows.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 transition hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-mono font-medium text-blue-700">
                    <Barcode className="h-4 w-4 text-gray-400" />
                    {item.code}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800">
                  {item.description}
                  {/* Mã tự sinh từ tờ khai chưa được ai kiểm lại, nên phải nhìn ra
                      ngay để rà soát chứ không lẫn vào danh mục đã duyệt. */}
                  {item.autoCreated && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Sparkles className="h-3 w-3" /> tự sinh
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{item.defaultUnit ? unitLabel(item.defaultUnit) : '—'}</td>
                <td className="px-4 py-3 tabular-nums text-gray-800">
                  {item.effectiveVatRate}%
                  {item.vatRate == null && <span className="block text-xs text-gray-400">tự suy</span>}
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600">{item.usageCount} dòng hàng</td>
                <td className="px-4 py-3 text-gray-500">{item.notes || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <button onClick={() => openEdit(item)} className="rounded-lg bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200" title="Sửa">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={item.usageCount > 0}
                        title={item.usageCount > 0 ? 'Đang được dùng trên tờ khai, không thể xoá' : 'Xoá'}
                        className="rounded-lg bg-rose-100 p-2 text-rose-700 transition hover:bg-rose-200 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteHsCode.isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage(deleteHsCode.error) || 'Không thể xoá mã HS này.'}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Sửa mã HS</h3>
              <button onClick={() => setEditing(null)} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mã HS</label>
                <input
                  value={editForm.code}
                  onChange={(event) => setEditForm((current) => ({ ...current, code: event.target.value }))}
                  className={`${field} font-mono`}
                />
                {editing.usageCount > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Đổi mã sẽ cập nhật luôn {editing.usageCount} dòng hàng đang dùng mã cũ.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tên hàng hoá</label>
                <input
                  value={editForm.description}
                  onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                  className={field}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Đơn vị mặc định</label>
                <select
                  value={editForm.defaultUnit}
                  onChange={(event) => setEditForm((current) => ({ ...current, defaultUnit: event.target.value }))}
                  className={field}
                >
                  <option value="">—</option>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unitLabel(unit)}</option>
                  ))}
                  {editForm.defaultUnit && !UNITS.includes(editForm.defaultUnit as any) && (
                    <option value={editForm.defaultUnit}>{unitLabel(editForm.defaultUnit)}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Thuế suất VAT (%) — để trống là tự suy theo chương
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={editForm.vatRate}
                  onChange={(event) => setEditForm((current) => ({ ...current, vatRate: event.target.value }))}
                  placeholder={String(getVatRateByHsCode(editForm.code))}
                  className={`${field} tabular-nums`}
                />
              </div>
              <textarea
                value={editForm.notes}
                onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Ghi chú"
                rows={3}
                className={`${field} md:col-span-2`}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() =>
                  updateHsCode.mutate(
                    { id: editing.id, data: toPayload(editForm) },
                    { onSuccess: () => setEditing(null) },
                  )
                }
                disabled={updateHsCode.isPending || !editValid}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                Lưu thay đổi
              </button>
              <button onClick={() => setEditing(null)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
                Hủy
              </button>
              {updateHsCode.isError && <p className="text-sm text-rose-600">{errorMessage(updateHsCode.error) || 'Không thể cập nhật.'}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
