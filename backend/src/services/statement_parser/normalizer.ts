export interface NormalizedDateValue {
  date: string | null;
  time: string | null;
  confidence: number;
  issue?: string;
}

export function normalizeStatementDate(value: string): NormalizedDateValue {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = iso;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}` ||
      Number(hour) > 23 ||
      Number(minute) > 59 ||
      Number(second) > 59
    ) {
      return { date: null, time: null, confidence: 0, issue: 'Date or time is invalid.' };
    }
    return {
      date: `${year}-${month}-${day}`,
      time: iso[4] ? `${hour}:${minute}:${second}` : null,
      confidence: 1,
    };
  }

  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!numeric) {
    return { date: null, time: null, confidence: 0, issue: 'Date is missing or uses an unsupported format.' };
  }
  const [, firstText, secondText, year, hour = '00', minute = '00', second = '00'] = numeric;
  const first = Number(firstText);
  const secondPart = Number(secondText);
  let day: number;
  let month: number;
  if (first > 12) {
    day = first;
    month = secondPart;
  } else if (secondPart > 12) {
    month = first;
    day = secondPart;
  } else {
    return {
      date: null,
      time: null,
      confidence: 0,
      issue: 'Date order is ambiguous; use YYYY-MM-DD or an unambiguous date.',
    };
  }

  const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(Date.UTC(Number(year), month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== normalizedDate) {
    return { date: null, time: null, confidence: 0, issue: 'Date is invalid.' };
  }
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    return { date: null, time: null, confidence: 0, issue: 'Time is invalid.' };
  }
  return {
    date: normalizedDate,
    time: numeric[4] ? `${String(Number(hour)).padStart(2, '0')}:${minute}:${second}` : null,
    confidence: 0.9,
  };
}

export function normalizeStatementAmount(value: string): string | null {
  const cleaned = value.replace(/[₹$€£]/g, '').replace(/\bINR\b|\bRs\.?\s*/gi, '').trim();
  if (!cleaned) return null;
  const unsigned = cleaned.replace(/^[+-]/, '').replace(/^\((.*)\)$/, '$1').trim();
  const validGrouping =
    /^\d+(?:\.\d{1,2})?$/.test(unsigned) ||
    /^\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(unsigned);
  if (!validGrouping) return null;
  const parsed = unsigned.replace(/,/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(parsed)) return null;
  if (/^0(?:\.0{1,2})?$/.test(parsed)) return '0';
  return cleaned.startsWith('(') || cleaned.startsWith('-') ? `-${parsed}` : parsed;
}
