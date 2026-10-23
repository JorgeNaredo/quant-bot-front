import {
  ComparisonRow,
  EvaluationDocument,
  SplitRun,
  StrategyReport,
  TradeRow,
} from '../../shared/models/bot-api.model';

export type SplitKey = 'train' | 'walkForward' | 'oos' | 'holdout';
export type EvaluationMode = 'develop' | 'confirm';
export type ComparativeSort = 'verdict' | 'rightDsr' | 'deltaDsr' | 'id';

type MetricKey =
  | 'deflatedSharpe'
  | 'expectancyR'
  | 'profitFactor'
  | 'closedTrades'
  | 'returnPct'
  | 'maxDrawdownPct';

export interface MonthlyBar {
  month: string;
  left: number;
  right: number;
}

export interface ComparisonSides {
  mode: EvaluationMode;
  left: SplitKey;
  right: SplitKey;
  leftLabel: string;
  rightLabel: string;
  leftFullLabel: string;
  rightFullLabel: string;
  deltaLabel: string;
}

export interface ComparativeDelta {
  deflatedSharpe?: number;
  expectancyR?: number;
  profitFactor?: number;
  closedTrades?: number;
  returnPct?: number;
  maxDrawdownPct?: number;
  finalEquity?: number;
}

export interface ComparativeRow {
  id: string;
  left: StrategyReport | null;
  right: StrategyReport | null;
  leftFloor: string;
  rightFloor: string;
  delta: ComparativeDelta;
  label: string;
  reasons: string[];
}

export interface WinnerKpi {
  id: string;
  floor: string;
  deflatedSharpe: number;
  expectancyR?: number;
  returnPct?: number;
  closedTrades?: number;
  delta: ComparativeDelta;
}

export interface SideKpis {
  count: number;
  winner: WinnerKpi | null;
  totalPnl: number;
  trades: number;
}

export interface ComparativeKpis {
  left: SideKpis;
  right: SideKpis;
  delta: {
    leftWinner: WinnerKpi | null;
    rightWinner: WinnerKpi | null;
    verdicts: Array<{ label: string; count: number }>;
  };
}

export interface ComparisonViewRow {
  id: string;
  leftFloor: string;
  rightFloor: string;
  delta: ComparativeDelta;
  label: string;
  reasons: string[];
}

export function evaluationModeOf(doc: EvaluationDocument | null | undefined): EvaluationMode {
  const mode = (doc?.evaluation?.mode || 'develop').toString().toLowerCase();
  return mode === 'confirm' ? 'confirm' : 'develop';
}

export function comparisonSides(
  doc: EvaluationDocument | null | undefined,
): ComparisonSides {
  if (evaluationModeOf(doc) === 'confirm') {
    return {
      mode: 'confirm',
      left: 'oos',
      right: 'holdout',
      leftLabel: 'OOS',
      rightLabel: 'Holdout',
      leftFullLabel: 'OOS (auditoría)',
      rightFullLabel: 'Holdout',
      deltaLabel: 'Δ Holdout − OOS',
    };
  }
  return {
    mode: 'develop',
    left: 'train',
    right: 'walkForward',
    leftLabel: 'IS',
    rightLabel: 'OOS',
    leftFullLabel: 'IS (Train)',
    rightFullLabel: 'OOS (Walk-forward)',
    deltaLabel: 'Δ OOS − IS',
  };
}

export function formatNumber(value: number | undefined | null, digits: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function deltaText(value: number | undefined | null, digits: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '=';
  return `${arrow}${Math.abs(value).toFixed(digits)}`;
}

export function gradeOf(row: StrategyReport | undefined, key: string): string {
  return row?.grades?.[key] ?? '—';
}

export function gradeSeverity(
  letter: string | undefined,
): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  switch ((letter ?? '').charAt(0).toUpperCase()) {
    case 'A':
      return 'success';
    case 'B':
      return 'info';
    case 'C':
      return 'warn';
    case 'D':
    case 'F':
      return 'danger';
    default:
      return 'secondary';
  }
}

export type FloorTone = 'excellent' | 'good' | 'regular' | 'poor' | 'none';

export function floorTone(letter: string | undefined): FloorTone {
  switch ((letter ?? '').charAt(0).toUpperCase()) {
    case 'E':
    case 'A':
      return 'excellent';
    case 'B':
      return 'good';
    case 'C':
    case 'R':
      return 'regular';
    case 'D':
    case 'F':
    case 'M':
      return 'poor';
    default:
      return 'none';
  }
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
  for (const split of ['train', 'walkForward', 'oos', 'holdout'] as const) {
    for (const row of doc[split]?.strategies ?? []) push(row.id);
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

function difference(
  from: number | undefined | null,
  to: number | undefined | null,
): number | undefined {
  if (from === undefined || from === null || to === undefined || to === null) return undefined;
  return to - from;
}

export function comparativeDelta(
  left: StrategyReport | null,
  right: StrategyReport | null,
  backend?: ComparisonRow['delta'],
): ComparativeDelta {
  const derived = (key: MetricKey) => difference(left?.[key], right?.[key]);
  return {
    deflatedSharpe: backend?.deflatedSharpe ?? derived('deflatedSharpe'),
    expectancyR: backend?.expectancyR ?? derived('expectancyR'),
    profitFactor: derived('profitFactor'),
    closedTrades: backend?.closedTrades ?? derived('closedTrades'),
    returnPct: backend?.returnPct ?? derived('returnPct'),
    maxDrawdownPct: backend?.maxDrawdownPct ?? derived('maxDrawdownPct'),
    finalEquity: difference(left?.finalEquity, right?.finalEquity),
  };
}

function floorOf(
  comparison: ComparisonRow | undefined,
  split: SplitKey,
  report: StrategyReport | null,
): string {
  const value =
    split === 'train'
      ? comparison?.trainFloor
      : split === 'walkForward'
        ? comparison?.oosFloor
        : split === 'oos'
          ? comparison?.oosFloor
          : comparison?.holdoutFloor;
  return value ?? gradeOf(report ?? undefined, 'floor');
}

export function buildComparativeRows(
  doc: EvaluationDocument,
  strategyId: string,
): ComparativeRow[] {
  const sides = comparisonSides(doc);
  const left = indexById(splitStrategies(doc, sides.left));
  const right = indexById(splitStrategies(doc, sides.right));
  const comparisons = indexById(doc.comparison ?? []);
  const verdicts = indexById(doc.verdicts ?? []);
  const ids = orderedStrategyIds(doc).filter(
    (id) => strategyId === 'all' || id === strategyId,
  );
  return ids.map((id) => {
    const leftRow = left.get(id) ?? null;
    const rightRow = right.get(id) ?? null;
    const verdict = verdicts.get(id);
    const comparison = comparisons.get(id);
    return {
      id,
      left: leftRow,
      right: rightRow,
      leftFloor: floorOf(comparison, sides.left, leftRow),
      rightFloor: floorOf(comparison, sides.right, rightRow),
      delta: comparativeDelta(leftRow, rightRow, comparison?.delta),
      label: verdict?.label ?? '—',
      reasons: verdict?.reasons ?? [],
    };
  });
}

export function hasSideData(report: StrategyReport | null | undefined): boolean {
  if (!report) return false;
  return (
    (report.closedTrades ?? 0) > 0 ||
    (report.netPnl ?? 0) !== 0 ||
    (report.deflatedSharpe ?? 0) !== 0
  );
}

export function winnerOf(rows: ComparativeRow[], side: 'left' | 'right'): ComparativeRow | null {
  const candidates = rows.filter((row) => {
    const report = row[side];
    return hasSideData(report) && report?.deflatedSharpe != null;
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const left = a[side];
    const right = b[side];
    return (
      (right?.deflatedSharpe ?? 0) - (left?.deflatedSharpe ?? 0) ||
      (right?.expectancyR ?? 0) - (left?.expectancyR ?? 0) ||
      (right?.returnPct ?? 0) - (left?.returnPct ?? 0) ||
      a.id.localeCompare(b.id)
    );
  })[0];
}

export function sideKpis(rows: ComparativeRow[], side: 'left' | 'right'): SideKpis {
  let totalPnl = 0;
  let trades = 0;
  let count = 0;
  for (const row of rows) {
    const report = row[side];
    if (!report) continue;
    count += 1;
    totalPnl += report.netPnl ?? 0;
    trades += report.closedTrades ?? 0;
  }
  const winner = winnerOf(rows, side);
  const report = winner?.[side];
  return {
    count,
    totalPnl,
    trades,
    winner:
      winner && report
        ? {
            id: winner.id,
            floor: side === 'left' ? winner.leftFloor : winner.rightFloor,
            deflatedSharpe: report.deflatedSharpe ?? 0,
            expectancyR: report.expectancyR,
            returnPct: report.returnPct,
            closedTrades: report.closedTrades,
            delta: winner.delta,
          }
        : null,
  };
}

const VERDICT_ORDER = ['confirmed', 'candidate', 'inconclusive', 'failed'];
const VERDICT_RANK: Record<string, number> = {
  confirmed: 0,
  candidate: 1,
  inconclusive: 2,
  failed: 3,
};

export function verdictRank(label: string | undefined): number {
  return VERDICT_RANK[(label ?? '').toLowerCase()] ?? VERDICT_ORDER.length;
}

export function verdictSeverity(
  label: string | undefined,
): 'success' | 'warn' | 'danger' | 'secondary' {
  switch ((label ?? '').toLowerCase()) {
    case 'confirmed':
    case 'candidate':
      return 'success';
    case 'inconclusive':
      return 'warn';
    case 'failed':
      return 'danger';
    default:
      return 'secondary';
  }
}

export function comparativeKpis(rows: ComparativeRow[]): ComparativeKpis {
  const left = sideKpis(rows, 'left');
  const right = sideKpis(rows, 'right');
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.label || '—';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const verdicts = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => verdictRank(a.label) - verdictRank(b.label) || b.count - a.count);
  return {
    left,
    right,
    delta: {
      leftWinner: left.winner,
      rightWinner: right.winner,
      verdicts,
    },
  };
}

export function sortComparativeRows(
  rows: ComparativeRow[],
  sort: ComparativeSort,
): ComparativeRow[] {
  const out = [...rows];
  const byDsr = (a: number | undefined, b: number | undefined) =>
    (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY);
  switch (sort) {
    case 'rightDsr':
      out.sort(
        (a, b) =>
          byDsr(a.right?.deflatedSharpe, b.right?.deflatedSharpe) || a.id.localeCompare(b.id),
      );
      break;
    case 'deltaDsr':
      out.sort(
        (a, b) => byDsr(a.delta.deflatedSharpe, b.delta.deflatedSharpe) || a.id.localeCompare(b.id),
      );
      break;
    case 'id':
      out.sort((a, b) => a.id.localeCompare(b.id));
      break;
    default:
      out.sort(
        (a, b) =>
          verdictRank(a.label) - verdictRank(b.label) ||
          byDsr(a.right?.deflatedSharpe, b.right?.deflatedSharpe) ||
          a.id.localeCompare(b.id),
      );
  }
  return out;
}

export function buildComparisonRows(
  doc: EvaluationDocument,
  strategyId: string,
): ComparisonViewRow[] {
  return buildComparativeRows(doc, strategyId).map((row) => ({
    id: row.id,
    leftFloor: row.leftFloor,
    rightFloor: row.rightFloor,
    delta: row.delta,
    label: row.label,
    reasons: row.reasons,
  }));
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
  const sides = comparisonSides(doc);
  const map = new Map<string, MonthlyBar>();
  const add = (split: SplitKey, key: 'left' | 'right') => {
    for (const strategy of splitStrategies(doc, split)) {
      if (strategyId !== 'all' && strategy.id !== strategyId) continue;
      for (const trade of strategy.trades ?? []) {
        if (!trade.exitTime) continue;
        const month = trade.exitTime.slice(0, 7);
        const row = map.get(month) ?? { month, left: 0, right: 0 };
        row[key] += trade.netPnl ?? 0;
        map.set(month, row);
      }
    }
  };
  add(sides.left, 'left');
  add(sides.right, 'right');
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}
