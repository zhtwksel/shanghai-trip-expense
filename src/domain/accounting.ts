export const names = ['이사장', '센터장', '김재영', '강병우', '박재득', '화현경'] as const;
export type Person = typeof names[number];
export type Expense = { id: string; phase: 'before' | 'during'; payer: Person; amount: string; currency: 'KRW' | 'CNY'; rate: string; krw: number; description: string; date: string; memo: string };
export type Transfer = { id: string; person: Person; krw: number; date: string; memo: string };
export type Adjustment = Transfer;
export type State = { version: 1; trip: { name: string; start: string; end: string }; people: Record<Person, { initial: number; allocated: number }>; rate: string; threshold: number; expenses: Expense[]; transfers: Transfer[]; adjustments: Adjustment[] };
export function emptyState(): State { return { version: 1, trip: { name: '상하이 국외출장', start: '', end: '' }, people: Object.fromEntries(names.map(n => [n, { initial: 0, allocated: 0 }])) as State['people'], rate: '205', threshold: 200000, expenses: [], transfers: [], adjustments: [] }; }
function decimal(value: string, places: number): bigint {
  if (typeof value !== 'string' || !(places === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`)).test(value) || value.length > 18) throw new Error(`금액/환율은 소수 ${places}자리 이내의 양수로 입력하세요.`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
export function money(value: string): number { const n = decimal(value, 0); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('금액이 너무 큽니다.'); return Number(n); }
export function convert(amount: string, currency: 'KRW' | 'CNY', rate: string): number {
  const result = currency === 'KRW' ? decimal(amount, 0) : (decimal(amount, 2) * decimal(rate, 4) + 500000n) / 1000000n;
  if (result <= 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('환산금액은 1원 이상이어야 하며 안전한 정수 범위여야 합니다.');
  return Number(result);
}
const sum = (xs: number[]) => { const n = xs.reduce((a, b) => a + b, 0); if (!Number.isSafeInteger(n)) throw new Error('합계가 안전한 금액 범위를 초과했습니다.'); return n; };
export function calculate(s: State) {
  const initial = sum(names.map(n => s.people[n].initial));
  const before = sum(s.expenses.filter(e => e.phase === 'before').map(e => e.krw));
  const during = sum(s.expenses.filter(e => e.phase === 'during').map(e => e.krw));
  const allocated = sum(names.map(n => s.people[n].allocated));
  const transferred = sum(s.transfers.map(t => t.krw));
  const people = names.map(name => {
    const extra = sum(s.transfers.filter(t => t.person === name).map(t => t.krw));
    const spent = sum(s.expenses.filter(e => e.phase === 'during' && e.payer === name).map(e => e.krw));
    const adjustment = sum(s.adjustments.filter(a => a.person === name).map(a => a.krw));
    return { name, ...s.people[name], extra, spent, adjustment, balance: sum([s.people[name].allocated, extra, -spent, adjustment]) };
  });
  const departure = sum([initial, -before]);
  const pool = sum([departure, -allocated, -transferred]);
  const personal = sum(people.map(p => p.balance));
  const total = sum([personal, pool]);
  const expected = sum([initial, -before, -during]);
  return { initial, before, during, allocated, transferred, departure, pool, people, personal, total, expected, difference: sum([total, -expected]) };
}
export function putExpense(s: State, expense: Expense): State {
  if (!names.includes(expense.payer) || !expense.description.trim() || !expense.date) throw new Error('결제자, 사용내용, 날짜를 입력하세요.');
  const normalized = { ...expense, description: expense.description.trim(), krw: convert(expense.amount, expense.currency, expense.rate) };
  const next = { ...s, expenses: [...s.expenses.filter(e => e.id !== expense.id), normalized] }; calculate(next); return next;
}
export function deleteExpense(s: State, id: string): State { return { ...s, expenses: s.expenses.filter(e => e.id !== id) }; }
export function addTransfer(s: State, transfer: Transfer): State {
  if (!names.includes(transfer.person) || !Number.isSafeInteger(transfer.krw) || transfer.krw <= 0) throw new Error('추가 지급액은 양의 정수여야 합니다.');
  if (calculate(s).pool < transfer.krw) throw new Error('미배분 공통 보유금이 부족합니다.');
  return { ...s, transfers: [...s.transfers, transfer] };
}
export function setBalance(s: State, person: Person, balance: number, id: string, date: string, memo: string): State {
  if (!Number.isSafeInteger(balance) || balance < 0 || !memo.trim()) throw new Error('현재잔액과 수정 사유를 입력하세요.');
  const current = calculate(s).people.find(p => p.name === person)!.balance;
  return { ...s, adjustments: [...s.adjustments, { id, person, krw: balance - current, date, memo }] };
}
export function validateState(value: unknown): State {
  const s = value as State;
  if (!s || s.version !== 1 || !s.people || !s.trip || typeof s.trip.name !== 'string' || typeof s.trip.start !== 'string' || typeof s.trip.end !== 'string') throw new Error('지원하지 않는 데이터입니다.');
  if (decimal(s.rate, 4) <= 0 || !Number.isSafeInteger(s.threshold) || s.threshold < 0) throw new Error('설정 데이터가 올바르지 않습니다.');
  for (const name of names) for (const key of ['initial', 'allocated'] as const) if (!Number.isSafeInteger(s.people[name]?.[key]) || s.people[name][key] < 0) throw new Error('개인 금액이 올바르지 않습니다.');
  if (![s.expenses, s.transfers, s.adjustments].every(Array.isArray)) throw new Error('거래 데이터가 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const e of [...s.expenses, ...s.transfers, ...s.adjustments]) {
    if (typeof e.id !== 'string' || !e.id || ids.has(e.id) || typeof e.date !== 'string' || !Number.isFinite(Date.parse(e.date)) || typeof e.memo !== 'string') throw new Error('거래 식별자 또는 날짜가 올바르지 않습니다.'); ids.add(e.id);
  }
  for (const e of s.expenses) if (!names.includes(e.payer) || !['before', 'during'].includes(e.phase) || !['KRW', 'CNY'].includes(e.currency) || !e.description?.trim() || convert(e.amount, e.currency, e.rate) !== e.krw) throw new Error('지출 데이터가 올바르지 않습니다.');
  for (const t of [...s.transfers, ...s.adjustments]) if (!names.includes(t.person) || !Number.isSafeInteger(t.krw)) throw new Error('잔액 거래가 올바르지 않습니다.');
  for (const t of s.transfers) if (t.krw <= 0) throw new Error('추가 지급 데이터가 올바르지 않습니다.');
  calculate(s); return s;
}
