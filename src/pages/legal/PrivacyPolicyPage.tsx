import { Link } from "react-router-dom";
import { Bird } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TopRightMenu } from "@/components/TopRightMenu";
import { useI18n } from "@/context/I18nContext";

export default function PrivacyPolicyPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Bird className="h-5 w-5 text-primary" />
            {t("app.productName")}
          </Link>
          <TopRightMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Card className="rounded-2xl p-6 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("privacy.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("legal.lastUpdated")}</p>

          <div className="mt-6 space-y-5 text-sm leading-6 text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.collectTitle")}</h2>
              <p>{t("privacy.collectBody")}</p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.useTitle")}</h2>
              <p>{t("privacy.useBody")}</p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.shareTitle")}</h2>
              <p>{t("privacy.shareBody")}</p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.securityTitle")}</h2>
              <p>{t("privacy.securityBody")}</p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.choicesTitle")}</h2>
              <p>{t("privacy.choicesBody")}</p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-foreground">{t("privacy.contactTitle")}</h2>
              <p>{t("privacy.contactBody")}</p>
            </section>
          </div>
        </Card>
      </main>
    </div>
  );
}
