import {
  ComparisonRow,
  EvaluationDocument,
  SplitRun,
  StrategyReport,
  TradeRow,
} from '../../shared/models/bot-api.model';

export type SplitKey = 'train' | 'walkForward' | 'holdout';

export interface MonthlyBar {
  month: string;
  is: number;
  oos: number;
}

export interface ComparisonViewRow {
  id: string;
  leftFloor: string;
  rightFloor: string;
  delta: ComparisonRow['delta'];
  label: string;
  reasons: string[];
}

export function evaluationModeOf(doc: EvaluationDocument | null | undefined): 'develop' | 'confirm' {
  const mode = (doc?.evaluation?.mode || 'develop').toString().toLowerCase();
  return mode === 'confirm' ? 'confirm' : 'develop';
}

export function formatNumber(value: number | undefined | null, digits: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function gradeOf(row: StrategyReport | undefined, key: string): string {
  return row?.grades?.[key] ?? '—';
}

export function gradedOf(
  row: StrategyReport,
  key: string,
  value: number | undefined | null,
  digits: number,
): string {
  const letter = gradeOf(row, key);
  if (value === undefined || value === null || Number.isNaN(value)) {
    return letter === '—' ? '—' : `${letter} —`;
  }
  return `${letter} ${value.toFixed(digits)}`;
}

export function exitCountOf(row: StrategyReport, reason: string): number {
  return row.exits?.[reason] ?? 0;
}

export function formatRunHeader(name: string, run: SplitRun | undefined): string {
  if (!run) return name;
  let ended = run.endedBecause || '?';
  if (run.error) ended = `${ended}: ${run.error}`;
  const days = run.days == null ? '-' : `${run.days.toFixed(0)} d`;
  return [
    name,
    run.profile || '',
    `${run.symbol || ''} ${run.interval || ''}`.trim(),
    `${run.firstBar || '-'} -> ${run.lastBar || '-'}`,
    days,
    `N=${run.trials ?? '?'}`,
    ended,
  ]
    .filter((part) => part.length > 0)
    .join('  ');
}

export function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}

export function orderedStrategyIds(doc: EvaluationDocument): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  if (evaluationModeOf(doc) === 'confirm') {
    for (const row of doc.holdout?.strategies ?? []) push(row.id);
  } else {
    for (const row of doc.train?.strategies ?? []) push(row.id);
    for (const row of doc.walkForward?.strategies ?? []) push(row.id);
  }
  for (const row of doc.comparison ?? []) push(row.id);
  for (const row of doc.verdicts ?? []) push(row.id);
  return ids;
}

export function strategyOptions(doc: EvaluationDocument): string[] {
  return ['all', ...orderedStrategyIds(doc).sort()];
}

export function splitStrategies(doc: EvaluationDocument, split: SplitKey): StrategyReport[] {
  return doc[split]?.strategies ?? [];
}

export function filterByStrategy<T extends { id: string }>(rows: T[], strategyId: string): T[] {
  if (strategyId === 'all') return rows;
  return rows.filter((row) => row.id === strategyId);
}

export function buildComparisonRows(
  doc: EvaluationDocument,
  strategyId: string,
): ComparisonViewRow[] {
  const comparisons = indexById(doc.comparison ?? []);
  const verdicts = indexById(doc.verdicts ?? []);
  let ids = orderedStrategyIds(doc);
  if (strategyId !== 'all') {
    ids = ids.filter((id) => id === strategyId);
  }
  const confirm = evaluationModeOf(doc) === 'confirm';
  return ids.map((id) => {
    const cmp = comparisons.get(id);
    const verdict = verdicts.get(id);
    return {
      id,
      leftFloor: confirm ? (cmp?.oosFloor ?? '—') : (cmp?.trainFloor ?? '—'),
      rightFloor: confirm ? (cmp?.holdoutFloor ?? '—') : (cmp?.oosFloor ?? '—'),
      delta: cmp?.delta,
      label: verdict?.label ?? '—',
      reasons: verdict?.reasons ?? [],
    };
  });
}

export function collectTrades(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const strategy of splitStrategies(doc, split)) {
    if (strategyId !== 'all' && strategy.id !== strategyId) {
      continue;
    }
    for (const trade of strategy.trades ?? []) {
      rows.push({ ...trade, strategyId: trade.strategyId ?? strategy.id });
    }
  }
  return rows;
}

export function buildMonthlyBars(
  doc: EvaluationDocument,
  strategyId: string,
): MonthlyBar[] {
  const map = new Map<string, MonthlyBar>();
  const add = (split: SplitKey, key: 'is' | 'oos') => {
    for (const strategy of splitStrategies(doc, split)) {
      if (strategyId !== 'all' && strategy.id !== strategyId) continue;
      for (const trade of strategy.trades ?? []) {
        if (!trade.exitTime) continue;
        const month = trade.exitTime.slice(0, 7);
        const row = map.get(month) ?? { month, is: 0, oos: 0 };
        row[key] += trade.netPnl ?? 0;
        map.set(month, row);
      }
    }
  };
  if (evaluationModeOf(doc) === 'confirm') {
    add('holdout', 'oos');
  } else {
    add('train', 'is');
    add('walkForward', 'oos');
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}
