import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { TrafficPoint } from "../hooks/useTrafficStream";

interface TrafficSparklineProps {
  points: TrafficPoint[];
  dataKey: keyof TrafficPoint;
  color: string;
  label: string;
  height?: number;
  secondary?: { dataKey: keyof TrafficPoint; color: string };
}

export function TrafficSparkline({ points, dataKey, color, label, height = 66, secondary }: TrafficSparklineProps) {
  return (
    <div className="traffic-chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 320, height }}>
        <LineChart data={points} margin={{ top: 5, right: 2, bottom: 5, left: 2 }}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          {secondary && <Line type="monotone" dataKey={secondary.dataKey} stroke={secondary.color} strokeWidth={1.6} dot={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
