import { Line, LineChart, matchByDataKey, ResponsiveContainer, XAxis } from "recharts";
import type { TrafficPoint } from "../hooks/useTrafficStream";

interface TrafficSparklineProps {
  points: TrafficPoint[];
  dataKey: "up" | "down";
  color: string;
  label: string;
  height?: number;
  fillHeight?: boolean;
  secondary?: { dataKey: "up" | "down"; color: string };
}

const animation = {
  isAnimationActive: "auto",
  animationDuration: 900,
  animationEasing: "linear",
  animationMatchBy: matchByDataKey("sequence"),
  animateNewValues: false,
} as const;

export function TrafficSparkline({ points, dataKey, color, label, height = 66, fillHeight = false, secondary }: TrafficSparklineProps) {
  return (
    <div className="traffic-chart" role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height={fillHeight ? "100%" : height} initialDimension={{ width: 320, height }}>
        <LineChart data={points} margin={{ top: 5, right: 2, bottom: 5, left: 2 }}>
          <XAxis hide allowDataOverflow />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} {...animation} />
          {secondary && <Line type="monotone" dataKey={secondary.dataKey} stroke={secondary.color} strokeWidth={1.6} dot={false} {...animation} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
