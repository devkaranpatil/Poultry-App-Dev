import { Box, LayoutDashboard, LifeBuoy, Search, LogIn, LogOut, Monitor, Moon, Settings2, Shield, Sun, UserPlus, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { SUPPORTED_LANGUAGES } from "@/i18n/messages";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: typeof Sun }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="px-2 py-1.5">
      <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{label}</p>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TopRightMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const displayName = user?.name || t("menu.guest");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-border bg-card"
          aria-label={displayName}
          title={displayName}
        >
          {user?.name ? (
            <span className="font-display text-xs font-bold text-primary">{initialsOf(user.name)}</span>
          ) : (
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          {user?.email ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <Segment
          label={t("settings.language")}
          value={language}
          options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.value, label: lang.label }))}
          onChange={setLanguage}
        />
        <Segment
          label={t("settings.theme")}
          value={(theme as "light" | "dark" | "system") || "system"}
          options={[
            { value: "light", label: t("settings.themeLight"), icon: Sun },
            { value: "dark", label: t("settings.themeDark"), icon: Moon },
            { value: "system", label: t("settings.themeSystem"), icon: Monitor },
          ]}
          onChange={setTheme}
        />
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event("open-command-palette"))}>
          <Search className="mr-2 h-4 w-4" />
          {t("palette.open")}
          <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">Ctrl K</kbd>
        </DropdownMenuItem>

        {isAuthenticated ? (
          <>
            <DropdownMenuItem asChild>
              <Link to="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                {t("nav.dashboard")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/visualizer">
                <Box className="mr-2 h-4 w-4" />
                {t("menu.visualizer")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/account">
                <UserRound className="mr-2 h-4 w-4" />
                {t("menu.account")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to="/login">
                <LogIn className="mr-2 h-4 w-4" />
                {t("menu.login")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/signup">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("menu.signup")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/support">
            <LifeBuoy className="mr-2 h-4 w-4" />
            {t("menu.support")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/privacy">
            <Shield className="mr-2 h-4 w-4" />
            {t("landing.privacy")}
          </Link>
        </DropdownMenuItem>

        {isAuthenticated ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t("auth.logout")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
