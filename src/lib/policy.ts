/** Cancellation / refund policy of a pitch, as shown to players and owners. */
import type { Pitch } from '@/data/types';
import { fromISODate } from '@/i18n/format';

export function cancelInfo(p: Pick<Pitch, 'cancelHours' | 'lateRefundPct'>, b: { dateISO: string; hour: number }, now = Date.now()) {
  const hours = p.cancelHours ?? 6;
  const refundPct = p.lateRefundPct ?? 0;
  const start = fromISODate(b.dateISO).getTime() + b.hour * 3600000;
  return { hours, refundPct, late: start - now < hours * 3600000, deadline: start - hours * 3600000 };
}
