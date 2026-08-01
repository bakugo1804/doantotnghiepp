'use client';

import { useMessages } from './useMessages';

export function useStatusLabels() {
  const msg = useMessages();

  return {
    DRAFT: { label: msg.customs.statuses.DRAFT, color: 'bg-slate-100 text-slate-700' },
    SUBMITTED: { label: msg.customs.statuses.SUBMITTED, color: 'bg-blue-100 text-blue-700' },
    PROCESSING: { label: msg.customs.statuses.PROCESSING, color: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: msg.customs.statuses.APPROVED, color: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: msg.customs.statuses.REJECTED, color: 'bg-rose-100 text-rose-700' },
    COMPLETED: { label: msg.customs.statuses.COMPLETED, color: 'bg-teal-100 text-teal-700' },
  } as const;
}

export function useTransportLabels() {
  const msg = useMessages();

  return {
    AIR: msg.customs.transportTypes.AIR,
    SEA: msg.customs.transportTypes.SEA,
    RAIL: msg.customs.transportTypes.RAIL,
    ROAD: msg.customs.transportTypes.ROAD,
  } as const;
}
