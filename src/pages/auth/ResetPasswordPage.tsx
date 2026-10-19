import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";
import { updatePassword } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const { isAuthenticated, isLoading, isRecovery, finishRecovery } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Opening the emailed link signs the user in with a recovery session; without it there is nothing to reset.
  const canReset = isRecovery || (isAuthenticated && Boolean(message));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError(t("errors.passMin"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("errors.passMismatch"));
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setMessage(t("auth.passwordUpdated"));
      setPassword("");
      setConfirmPassword("");
      finishRecovery();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayout title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSubtitle")}>
        <p className="text-sm text-muted-foreground">{t("auth.pleaseWait")}</p>
      </AuthLayout>
    );
  }

  if (!canReset) {
    return (
      <AuthLayout title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSubtitle")}>
        <div className="space-y-4">
          <p role="alert" className="text-sm text-destructive">{t("auth.resetLinkInvalid")}</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t("auth.sendReset")}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSubtitle")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.newPassword")}</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
          <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>

        {message ? (
          <p role="status" className="text-sm text-emerald-600">
            {message}{" "}
            <Link to="/visualizer" className="underline">
              {t("auth.backVisualizer")}
            </Link>
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth.updating") : t("auth.updatePassword")}
        </Button>
      </form>
    </AuthLayout>
  );
}
