import { ContentPage } from "@/components/layout/SiteChrome";
import { useI18n } from "@/context/I18nContext";

const SECTIONS = ["collect", "use", "share", "security", "choices", "contact"] as const;

export default function PrivacyPolicyPage() {
  const { t } = useI18n();
  return (
    <ContentPage title={t("privacy.title")} intro={t("legal.lastUpdated")}>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2>{t(`privacy.${section}Title`)}</h2>
          <p className="mt-2 text-muted-foreground">{t(`privacy.${section}Body`)}</p>
        </section>
      ))}
    </ContentPage>
  );
}
