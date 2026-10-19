import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { FileText, Home, LayoutDashboard, LifeBuoy, LogIn, Moon, ShieldCheck, UserCircle, UserPlus } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";

interface Entry {
  id: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

/** Ctrl/Cmd + K quick navigation and actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  const go = (path: string) => () => navigate(path);

  const pages: Entry[] = [
    { id: "home", label: t("palette.home"), icon: <Home />, run: go("/") },
    { id: "visualizer", label: t("palette.visualizer"), icon: <LayoutDashboard />, run: go("/visualizer") },
    ...(isAuthenticated ? [{ id: "account", label: t("palette.account"), icon: <UserCircle />, run: go("/account") }] : []),
    { id: "support", label: t("palette.support"), icon: <LifeBuoy />, run: go("/support") },
    { id: "privacy", label: t("palette.privacy"), icon: <ShieldCheck />, run: go("/privacy") },
    { id: "terms", label: t("palette.terms"), icon: <FileText />, run: go("/terms") },
  ];

  const actions: Entry[] = [
    ...(isAuthenticated
      ? []
      : [
          { id: "login", label: t("palette.login"), icon: <LogIn />, run: go("/login") },
          { id: "signup", label: t("palette.signup"), icon: <UserPlus />, run: go("/signup") },
        ]),
    {
      id: "theme",
      label: t("palette.theme"),
      icon: <Moon />,
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ];

  const renderGroup = (heading: string, entries: Entry[]) => (
    <CommandGroup heading={heading}>
      {entries.map((entry) => (
        <CommandItem
          key={entry.id}
          value={entry.label}
          onSelect={() => {
            setOpen(false);
            entry.run();
          }}
          className="gap-2 [&>svg]:h-4 [&>svg]:w-4"
        >
          {entry.icon}
          {entry.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
      <DialogDescription className="sr-only">{t("palette.placeholder")}</DialogDescription>
      <CommandInput placeholder={t("palette.placeholder")} aria-label={t("palette.title")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        {renderGroup(t("palette.pages"), pages)}
        {renderGroup(t("palette.actions"), actions)}
      </CommandList>
    </CommandDialog>
  );
}
