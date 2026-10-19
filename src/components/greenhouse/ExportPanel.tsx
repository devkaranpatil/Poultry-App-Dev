import { useState } from 'react';
import { Check, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { useI18n } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import type { FinanceAssumptions } from '@/lib/finance';
import type { LoanTerms } from '@/lib/loan';
import { captureModelSnapshot } from '@/lib/modelSnapshot';
import { buildReportData } from '@/lib/export/reportData';
import type { CalculationResult, GreenhouseConfig } from '@/types/greenhouse';

interface ExportPanelProps {
  config: GreenhouseConfig;
  result: CalculationResult | null;
  assumptions: FinanceAssumptions;
  loanTerms?: LoanTerms;
  ai?: AiAssistant;
  /** Whether the AI summary goes in. Pass both to share the setting with the summary step; otherwise the panel keeps its own. */
  includeAdvisor?: boolean;
  onIncludeAdvisorChange?: (next: boolean) => void;
}

type Format = 'pdf' | 'xlsx';

export function ExportPanel({ config, result, assumptions, loanTerms, ai, includeAdvisor: includeAdvisorProp, onIncludeAdvisorChange }: ExportPanelProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<Format | null>(null);
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [ownIncludeAdvisor, setOwnIncludeAdvisor] = useState(true);
  const includeAdvisor = includeAdvisorProp ?? ownIncludeAdvisor;
  const setIncludeAdvisor = onIncludeAdvisorChange ?? setOwnIncludeAdvisor;
  const [includeAiCrops, setIncludeAiCrops] = useState(true);

  const hasAdvisor = Boolean(ai?.advisor && !ai.advisorStale);
  const hasAiCrops = Boolean(ai?.crops && !ai.cropsStale);

  const run = async (format: Format) => {
    if (!result) return;
    setBusy(format);
    try {
      const data = buildReportData({
        config,
        result,
        assumptions,
        loanTerms,
        advisor: includeAdvisor && hasAdvisor ? ai?.advisor : null,
        aiCrops: includeAiCrops && hasAiCrops ? ai?.crops : null,
        snapshot: format === 'pdf' && includeSnapshot ? captureModelSnapshot() : null,
      });
      if (format === 'pdf') {
        const { exportPdfReport } = await import('@/lib/export/pdfReport');
        await exportPdfReport(data);
      } else {
        const { exportExcelReport } = await import('@/lib/export/excelReport');
        await exportExcelReport(data);
      }
      toast.success(t(format === 'pdf' ? 'export.pdfDone' : 'export.xlsxDone'));
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('export.failed'));
    } finally {
      setBusy(null);
    }
  };

  if (!result) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('export.needResult')}</p>;
  }

  const option = (id: string, checked: boolean, onChange: (value: boolean) => void, label: string, hint?: string, disabled?: boolean) => (
    <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <Checkbox id={id} checked={checked && !disabled} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );

  const formats: Array<{ format: Format; icon: typeof FileText; title: string; desc: string; points: string[] }> = [
    {
      format: 'pdf',
      icon: FileText,
      title: t('export.pdfTitle'),
      desc: t('export.pdfDesc'),
      points: [t('export.pdfPoint1'), t('export.pdfPoint2'), t('export.pdfPoint3')],
    },
    {
      format: 'xlsx',
      icon: FileSpreadsheet,
      title: t('export.xlsxTitle'),
      desc: t('export.xlsxDesc'),
      points: [t('export.xlsxPoint1'), t('export.xlsxPoint2'), t('export.xlsxPoint3')],
    },
  ];

  return (
    <div className="space-y-4">
      {formats.map(({ format, icon: Icon, title, desc, points }) => (
        <div key={format} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1">
            {points.map((point) => (
              <li key={point} className="flex gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" onClick={() => void run(format)} disabled={busy !== null}>
            {busy === format ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {busy === format ? t('export.preparing') : t(format === 'pdf' ? 'export.downloadPdf' : 'export.downloadXlsx')}
          </Button>
        </div>
      ))}

      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <p className="eyebrow">{t('export.include')}</p>
        {option('export-snapshot', includeSnapshot, setIncludeSnapshot, t('export.optSnapshot'), t('export.optSnapshotHint'))}
        {option(
          'export-advisor',
          includeAdvisor,
          setIncludeAdvisor,
          t('export.optAdvisor'),
          hasAdvisor ? undefined : t('export.optAdvisorHint'),
          !hasAdvisor
        )}
        {option(
          'export-crops',
          includeAiCrops,
          setIncludeAiCrops,
          t('export.optCrops'),
          hasAiCrops ? undefined : t('export.optCropsHint'),
          !hasAiCrops
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t('export.languageNote')}</p>
    </div>
  );
}
