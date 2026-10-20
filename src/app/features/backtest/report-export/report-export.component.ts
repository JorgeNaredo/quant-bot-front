import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EvaluationDocument } from '../../../shared/models/bot-api.model';
import { downloadTextFile } from '../../../shared/utils/download-file';
import { strategyOptions } from '../report-data';
import {
  buildExportFilename,
  buildReportExport,
  exportMimeType,
} from './report-export.builder';
import {
  ALL_REPORT_SECTIONS,
  DEFAULT_REPORT_SECTIONS,
  ExportFormat,
  REPORT_SECTIONS,
  ReportSection,
  SplitScope,
} from './report-export.types';

@Component({
  selector: 'app-report-export',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './report-export.component.html',
  styleUrl: './report-export.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportExportComponent implements AfterViewInit {
  @ViewChild('dialog')
  private dialogRef?: ElementRef<HTMLDialogElement>;

  readonly evaluation = input.required<EvaluationDocument>();
  readonly reportName = input.required<string>();
  readonly closed = output<void>();

  protected readonly formats: ReadonlyArray<{ value: ExportFormat; label: string }> = [
    { value: 'md', label: 'Markdown (.md)' },
    { value: 'csv', label: 'CSV para análisis IA (.csv)' },
  ];
  protected readonly sectionsCatalog = REPORT_SECTIONS;
  protected readonly format = signal<ExportFormat>('md');
  protected readonly sections = signal<ReportSection[]>([...DEFAULT_REPORT_SECTIONS]);
  protected readonly strategyId = signal<string>('all');
  protected readonly tradesSplit = signal<SplitScope>('both');
  protected readonly stagesSplit = signal<SplitScope>('both');
  protected readonly strategies = computed(() => strategyOptions(this.evaluation()));
  protected readonly canDownload = computed(() => this.sections().length > 0);

  ngAfterViewInit(): void {
    this.dialogRef?.nativeElement.showModal();
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
    this.sections.set([...ALL_REPORT_SECTIONS]);
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
    this.closeDialog();
  }

  protected closeDialog(): void {
    this.dialogRef?.nativeElement.close();
  }

  protected onDialogClosed(): void {
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogRef?.nativeElement) {
      this.closeDialog();
    }
  }
}
