import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { TopRightMenu } from "@/components/TopRightMenu";
import { useI18n } from "@/context/I18nContext";
import { APP_NAME } from "@/config/app";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const benefits = [t("auth.benefit1"), t("auth.benefit2"), t("auth.benefit3")];

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <Link to="/" className="inline-flex items-center gap-2" aria-label={t("app.goHome")}>
          <span className="rounded-lg bg-white/95 p-1">
            <Logo compact className="[&>span:last-child]:hidden" />
          </span>
          <span className="font-display text-lg font-bold">{APP_NAME}</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{t("auth.panelTitle")}</h2>
          <ul className="mt-6 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3 text-primary-foreground/90">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3 w-3" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/70">{t("site.tagline")}</p>
        <svg className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 text-white/[0.06]" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 30V14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M16 17c0-5-3.6-8.4-9-8.4 0 5 3.6 8.4 9 8.4Z" fill="currentColor" />
          <path d="M16 14c0-5.2 3.8-9 9.6-9 0 5.2-3.8 9-9.6 9Z" fill="currentColor" />
        </svg>
      </aside>

      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link to="/" className="lg:invisible" aria-label={t("app.goHome")}>
            <Logo compact />
          </Link>
          <TopRightMenu />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
