import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { rememberPostAuthRedirect, signInWithGoogle } from "@/services/auth.service";
import { useI18n } from "@/context/I18nContext";

type AuthMode = "login" | "signup";

interface AuthModalProps {
  open: boolean;
  mode: AuthMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AuthMode) => void;
}

export function AuthModal({ open, mode, onOpenChange, onModeChange }: AuthModalProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { login, signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")),
    [mode, t]
  );

  const resetFormState = () => {
    setError(null);
    setNotice(null);
    setLoading(false);
  };

  const onSubmitLogin = async (event: FormEvent) => {
    event.preventDefault();
    resetFormState();
    setLoading(true);
    try {
      await login(email, password);
      onOpenChange(false);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableLogin"));
    } finally {
      setLoading(false);
    }
  };

  const onSubmitSignup = async (event: FormEvent) => {
    event.preventDefault();
    resetFormState();
    setLoading(true);
    try {
      const { needsConfirmation } = await signup(name, email, password);
      if (needsConfirmation) {
        setNotice(t("auth.confirmEmail"));
        return;
      }
      onOpenChange(false);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unableCreate"));
    } finally {
      setLoading(false);
    }
  };

  const onGoogleAuth = async () => {
    resetFormState();
    try {
      rememberPostAuthRedirect("/dashboard");
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.googleUnavailable"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-elevated max-w-md overflow-hidden border-white/40 p-0">
        <div className="bg-gradient-to-br from-primary/10 via-transparent to-[hsl(36_82%_60%_/_0.14)] p-6 pb-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("auth.accessSaved")}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            onModeChange(value as AuthMode);
            setError(null);
          }}
          className="w-full"
        >
          <TabsList className="glass mt-1 grid w-full grid-cols-2 rounded-2xl border border-white/20 p-1">
            <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
            <TabsTrigger value="signup">{t("landing.signup")}</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={onSubmitLogin} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-login-email">{t("auth.email")}</Label>
                <Input
                  id="auth-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-login-password">{t("auth.password")}</Label>
                <Input
                  id="auth-login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onGoogleAuth}
                disabled={loading}
              >
                {t("auth.continueGoogle")}
              </Button>
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("auth.forgot")}
                </Link>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={onSubmitSignup} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-signup-name">{t("auth.name")}</Label>
                <Input
                  id="auth-signup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-signup-email">{t("auth.email")}</Label>
                <Input
                  id="auth-signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-signup-password">{t("auth.password")}</Label>
                <Input
                  id="auth-signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">{t("auth.use8")}</p>
              </div>

              {notice ? <p role="status" className="text-sm text-emerald-600">{notice}</p> : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.creating") : t("auth.createAccount")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onGoogleAuth}
                disabled={loading}
              >
                {t("auth.continueGoogle")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
