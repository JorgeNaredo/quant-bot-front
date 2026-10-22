import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import { SplitKey, evaluationModeOf, formatRunHeader } from '../report-data';
import {
  REPORT_SECTIONS,
  ReportExportOptions,
  ReportSection,
  SplitScope,
} from './report-export.types';
import {
  ReportTable,
  StageEntry,
  STAGE_HEADERS,
  buildDetailTables,
  buildMetaTable,
  buildMonthlyTable,
  buildResultTable,
  buildStageGroups,
  buildSummaryTable,
  buildTradeTable,
  buildVerdictReasonsTable,
  stageRows,
} from './report-tables';
import { serializeCsvTable } from './report-csv.builder';

export function buildMarkdownReport(
  doc: EvaluationDocument,
  reportName: string,
  options: ReportExportOptions,
): string {
  const selected = new Set(options.sections);
  const strategyId = options.strategyId || 'all';
  const selectedLabels = REPORT_SECTIONS.filter((section) =>
    selected.has(section.key),
  )
    .map((section) => section.label)
    .join('; ');
  const parts: string[] = [
    `# Backtest · ${mdInline(reportName)}`,
    `_Generado: ${new Date().toISOString()}_`,
  ];

  const add = (key: ReportSection, content: string) => {
    if (selected.has(key)) parts.push(content);
  };

  add('meta', renderMeta(doc, reportName, strategyId, selectedLabels));
  add('trainSummary', renderSummary(doc, 'train', strategyId));
  add('trainDetails', renderDetails(doc, 'train', strategyId));
  add('walkForwardSummary', renderSummary(doc, 'walkForward', strategyId));
  add('walkForwardDetails', renderDetails(doc, 'walkForward', strategyId));
  add('holdoutSummary', renderSummary(doc, 'holdout', strategyId));
  add('holdoutDetails', renderDetails(doc, 'holdout', strategyId));
  add('result', renderResult(doc, strategyId));
  add('monthly', renderMonthly(doc, strategyId));
  add('stages', renderStages(doc, strategyId, options.stagesSplit));
  add('trades', renderTrades(doc, strategyId, options.tradesSplit));

  return `${parts.join('\n\n')}\n`;
}

function renderMeta(
  doc: EvaluationDocument,
  reportName: string,
  strategyId: string,
  selectedLabels: string,
): string {
  return [
    '## Metadatos',
    markdownTable(buildMetaTable(doc, reportName, strategyId, selectedLabels)),
  ].join('\n\n');
}

function renderSummary(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): string {
  return [
    `## ${splitLabel(split)} · resumen`,
    `_${formatRunHeader(runLabel(split), doc[split]?.run)}_`,
    markdownTable(buildSummaryTable(doc, split, strategyId)),
  ].join('\n\n');
}

function renderDetails(
  doc: EvaluationDocument,
  split: SplitKey,
  strategyId: string,
): string {
  const tables = buildDetailTables(doc, split, strategyId);
  return [
    `## ${splitLabel(split)} · detalle`,
    '### Trades',
    markdownTable(tables.trades),
    '### Salidas',
    markdownTable(tables.exits),
    '### Curva',
    markdownTable(tables.curve),
  ].join('\n\n');
}

function renderResult(doc: EvaluationDocument, strategyId: string): string {
  const reasons = buildVerdictReasonsTable(doc, strategyId);
  const lines = ['## Resultado', markdownTable(buildResultTable(doc, strategyId))];
  if (reasons.rows.length > 0) {
    lines.push('### Motivos del veredicto');
    lines.push(
      reasons.rows
        .map(
          ([id, label, text]) =>
            `- **${mdInline(id)}** (${mdInline(label)}): ${mdInline(text)}`,
        )
        .join('\n'),
    );
  }
  return lines.join('\n\n');
}

function renderMonthly(doc: EvaluationDocument, strategyId: string): string {
  const title =
    evaluationModeOf(doc) === 'confirm'
      ? '## Ganancias por mes (holdout)'
      : '## Ganancias por mes (IS / OOS)';
  return [title, markdownTable(buildMonthlyTable(doc, strategyId))].join('\n\n');
}

function renderStages(
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): string {
  const lines = ['## Stages'];
  for (const split of splitKeys(scope)) {
    lines.push(`### ${splitLabel(split)}`);
    const groups = buildStageGroups(doc, split, strategyId);
    if (groups.length === 0) {
      lines.push('_Sin datos._');
      continue;
    }
    for (const group of groups) {
      lines.push(`#### ${mdInline(group.strategyId)}`);
      lines.push('**Long**');
      lines.push(stageTable(group.long));
      lines.push(`invalidated: ${group.invalidatedLong}`);
      lines.push('**Short**');
      lines.push(stageTable(group.short));
      lines.push(`invalidated: ${group.invalidatedShort}`);
    }
  }
  return lines.join('\n\n');
}

function stageTable(stages: StageEntry[]): string {
  if (stages.length === 0) return '_Sin datos._';
  return markdownTable({
    headers: STAGE_HEADERS,
    rows: stageRows(stages),
  });
}

function renderTrades(
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): string {
  const lines = ['## Trades individuales'];
  for (const split of splitKeys(scope)) {
    lines.push(`### ${splitLabel(split)}`);
    const table = buildTradeTable(doc, split, strategyId);
    if (table.rows.length === 0) {
      lines.push('_Sin datos._');
      continue;
    }
    lines.push(['```csv', serializeCsvTable(table), '```'].join('\n'));
  }
  return lines.join('\n\n');
}

function markdownTable(table: ReportTable): string {
  if (table.rows.length === 0) return '_Sin datos._';
  const head = `| ${table.headers.map(mdCell).join(' | ')} |`;
  const separator = `| ${table.headers.map(() => '---').join(' | ')} |`;
  const body = table.rows
    .map((row) => `| ${row.map(mdCell).join(' | ')} |`)
    .join('\n');
  return [head, separator, body].join('\n');
}

function mdCell(value: string): string {
  const text = String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  return text || '—';
}

function mdInline(value: string): string {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function splitKeys(scope: SplitScope): SplitKey[] {
  if (scope === 'train') return ['train'];
  if (scope === 'walkForward') return ['walkForward'];
  if (scope === 'holdout') return ['holdout'];
  return ['train', 'walkForward'];
}

function splitLabel(split: SplitKey): string {
  if (split === 'train') return 'Train';
  if (split === 'holdout') return 'Holdout';
  return 'Walk-forward';
}

function runLabel(split: SplitKey): string {
  if (split === 'train') return 'train';
  if (split === 'holdout') return 'holdout';
  return 'walk-forward';
}
