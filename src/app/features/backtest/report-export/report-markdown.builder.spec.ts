import { EvaluationDocument, StrategyReport } from '../../../shared/models/bot-api.model';
import { buildExportFilename } from './report-export.builder';
import { ALL_REPORT_SECTIONS } from './report-export.types';
import { buildMarkdownReport } from './report-markdown.builder';

const alpha: StrategyReport = {
  id: 'alpha',
  grades: {
    floor: 'A',
    deflatedSharpe: 'A',
    expectancyR: 'B',
    profitFactor: 'A',
    maxDrawdownPct: 'B',
    closedTrades: 'A',
  },
  sampleEnough: true,
  openAtEnd: false,
  deflatedSharpe: 1.23,
  expectancyR: 0.456,
  profitFactor: 1.7,
  maxDrawdownPct: 8.2,
  closedTrades: 42,
  finalEquity: 10450.5,
  returnPct: 4.5,
  winRatePct: 55.5,
  winners: 23,
  avgWinR: 1.8,
  avgLossR: -0.9,
  maxConsecutiveLosses: 3,
  avgBarsInTrade: 12.5,
  exits: { LIQUIDATION: 1, STOP: 10, TARGET: 20, SIGNAL: 11 },
  maxDrawdownBars: 7,
  exposurePct: 33.3,
  sharpePerBar: 0.01,
  sharpeAnnualized: 1.1,
  probabilisticSharpe: 0.9,
  stages: {
    long: [{ index: 0, passed: 10, timeouts: 2, fellBack: 1 }],
    short: [],
    invalidated: { long: 2, short: 0 },
  },
  trades: [
    {
      side: 'LONG',
      entryTime: '2025-02-01T00:00:00Z',
      exitTime: '2025-02-02T00:00:00Z',
      netPnl: 100,
      netR: 1.5,
      reason: 'TARGET',
    },
  ],
};

const beta: StrategyReport = {
  id: 'beta',
  closedTrades: 2,
  trades: [
    {
      side: 'SHORT',
      entryTime: '2025-02-03T00:00:00Z',
      exitTime: '2025-02-04T00:00:00Z',
      netPnl: -20,
      netR: -1,
      reason: 'STOP',
    },
  ],
};

const doc: EvaluationDocument = {
  evaluation: {
    symbol: 'SOLUSDT',
    trials: 12,
    dataDir: '/data',
    trainFrom: '2025-01-01',
    trainTo: '2025-06-30',
    walkForwardFrom: '2025-07-01',
    walkForwardTo: '2025-12-31',
  },
  train: {
    run: {
      profile: 'backtest',
      symbol: 'SOLUSDT',
      interval: '15m',
      firstBar: '2025-01-01',
      lastBar: '2025-06-30',
      days: 180,
      trials: 12,
      endedBecause: 'end',
    },
    strategies: [alpha, beta],
  },
  walkForward: {
    run: {
      profile: 'backtest',
      symbol: 'SOLUSDT',
      interval: '15m',
      firstBar: '2025-07-01',
      lastBar: '2025-12-31',
      days: 183,
      trials: 12,
      endedBecause: 'end',
    },
    strategies: [alpha, beta],
  },
  comparison: [
    { id: 'alpha', trainFloor: 'A', oosFloor: 'A', delta: { deflatedSharpe: 0.1 } },
    { id: 'beta', trainFloor: 'B', oosFloor: 'C', delta: { deflatedSharpe: -0.2 } },
  ],
  verdicts: [
    { id: 'alpha', label: 'candidate', reasons: [] },
    { id: 'beta', label: 'rejected', reasons: ['muestra OOS insuficiente'] },
  ],
};

describe('buildMarkdownReport', () => {
  it('renders the same summary columns as the backtest page', () => {
    const markdown = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ALL_REPORT_SECTIONS,
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(markdown).toContain(
      '| estrategia | piso | muestra | DSR | E[R] | PF | DD% | trades | equity | ret% |',
    );
    expect(markdown).toContain(
      '| alpha | A | sí | A 1.23 | B 0.456 | A 1.70 | B 8.2 | A 42 | 10450.50 | 4.5 |',
    );
    expect(markdown).toContain('### Motivos del veredicto');
    expect(markdown).toContain('- **beta** (rejected): muestra OOS insuficiente');
  });

  it('puts individual trades in a fenced csv block', () => {
    const markdown = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ['trades'],
      strategyId: 'all',
      tradesSplit: 'train',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(markdown).toContain('```csv');
    expect(markdown).toContain('Strat,Side,Entry,Exit,PnL,R,Reason');
    expect(markdown).toContain(
      'alpha,LONG,2025-02-01T00:00:00Z,2025-02-02T00:00:00Z,100.00,1.50,TARGET',
    );
    expect(markdown).not.toContain('### Walk-forward');
  });

  it('filters every section down to a single strategy', () => {
    const markdown = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ['trainSummary', 'result', 'trades'],
      strategyId: 'beta',
      tradesSplit: 'train',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(markdown).toContain('| beta |');
    expect(markdown).not.toContain('| alpha |');
    expect(markdown).not.toContain('alpha,');
    expect(markdown).not.toContain('## Train · detalle');
  });

  it('omits sections that were not selected', () => {
    const markdown = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ['result'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(markdown).toContain('## Resultado');
    expect(markdown).not.toContain('## Train');
    expect(markdown).not.toContain('## Stages');
  });

  it('renders the monthly tables scoped to the chosen split', () => {
    const scoped = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ['monthly', 'monthlyEr'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'train',
    });

    expect(scoped).toContain('## Ganancias por mes (IS / OOS)');
    expect(scoped).toContain('| mes | IS |');
    expect(scoped).toContain('| 2025-02 | 80.00 |');
    expect(scoped).toContain('## E[R] por mes (IS / OOS)');
    expect(scoped).toContain('| 2025-02 | 0.25 |');
    expect(scoped).not.toContain('| OOS |');

    const both = buildMarkdownReport(doc, 'report.json', {
      format: 'md',
      sections: ['monthly'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(both).toContain('| mes | IS | OOS |');
    expect(both).toContain('| 2025-02 | 80.00 | 80.00 |');
  });
});

describe('buildExportFilename', () => {
  it('uses the report name, strategy and timestamp', () => {
    const filename = buildExportFilename(
      '2026-10-19T10-30-report.json',
      'alpha',
      'md',
      new Date(2026, 9, 20, 3, 44),
    );

    expect(filename).toBe('2026-10-19T10-30-report-alpha-20261020-0344.md');
  });
});
