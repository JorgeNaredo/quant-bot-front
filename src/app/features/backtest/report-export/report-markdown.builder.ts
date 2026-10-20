import {
  EvaluationDocument,
  StrategyReport,
  TradeRow,
} from '../../../shared/models/bot-api.model';
import {
  SplitKey,
  buildComparisonRows,
  buildMonthlyBars,
  collectTrades,
  exitCountOf,
  filterByStrategy,
  formatNumber,
  formatRunHeader,
  gradeOf,
  gradedOf,
  splitStrategies,
} from '../report-data';

export type ExportFormat = 'md';

export type ReportSection =
  | 'meta'
  | 'trainSummary'
  | 'trainDetails'
  | 'walkForwardSummary'
  | 'walkForwardDetails'
  | 'result'
  | 'monthly'
  | 'stages'
  | 'trades';

export type SplitScope = 'train' | 'walkForward' | 'both';

export interface ReportExportOptions {
  format: ExportFormat;
  sections: ReportSection[];
  strategyId: string;
  tradesSplit: SplitScope;
  stagesSplit: SplitScope;
}

export interface ReportSectionDefinition {
  key: ReportSection;
  label: string;
}

export const REPORT_SECTIONS: ReadonlyArray<ReportSectionDefinition> = [
  { key: 'meta', label: 'Metadatos del reporte' },
  { key: 'trainSummary', label: 'Train · resumen' },
  { key: 'trainDetails', label: 'Train · detalle (trades, salidas, curva)' },
  { key: 'walkForwardSummary', label: 'Walk-forward · resumen' },
  { key: 'walkForwardDetails', label: 'Walk-forward · detalle (trades, salidas, curva)' },
  { key: 'result', label: 'Resultado y veredictos' },
  { key: 'monthly', label: 'Ganancias por mes (IS / OOS)' },
  { key: 'stages', label: 'Stages' },
  { key: 'trades', label: 'Trades individuales' },
];

export const ALL_REPORT_SECTIONS: ReportSection[] = REPORT_SECTIONS.map(
  (section) => section.key,
);

export const DEFAULT_REPORT_SECTIONS: ReportSection[] = [
  'trainSummary',
  'walkForwardSummary',
  'result',
  'stages',
];

export function buildMarkdownReport(
  doc: EvaluationDocument,
  reportName: string,
  options: ReportExportOptions,
): string {
  const selected = new Set(options.sections);
  const strategyId = options.strategyId || 'all';
  const parts: string[] = [
    `# Backtest · ${mdInline(reportName)}`,
    `_Generado: ${new Date().toISOString()}_`,
  ];

  const add = (key: ReportSection, content: string) => {
    if (selected.has(key)) parts.push(content);
  };

  add('meta', metaSection(doc, reportName, strategyId, selected));
  add('trainSummary', summarySection(doc, 'train', strategyId));
  add('trainDetails', detailsSection(doc, 'train', strategyId));
  add('walkForwardSummary', summarySection(doc, 'walkForward', strategyId));
  add('walkForwardDetails', detailsSection(doc, 'walkForward', strategyId));
  add('result', resultSection(doc, strategyId));
  add('monthly', monthlySection(doc, strategyId));
  add('stages', stagesSection(doc, strategyId, options.stagesSplit));
  add('trades', tradesSection(doc, strategyId, options.tradesSplit));

  return `${parts.join('\n\n')}\n`;
}

export function buildExportFilename(
  reportName: string,
  strategyId: string,
  format: ExportFormat,
  now = new Date(),
): string {
  const base = sanitizeSegment(reportName.replace(/\.json$/i, '')) || 'report';
  const scope = strategyId === 'all' ? 'all' : sanitizeSegment(strategyId) || 'strategy';
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('');
  return `${base}-${scope}-${stamp}.${format}`;
}

function metaSection(
  doc: EvaluationDocument,
  reportName: string,
  strategyId: string,
  selected: Set<ReportSection>,
): string {
  const meta = doc.evaluation ?? {};
  const run = doc.train?.run;
  const wf = doc.walkForward?.run;
  const sectionLabels = REPORT_SECTIONS.filter((section) => selected.has(section.key))
    .map((section) => section.label)
    .join('; ');
  const symbol = meta.symbol || run?.symbol || wf?.symbol || '—';
  const rows: string[][] = [
    ['reporte', reportName],
    ['simbolo', symbol],
    ['estrategia exportada', strategyId === 'all' ? 'todas' : strategyId],
    ['trials', meta.trials == null ? '—' : String(meta.trials)],
    ['dataDir', meta.dataDir || '—'],
    ['train', range(meta.trainFrom, meta.trainTo)],
    ['walk-forward', range(meta.walkForwardFrom, meta.walkForwardTo)],
    ['secciones', sectionLabels || '—'],
  ];
  if (run) rows.push(['run train', formatRunHeader('train', run)]);
  if (wf) rows.push(['run walk-forward', formatRunHeader('walk-forward', wf)]);

  return ['## Metadatos', table(['campo', 'valor'], rows)].join('\n\n');
}

function summarySection(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): string {
  const rows = filterByStrategy(splitStrategies(doc, split), strategyId);
  const lines = [
    `## ${splitLabel(split)} · resumen`,
    `_${formatRunHeader(runLabel(split), doc[split]?.run)}_`,
    table(
      [
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
      rows.map((row) => [
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
      ]),
    ),
  ];
  return lines.join('\n\n');
}

function detailsSection(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): string {
  const rows = filterByStrategy(splitStrategies(doc, split), strategyId);
  return [
    `## ${splitLabel(split)} · detalle`,
    '### Trades',
    table(
      [
        'estrategia',
        'al cierre',
        'win%',
        'ganadores',
        'R ganador',
        'R perdedor',
        'racha',
        'velas',
      ],
      rows.map((row) => [
        row.id,
        row.openAtEnd ? 'abierta' : 'plana',
        formatNumber(row.winRatePct, 1),
        formatNumber(row.winners, 0),
        formatNumber(row.avgWinR, 2),
        formatNumber(row.avgLossR, 2),
        formatNumber(row.maxConsecutiveLosses, 0),
        formatNumber(row.avgBarsInTrade, 1),
      ]),
    ),
    '### Salidas',
    table(
      ['estrategia', 'liquidacion', 'stop', 'target', 'signal'],
      rows.map((row) => [
        row.id,
        String(exitCountOf(row, 'LIQUIDATION')),
        String(exitCountOf(row, 'STOP')),
        String(exitCountOf(row, 'TARGET')),
        String(exitCountOf(row, 'SIGNAL')),
      ]),
    ),
    '### Curva',
    table(
      [
        'estrategia',
        'DD velas',
        'exposicion %',
        'Sharpe/vela',
        'Sharpe anual',
        'PSR',
      ],
      rows.map((row) => [
        row.id,
        formatNumber(row.maxDrawdownBars, 0),
        formatNumber(row.exposurePct, 1),
        formatNumber(row.sharpePerBar, 4),
        formatNumber(row.sharpeAnnualized, 2),
        formatNumber(row.probabilisticSharpe, 2),
      ]),
    ),
  ].join('\n\n');
}

function resultSection(doc: EvaluationDocument, strategyId: string): string {
  const rows = buildComparisonRows(doc, strategyId);
  const lines = [
    '## Resultado',
    table(
      [
        'estrategia',
        'train',
        'oos',
        'ΔDSR',
        'ΔE[R]',
        'Δtrades',
        'Δret%',
        'ΔDD%',
        'verdict',
      ],
      rows.map((row) => [
        row.id,
        row.trainFloor,
        row.oosFloor,
        formatNumber(row.delta?.deflatedSharpe, 2),
        formatNumber(row.delta?.expectancyR, 3),
        formatNumber(row.delta?.closedTrades, 0),
        formatNumber(row.delta?.returnPct, 1),
        formatNumber(row.delta?.maxDrawdownPct, 1),
        row.label,
      ]),
    ),
  ];

  const reasons = rows.filter((row) => row.reasons.length > 0);
  if (reasons.length > 0) {
    lines.push('### Motivos del veredicto');
    lines.push(
      reasons
        .map((row) => `- **${mdInline(row.id)}** (${mdInline(row.label)}): ${mdInline(row.reasons.join('; '))}`)
        .join('\n'),
    );
  }

  return lines.join('\n\n');
}

function monthlySection(doc: EvaluationDocument, strategyId: string): string {
  const bars = buildMonthlyBars(doc, strategyId);
  return [
    '## Ganancias por mes (IS / OOS)',
    table(
      ['mes', 'IS', 'OOS'],
      bars.map((bar) => [
        bar.month,
        formatNumber(bar.is, 2),
        formatNumber(bar.oos, 2),
      ]),
    ),
  ].join('\n\n');
}

function stagesSection(
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): string {
  const lines = ['## Stages'];
  for (const split of splitKeys(scope)) {
    lines.push(`### ${splitLabel(split)}`);
    const rows = filterByStrategy(splitStrategies(doc, split), strategyId);
    if (rows.length === 0) {
      lines.push('_Sin datos._');
      continue;
    }
    for (const row of rows) {
      lines.push(`#### ${mdInline(row.id)}`);
      lines.push('**Long**');
      lines.push(stageTable(row, 'long'));
      lines.push(`invalidated: ${row.stages?.invalidated?.long ?? 0}`);
      lines.push('**Short**');
      lines.push(stageTable(row, 'short'));
      lines.push(`invalidated: ${row.stages?.invalidated?.short ?? 0}`);
    }
  }
  return lines.join('\n\n');
}

function stageTable(row: StrategyReport, side: 'long' | 'short'): string {
  const stages = row.stages?.[side] ?? [];
  if (stages.length === 0) return '_Sin datos._';
  return table(
    ['stage', 'passed', 'timeouts', 'fellBack'],
    stages.map((stage, index) => [
      `S${stage.index ?? index}`,
      formatNumber(stage.passed, 0),
      formatNumber(stage.timeouts, 0),
      formatNumber(stage.fellBack, 0),
    ]),
  );
}

function tradesSection(
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): string {
  const lines = ['## Trades individuales'];
  for (const split of splitKeys(scope)) {
    const trades = collectTrades(doc, split, strategyId);
    lines.push(`### ${splitLabel(split)}`);
    if (trades.length === 0) {
      lines.push('_Sin datos._');
      continue;
    }
    lines.push(['```csv', tradeCsv(trades), '```'].join('\n'));
  }
  return lines.join('\n\n');
}

function tradeCsv(trades: TradeRow[]): string {
  const header = ['Strat', 'Side', 'Entry', 'Exit', 'PnL', 'R', 'Reason'];
  const rows = trades.map((trade) => [
    csvCell(trade.strategyId),
    csvCell(trade.side),
    csvCell(trade.entryTime),
    csvCell(trade.exitTime),
    csvCell(formatNumber(trade.netPnl, 2)),
    csvCell(formatNumber(trade.netR, 2)),
    csvCell(trade.reason),
  ]);
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '_Sin datos._';
  const head = `| ${headers.map(mdCell).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`).join('\n');
  return [head, separator, body].join('\n');
}

function mdCell(value: string): string {
  const text = String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  return text || '—';
}

function mdInline(value: string): string {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function csvCell(value: string | undefined | null): string {
  const text = value == null ? '—' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function splitKeys(scope: SplitScope): SplitKey[] {
  if (scope === 'train') return ['train'];
  if (scope === 'walkForward') return ['walkForward'];
  return ['train', 'walkForward'];
}

function splitLabel(split: SplitKey): string {
  return split === 'train' ? 'Train' : 'Walk-forward';
}

function runLabel(split: SplitKey): string {
  return split === 'train' ? 'train' : 'walk-forward';
}

function range(from: string | undefined, to: string | undefined): string {
  if (!from && !to) return '—';
  return `${from || '-'} -> ${to || '-'}`;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
