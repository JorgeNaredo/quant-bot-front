import {
  EvaluationDocument,
  StrategyReport,
} from '../../../shared/models/bot-api.model';
import {
  SplitKey,
  buildComparisonRows,
  buildMonthlyBars,
  collectTrades,
  evaluationModeOf,
  exitCountOf,
  filterByStrategy,
  formatNumber,
  formatRunHeader,
  gradeOf,
  gradedOf,
  splitStrategies,
} from '../report-data';

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface StageEntry {
  index: number;
  passed?: number;
  timeouts?: number;
  fellBack?: number;
}

export interface StageGroup {
  strategyId: string;
  long: StageEntry[];
  short: StageEntry[];
  invalidatedLong: number;
  invalidatedShort: number;
}

export const STAGE_HEADERS = ['stage', 'passed', 'timeouts', 'fellBack'];

export function buildMetaTable(
  doc: EvaluationDocument,
  reportName: string,
  strategyId: string,
  selectedLabels: string,
): ReportTable {
  const meta = doc.evaluation ?? {};
  const confirm = evaluationModeOf(doc) === 'confirm';
  const trainRun = doc.train?.run;
  const wfRun = doc.walkForward?.run;
  const holdoutRun = doc.holdout?.run;
  const symbol =
    meta.symbol || trainRun?.symbol || wfRun?.symbol || holdoutRun?.symbol || '—';
  const rows: string[][] = [
    ['reporte', reportName],
    ['mode', meta.mode || 'develop'],
    ['simbolo', symbol],
    ['estrategia exportada', strategyId === 'all' ? 'todas' : strategyId],
    ['trials', meta.trials == null ? '—' : String(meta.trials)],
    ['dataDir', meta.dataDir || '—'],
  ];
  if (confirm) {
    rows.push(
      ['oos', range(meta.oosFrom, meta.oosTo)],
      ['holdout', range(meta.holdoutFrom, meta.holdoutTo)],
    );
    if (holdoutRun) rows.push(['run holdout', formatRunHeader('holdout', holdoutRun)]);
  } else {
    rows.push(
      ['train', range(meta.trainFrom ?? meta.isFrom, meta.trainTo ?? meta.isTo)],
      [
        'walk-forward',
        range(meta.walkForwardFrom ?? meta.oosFrom, meta.walkForwardTo ?? meta.oosTo),
      ],
    );
    if (trainRun) rows.push(['run train', formatRunHeader('train', trainRun)]);
    if (wfRun) rows.push(['run walk-forward', formatRunHeader('walk-forward', wfRun)]);
  }
  rows.push(['secciones', selectedLabels || '—']);

  return {
    headers: ['campo', 'valor'],
    rows,
  };
}

export function buildSummaryTable(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): ReportTable {
  const rows = filterByStrategy(splitStrategies(doc, split), strategyId);
  return {
    headers: [
      'estrategia',
      'piso',
      'muestra',
      'DSR',
      'E[R]',
      'PF',
      'DD%',
      'trades',
      'equity',
      'ret%',
    ],
    rows: rows.map((row) => summaryRow(row)),
  };
}

export function buildDetailTables(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): {
  trades: ReportTable;
  exits: ReportTable;
  curve: ReportTable;
} {
  const rows = filterByStrategy(splitStrategies(doc, split), strategyId);
  return {
    trades: {
      headers: [
        'estrategia',
        'al cierre',
        'win%',
        'ganadores',
        'R ganador',
        'R perdedor',
        'racha',
        'velas',
      ],
      rows: rows.map((row) => [
        row.id,
        row.openAtEnd ? 'abierta' : 'plana',
        formatNumber(row.winRatePct, 1),
        formatNumber(row.winners, 0),
        formatNumber(row.avgWinR, 2),
        formatNumber(row.avgLossR, 2),
        formatNumber(row.maxConsecutiveLosses, 0),
        formatNumber(row.avgBarsInTrade, 1),
      ]),
    },
    exits: {
      headers: ['estrategia', 'liquidacion', 'stop', 'target', 'signal'],
      rows: rows.map((row) => [
        row.id,
        String(exitCountOf(row, 'LIQUIDATION')),
        String(exitCountOf(row, 'STOP')),
        String(exitCountOf(row, 'TARGET')),
        String(exitCountOf(row, 'SIGNAL')),
      ]),
    },
    curve: {
      headers: [
        'estrategia',
        'DD velas',
        'exposicion %',
        'Sharpe/vela',
        'Sharpe anual',
        'PSR',
      ],
      rows: rows.map((row) => [
        row.id,
        formatNumber(row.maxDrawdownBars, 0),
        formatNumber(row.exposurePct, 1),
        formatNumber(row.sharpePerBar, 4),
        formatNumber(row.sharpeAnnualized, 2),
        formatNumber(row.probabilisticSharpe, 2),
      ]),
    },
  };
}

export function buildResultTable(
  doc: EvaluationDocument,
  strategyId: string,
): ReportTable {
  const rows = buildComparisonRows(doc, strategyId);
  const confirm = evaluationModeOf(doc) === 'confirm';
  return {
    headers: [
      'estrategia',
      confirm ? 'oos' : 'train',
      confirm ? 'holdout' : 'oos',
      'ΔDSR',
      'ΔE[R]',
      'Δtrades',
      'Δret%',
      'ΔDD%',
      'verdict',
    ],
    rows: rows.map((row) => [
      row.id,
      row.leftFloor,
      row.rightFloor,
      formatNumber(row.delta?.deflatedSharpe, 2),
      formatNumber(row.delta?.expectancyR, 3),
      formatNumber(row.delta?.closedTrades, 0),
      formatNumber(row.delta?.returnPct, 1),
      formatNumber(row.delta?.maxDrawdownPct, 1),
      row.label,
    ]),
  };
}

export function buildVerdictReasonsTable(
  doc: EvaluationDocument,
  strategyId: string,
): ReportTable {
  const rows = buildComparisonRows(doc, strategyId).filter(
    (row) => row.reasons.length > 0,
  );
  return {
    headers: ['estrategia', 'verdict', 'motivos'],
    rows: rows.map((row) => [row.id, row.label, row.reasons.join('; ')]),
  };
}

export function buildMonthlyTable(
  doc: EvaluationDocument,
  strategyId: string,
): ReportTable {
  const confirm = evaluationModeOf(doc) === 'confirm';
  return {
    headers: confirm ? ['mes', 'OOS', 'Holdout'] : ['mes', 'IS', 'OOS'],
    rows: buildMonthlyBars(doc, strategyId).map((bar) => [
      bar.month,
      formatNumber(bar.left, 2),
      formatNumber(bar.right, 2),
    ]),
  };
}

export function buildStageGroups(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): StageGroup[] {
  return filterByStrategy(splitStrategies(doc, split), strategyId).map((row) => ({
    strategyId: row.id,
    long: (row.stages?.long ?? []).map((stage, index) => ({
      index: stage.index ?? index,
      passed: stage.passed,
      timeouts: stage.timeouts,
      fellBack: stage.fellBack,
    })),
    short: (row.stages?.short ?? []).map((stage, index) => ({
      index: stage.index ?? index,
      passed: stage.passed,
      timeouts: stage.timeouts,
      fellBack: stage.fellBack,
    })),
    invalidatedLong: row.stages?.invalidated?.long ?? 0,
    invalidatedShort: row.stages?.invalidated?.short ?? 0,
  }));
}

export function stageRows(stages: StageEntry[]): string[][] {
  return stages.map((stage) => [
    `S${stage.index}`,
    formatNumber(stage.passed, 0),
    formatNumber(stage.timeouts, 0),
    formatNumber(stage.fellBack, 0),
  ]);
}

export function buildTradeTable(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): ReportTable {
  return {
    headers: ['Strat', 'Side', 'Entry', 'Exit', 'PnL', 'R', 'Reason'],
    rows: collectTrades(doc, split, strategyId).map((trade) => [
      trade.strategyId ?? '—',
      trade.side ?? '—',
      trade.entryTime ?? '—',
      trade.exitTime ?? '—',
      formatNumber(trade.netPnl, 2),
      formatNumber(trade.netR, 2),
      trade.reason ?? '—',
    ]),
  };
}

function summaryRow(row: StrategyReport): string[] {
  return [
    row.id,
    gradeOf(row, 'floor'),
    row.sampleEnough ? 'sí' : 'no',
    gradedOf(row, 'deflatedSharpe', row.deflatedSharpe, 2),
    gradedOf(row, 'expectancyR', row.expectancyR, 3),
    gradedOf(row, 'profitFactor', row.profitFactor, 2),
    gradedOf(row, 'maxDrawdownPct', row.maxDrawdownPct, 1),
    gradedOf(row, 'closedTrades', row.closedTrades, 0),
    formatNumber(row.finalEquity, 2),
    formatNumber(row.returnPct, 1),
  ];
}

function range(from: string | undefined, to: string | undefined): string {
  if (!from && !to) return '—';
  return `${from || '-'} -> ${to || '-'}`;
}
