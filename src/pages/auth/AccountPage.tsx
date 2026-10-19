import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { linkGoogleAccount, rememberPostAuthRedirect, unlinkGoogleAccount, updatePassword } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/context/I18nContext";
import { TopRightMenu } from "@/components/TopRightMenu";
import { BadgeCheck, KeyRound, Link2, Mail, ShieldCheck, Sparkles, Sprout, UserRound, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AccountPage() {
  const { t } = useI18n();
  const { user, logout, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  const handleGoogleLink = async () => {
    setError(null);
    try {
      rememberPostAuthRedirect("/account");
      await linkGoogleAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableStartLink"));
    }
  };

  const handleGoogleUnlink = async () => {
    setLoading(true);
    setError(null);
    try {
      await unlinkGoogleAccount();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableUnlink"));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword.length < 8) {
      setError(t("errors.passMin"));
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      await refreshUser();
      setNewPassword("");
      setNotice(t("auth.passwordUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-lg">
          <Card className="rounded-2xl p-6">
            <p className="text-sm text-muted-foreground">{t("auth.pleaseLoginSettings")}</p>
            <Link to="/login" className="mt-3 inline-block text-primary hover:underline">
              {t("auth.goLogin")}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Sprout className="h-5 w-5 text-primary" />
            Greenhouse IQ
          </Link>
          <TopRightMenu />
        </div>
      </header>

      <div className="relative px-4 py-10">
        <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl space-y-5">

          <Card className="overflow-hidden rounded-3xl border p-0">
            <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-lg">
                    {initials}
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t("auth.account")}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{user.name}</p>
                    <div className="glass mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {user.email}
                    </div>
                  </div>
                </div>
                <Button variant="secondary" asChild className="rounded-full">
                  <Link to="/visualizer">{t("auth.backVisualizer")}</Link>
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: t("auth.emailVerified"), ok: user.emailVerified, icon: BadgeCheck },
              { label: t("auth.googleLinked"), ok: user.googleLinked, icon: Link2 },
              { label: t("auth.passwordSet"), ok: user.hasPassword, icon: KeyRound },
            ].map((item) => (
              <Card key={item.label} className="rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold">{item.ok ? t("common.yes") : t("common.no")}</p>
                  </div>
                  <item.icon className={cn("h-5 w-5", item.ok ? "text-primary" : "text-muted-foreground")} />
                </div>
          </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t("auth.loginMethods")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <Sparkles className="mr-1 inline h-4 w-4 text-primary" />
                {t("auth.manageMethods")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={handleGoogleLink}>{t("auth.linkGoogle")}</Button>
                <Button
                  variant="outline"
                  onClick={handleGoogleUnlink}
                  disabled={loading || !user.googleLinked || !user.hasPassword}
                  title={user.googleLinked && !user.hasPassword ? t("auth.unlinkNeedsPassword") : undefined}
                >
                  {t("auth.unlinkGoogle")}
                </Button>
              </div>
              <form onSubmit={handleSetPassword} className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor="account-password" className="text-xs text-muted-foreground">
                    {user.hasPassword ? t("auth.updatePassword") : t("auth.setPassword")}
                  </label>
                  <Input
                    id="account-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={loading || newPassword.length === 0}>
                  {user.hasPassword ? t("auth.updatePassword") : t("auth.setPassword")}
                </Button>
              </form>
              {notice ? <p role="status" className="mt-3 text-sm text-emerald-600">{notice}</p> : null}
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </Card>

            <Card className="rounded-2xl p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <UserRound className="h-5 w-5 text-primary" />
                {t("auth.account")}
              </h2>
              <div className="mt-4 space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("auth.name")}:</span> {user.name}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("auth.email")}:</span> {user.email}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="destructive" onClick={logout}>
                  <XCircle className="mr-2 h-4 w-4" />
                  {t("auth.logout")}
                </Button>
              </div>
            </Card>
          </div>

          <Card className="rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("auth.securityNote")}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/privacy">{t("landing.privacy")}</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/terms">{t("landing.terms")}</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
