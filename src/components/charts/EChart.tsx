import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, FunnelChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);

// Chart ink & palette — fleet navy/cyan hues (cyan / violet / green),
// slotted into the validated categorical order (blue, ..., green, violet, ...).
// Single-series bar charts use one hue only (never a rainbow per bar).
export const viz = {
  blue: '#1a87b8',
  violet: '#6a4fb3',
  green: '#2f8a4d',
  // Ordinal ramp (one hue, light→dark) for ranked stages — funnels, tiers.
  ramp3: ['#8ccbe6', '#2f9bc9', '#14506f'],
  ink: '#111a2e',
  inkSecondary: '#4a5468',
  muted: '#7b8497',
  grid: '#e3e8ef',
  axis: '#c9d1dd',
  surface: '#ffffff',
};

export const vizAxisLabel = { color: viz.muted, fontSize: 11 };
export const vizSplitLine = { lineStyle: { color: viz.grid, width: 1 } };
export const vizTooltip = {
  backgroundColor: viz.surface,
  borderColor: viz.grid,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: viz.ink, fontSize: 12 },
  extraCssText: 'box-shadow: 0 4px 16px rgba(11,11,11,0.08); border-radius: 8px;',
};

interface EChartProps {
  option: echarts.EChartsCoreOption;
  height?: number;
}

export function EChart({ option, height = 280 }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={ref} style={{ height, width: '100%' }} />;
}
