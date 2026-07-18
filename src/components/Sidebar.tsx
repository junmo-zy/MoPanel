import {
  Broadcast,
  FileText,
  GearSix,
  HouseLine,
  Moon,
  Note,
  PaperPlaneTilt,
  Sun,
} from "@phosphor-icons/react";

export type SectionId = "overview" | "proxies" | "profiles" | "connections" | "logs" | "settings";

interface SidebarProps {
  activeSection: SectionId;
  onNavigate: (section: SectionId) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

const items = [
  { id: "overview", label: "概览", icon: HouseLine },
  { id: "proxies", label: "代理", icon: PaperPlaneTilt },
  { id: "profiles", label: "订阅", icon: FileText },
  { id: "connections", label: "连接", icon: Broadcast },
  { id: "logs", label: "日志", icon: Note },
  { id: "settings", label: "设置", icon: GearSix },
] satisfies Array<{ id: SectionId; label: string; icon: typeof HouseLine }>;

export function Sidebar({ activeSection, onNavigate, theme, onToggleTheme }: SidebarProps) {
  const nextThemeLabel = theme === "light" ? "切换为深色模式" : "切换为浅色模式";

  return (
    <aside className="sidebar" aria-label="主导航">
      <nav>
        <ul className="nav-list">
          {items.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className="nav-item"
                data-active={activeSection === id}
                aria-current={activeSection === id ? "page" : undefined}
                onClick={() => onNavigate(id)}
              >
                <Icon size={22} weight={activeSection === id ? "fill" : "regular"} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className="theme-toggle"
          aria-label={nextThemeLabel}
          aria-pressed={theme === "dark"}
          title={nextThemeLabel}
          onClick={onToggleTheme}
        >
          {theme === "light"
            ? <Moon size={20} weight="regular" aria-hidden="true" />
            : <Sun size={21} weight="regular" aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
