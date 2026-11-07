import { ContentPage } from "@/components/layout/SiteChrome";
import { useI18n } from "@/context/I18nContext";

const SECTIONS = ["use", "accounts", "estimates", "availability", "liability", "contact"] as const;

export default function TermsOfServicePage() {
  const { t } = useI18n();
  return (
    <ContentPage title={t("terms.title")} intro={t("legal.lastUpdated")}>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2>{t(`terms.${section}Title`)}</h2>
          <p className="mt-2 text-muted-foreground">{t(`terms.${section}Body`)}</p>
        </section>
      ))}
    </ContentPage>
  );
}
