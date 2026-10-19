import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { TopRightMenu } from '@/components/TopRightMenu';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

export interface SiteNavLink {
  href: string;
  label: string;
}

/** Sticky header for public pages (landing, support, legal). */
export function SiteHeader({
  links = [],
  onSignup,
}: {
  links?: SiteNavLink[];
  /** Opens sign-up in place (e.g. a modal); falls back to the /signup page. */
  onSignup?: () => void;
}) {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const primaryAction = isAuthenticated ? (
    <Button asChild size="sm">
      <Link to="/visualizer">
        {t('landing.openVisualizer')}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Link>
    </Button>
  ) : onSignup ? (
    <Button size="sm" onClick={onSignup}>
      {t('landing.signup')}
    </Button>
  ) : (
    <Button asChild size="sm">
      <Link to="/signup">{t('landing.signup')}</Link>
    </Button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label={t('app.goHome')}>
          <Logo />
        </Link>

        {links.length > 0 ? (
          <nav aria-label={t('site.primaryNav')} className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link to="/login">{t('landing.login')}</Link>
            </Button>
          ) : null}
          <span className="hidden sm:inline-flex">{primaryAction}</span>
          <TopRightMenu />
          {links.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-expanded={mobileOpen}
              aria-label={t('site.toggleMenu')}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          ) : null}
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          <nav aria-label={t('site.primaryNav')} className="flex flex-col">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            {!isAuthenticated ? (
              <Button asChild variant="outline" className="flex-1">
                <Link to="/login">{t('landing.login')}</Link>
              </Button>
            ) : null}
            <span className="flex flex-1 [&>*]:w-full">{primaryAction}</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo compact />
          <p className="max-w-sm text-sm text-muted-foreground">{t('site.tagline')}</p>
        </div>
        <nav aria-label={t('site.footerNav')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/support" className="hover:text-foreground">
            {t('landing.contact')}
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            {t('landing.privacy')}
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            {t('landing.terms')}
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          {t('landing.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}

/** Simple centred page shell for support and legal pages. */
export function ContentPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{intro}</p> : null}
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
