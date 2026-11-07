import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { safeRedirectPath } from "@/lib/utils";
import { rememberPostAuthRedirect, signInWithGoogle } from "@/services/auth.service";

export default function SignupPage() {
  const { t } = useI18n();
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const redirectTo = safeRedirectPath((location.state as { from?: string } | null)?.from);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const { needsConfirmation } = await signup(name, email, password);
      if (needsConfirmation) {
        setNotice(t("auth.confirmEmail"));
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableCreate"));
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignup = async () => {
    setError(null);
    try {
      rememberPostAuthRedirect(redirectTo);
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.googleUnavailable"));
    }
  };

  return (
    <AuthLayout title={t("auth.signupTitle")} subtitle={t("auth.signupSubtitle")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("auth.name")}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">{t("auth.use8")}</p>
        </div>

        {notice ? <p role="status" className="text-sm text-success">{notice}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth.creating") : t("auth.createAccount")}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onGoogleSignup}>
          {t("auth.continueGoogle")}
        </Button>

        <p className="text-sm text-muted-foreground">
          {t("auth.already")}{" "}
          <Link to="/login" className="text-primary hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
