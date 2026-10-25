import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import { BotApiService } from '../../../shared/services/bot-api.service';
import { downloadBlob, downloadTextFile } from '../../../shared/utils/download-file';
import { evaluationModeOf, strategyOptions } from '../report-data';
import {
  buildExportFilename,
  buildReportExport,
  exportMimeType,
} from './report-export.builder';
import {
  ExportFormat,
  ReportSection,
  SplitScope,
  defaultSectionsForDocument,
  sectionsForDocument,
} from './report-export.types';

@Component({
  selector: 'app-report-export',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
  ],
  templateUrl: './report-export.component.html',
  styleUrl: './report-export.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportExportComponent implements OnInit {
  private readonly api = inject(BotApiService);

  readonly evaluation = input.required<EvaluationDocument>();
  readonly reportName = input.required<string>();
  readonly closed = output<void>();

  protected readonly visible = signal(true);
  protected readonly formats: { value: ExportFormat; label: string }[] = [
    { value: 'md', label: 'Markdown (.md)' },
    { value: 'csv', label: 'CSV para análisis IA (.csv)' },
  ];
  protected readonly format = signal<ExportFormat>('md');
  protected readonly sections = signal<ReportSection[]>([]);
  protected readonly strategyId = signal<string>('all');
  protected readonly tradesSplit = signal<SplitScope>('both');
  protected readonly stagesSplit = signal<SplitScope>('both');
  protected readonly monthlySplit = signal<SplitScope>('both');
  protected readonly strategies = computed(() => strategyOptions(this.evaluation()));
  protected readonly canDownload = computed(() => this.sections().length > 0);
  protected readonly confirmMode = computed(
    () => evaluationModeOf(this.evaluation()) === 'confirm',
  );
  protected readonly sectionsCatalog = computed(() => sectionsForDocument(this.evaluation()));
  protected readonly hasAudit = computed(
    () => !!this.evaluation().evaluation?.audit?.file,
  );
  protected readonly auditFormats: { value: 'jsonl' | 'csv'; label: string }[] = [
    { value: 'jsonl', label: 'JSONL (.jsonl)' },
    { value: 'csv', label: 'CSV (.csv)' },
  ];
  protected readonly auditFormat = signal<'jsonl' | 'csv'>('csv');
  protected readonly auditSplits = signal<string[]>([]);
  protected readonly auditStrategies = signal<string[]>([]);
  protected readonly auditFromMonth = signal('');
  protected readonly auditToMonth = signal('');
  protected readonly auditBusy = signal(false);
  protected readonly auditError = signal<string | null>(null);
  protected readonly auditSplitChoices = computed(() => {
    if (this.confirmMode()) {
      return [
        { value: 'oos', label: 'OOS' },
        { value: 'holdout', label: 'Holdout' },
      ];
    }
    return [
      { value: 'is', label: 'IS' },
      { value: 'oos', label: 'OOS' },
    ];
  });
  protected readonly auditStrategyChoices = computed(() =>
    this.strategies()
      .filter((id) => id !== 'all')
      .map((id) => ({ value: id, label: id })),
  );

  protected readonly splitOptions: { value: SplitScope; label: string }[] = [
    { value: 'both', label: 'Train + walk-forward' },
    { value: 'train', label: 'Train' },
    { value: 'walkForward', label: 'Walk-forward' },
  ];
  protected readonly confirmSplitOptions: { value: SplitScope; label: string }[] = [
    { value: 'holdout', label: 'Holdout' },
  ];
  protected readonly monthlySplitOptions: { value: SplitScope; label: string }[] = [
    { value: 'both', label: 'IS + OOS' },
    { value: 'train', label: 'Train (IS)' },
    { value: 'walkForward', label: 'Walk-forward (OOS)' },
  ];
  protected readonly monthlyConfirmSplitOptions: { value: SplitScope; label: string }[] = [
    { value: 'both', label: 'OOS + Holdout' },
    { value: 'oos', label: 'OOS' },
    { value: 'holdout', label: 'Holdout' },
  ];
  protected readonly strategyChoices = computed(() =>
    this.strategies().map((id) => ({ value: id, label: id === 'all' ? 'Todas' : id })),
  );

  ngOnInit(): void {
    const doc = this.evaluation();
    this.sections.set(defaultSectionsForDocument(doc));
    if (evaluationModeOf(doc) === 'confirm') {
      this.tradesSplit.set('holdout');
      this.stagesSplit.set('holdout');
      this.monthlySplit.set('both');
      this.auditSplits.set(['holdout']);
    } else {
      this.auditSplits.set(['is', 'oos']);
    }
  }

  protected isChecked(section: ReportSection): boolean {
    return this.sections().includes(section);
  }

  protected toggleSection(section: ReportSection, checked: boolean): void {
    this.sections.update((current) =>
      checked ? [...current, section] : current.filter((key) => key !== section),
    );
  }

  protected selectAllSections(): void {
    this.sections.set(this.sectionsCatalog().map((section) => section.key));
  }

  protected clearSections(): void {
    this.sections.set([]);
  }

  protected download(): void {
    if (!this.canDownload()) return;
    const content = buildReportExport(this.evaluation(), this.reportName(), {
      format: this.format(),
      sections: this.sections(),
      strategyId: this.strategyId(),
      tradesSplit: this.tradesSplit(),
      stagesSplit: this.stagesSplit(),
      monthlySplit: this.monthlySplit(),
    });
    const filename = buildExportFilename(
      this.reportName(),
      this.strategyId(),
      this.format(),
    );
    downloadTextFile(filename, content, exportMimeType(this.format()));
    this.visible.set(false);
  }

  protected downloadAudit(): void {
    if (!this.hasAudit() || this.auditBusy()) return;
    const report = this.reportName();
    if (!report || report === 'latest') {
      this.auditError.set('Selecciona un informe guardado para exportar la auditoría');
      return;
    }
    this.auditBusy.set(true);
    this.auditError.set(null);
    const from = this.auditFromMonth().trim();
    const to = this.auditToMonth().trim();
    this.api
      .exportAudit(report, {
        split: this.auditSplits().length ? this.auditSplits().join(',') : undefined,
        strategy: this.auditStrategies().length
          ? this.auditStrategies().join(',')
          : undefined,
        fromMonth: from || undefined,
        toMonth: to || undefined,
        format: this.auditFormat(),
      })
      .subscribe({
        next: (blob) => {
          this.auditBusy.set(false);
          const base = report.replace(/\.json$/i, '');
          downloadBlob(`${base}-audit-export.${this.auditFormat()}`, blob);
        },
        error: (err) => {
          this.auditBusy.set(false);
          this.auditError.set(
            err?.error?.message || err?.message || 'No se pudo exportar la auditoría',
          );
        },
      });
  }

  protected onHide(): void {
    this.closed.emit();
  }
}
