import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { useI18n } from "@/context/I18nContext";

const NotFound = () => {
  const { t } = useI18n();
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-4 py-20 sm:px-6">
        <p className="font-display text-7xl font-extrabold text-straw sm:text-8xl">404</p>
        <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{t("notFound.title")}</h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/">{t("notFound.return")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/estimate">
              {t("landing.tryEstimate")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default NotFound;
