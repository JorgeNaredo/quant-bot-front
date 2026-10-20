import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import { buildCsvReport } from './report-csv.builder';
import {
  ExportFormat,
  ReportExportOptions,
} from './report-export.types';
import { buildMarkdownReport } from './report-markdown.builder';

export function buildReportExport(
  doc: EvaluationDocument,
  reportName: string,
  options: ReportExportOptions,
): string {
  return options.format === 'csv'
    ? buildCsvReport(doc, reportName, options)
    : buildMarkdownReport(doc, reportName, options);
}

export function exportMimeType(format: ExportFormat): string {
  return format === 'csv'
    ? 'text/csv;charset=utf-8'
    : 'text/markdown;charset=utf-8';
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
