import { EvaluationDocument, StrategyReport } from '../../../shared/models/bot-api.model';
import { buildCsvReport } from './report-csv.builder';
import { buildExportFilename } from './report-export.builder';

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
  deflatedSharpe: 1.23,
  expectancyR: 0.456,
  profitFactor: 1.7,
  maxDrawdownPct: 8.2,
  closedTrades: 42,
  finalEquity: 10450.5,
  returnPct: 4.5,
  stages: {
    long: [{ index: 0, passed: 10, timeouts: 2, fellBack: 1 }],
    short: [{ index: 0, passed: 5, timeouts: 0, fellBack: 2 }],
    invalidated: { long: 2, short: 1 },
  },
  trades: [
    {
      side: 'LONG',
      entryTime: '2025-02-01T00:00:00Z',
      exitTime: '2025-02-02T00:00:00Z',
      netPnl: 100,
      netR: 1.5,
      reason: 'TARGET, partial',
    },
  ],
};

const beta: StrategyReport = {
  id: 'beta',
  sampleEnough: false,
  stages: {
    long: [],
    short: [],
    invalidated: { long: 0, short: 0 },
  },
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
    trainFrom: '2025-01-01',
    trainTo: '2025-06-30',
    walkForwardFrom: '2025-07-01',
    walkForwardTo: '2025-12-31',
  },
  train: {
    run: { profile: 'backtest', symbol: 'SOLUSDT', interval: '15m' },
    strategies: [alpha, beta],
  },
  walkForward: {
    run: { profile: 'backtest', symbol: 'SOLUSDT', interval: '15m' },
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

describe('buildCsvReport', () => {
  it('renders section blocks with the front columns', () => {
    const csv = buildCsvReport(doc, 'report.json', {
      format: 'csv',
      sections: ['trainSummary', 'trades'],
      strategyId: 'all',
      tradesSplit: 'train',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(csv).toContain(
      '# train_summary\nestrategia,piso,muestra,DSR,E[R],PF,DD%,trades,equity,ret%',
    );
    expect(csv).toContain(
      '# trades_train\nStrat,Side,Entry,Exit,PnL,R,Reason',
    );
    expect(csv).toContain(
      'alpha,LONG,2025-02-01T00:00:00Z,2025-02-02T00:00:00Z,100.00,1.50,"TARGET, partial"',
    );
  });

  it('filters sections by strategy and split', () => {
    const csv = buildCsvReport(doc, 'report.json', {
      format: 'csv',
      sections: ['result', 'stages'],
      strategyId: 'beta',
      tradesSplit: 'train',
      stagesSplit: 'walkForward',
      monthlySplit: 'both',
    });

    expect(csv).toContain('# result');
    expect(csv).toContain('beta,rejected,muestra OOS insuficiente');
    expect(csv).toContain('# stages_walk_forward');
    expect(csv).not.toContain('# stages_train');
    expect(csv).not.toContain('alpha,');
  });

  it('emits only the selected sections', () => {
    const csv = buildCsvReport(doc, 'report.json', {
      format: 'csv',
      sections: ['result'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(csv).toContain('# result');
    expect(csv).toContain('# result_verdicts');
    expect(csv).not.toContain('# train_summary');
    expect(csv).not.toContain('# trades_train');
  });

  it('scopes the monthly blocks to the chosen split and exports E[R] per month', () => {
    const csv = buildCsvReport(doc, 'report.json', {
      format: 'csv',
      sections: ['monthly', 'monthlyEr'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'train',
    });

    expect(csv).toContain('# monthly\nmes,IS');
    expect(csv).toContain('2025-02,80.00');
    expect(csv).not.toContain(',OOS');
    expect(csv).toContain('# monthly_er\nmes,IS');
    expect(csv).toContain('2025-02,0.25');
  });

  it('keeps both monthly columns when the scope is both', () => {
    const csv = buildCsvReport(doc, 'report.json', {
      format: 'csv',
      sections: ['monthly'],
      strategyId: 'all',
      tradesSplit: 'both',
      stagesSplit: 'both',
      monthlySplit: 'both',
    });

    expect(csv).toContain('# monthly\nmes,IS,OOS');
    expect(csv).toContain('2025-02,80.00,80.00');
  });

  it('uses the csv extension in the filename', () => {
    const filename = buildExportFilename(
      'report.json',
      'alpha',
      'csv',
      new Date(2026, 9, 20, 3, 44),
    );

    expect(filename).toBe('report-alpha-20261020-0344.csv');
  });
});
