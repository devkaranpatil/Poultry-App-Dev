import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Bird, Box, Copy, FolderOpen, MapPin, Plus, Ruler, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import { Logo } from '@/components/brand/Logo';
import { TopRightMenu } from '@/components/TopRightMenu';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { calculateFarm } from '@/services/calculation.service';
import {
  createConfiguration,
  deleteConfiguration,
  listConfigurations,
  type SavedConfiguration,
} from '@/services/configuration.service';
import { clearDraft, loadDraft, saveDraft } from '@/lib/configPersistence';
import { formatINRCompact, formatNumber } from '@/lib/format';
import { flockSize } from '@/lib/flock';
import { DEFAULT_CONFIG, normalizeFarmConfig, optionKey, type FarmConfig } from '@/types/farm';

const SAVED_QUERY_KEY = ['saved-configurations'];

/** A photo per kind of farm, so projects are easy to tell apart at a glance. */
const BIRD_PHOTO: Record<string, string> = {
  broiler: '/images/shed-interior-800.webp',
  'layer-cage': '/images/layer-cages-640.webp',
  'layer-floor': '/images/layer-cages-640.webp',
  desi: '/images/desi-yard-640.webp',
};

/** A saved setup only has a price once it names a place, because climate is part of the estimate. */
const hasLocation = (config: FarmConfig) => config.state.trim() !== '' && config.district.trim() !== '';

function SetupCost({ config }: { config: FarmConfig }) {
  const { t } = useI18n();
  const located = hasLocation(config);
  const cost = useQuery({
    queryKey: ['setup-cost', JSON.stringify(config)],
    queryFn: () => calculateFarm(config, {}),
    enabled: located,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!located) return <p className="text-xs text-muted-foreground">{t('dashboard.costNeedsLocation')}</p>;
  if (cost.isPending) return <Skeleton className="h-6 w-24" />;
  if (cost.isError || !cost.data) return <p className="text-xs text-muted-foreground">{t('dashboard.costFailed')}</p>;
  return (
    <p className="font-display text-lg font-extrabold text-foreground" data-testid="setup-cost">
      {formatINRCompact(cost.data.cost.capitalCost)}
    </p>
  );
}

function SetupCard({
  item,
  onOpen,
  onDuplicate,
  onDelete,
  busy,
}: {
  item: SavedConfiguration;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t, language } = useI18n();
  const config = normalizeFarmConfig(item.config as Partial<FarmConfig>);
  const place = hasLocation(config) ? `${config.district}, ${config.state}` : t('dashboard.draftNoPlace');
  const updated = new Date(item.updatedAt).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card className="flex flex-col overflow-hidden rounded-card p-0 transition-shadow hover:shadow-elevated" data-testid="setup-card">
      <img src={BIRD_PHOTO[config.birdType] ?? BIRD_PHOTO.broiler} alt="" loading="lazy" className="h-28 w-full object-cover" />
      <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-extrabold text-foreground">{item.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] text-muted-foreground">{t('dashboard.cost')}</p>
          <SetupCost config={config} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Ruler className="h-3.5 w-3.5" />
          <dd className="text-foreground">
            {config.length} × {config.width} m · {Math.round(config.length * config.width)} m²
          </dd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Bird className="h-3.5 w-3.5" />
          <dd className="text-foreground">
            {t(optionKey('bird', config.birdType))} · {formatNumber(flockSize({ ...config, housing: config.housingSystem }) ?? 0)}
          </dd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Box className="h-3.5 w-3.5" />
          <dd className="text-foreground">{t(optionKey('housing', config.housingSystem))}</dd>
        </div>
        <div className="text-muted-foreground">{t('dashboard.updated', { date: updated })}</div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onOpen} disabled={busy} className="gap-1.5">
          <FolderOpen className="h-4 w-4" />
          {t('dashboard.open')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDuplicate} disabled={busy} className="gap-1.5">
          <Copy className="h-4 w-4" />
          {t('dashboard.duplicate')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
          aria-label={`${t('dashboard.delete')} ${item.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<SavedConfiguration | null>(null);

  const saved = useQuery({
    queryKey: [...SAVED_QUERY_KEY, user?.email],
    queryFn: () => listConfigurations(token!),
    enabled: Boolean(token),
  });

  const draft = useMemo(() => loadDraft(), []);
  const draftWorthResuming = draft !== null && draft.length > 0 && draft.width > 0;

  const duplicate = useMutation({
    mutationFn: (item: SavedConfiguration) =>
      createConfiguration(token!, {
        name: `${item.name} ${t('dashboard.copySuffix')}`,
        configType: item.configType,
        config: item.config,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERY_KEY });
      toast.success(t('dashboard.duplicated', { name: created.name }));
    },
    onError: () => toast.error(t('dashboard.actionFailed')),
  });

  const remove = useMutation({
    mutationFn: (item: SavedConfiguration) => deleteConfiguration(token!, item.id),
    onSuccess: (_result, item) => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERY_KEY });
      toast.success(t('dashboard.deleted', { name: item.name }));
    },
    onError: () => toast.error(t('dashboard.actionFailed')),
  });

  // Memoised so the empty list while loading is the same array each render (the stats below depend on it).
  const items = useMemo(() => saved.data ?? [], [saved.data]);
  const stats = useMemo(() => {
    const area = items.reduce((sum, item) => {
      const config = normalizeFarmConfig(item.config as Partial<FarmConfig>);
      return sum + config.length * config.width;
    }, 0);
    const latest = items.reduce<string | null>((best, item) => (!best || item.updatedAt > best ? item.updatedAt : best), null);
    return { area, latest };
  }, [items]);

  const openSetup = (item: SavedConfiguration) => {
    saveDraft(normalizeFarmConfig(item.config as Partial<FarmConfig>));
    toast(t('dashboard.opened', { name: item.name }));
    navigate('/visualizer');
  };

  const startNew = () => {
    clearDraft();
    navigate('/visualizer');
  };

  const startRecommended = () => {
    saveDraft(normalizeFarmConfig({ ...DEFAULT_CONFIG, state: '', district: '' }));
    navigate('/visualizer');
  };

  const firstName = (user?.name || '').split(' ')[0] || user?.email || '';
  const busy = duplicate.isPending || remove.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-3 shadow-soft sm:px-6">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label={t('app.goHome')}>
            <Logo compact />
          </Link>
          <nav className="flex items-center gap-1" aria-label={t('app.primaryNav')}>
            <span
              aria-current="page"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-semibold text-accent-foreground"
            >
              <BarChart3 className="h-4 w-4" />
              {t('nav.dashboard')}
            </span>
            <Link
              to="/visualizer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Box className="h-4 w-4" />
              {t('nav.design')}
            </Link>
          </nav>
        </div>
        <TopRightMenu />
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6 lg:py-14">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{t('dashboard.welcome', { name: firstName })}</h1>
            <p className="mt-2 text-[16px] text-muted-foreground">{t('dashboard.subtitle')}</p>
          </div>
          <Button size="lg" onClick={startNew} className="gap-2 self-start sm:self-auto">
            <Plus className="h-5 w-5" />
            {t('dashboard.newDesign')}
          </Button>
        </section>

        {draftWorthResuming ? (
          <Card className="flex flex-col gap-3 rounded-card border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="draft-card">
            <div>
              <h2 className="text-sm font-semibold">{t('dashboard.continue')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('dashboard.draftMeta', {
                  place: hasLocation(draft) ? `${draft.district}, ${draft.state}` : t('dashboard.draftNoPlace'),
                  length: draft.length,
                  width: draft.width,
                })}
              </p>
            </div>
            <Button asChild variant="default">
              <Link to="/visualizer">{t('dashboard.openDesigner')}</Link>
            </Button>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 rounded-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">{t('dashboard.quickStart')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.quickStartDesc')}</p>
            </div>
            <Button variant="secondary" onClick={startRecommended}>
              {t('dashboard.openDesigner')}
            </Button>
          </Card>
        )}

        <section className="flex flex-wrap gap-x-8 gap-y-2" aria-label={t('dashboard.title')}>
          {[
            { label: t('dashboard.statSetups'), value: saved.isPending ? '…' : String(items.length) },
            { label: t('dashboard.statArea'), value: saved.isPending ? '…' : `${Math.round(stats.area).toLocaleString(language)} m²` },
            {
              label: t('dashboard.statLatest'),
              value: saved.isPending
                ? '…'
                : stats.latest
                  ? new Date(stats.latest).toLocaleDateString(language, { day: 'numeric', month: 'short' })
                  : t('dashboard.statNone'),
            },
          ].map((stat) => (
            <p key={stat.label} className="flex items-baseline gap-2 text-[14px]">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-display text-lg font-extrabold">{stat.value}</span>
            </p>
          ))}
        </section>

        <section aria-labelledby="saved-heading" className="space-y-4">
          <h2 id="saved-heading" className="font-display text-2xl font-extrabold">
            {t('dashboard.sectionTitle')}
          </h2>

          {saved.isPending ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-48 rounded-card" />
              ))}
            </div>
          ) : saved.isError ? (
            <Card className="flex flex-col items-start gap-3 rounded-card p-6">
              <p role="alert" className="text-sm text-destructive">
                {t('dashboard.loadError')}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void saved.refetch()}>
                {t('dashboard.retry')}
              </Button>
            </Card>
          ) : items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 rounded-card p-10 text-center" data-testid="dashboard-empty">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Bird className="h-7 w-7" strokeWidth={1.75} />
              </span>
              <h3 className="font-display text-xl font-extrabold">{t('dashboard.emptyTitle')}</h3>
              <p className="max-w-md text-[15px] text-muted-foreground">{t('dashboard.emptyDesc')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={startNew} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('dashboard.newDesign')}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/estimate">{t('landing.tryEstimate')}</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <SetupCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onOpen={() => openSetup(item)}
                  onDuplicate={() => duplicate.mutate(item)}
                  onDelete={() => setPendingDelete(item)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dashboard.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dashboard.deleteDesc', { name: pendingDelete?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dashboard.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              {t('dashboard.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
