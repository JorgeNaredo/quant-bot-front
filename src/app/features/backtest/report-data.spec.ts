import { EvaluationDocument, StrategyReport } from '../../shared/models/bot-api.model';
import {
  buildComparativeRows,
  buildMonthlyBars,
  buildTradeHistogram,
  comparativeKpis,
  comparisonSides,
  evLabel,
  histogramTotal,
  deltaText,
  evaluationModeOf,
  floorTone,
  gradeSeverity,
  orderedStrategyIds,
  sliceMonthlyBars,
  sortComparativeRows,
  verdictRank,
  verdictSeverity,
} from './report-data';

function strategy(id: string, overrides: Partial<StrategyReport> = {}): StrategyReport {
  return {
    id,
    deflatedSharpe: 1,
    expectancyR: 0.1,
    profitFactor: 1.5,
    closedTrades: 10,
    netPnl: 100,
    returnPct: 5,
    ...overrides,
  };
}

function document(mode: 'develop' | 'confirm'): EvaluationDocument {
  const base: EvaluationDocument = {
    evaluation: { mode },
    train: {
      strategies: [
        strategy('alpha', { deflatedSharpe: 1.2, expectancyR: 0.2, netPnl: 400 }),
        strategy('beta', { deflatedSharpe: 0.4, expectancyR: -0.05, netPnl: -100 }),
      ],
    },
    walkForward: {
      strategies: [
        strategy('alpha', {
          deflatedSharpe: 0.9,
          expectancyR: 0.15,
          profitFactor: 1.3,
          netPnl: 250,
        }),
        strategy('gamma', { deflatedSharpe: 0.7, expectancyR: 0.08, netPnl: 50 }),
      ],
    },
    oos: {
      strategies: [
        strategy('alpha', { deflatedSharpe: 0.9, expectancyR: 0.15, netPnl: 250 }),
      ],
    },
    holdout: {
      strategies: [
        strategy('alpha', { deflatedSharpe: 0.8, expectancyR: 0.12, netPnl: 200 }),
        strategy('delta', { deflatedSharpe: 0.5, expectancyR: 0.05, netPnl: 20 }),
      ],
    },
    comparison: [
      {
        id: 'alpha',
        trainFloor: 'A',
        oosFloor: 'B',
        holdoutFloor: 'C',
        delta: { deflatedSharpe: -0.3, expectancyR: -0.05 },
      },
    ],
    verdicts: [
      { id: 'alpha', label: 'confirmed', reasons: [] },
      { id: 'beta', label: 'failed', reasons: ['muestra insuficiente'] },
    ],
  };
  return base;
}

describe('report-data', () => {
  it('maps develop to IS/OOS and confirm to OOS/Holdout', () => {
    const develop = comparisonSides(document('develop'));
    expect(develop.left).toBe('train');
    expect(develop.right).toBe('walkForward');
    expect(develop.leftLabel).toBe('IS');
    expect(develop.deltaLabel).toBe('Δ OOS − IS');

    const confirm = comparisonSides(document('confirm'));
    expect(confirm.left).toBe('oos');
    expect(confirm.right).toBe('holdout');
    expect(confirm.rightLabel).toBe('Holdout');
    expect(confirm.deltaLabel).toBe('Δ Holdout − OOS');
  });

  it('defaults to develop when the document is empty', () => {
    expect(evaluationModeOf(null)).toBe('develop');
    expect(evaluationModeOf({})).toBe('develop');
  });

  it('unions strategy ids across every split', () => {
    expect(orderedStrategyIds(document('develop'))).toEqual([
      'alpha',
      'beta',
      'gamma',
      'delta',
    ]);
  });

  it('builds aligned rows with left, right and delta', () => {
    const rows = buildComparativeRows(document('develop'), 'all');
    expect(rows.map((row) => row.id)).toEqual(['alpha', 'beta', 'gamma', 'delta']);

    const alpha = rows[0];
    expect(alpha.left?.id).toBe('alpha');
    expect(alpha.right?.id).toBe('alpha');
    expect(alpha.delta.deflatedSharpe).toBe(-0.3);
    expect(alpha.delta.profitFactor).toBeCloseTo(-0.2, 10);
    expect(alpha.label).toBe('confirmed');

    const gamma = rows[2];
    expect(gamma.left).toBeNull();
    expect(gamma.right?.id).toBe('gamma');
    expect(gamma.delta.deflatedSharpe).toBeUndefined();
  });

  it('derives the delta from the reports when the backend omits it', () => {
    const doc = document('develop');
    doc.comparison = [];
    const alpha = buildComparativeRows(doc, 'alpha')[0];
    expect(alpha.delta.deflatedSharpe).toBeCloseTo(-0.3, 10);
    expect(alpha.delta.expectancyR).toBeCloseTo(-0.05, 10);
    expect(alpha.delta.closedTrades).toBe(0);
  });

  it('exposes the floors of each compared side', () => {
    const develop = buildComparativeRows(document('develop'), 'all');
    expect(develop[0].leftFloor).toBe('A');
    expect(develop[0].rightFloor).toBe('B');

    const confirm = buildComparativeRows(document('confirm'), 'alpha');
    expect(confirm[0].leftFloor).toBe('B');
    expect(confirm[0].rightFloor).toBe('C');
  });

  it('falls back to the report grade when the comparison omits floors', () => {
    const doc = document('develop');
    doc.comparison = [];
    doc.train!.strategies = [
      strategy('alpha', { grades: { floor: 'M' } }),
    ];
    doc.walkForward!.strategies = [
      strategy('alpha', { grades: { floor: 'N' } }),
    ];
    const row = buildComparativeRows(doc, 'alpha')[0];
    expect(row.leftFloor).toBe('M');
    expect(row.rightFloor).toBe('N');
  });

  it('derives the equity delta from both sides', () => {
    const doc = document('develop');
    doc.comparison = [];
    doc.train!.strategies = [strategy('alpha', { finalEquity: 1250 })];
    doc.walkForward!.strategies = [strategy('alpha', { finalEquity: 1100 })];
    const row = buildComparativeRows(doc, 'alpha')[0];
    expect(row.delta.finalEquity).toBe(-150);
  });

  it('filters by strategy id', () => {
    const rows = buildComparativeRows(document('develop'), 'beta');
    expect(rows.map((row) => row.id)).toEqual(['beta']);
  });

  it('aggregates KPIs per side and for the delta', () => {
    const kpis = comparativeKpis(buildComparativeRows(document('develop'), 'all'));
    expect(kpis.left.count).toBe(2);
    expect(kpis.left.totalPnl).toBe(300);
    expect(kpis.left.trades).toBe(20);
    expect(kpis.left.winner?.id).toBe('alpha');
    expect(kpis.left.winner?.deflatedSharpe).toBe(1.2);
    expect(kpis.left.winner?.floor).toBe('A');
    expect(kpis.left.winner?.delta.deflatedSharpe).toBe(-0.3);
    expect(kpis.right.count).toBe(2);
    expect(kpis.right.totalPnl).toBe(300);
    expect(kpis.right.winner?.id).toBe('alpha');
    expect(kpis.right.winner?.floor).toBe('B');
    expect(kpis.delta.leftWinner?.id).toBe('alpha');
    expect(kpis.delta.rightWinner?.id).toBe('alpha');
    expect(kpis.delta.leftWinner?.delta.deflatedSharpe).toBe(-0.3);
    expect(kpis.delta.verdicts).toEqual([
      { label: 'confirmed', count: 1 },
      { label: 'failed', count: 1 },
      { label: '—', count: 2 },
    ]);
  });

  it('exposes the winner own metrics instead of side averages', () => {
    const kpis = comparativeKpis(buildComparativeRows(document('develop'), 'all'));
    expect(kpis.left.winner?.expectancyR).toBe(0.2);
    expect(kpis.left.winner?.returnPct).toBe(5);
    expect(kpis.left.winner?.closedTrades).toBe(10);
  });

  it('ignores specs without data when picking the winner', () => {
    const doc = document('develop');
    doc.train = {
      strategies: [
        strategy('ghost', {
          deflatedSharpe: 0,
          expectancyR: 0,
          profitFactor: 0,
          closedTrades: 0,
          netPnl: 0,
          returnPct: 0,
        }),
      ],
    };
    doc.walkForward = { strategies: [] };
    const kpis = comparativeKpis(buildComparativeRows(doc, 'all'));
    expect(kpis.left.winner).toBeNull();
    expect(kpis.delta.leftWinner).toBeNull();
    expect(kpis.delta.rightWinner).toBeNull();
  });

  it('sorts by verdict severity with DSR as tie-break', () => {
    const rows = buildComparativeRows(document('develop'), 'all');
    const sorted = sortComparativeRows(rows, 'verdict');
    expect(sorted[0].label).toBe('confirmed');
    expect(sorted[sorted.length - 1].label).toBe('—');
  });

  it('sorts by delta DSR', () => {
    const rows = buildComparativeRows(document('develop'), 'all');
    const sorted = sortComparativeRows(rows, 'deltaDsr');
    expect(sorted[0].id).toBe('alpha');
  });

  it('builds monthly bars for the active sides in confirm mode', () => {
    const doc = document('confirm');
    doc.oos = {
      strategies: [
        strategy('alpha', {
          trades: [
            { strategyId: 'alpha', exitTime: '2026-01-15T00:00:00Z', netPnl: 10 },
          ],
        }),
      ],
    };
    doc.holdout = {
      strategies: [
        strategy('alpha', {
          trades: [
            { strategyId: 'alpha', exitTime: '2026-01-20T00:00:00Z', netPnl: 25 },
            { strategyId: 'alpha', exitTime: '2026-02-02T00:00:00Z', netPnl: -5 },
          ],
        }),
      ],
    };
    const bars = buildMonthlyBars(doc, 'all');
    expect(bars).toEqual([
      { month: '2026-01', left: 10, right: 25 },
      { month: '2026-02', left: 0, right: -5 },
    ]);
  });

  it('slices monthly bars to the visible split', () => {
    const bars = [
      { month: '2026-01', left: 10, right: 0 },
      { month: '2026-02', left: 0, right: 0 },
      { month: '2026-03', left: 3, right: 0 },
      { month: '2026-04', left: 0, right: 5 },
      { month: '2026-05', left: 0, right: -5 },
    ];
    expect(sliceMonthlyBars(bars, 'both')).toBe(bars);
    expect(sliceMonthlyBars(bars, 'left').map((bar) => bar.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(sliceMonthlyBars(bars, 'right').map((bar) => bar.month)).toEqual([
      '2026-04',
      '2026-05',
    ]);
    expect(sliceMonthlyBars(bars, 'right')).not.toBe(bars);
  });

  it('drops monthly bars when the visible split has no data', () => {
    const bars = [{ month: '2026-01', left: 10, right: 0 }];
    expect(sliceMonthlyBars(bars, 'right')).toEqual([]);
    expect(sliceMonthlyBars([], 'left')).toEqual([]);
  });

  it('buckets trades by net R for each compared side', () => {
    const doc = document('develop');
    doc.train!.strategies = [
      strategy('alpha', {
        trades: [
          { netR: -1.1 },
          { netR: 1.95 },
          { netR: -1 },
          { netR: 2 },
          { netR: 3 },
          { netR: 2.7 },
          { netR: -2.5 },
        ],
      }),
      strategy('beta', { trades: [{ netR: 0.3 }] }),
    ];
    doc.walkForward!.strategies = [
      strategy('alpha', { trades: [{ netR: 0.3 }] }),
    ];
    const hist = buildTradeHistogram(doc, 'alpha');
    expect(hist.bins.length).toBe(13);
    expect(hist.leftTotal).toBe(7);
    expect(hist.rightTotal).toBe(1);
    const countLeft = (edge: number | null) =>
      hist.bins.find((bin) => bin.edge === edge)?.left ?? 0;
    expect(countLeft(null)).toBe(0);
    expect(countLeft(-2.5)).toBe(1);
    expect(countLeft(-1.5)).toBe(1);
    expect(countLeft(-1)).toBe(1);
    expect(countLeft(0)).toBe(0);
    expect(countLeft(1.5)).toBe(1);
    expect(countLeft(2)).toBe(1);
    expect(countLeft(2.5)).toBe(1);
    expect(hist.bins[0].left).toBe(0);
    expect(hist.bins[12].left).toBe(1);
    expect(hist.bins[12].label).toBe('≥ 3.00');
    expect(hist.bins[0].label).toBe('< -2.50');
    expect(hist.bins[6].label).toBe('0.00 a 0.50');
    expect(hist.leftEv).toBeCloseTo(5.05 / 7, 5);
    expect(hist.rightEv).toBeCloseTo(0.3, 5);
  });

  it('formats the expectancy chip label', () => {
    expect(evLabel(0.08)).toBe('+0.08R');
    expect(evLabel(-0.03)).toBe('-0.03R');
    expect(evLabel(0)).toBe('0.00R');
    expect(evLabel(-0.001)).toBe('0.00R');
    expect(evLabel(undefined)).toBe('—');
    expect(evLabel(Number.NaN)).toBe('—');
  });

  it('excludes trades without a finite net R', () => {
    const doc = document('develop');
    doc.train!.strategies = [
      strategy('alpha', {
        trades: [{ netR: 1 }, { netPnl: 5 }, { netR: Number.NaN }],
      }),
    ];
    doc.walkForward!.strategies = [strategy('alpha', { trades: [] })];
    const hist = buildTradeHistogram(doc, 'all');
    expect(hist.leftTotal).toBe(1);
    expect(hist.rightTotal).toBe(0);
    expect(hist.leftEv).toBe(1);
    expect(hist.rightEv).toBeUndefined();
    expect(histogramTotal(hist, 'left')).toBe(1);
    expect(histogramTotal(hist, 'right')).toBe(0);
    expect(histogramTotal(hist, 'both')).toBe(1);
  });

  it('maps confirm mode splits to left and right', () => {
    const doc = document('confirm');
    doc.oos = { strategies: [strategy('alpha', { trades: [{ netR: 1 }] })] };
    doc.holdout = {
      strategies: [strategy('alpha', { trades: [{ netR: -1 }, { netR: 2 }] })],
    };
    const hist = buildTradeHistogram(doc, 'all');
    expect(hist.leftTotal).toBe(1);
    expect(hist.rightTotal).toBe(2);
  });

  it('returns empty totals for documents without trades', () => {
    const hist = buildTradeHistogram(document('develop'), 'all');
    expect(hist.leftTotal).toBe(0);
    expect(hist.rightTotal).toBe(0);
    expect(hist.bins.every((bin) => bin.left === 0 && bin.right === 0)).toBe(true);
  });

  it('formats deltas with direction arrows', () => {
    expect(deltaText(0.08, 2)).toBe('↑0.08');
    expect(deltaText(-0.08, 2)).toBe('↓0.08');
    expect(deltaText(0, 2)).toBe('=0.00');
    expect(deltaText(undefined, 2)).toBe('—');
  });

  it('maps verdict labels to tag severities', () => {
    expect(verdictSeverity('confirmed')).toBe('success');
    expect(verdictSeverity('candidate')).toBe('success');
    expect(verdictSeverity('inconclusive')).toBe('warn');
    expect(verdictSeverity('oos_inconclusive')).toBe('warn');
    expect(verdictSeverity('overfit')).toBe('danger');
    expect(verdictSeverity('failed')).toBe('danger');
    expect(verdictSeverity('reject')).toBe('danger');
    expect(verdictSeverity('—')).toBe('secondary');
  });

  it('ranks verdicts from confirmed down to reject', () => {
    expect(verdictRank('confirmed')).toBeLessThan(verdictRank('candidate'));
    expect(verdictRank('candidate')).toBeLessThan(verdictRank('inconclusive'));
    expect(verdictRank('inconclusive')).toBeLessThan(verdictRank('oos_inconclusive'));
    expect(verdictRank('oos_inconclusive')).toBeLessThan(verdictRank('overfit'));
    expect(verdictRank('overfit')).toBeLessThan(verdictRank('failed'));
    expect(verdictRank('failed')).toBeLessThan(verdictRank('reject'));
    expect(verdictRank('desconocido')).toBeGreaterThan(verdictRank('reject'));
  });

  it('maps grade letters to tag severities using the first letter', () => {
    expect(gradeSeverity('A')).toBe('success');
    expect(gradeSeverity('B')).toBe('info');
    expect(gradeSeverity('C')).toBe('warn');
    expect(gradeSeverity('D')).toBe('danger');
    expect(gradeSeverity('F')).toBe('danger');
    expect(gradeSeverity('MB')).toBe('secondary');
    expect(gradeSeverity('—')).toBe('secondary');
  });

  it('maps floor letters to the M-R-B-E tone scale', () => {
    expect(floorTone('E')).toBe('excellent');
    expect(floorTone('B')).toBe('good');
    expect(floorTone('R')).toBe('regular');
    expect(floorTone('M')).toBe('poor');
    expect(floorTone('A')).toBe('excellent');
    expect(floorTone('C')).toBe('regular');
    expect(floorTone('MB')).toBe('poor');
    expect(floorTone('—')).toBe('none');
  });
});
