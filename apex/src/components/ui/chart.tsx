import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export interface ChartPoint {
  x: number; // 0..1
  y: number; // 0..1 (0 = top)
}

/** Horizontal band behind the lines (normalized y: y0 = top edge, y1 = bottom edge). */
export interface ChartBand {
  y0: number;
  y1: number;
  color: string;
}

/** Standalone marker on the chart (e.g. a scoring event) at a normalized x/y. */
export interface ChartMarker {
  x: number;
  y: number;
  color: string;
  selected?: boolean;
}

interface LineChartProps {
  series: { name: string; color: string; points: ChartPoint[] }[];
  height?: number;
  showGrid?: boolean;
  gridLabels?: string[];
  /** Left-side y-axis labels (top → bottom). */
  yLabels?: string[];
  /** X position 0..1 of a scrubber line. */
  scrubber?: number;
  showDots?: boolean;
  /** Risk-zone bands drawn behind the lines (soft fills). */
  bands?: ChartBand[];
  /** Standalone markers (scoring events) drawn on top of the lines. */
  markers?: ChartMarker[];
  onMarkerPress?: (index: number) => void;
  /** Tap a dot → report its series/point index. */
  onPointPress?: (seriesIndex: number, pointIndex: number) => void;
  /** Highlighted dot (series index, point index). */
  selectedPoint?: { series: number; point: number } | null;
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

/**
 * Press handler for SVG shapes. On native, `onPress` works as expected. On
 * web, react-native-svg wraps `onPress` in PanResponder props
 * (onStartShouldSetResponder / onResponder*) that react-native-web logs as
 * unknown event handlers — using the DOM `onClick` there keeps the tap
 * working with zero warnings.
 */
function pointPressProps(
  handler: ((...args: number[]) => void) | undefined,
  a: number,
  b: number,
  marker = false
): Record<string, unknown> {
  if (!handler) return {};
  const fn = marker ? () => handler(a) : () => handler(a, b);
  return Platform.OS === 'web' ? { onClick: fn } : { onPress: fn };
}

/** Lightweight multi-series line chart. Values are normalized 0..1. */
export function LineChart({
  series,
  height = 160,
  showGrid = true,
  gridLabels = [],
  yLabels = [],
  scrubber,
  showDots = false,
  bands = [],
  markers = [],
  onMarkerPress,
  onPointPress,
  selectedPoint,
}: LineChartProps) {
  const width = 100;

  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {bands.map((band, i) => (
          <Rect
            key={i}
            x={0}
            y={band.y0 * height}
            width={width}
            height={Math.max(0, (band.y1 - band.y0) * height)}
            fill={band.color}
            fillOpacity={0.09}
          />
        ))}
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
          ? series.map((s, si) =>
              s.points.map((p, pi) => {
                const isSelected = selectedPoint?.series === si && selectedPoint?.point === pi;
                return (
                  <Circle
                    key={`${s.name}-${pi}`}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r={isSelected ? 5 : 2.6}
                    fill={isSelected ? '#14121F' : s.color}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    {...pointPressProps(onPointPress, si, pi)}
                  />
                );
              })
            )
          : null}
        {markers.map((m, i) => (
          <Circle
            key={`marker-${i}`}
            cx={m.x * 100}
            cy={m.y * height}
            r={m.selected ? 6 : 4}
            fill={m.color}
            stroke={m.selected ? '#14121F' : '#FFFFFF'}
            strokeWidth={1.5}
            {...pointPressProps(onMarkerPress, i, 0, true)}
          />
        ))}
        {scrubber != null ? (
          <Line x1={scrubber * 100} x2={scrubber * 100} y1={0} y2={height} stroke="#5856D6" strokeWidth={2} />
        ) : null}
      </Svg>
      {yLabels.length > 0 ? (
        <View style={styles.yLabels}>
          {yLabels.map((label, i) => (
            <Text key={`yl-${i}`} style={styles.yLabel}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      {gridLabels.length > 0 ? (
        <View style={styles.labelsRow}>
          {gridLabels.map((label, i) => (
            <Text key={`gl-${i}`} style={styles.label}>
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
  yLabels: {
    position: 'absolute',
    left: 2,
    top: 2,
    bottom: 2,
    justifyContent: 'space-between',
  },
  yLabel: {
    fontSize: 9,
    color: '#C6C8D2',
    fontWeight: '600',
  },
});
