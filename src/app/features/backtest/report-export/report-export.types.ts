export type ExportFormat = 'md' | 'csv';

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
