import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { rememberPostAuthRedirect, signInWithGoogle } from "@/services/auth.service";
import { useI18n } from "@/context/I18nContext";
import { safeRedirectPath } from "@/lib/utils";

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const redirectTo = safeRedirectPath((location.state as { from?: string } | null)?.from);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableLogin"));
    } finally {
      setLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    setError(null);
    try {
      rememberPostAuthRedirect(redirectTo);
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.googleUnavailable"));
    }
  };

  return (
    <AuthLayout title={t("auth.login")} subtitle={t("auth.accessSaved")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onGoogleLogin}>
          {t("auth.continueGoogle")}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            {t("auth.forgot")}
          </Link>
          <Link to="/signup" className="text-primary hover:underline">
            {t("auth.createAccount")}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
