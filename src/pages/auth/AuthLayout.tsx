import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { TopRightMenu } from "@/components/TopRightMenu";
import { useI18n } from "@/context/I18nContext";
import { APP_NAME } from "@/config/app";

/** Split screen for sign-in, sign-up and password pages: the farm on the left, the form on the right. */
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src="/images/shed-golden-hour-800.webp"
          srcSet="/images/shed-golden-hour-800.webp 800w, /images/shed-golden-hour-1600.webp 1600w"
          sizes="50vw"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* A forest-green fade from the bottom keeps the words readable over the photo. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(160_45%_8%/0.92)] via-[hsl(160_45%_8%/0.45)] to-[hsl(160_45%_8%/0.15)]" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label={t("app.goHome")}>
            <LogoMark />
            <span className="pt-1 font-display text-lg font-extrabold">{APP_NAME}</span>
          </Link>
          <div className="max-w-md">
            <h2 className="font-display text-[2rem] font-extrabold leading-tight">{t("auth.panelTitle")}</h2>
            <ul className="mt-6 space-y-3 text-[16px]">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-white/90">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-straw text-straw-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
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
            <h1 className="font-display text-3xl font-extrabold leading-tight text-foreground">{title}</h1>
            {subtitle ? <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
