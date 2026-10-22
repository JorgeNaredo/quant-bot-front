import { evaluationModeOf } from '../report-data';
import { EvaluationDocument } from '../../../shared/models/bot-api.model';

export type ExportFormat = 'md' | 'csv';

export type ReportSection =
  | 'meta'
  | 'trainSummary'
  | 'trainDetails'
  | 'walkForwardSummary'
  | 'walkForwardDetails'
  | 'holdoutSummary'
  | 'holdoutDetails'
  | 'result'
  | 'monthly'
  | 'stages'
  | 'trades';

export type SplitScope = 'train' | 'walkForward' | 'holdout' | 'both';

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
  { key: 'holdoutSummary', label: 'Holdout · resumen' },
  { key: 'holdoutDetails', label: 'Holdout · detalle (trades, salidas, curva)' },
  { key: 'result', label: 'Resultado y veredictos' },
  { key: 'monthly', label: 'Ganancias por mes' },
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

export const DEFAULT_CONFIRM_SECTIONS: ReportSection[] = [
  'holdoutSummary',
  'result',
  'stages',
];

export function sectionsForDocument(doc: EvaluationDocument): ReportSectionDefinition[] {
  const confirm = evaluationModeOf(doc) === 'confirm';
  return REPORT_SECTIONS.filter((section) => {
    if (confirm) {
      return ![
        'trainSummary',
        'trainDetails',
        'walkForwardSummary',
        'walkForwardDetails',
      ].includes(section.key);
    }
    return !['holdoutSummary', 'holdoutDetails'].includes(section.key);
  });
}

export function defaultSectionsForDocument(doc: EvaluationDocument): ReportSection[] {
  return evaluationModeOf(doc) === 'confirm'
    ? [...DEFAULT_CONFIRM_SECTIONS]
    : [...DEFAULT_REPORT_SECTIONS];
}
