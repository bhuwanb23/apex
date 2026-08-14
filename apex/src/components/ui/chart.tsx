import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

export interface ChartPoint {
  x: number; // 0..1
  y: number; // 0..1 (0 = top)
}

interface LineChartProps {
  series: { name: string; color: string; points: ChartPoint[] }[];
  height?: number;
  showGrid?: boolean;
  gridLabels?: string[];
  /** X position 0..1 of a scrubber line. */
  scrubber?: number;
  showDots?: boolean;
}

function toPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x * 100} ${first.y * 100}`;
  for (const p of rest) {
    d += ` L ${p.x * 100} ${p.y * 100}`;
  }
  return d;
}

/** Lightweight multi-series line chart. Values are normalized 0..1. */
export function LineChart({
  series,
  height = 160,
  showGrid = true,
  gridLabels = [],
  scrubber,
  showDots = false,
}: LineChartProps) {
  const width = 100;

  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {showGrid
          ? [0.25, 0.5, 0.75].map(t => (
              <Line
                key={t}
                x1={0}
                x2={width}
                y1={height * t}
                y2={height * t}
                stroke="#E8E9F0"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))
          : null}
        {series.map(s => (
          <Path
            key={s.name}
            d={toPath(s.points)}
            stroke={s.color}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {showDots
          ? series.map(s =>
              s.points.map((p, i) => (
                <Circle
                  key={`${s.name}-${i}`}
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={2.4}
                  fill={s.color}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                />
              ))
            )
          : null}
        {scrubber != null ? (
          <Line x1={scrubber * 100} x2={scrubber * 100} y1={0} y2={height} stroke="#5856D6" strokeWidth={2} />
        ) : null}
      </Svg>
      {gridLabels.length > 0 ? (
        <View style={styles.labelsRow}>
          {gridLabels.map(label => (
            <Text key={label} style={styles.label}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    color: '#9AA0B5',
    fontWeight: '500',
  },
});
