import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import { downloadTextFile } from '../../../shared/utils/download-file';
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
  imports: [FormsModule, ButtonModule, CheckboxModule, DialogModule, SelectModule],
  templateUrl: './report-export.component.html',
  styleUrl: './report-export.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportExportComponent implements OnInit {
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
  protected readonly strategies = computed(() => strategyOptions(this.evaluation()));
  protected readonly canDownload = computed(() => this.sections().length > 0);
  protected readonly confirmMode = computed(
    () => evaluationModeOf(this.evaluation()) === 'confirm',
  );
  protected readonly sectionsCatalog = computed(() => sectionsForDocument(this.evaluation()));

  protected readonly splitOptions: { value: SplitScope; label: string }[] = [
    { value: 'both', label: 'Train + walk-forward' },
    { value: 'train', label: 'Train' },
    { value: 'walkForward', label: 'Walk-forward' },
  ];
  protected readonly confirmSplitOptions: { value: SplitScope; label: string }[] = [
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
    });
    const filename = buildExportFilename(
      this.reportName(),
      this.strategyId(),
      this.format(),
    );
    downloadTextFile(filename, content, exportMimeType(this.format()));
    this.visible.set(false);
  }

  protected onHide(): void {
    this.closed.emit();
  }
}
