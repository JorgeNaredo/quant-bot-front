import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import {
  REPORT_SECTIONS,
  ReportExportOptions,
  SplitScope,
} from './report-export.types';
import {
  ReportTable,
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

export function buildCsvReport(
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
  const blocks: string[] = [];

  if (selected.has('meta')) {
    blocks.push(
      serializeCsvBlock(
        'meta',
        buildMetaTable(doc, reportName, strategyId, selectedLabels),
      ),
    );
  }
  if (selected.has('trainSummary')) {
    blocks.push(
      serializeCsvBlock('train_summary', buildSummaryTable(doc, 'train', strategyId)),
    );
  }
  if (selected.has('trainDetails')) {
    addDetailBlocks(blocks, 'train', doc, strategyId);
  }
  if (selected.has('walkForwardSummary')) {
    blocks.push(
      serializeCsvBlock(
        'walk_forward_summary',
        buildSummaryTable(doc, 'walkForward', strategyId),
      ),
    );
  }
  if (selected.has('walkForwardDetails')) {
    addDetailBlocks(blocks, 'walk_forward', doc, strategyId, 'walkForward');
  }
  if (selected.has('result')) {
    blocks.push(
      serializeCsvBlock('result', buildResultTable(doc, strategyId)),
    );
    blocks.push(
      serializeCsvBlock(
        'result_verdicts',
        buildVerdictReasonsTable(doc, strategyId),
      ),
    );
  }
  if (selected.has('monthly')) {
    blocks.push(
      serializeCsvBlock('monthly', buildMonthlyTable(doc, strategyId)),
    );
  }
  if (selected.has('stages')) {
    addStageBlocks(blocks, doc, strategyId, options.stagesSplit);
  }
  if (selected.has('trades')) {
    addTradeBlocks(blocks, doc, strategyId, options.tradesSplit);
  }

  return `${blocks.join('\n\n')}\n`;
}

export function serializeCsvTable(table: ReportTable): string {
  return [
    table.headers.map(csvCell).join(','),
    ...table.rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n');
}

function serializeCsvBlock(key: string, table: ReportTable): string {
  return [`# ${key}`, serializeCsvTable(table)].join('\n');
}

function addDetailBlocks(
  blocks: string[],
  keyPrefix: string,
  doc: EvaluationDocument,
  strategyId: string,
  split: 'train' | 'walkForward' = 'train',
): void {
  const tables = buildDetailTables(doc, split, strategyId);
  blocks.push(
    serializeCsvBlock(`${keyPrefix}_details_trades`, tables.trades),
    serializeCsvBlock(`${keyPrefix}_details_exits`, tables.exits),
    serializeCsvBlock(`${keyPrefix}_details_curve`, tables.curve),
  );
}

function addStageBlocks(
  blocks: string[],
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): void {
  for (const split of splitKeys(scope)) {
    const groups = buildStageGroups(doc, split, strategyId);
    const key = split === 'train' ? 'train' : 'walk_forward';
    const stageTable: ReportTable = {
      headers: ['estrategia', 'side', ...STAGE_HEADERS],
      rows: groups.flatMap((group) => [
        ...stageRows(group.long).map((row) => [group.strategyId, 'long', ...row]),
        ...stageRows(group.short).map((row) => [group.strategyId, 'short', ...row]),
      ]),
    };
    const invalidatedTable: ReportTable = {
      headers: ['estrategia', 'side', 'invalidated'],
      rows: groups.flatMap((group) => [
        [group.strategyId, 'long', String(group.invalidatedLong)],
        [group.strategyId, 'short', String(group.invalidatedShort)],
      ]),
    };
    blocks.push(
      serializeCsvBlock(`stages_${key}`, stageTable),
      serializeCsvBlock(`stages_${key}_invalidated`, invalidatedTable),
    );
  }
}

function addTradeBlocks(
  blocks: string[],
  doc: EvaluationDocument,
  strategyId: string,
  scope: SplitScope,
): void {
  for (const split of splitKeys(scope)) {
    const key = split === 'train' ? 'train' : 'walk_forward';
    blocks.push(
      serializeCsvBlock(`trades_${key}`, buildTradeTable(doc, split, strategyId)),
    );
  }
}

function splitKeys(scope: SplitScope): Array<'train' | 'walkForward'> {
  if (scope === 'train') return ['train'];
  if (scope === 'walkForward') return ['walkForward'];
  return ['train', 'walkForward'];
}

function csvCell(value: string | undefined | null): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
