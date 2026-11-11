import {
  ArrowDown,
  ArrowUp,
  ArrowsSplit,
  Broadcast,
  Cpu,
  FileText,
  GearSix,
  HouseLine,
  LockKeyOpen,
  Moon,
  Note,
  PaperPlaneTilt,
  Sun,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { formatTraffic, speedParts } from "../format";
import type { TrafficState } from "../hooks/useTrafficStream";
import { TrafficSparkline } from "./TrafficSparkline";

export type SectionId = "overview" | "proxies" | "profiles" | "connections" | "rules" | "logs" | "test" | "settings";

interface SidebarProps {
  activeSection: SectionId;
  onNavigate: (section: SectionId) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  traffic?: TrafficState;
  memory?: number | null;
  connection?: { state: "connected" | "connecting" | "disconnected"; label: string };
}

function SpeedRow({ icon, label, value, tone }: { icon: ReactNode; label: string; value: [string, string]; tone: string }) {
  return (
    <div className="sidebar-traffic-row" data-tone={tone} aria-label={`${label} ${value.join(" ")}`} data-tip={`${label}速度`}>
      {icon}<strong>{value[0]}</strong><span>{value[1]}</span>
    </div>
  );
}

const items = [
  { id: "overview", label: "概览", icon: HouseLine },
  { id: "proxies", label: "代理", icon: PaperPlaneTilt },
  { id: "profiles", label: "订阅", icon: FileText },
  { id: "connections", label: "连接", icon: Broadcast },
  { id: "rules", label: "规则", icon: ArrowsSplit },
  { id: "logs", label: "日志", icon: Note },
  { id: "test", label: "测试", icon: LockKeyOpen },
  { id: "settings", label: "设置", icon: GearSix },
] satisfies Array<{ id: SectionId; label: string; icon: typeof HouseLine }>;

export function Sidebar({ activeSection, onNavigate, theme, onToggleTheme, traffic, memory = null, connection }: SidebarProps) {
  const nextThemeLabel = theme === "light" ? "切换为深色模式" : "切换为浅色模式";

  return (
    <aside className="sidebar" aria-label="主导航">
      {/* Like a macOS sidebar: the app identity sits at its top, no title bar. */}
      <div className="sidebar-brand">
        <strong className="product-brand">
          <img src="/brand/mopanel-cat.png" alt="" width={26} height={26} />
          <span>MoPanel</span>
        </strong>
        {connection && (
          <span
            className="window-status"
            data-state={connection.state}
            aria-live="polite"
            data-tip={connection.state === "connected" ? "已连接到 Mihomo 内核" : connection.state === "connecting" ? "正在连接 Mihomo 内核" : "未连接到 Mihomo 内核，正在自动重试"}
          >
            <i aria-hidden="true" /><span>{connection.label}</span>
          </span>
        )}
      </div>
      <nav>
        <ul className="nav-list">
          {items.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className="nav-item"
                data-active={activeSection === id}
                aria-current={activeSection === id ? "page" : undefined}
                data-tip={label}
                data-tip-auto=""
                onClick={() => onNavigate(id)}
              >
                <Icon size={22} weight={activeSection === id ? "fill" : "regular"} aria-hidden="true" />
                <span data-tip-label="">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {traffic && (
        <section className="sidebar-traffic" aria-label="实时网速">
          <TrafficSparkline
            points={traffic.points}
            dataKey="down"
            color="#0a84ff"
            secondary={{ dataKey: "up", color: "#ff9f0a" }}
            height={40}
            label="实时网速曲线"
          />
          <SpeedRow icon={<ArrowUp size={15} weight="bold" aria-hidden="true" />} label="上传" value={speedParts(traffic.currentBytes.up)} tone="up" />
          <SpeedRow icon={<ArrowDown size={15} weight="bold" aria-hidden="true" />} label="下载" value={speedParts(traffic.currentBytes.down)} tone="down" />
          {memory !== null && (
            <div className="sidebar-traffic-row" data-tone="memory" aria-label={`内核内存 ${formatTraffic(memory)}`} data-tip="Mihomo 内核内存占用">
              <Cpu size={15} aria-hidden="true" /><strong>{formatTraffic(memory).split(" ")[0]}</strong><span>{formatTraffic(memory).split(" ")[1]}</span>
            </div>
          )}
        </section>
      )}
      <div className="sidebar-footer">
        <button
          type="button"
          className="theme-toggle"
          aria-label={nextThemeLabel}
          aria-pressed={theme === "dark"}
          data-tip={nextThemeLabel}
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
