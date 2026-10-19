import { Link } from "react-router-dom";
import { Mail, MessageCircleQuestion, Phone, Sprout } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TopRightMenu } from "@/components/TopRightMenu";
import { useI18n } from "@/context/I18nContext";
import { SUPPORT_EMAIL } from "@/config/app";

export default function SupportPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Sprout className="h-5 w-5 text-primary" />
            {t("app.productName")}
          </Link>
          <TopRightMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Card className="rounded-2xl p-6 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("support.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("support.subtitle")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card className="rounded-xl p-4">
              <div className="inline-flex rounded-lg bg-primary/10 p-2">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-3 text-sm font-semibold">{t("support.email")}</p>
              <p className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="inline-flex rounded-lg bg-primary/10 p-2">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-3 text-sm font-semibold">{t("support.phone")}</p>
              <p className="text-xs text-muted-foreground">+91 00000 00000</p>
            </Card>

            <Card className="rounded-xl p-4">
              <div className="inline-flex rounded-lg bg-primary/10 p-2">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-3 text-sm font-semibold">{t("support.responseTime")}</p>
              <p className="text-xs text-muted-foreground">{t("support.responseTimeValue")}</p>
            </Card>
          </div>
        </Card>
      </main>
    </div>
  );
}
