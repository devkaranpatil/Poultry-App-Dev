import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Columns3, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useI18n } from '@/context/I18nContext';
import {
  createConfiguration,
  deleteConfiguration,
  listConfigurations,
  type SavedConfiguration,
} from '@/services/configuration.service';
import { calculateGreenhouse } from '@/services/calculation.service';
import {
  computeFinancials,
  defaultFinanceAssumptions,
  type FinanceAssumptions,
  type FinancialSummary,
} from '@/lib/finance';
import { formatINR, formatINRCompact, formatNumber } from '@/lib/format';
import { normalizeGreenhouseConfig, type CalculationResult, type GreenhouseConfig } from '@/types/greenhouse';

const MAX_COMPARE = 3;

interface SavedSetupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  currentConfig: GreenhouseConfig;
  onLoad: (config: GreenhouseConfig) => void;
  /** Subsidy and operating-cost settings applied to every compared setup. */
  financeAssumptions: FinanceAssumptions;
}

interface CompareRow {
  item: SavedConfiguration;
  config: GreenhouseConfig;
  result: CalculationResult | null;
  financials: FinancialSummary | null;
}

const optionKey = (value: string) => value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

export function SavedSetupsDialog({
  open,
  onOpenChange,
  token,
  currentConfig,
  onLoad,
  financeAssumptions,
}: SavedSetupsDialogProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<SavedConfiguration[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareRows, setCompareRows] = useState<CompareRow[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setIsLoadingList(true);
    setError(null);
    try {
      setItems(await listConfigurations(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failedLoad'));
    } finally {
      setIsLoadingList(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (!open) {
      setCompareRows(null);
      setSelectedIds([]);
      return;
    }
    void refresh();
  }, [open, refresh]);

  const handleSave = async () => {
    if (!token) return;
    const name =
      saveName.trim() ||
      `${currentConfig.greenhouseType.replace(/-/g, ' ')} ${currentConfig.length}x${currentConfig.width}`;
    setIsSaving(true);
    setError(null);
    try {
      await createConfiguration(token, { name, configType: 'greenhouse', config: currentConfig });
      setSaveName('');
      toast.success(t('app.saveSuccess', { name }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failedSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setError(null);
    try {
      await deleteConfiguration(token, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => prev.filter((selected) => selected !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failedDelete'));
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.length >= MAX_COMPARE ? prev : [...prev, id]) : prev.filter((selected) => selected !== id)
    );
  };

  const runCompare = async () => {
    const chosen = items.filter((item) => selectedIds.includes(item.id));
    setIsComparing(true);
    const settled = await Promise.allSettled(
      chosen.map((item) => calculateGreenhouse(normalizeGreenhouseConfig(item.config as GreenhouseConfig)))
    );
    setCompareRows(
      chosen.map((item, index) => {
        const config = normalizeGreenhouseConfig(item.config as GreenhouseConfig);
        const outcome = settled[index];
        if (outcome.status !== 'fulfilled') return { item, config, result: null, financials: null };
        // Each setup keeps its own crop yields/prices; subsidy and opex follow the current settings.
        const assumptions = {
          ...defaultFinanceAssumptions(config.selectedCrop),
          subsidyPct: financeAssumptions.subsidyPct,
          operatingCostPct: financeAssumptions.operatingCostPct,
        };
        return {
          item,
          config,
          result: outcome.value,
          financials: computeFinancials(outcome.value.cost.totalCost, outcome.value.area, assumptions, outcome.value.subsidy),
        };
      })
    );
    setIsComparing(false);
  };

  const renderCompare = (rows: CompareRow[]) => {
    const calculated = rows.filter((row) => row.result);
    const costs = calculated.map((row) => row.result?.cost.totalCost ?? Infinity);
    const paybacks = calculated.map((row) => row.financials?.paybackYears ?? Infinity);
    const lowestCost = Math.min(...costs);
    const fastestPayback = Math.min(...paybacks);
    // Only crown a winner when the setups actually differ on that metric.
    const costsDiffer = new Set(costs).size > 1;
    const paybacksDiffer = new Set(paybacks).size > 1;

    const metrics: Array<{ label: string; render: (row: CompareRow) => ReactNode; isBest?: (row: CompareRow) => boolean }> = [
      { label: t('compare.area'), render: (row) => `${formatNumber(row.config.length * row.config.width)} m²` },
      { label: t('compare.type'), render: (row) => t(`options.greenhouse.${optionKey(row.config.greenhouseType)}`) },
      { label: t('compare.roof'), render: (row) => t(`options.roof.${row.config.roofType}`) },
      { label: t('compare.crop'), render: (row) => t(`options.crop.${row.config.selectedCrop}`) },
      {
        label: t('compare.location'),
        render: (row) => [row.config.district, row.config.state].filter(Boolean).join(', ') || '—',
      },
      {
        label: t('compare.totalCost'),
        render: (row) => (row.result ? formatINR(row.result.cost.totalCost) : t('compare.failed')),
        isBest: (row) => costsDiffer && row.result?.cost.totalCost === lowestCost,
      },
      { label: t('compare.costPerSqm'), render: (row) => (row.result ? formatINR(row.result.cost.costPerSqm) : '—') },
      {
        label: t('compare.netInvestment'),
        render: (row) => (row.financials ? formatINRCompact(row.financials.netInvestment) : '—'),
      },
      {
        label: t('compare.payback'),
        render: (row) =>
          !row.financials
            ? '—'
            : row.financials.paybackYears === null
              ? t('returns.noPayback')
              : t('returns.paybackYears', { years: formatNumber(row.financials.paybackYears) }),
        isBest: (row) =>
          paybacksDiffer && Number.isFinite(fastestPayback) && row.financials?.paybackYears === fastestPayback,
      },
    ];

    return (
      <div className="space-y-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setCompareRows(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('compare.back')}
        </Button>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="p-2.5 text-left text-xs font-medium text-muted-foreground">
                  {t('compare.metric')}
                </th>
                {rows.map((row) => (
                  <th key={row.item.id} scope="col" className="p-2.5 text-left font-semibold text-foreground">
                    {row.item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.label} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="p-2.5 text-left text-xs font-normal text-muted-foreground">
                    {metric.label}
                  </th>
                  {rows.map((row) => {
                    const best = metric.isBest?.(row) ?? false;
                    return (
                      <td
                        key={row.item.id}
                        className={`p-2.5 tabular-nums ${best ? 'font-semibold text-primary' : 'text-foreground'}`}
                      >
                        {metric.render(row)}
                        {best ? (
                          <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium">
                            {t('compare.best')}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('compare.note', { subsidy: financeAssumptions.subsidyPct, opex: financeAssumptions.operatingCostPct })}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-elevated max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{compareRows ? t('compare.title') : t('app.savedConfigurations')}</DialogTitle>
          <DialogDescription>{compareRows ? t('compare.subtitle') : t('app.savedHelper')}</DialogDescription>
        </DialogHeader>

        {compareRows ? (
          renderCompare(compareRows)
        ) : (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('app.saveToCloud')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('app.savedDialogHint')}</p>
                  </div>
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSave();
                    }}
                  >
                    <Input
                      value={saveName}
                      onChange={(event) => setSaveName(event.target.value)}
                      placeholder={t('app.configName')}
                      maxLength={120}
                      aria-label={t('app.configName')}
                    />
                    <Button type="submit" disabled={isSaving || !token} className="sm:min-w-36">
                      {isSaving ? t('app.saving') : t('app.saveToCloud')}
                    </Button>
                  </form>
                </div>
              </div>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t('compare.select', { max: MAX_COMPARE })}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={selectedIds.length < 2 || isComparing}
                onClick={() => void runCompare()}
              >
                {isComparing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Columns3 className="mr-1.5 h-4 w-4" />
                )}
                {isComparing ? t('compare.loading') : t('compare.button', { count: selectedIds.length })}
              </Button>
            </div>

            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {isLoadingList ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
              {!isLoadingList && items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('app.noSaved')}</p>
              ) : null}
              {items.map((item) => {
                const checked = selectedIds.includes(item.id);
                const itemConfig = normalizeGreenhouseConfig(item.config as GreenhouseConfig);
                return (
                  <div key={item.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
                    <Checkbox
                      checked={checked}
                      disabled={!checked && selectedIds.length >= MAX_COMPARE}
                      onCheckedChange={(value) => toggleSelected(item.id, value === true)}
                      aria-label={t('compare.selectItem', { name: item.name })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {itemConfig.length}×{itemConfig.width} m · {t(`options.crop.${itemConfig.selectedCrop}`)}
                        {itemConfig.district ? ` · ${itemConfig.district}` : ''} ·{' '}
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => {
                          onLoad(itemConfig);
                          onOpenChange(false);
                        }}
                      >
                        {t('common.load')}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDelete(item.id)}
                        aria-label={`${t('common.delete')} ${item.name}`}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
