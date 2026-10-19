import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { messages } from "@/i18n/messages";
import { TopRightMenu } from "@/components/TopRightMenu";

const setTheme = vi.fn();
const setLanguage = vi.fn();
const logout = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    logout,
  }),
}));

vi.mock("@/context/I18nContext", () => ({
  useI18n: () => ({
    language: "en",
    setLanguage,
    t: (key: string) => messages.en[key] ?? key,
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
}));

describe("TopRightMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing and shows the menu trigger", () => {
    render(
      <MemoryRouter>
        <TopRightMenu />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /guest/i })).toBeInTheDocument();
  });

  it("offers login, signup and support to guests", () => {
    render(
      <MemoryRouter>
        <TopRightMenu />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: messages.en["menu.login"] })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: messages.en["menu.signup"] })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: messages.en["menu.support"] })).toHaveAttribute("href", "/support");
  });

  it("switches language and theme from the segmented controls", () => {
    render(
      <MemoryRouter>
        <TopRightMenu />
      </MemoryRouter>
    );

    screen.getByRole("button", { name: "Hindi" }).click();
    expect(setLanguage).toHaveBeenCalledWith("hi");
    screen.getByRole("button", { name: messages.en["settings.themeDark"] }).click();
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
