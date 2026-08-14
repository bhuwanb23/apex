import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Track color. */
  trackColor?: string;
  /** Fill color up to the thumb. */
  fillColor?: string;
  thumbColor?: string;
  height?: number;
}

/** Dependency-free slider: tap or drag on the track to set a value. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  trackColor = '#E8E9F0',
  fillColor = '#5856D6',
  thumbColor = '#FFFFFF',
  height = 36,
}: SliderProps) {
  const widthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap = (v: number) => {
    if (step <= 0) return v;
    return Math.round((v - min) / step) * step + min;
  };

  const pct = (max - min === 0 ? 0 : (clamp(value) - min) / (max - min)) * 100;

  const updateFromX = (x: number) => {
    if (widthRef.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / widthRef.current));
    onChange(snap(clamp(min + ratio * (max - min))));
  };

  const onGrant = (e: GestureResponderEvent) => {
    setDragging(true);
    updateFromX(e.nativeEvent.locationX);
  };
  const onMove = (e: GestureResponderEvent) => {
    updateFromX(e.nativeEvent.locationX);
  };
  const onRelease = () => setDragging(false);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View
      style={[styles.touchArea, { height }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onRelease}
      onResponderTerminate={onRelease}>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { backgroundColor: fillColor, width: `${pct}%` }]} />
      </View>
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: thumbColor,
            left: `${pct}%`,
            borderColor: dragging ? fillColor : '#D5D7E0',
            transform: [{ translateX: -14 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    shadowColor: '#5856D6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
});
