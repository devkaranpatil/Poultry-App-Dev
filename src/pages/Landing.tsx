import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, FileSpreadsheet, FileText, Landmark, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AuthModal } from "@/components/auth/AuthModal";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteChrome";
import { ExampleEstimate } from "@/components/landing/ExampleEstimate";
import { Reveal } from "@/components/motion/Reveal";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { optionKey } from "@/types/farm";

/** A responsive photo from public/images (generated for this app; see docs/superpowers/specs). */
function Photo({
  name,
  widths,
  ratio,
  alt,
  sizes,
  className,
  priority = false,
}: {
  name: string;
  widths: [number, number];
  ratio: [number, number];
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const [large, small] = widths;
  return (
    <img
      src={`/images/${name}-${small}.webp`}
      srcSet={`/images/${name}-${small}.webp ${small}w, /images/${name}-${large}.webp ${large}w`}
      sizes={sizes}
      width={large}
      height={Math.round((large * ratio[1]) / ratio[0])}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      // React 18 only passes the lowercase attribute through to the DOM.
      {...(priority ? { fetchpriority: "high" } : {})}
      decoding="async"
      className={className}
    />
  );
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function Landing() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const reduce = useReducedMotion();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  const openSignup = () => {
    setAuthMode("signup");
    setAuthModalOpen(true);
  };

  // One label per intent: "Try a free estimate" starts everything; signed-in users go to their projects.
  const startAction = (
    <Button asChild size="lg">
      <Link to="/estimate">
        {t("landing.tryEstimate")}
        <ArrowRight />
      </Link>
    </Button>
  );

  const enter = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease } };

  const navLinks = [
    { href: "#how-it-works", label: t("home.howItWorks") },
    { href: "#bank", label: t("home.navBank") },
    { href: "#faq", label: t("landing.faq") },
  ];

  const questions = [1, 2, 3, 4].map((n) => ({ q: t(`home.q${n}`), a: t(`home.a${n}`) }));
  const flow = [1, 2, 3].map((n) => ({ title: t(`home.flow${n}Title`), desc: t(`home.flow${n}Desc`) }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader links={navLinks} onSignup={openSignup} />
      <AuthModal open={authModalOpen} mode={authMode} onOpenChange={setAuthModalOpen} onModeChange={setAuthMode} />

      <main>
        {/* Hero: the promise and one action on the left, the real shed and a live example on the right. */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-16">
            <div>
              <motion.h1
                {...enter(0)}
                className="font-display text-[2.2rem] font-extrabold leading-[1.16] text-foreground sm:text-[2.8rem] xl:text-[3.05rem]"
              >
                {t("landing.heroTitle")}
              </motion.h1>
              <motion.p {...enter(0.08)} className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
                {t("home.heroDesc")}
              </motion.p>
              <motion.div {...enter(0.16)} className="mt-9 flex flex-wrap items-center gap-3">
                {startAction}
                {isAuthenticated ? (
                  <Button asChild size="lg" variant="outline">
                    <Link to="/visualizer">{t("home.openWorkspace")}</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" variant="ghost">
                    <a href="#how-it-works">{t("home.howItWorks")}</a>
                  </Button>
                )}
              </motion.div>
            </div>

            <motion.figure
              initial={reduce ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease }}
              className="relative sm:pb-6 lg:ml-6"
            >
              <Photo
                name="shed-golden-hour"
                widths={[1600, 800]}
                ratio={[4, 3]}
                sizes="(min-width: 1024px) 50vw, 100vw"
                alt={t("home.heroImageAlt")}
                priority
                className="aspect-[4/3] w-full rounded-card object-cover shadow-elevated"
              />
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.45, ease }}
                className="relative z-10 -mt-16 px-4 sm:absolute sm:-bottom-14 sm:-left-8 sm:mt-0 sm:px-0"
              >
                <ExampleEstimate />
              </motion.div>
            </motion.figure>
          </div>
        </section>

        {/* The questions it answers: a sticky heading beside the answers. */}
        <section id="questions" className="scroll-mt-20 border-t border-border/70 bg-card">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8 lg:py-28">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("home.questionsTitle")}</h2>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted-foreground">{t("home.questionsDesc")}</p>
            </div>
            <dl className="space-y-10">
              {questions.map(({ q, a }) => (
                <Reveal key={q} className="border-l-2 border-straw pl-6">
                  <dt className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">{q}</dt>
                  <dd className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-muted-foreground">{a}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* How it works: a wide photo, then the three stages on one line. */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8 lg:pt-28">
            <h2 className="max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("home.flowTitle")}</h2>
          </div>
          <Reveal className="mx-auto mt-10 max-w-7xl px-4 sm:px-6 lg:px-8">
            <Photo
              name="shed-interior"
              widths={[1600, 800]}
              ratio={[16, 9]}
              sizes="(min-width: 1280px) 1216px, 100vw"
              alt={t("home.interiorAlt")}
              className="aspect-[16/9] w-full rounded-card object-cover sm:aspect-[21/8]"
            />
          </Reveal>
          <ol className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-12 sm:px-6 md:grid-cols-3 md:gap-8 lg:px-8 lg:pb-28">
            {flow.map((stage, index) => (
              <Reveal as="li" key={stage.title} className="relative md:pt-8">
                <span aria-hidden="true" className="absolute left-0 right-0 top-0 hidden h-px bg-border md:block" />
                <span
                  aria-hidden="true"
                  className={`absolute -top-[5px] left-0 hidden h-[11px] w-[11px] rounded-full md:block ${index === 0 ? "bg-straw" : "bg-primary"}`}
                />
                <h3 className="font-display text-2xl font-extrabold text-foreground">{stage.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[16px] leading-relaxed text-muted-foreground">{stage.desc}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* For the bank: the papers on one side, what the report holds on the other. */}
        <section id="bank" className="scroll-mt-20 border-y border-border/70 bg-card">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
            <Reveal>
              <Photo
                name="project-papers"
                widths={[1200, 640]}
                ratio={[4, 3]}
                sizes="(min-width: 1024px) 50vw, 100vw"
                alt={t("home.papersAlt")}
                className="aspect-[4/3] w-full rounded-card object-cover"
              />
            </Reveal>
            <div>
              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("home.bankTitle")}</h2>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">{t("home.bankDesc")}</p>
              <ul className="mt-10 space-y-7">
                {[
                  { icon: FileText, title: t("landing.exportPdfTitle"), desc: t("landing.exportPdfDesc") },
                  { icon: FileSpreadsheet, title: t("landing.exportXlsxTitle"), desc: t("landing.exportXlsxDesc") },
                  { icon: Landmark, title: t("home.bankNabardTitle"), desc: t("home.bankNabardDesc") },
                ].map(({ icon: Icon, title, desc }) => (
                  <Reveal as="li" key={title} className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold leading-snug text-foreground">{title}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Bird types: four tiles, two with photos, one with the coverage figure. */}
        <section id="birds" className="scroll-mt-20">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <h2 className="max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("home.birdsTitle")}</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">{t("home.birdsDesc")}</p>
            <div className="mt-12 grid gap-5 md:grid-cols-6">
              <Reveal className="surface overflow-hidden md:col-span-4">
                <div className="grid h-full sm:grid-cols-[1.1fr_1fr]">
                  <Photo
                    name="shed-interior"
                    widths={[1600, 800]}
                    ratio={[16, 9]}
                    sizes="(min-width: 768px) 40vw, 100vw"
                    alt={t("home.interiorAlt")}
                    className="h-full min-h-[220px] w-full object-cover"
                  />
                  <div className="flex flex-col justify-end p-6">
                    <h3 className="font-display text-2xl font-extrabold">{t(optionKey("bird", "broiler"))}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("home.birdBroiler")}</p>
                  </div>
                </div>
              </Reveal>
              <Reveal className="surface overflow-hidden md:col-span-2">
                <Photo
                  name="layer-cages"
                  widths={[1024, 640]}
                  ratio={[4, 3]}
                  sizes="(min-width: 768px) 30vw, 100vw"
                  alt={t("home.layerAlt")}
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="p-6">
                  <h3 className="font-display text-2xl font-extrabold">{t(optionKey("bird", "layer-cage"))}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("home.birdLayer")}</p>
                </div>
              </Reveal>
              <Reveal className="surface overflow-hidden md:col-span-2">
                <Photo
                  name="desi-yard"
                  widths={[1024, 640]}
                  ratio={[4, 3]}
                  sizes="(min-width: 768px) 30vw, 100vw"
                  alt={t("home.desiAlt")}
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="p-6">
                  <h3 className="font-display text-2xl font-extrabold">{t(optionKey("bird", "desi"))}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("home.birdDesi")}</p>
                </div>
              </Reveal>
              <Reveal className="flex flex-col justify-between rounded-card bg-primary p-8 text-primary-foreground md:col-span-4">
                <p className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">{t("landing.trust1")}</p>
                <p className="mt-6 max-w-md text-[16px] leading-relaxed text-primary-foreground/85">{t("home.coverageDesc")}</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* The assistant: what it does, and where the data goes. */}
        <section id="ai" className="scroll-mt-20 border-y border-border/70 bg-accent/50">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:px-8 lg:py-28">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-card bg-primary text-primary-foreground">
                <Sparkles className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h2 className="mt-6 font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("landing.aiTitle")}</h2>
              <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-muted-foreground">{t("landing.aiDesc")}</p>
            </div>
            <div className="divide-y divide-border/80 rounded-card border border-border bg-card">
              {[
                { icon: Bot, title: t("landing.aiPoint1Title"), desc: t("landing.aiPoint1Desc") },
                { icon: MessageSquare, title: t("landing.aiPoint2Title"), desc: t("landing.aiPoint2Desc") },
                { icon: Sparkles, title: t("landing.aiPoint3Title"), desc: t("landing.aiPoint3Desc") },
                { icon: ShieldCheck, title: t("landing.faq4Q"), desc: t("landing.faq4A") },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4 p-6">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
                  <div>
                    <h3 className="text-[17px] font-bold leading-snug">{title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions people ask. */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-28">
            <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.5rem]">{t("landing.commonQuestions")}</h2>
            <Accordion type="single" collapsible className="mt-8 w-full">
              {[1, 2, 3].map((index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-[17px]">{t(`landing.faq${index}Q`)}</AccordionTrigger>
                  <AccordionContent className="text-[16px] leading-relaxed text-muted-foreground">{t(`landing.faq${index}A`)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Closing action, the same label as the hero. */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <Reveal className="mx-auto flex max-w-7xl flex-col items-start gap-8 rounded-card bg-primary px-8 py-12 text-primary-foreground sm:px-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-3xl font-extrabold leading-tight">{t("home.ctaTitle")}</h2>
              <p className="mt-3 text-[17px] text-primary-foreground/85">{t("home.ctaDesc")}</p>
            </div>
            <Button asChild size="lg" className="bg-card text-primary shadow-none hover:bg-card/90">
              <Link to="/estimate">
                {t("landing.tryEstimate")}
                <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
