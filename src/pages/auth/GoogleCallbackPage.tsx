import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { consumePostAuthRedirect } from "@/services/auth.service";
import { useI18n } from "@/context/I18nContext";
import { safeRedirectPath } from "@/lib/utils";

/** Where Supabase sends the browser after Google. The client trades the ?code= for a session on load. */
export default function GoogleCallbackPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const providerError = searchParams.get("error_description") || searchParams.get("error");
  const failed = Boolean(providerError) || (!isLoading && !isAuthenticated);

  useEffect(() => {
    if (isLoading || !isAuthenticated || providerError) return;
    navigate(safeRedirectPath(consumePostAuthRedirect()), { replace: true });
  }, [isAuthenticated, isLoading, navigate, providerError]);

  return (
    <AuthLayout title={t("auth.googleSignIn")} subtitle={t("auth.completing")}>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {providerError ? `${t("errors.googleLoginFailed")}: ${providerError}` : t("errors.googleSessionExpired")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("auth.linkWaiting")}</p>
      )}
    </AuthLayout>
  );
}
