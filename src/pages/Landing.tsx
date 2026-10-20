import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calculator,
  Check,
  CloudSun,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  Layers3,
  Bird,
  MapPin,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AuthModal } from "@/components/auth/AuthModal";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { motion } from "framer-motion";
import { HeroBackdrop } from "@/components/motion/HeroBackdrop";
import { HeroMedia } from "@/components/motion/HeroMedia";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";

const HERO_IMAGE_SRC = "/images/landing-poultry-shed.svg";
const SOLUTION_IMAGE_SRC = "/images/landing-shed-climate.svg";

const heroContainer = { hidden: {}, show: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } } };
const heroItem = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
};

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="eyebrow text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold leading-tight text-foreground sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p> : null}
    </Reveal>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Reveal className="h-full">
      <div data-tilt className="surface group h-full p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Reveal>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  const openSignup = () => {
    setAuthMode("signup");
    setAuthModalOpen(true);
  };

  const primaryCta = isAuthenticated ? (
    <Button asChild data-magnetic size="lg" className="h-12 px-6 text-base">
      <Link to="/visualizer">
        {t("landing.openVisualizer")}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  ) : (
    <Button data-magnetic size="lg" className="h-12 px-6 text-base" onClick={openSignup}>
      {t("landing.getStarted")}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );

  const navLinks = [
    { href: "#features", label: t("landing.features") },
    { href: "#ai", label: t("landing.aiNav") },
    { href: "#workflow", label: t("landing.workflow") },
    { href: "#faq", label: t("landing.faq") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader links={navLinks} onSignup={openSignup} />
      <AuthModal open={authModalOpen} mode={authMode} onOpenChange={setAuthModalOpen} onModeChange={setAuthMode} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border bg-card">
          <HeroBackdrop />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <motion.div variants={heroContainer} initial="hidden" animate="show">
              <motion.p variants={heroItem} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t("landing.heroBadge")}
              </motion.p>
              <motion.h1 variants={heroItem} className="mt-5 text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl lg:text-[3.4rem]">
                {t("landing.heroTitle")}
              </motion.h1>
              <motion.p variants={heroItem} className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("landing.heroDesc")}</motion.p>
              <motion.div variants={heroItem} className="mt-8 flex flex-wrap gap-3">
                {primaryCta}
                <Button asChild data-magnetic size="lg" variant="outline" className="h-12 px-6 text-base">
                  <a href="#features">{t("landing.seeFeatures")}</a>
                </Button>
              </motion.div>
              <motion.ul variants={heroItem} className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                {[t("landing.trust1"), t("landing.trust2"), t("landing.trust3")].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </motion.ul>
            </motion.div>

            <HeroMedia
              src={HERO_IMAGE_SRC}
              alt={t("landing.heroImageAlt")}
              floating={
                <div className="surface absolute -bottom-6 left-4 right-4 p-4 shadow-elevated sm:left-auto sm:right-6 sm:w-72">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow">{t("landing.previewLabel")}</p>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      Pune
                    </span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">
                    <CountUp to={26.55} decimals={2} prefix="₹" suffix=" L" />
                  </p>
                  <p className="text-xs text-muted-foreground">{t("landing.previewSub")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-accent px-2.5 py-2">
                      <p className="text-accent-foreground/80">{t("right.kpiNet")}</p>
                      <p className="font-semibold tabular-nums text-accent-foreground">
                        <CountUp to={13.28} decimals={2} prefix="₹" suffix=" L" />
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted px-2.5 py-2">
                      <p className="text-muted-foreground">{t("right.kpiPayback")}</p>
                      <p className="font-semibold tabular-nums text-foreground">
                        <CountUp to={5} decimals={1} suffix=" yrs" />
                      </p>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionIntro eyebrow={t("landing.challenge")} title={t("landing.challengeTitle")} description={t("landing.challengeDesc")} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <FeatureCard icon={<IndianRupee />} title={t("landing.cardOpaquePricing")} description={t("landing.cardOpaquePricingDesc")} />
              <FeatureCard icon={<CloudSun />} title={t("landing.cardClimateMismatch")} description={t("landing.cardClimateMismatchDesc")} />
              <FeatureCard icon={<Layers3 />} title={t("landing.cardDesignGaps")} description={t("landing.cardDesignGapsDesc")} />
            </div>
          </div>
        </section>

        {/* Solution */}
        <section id="solution" className="scroll-mt-20 border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <img
              src={SOLUTION_IMAGE_SRC}
              alt={t("landing.solutionImageAlt")}
              className="aspect-[4/3] w-full rounded-2xl border border-border object-cover"
              loading="lazy"
            />
            <div>
              <SectionIntro eyebrow={t("landing.solution")} title={t("landing.solutionTitle")} description={t("landing.solutionDesc")} />
              <div className="mt-8 space-y-5">
                {[
                  { icon: <BarChart3 className="h-5 w-5" />, title: t("landing.smartScenarios"), desc: t("landing.smartScenariosDesc") },
                  { icon: <Calculator className="h-5 w-5" />, title: t("landing.costClarity"), desc: t("landing.costClarityDesc") },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionIntro eyebrow={t("landing.keyFeatures")} title={t("landing.performanceTitle")} description={t("landing.performanceDesc")} />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={<Layers3 />} title={t("landing.feature1Title")} description={t("landing.feature1Desc")} />
              <FeatureCard icon={<CloudSun />} title={t("landing.feature2Title")} description={t("landing.feature2Desc")} />
              <FeatureCard icon={<Calculator />} title={t("landing.feature3Title")} description={t("landing.feature3Desc")} />
              <FeatureCard icon={<Bird />} title={t("landing.feature4Title")} description={t("landing.feature4Desc")} />
              <FeatureCard icon={<IndianRupee />} title={t("landing.feature5Title")} description={t("landing.feature5Desc")} />
              <FeatureCard icon={<ShieldCheck />} title={t("landing.feature6Title")} description={t("landing.feature6Desc")} />
            </div>
          </div>
        </section>

        {/* AI + reports */}
        <section id="ai" className="scroll-mt-20 border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionIntro eyebrow={t("landing.aiKicker")} title={t("landing.aiTitle")} description={t("landing.aiDesc")} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <FeatureCard icon={<Bot />} title={t("landing.aiPoint1Title")} description={t("landing.aiPoint1Desc")} />
              <FeatureCard icon={<MessageSquare />} title={t("landing.aiPoint2Title")} description={t("landing.aiPoint2Desc")} />
              <FeatureCard icon={<Bird />} title={t("landing.aiPoint3Title")} description={t("landing.aiPoint3Desc")} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FeatureCard icon={<FileText />} title={t("landing.exportPdfTitle")} description={t("landing.exportPdfDesc")} />
              <FeatureCard icon={<FileSpreadsheet />} title={t("landing.exportXlsxTitle")} description={t("landing.exportXlsxDesc")} />
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionIntro eyebrow={t("landing.workflow")} title={t("landing.workflowTitle")} description={t("landing.workflowDesc")} />
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((step) => (
                <li key={step} className="surface p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                    {step}
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">{t(`landing.workflow${step}Title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`landing.workflow${step}Desc`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <SectionIntro eyebrow={t("landing.faq")} title={t("landing.commonQuestions")} description={t("landing.faqDesc")} />
            <Accordion type="single" collapsible className="w-full">
              {[1, 2, 3, 4].map((index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left text-base font-semibold">{t(`landing.faq${index}Q`)}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{t(`landing.faq${index}A`)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-primary-foreground sm:text-3xl">{t("landing.ctaTitle")}</h2>
              <p className="mt-2 max-w-xl text-primary-foreground/80">{t("landing.ctaDesc")}</p>
            </div>
            {isAuthenticated ? (
              <Button asChild size="lg" className="h-12 bg-card px-6 text-primary hover:bg-card/90">
                <Link to="/visualizer">{t("landing.launchConfigurator")}</Link>
              </Button>
            ) : (
              <Button size="lg" className="h-12 bg-card px-6 text-primary hover:bg-card/90" onClick={openSignup}>
                {t("landing.launchConfigurator")}
              </Button>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
