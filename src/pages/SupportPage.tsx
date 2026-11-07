import { Clock, Mail } from "lucide-react";
import { ContentPage } from "@/components/layout/SiteChrome";
import { useI18n } from "@/context/I18nContext";
import { SUPPORT_EMAIL } from "@/config/app";

export default function SupportPage() {
  const { t } = useI18n();

  return (
    <ContentPage title={t("support.title")} intro={t("support.subtitle")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="surface group flex gap-4 p-6 transition-colors hover:border-primary/40">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Mail className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span>
            <span className="block font-bold">{t("support.email")}</span>
            <span className="mt-1 block text-[15px] text-primary group-hover:underline">{SUPPORT_EMAIL}</span>
          </span>
        </a>
        <div className="surface flex gap-4 p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Clock className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span>
            <span className="block font-bold">{t("support.responseTime")}</span>
            <span className="mt-1 block text-[15px] text-muted-foreground">{t("support.responseTimeValue")}</span>
          </span>
        </div>
      </div>
    </ContentPage>
  );
}
