import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, MarkPointComponent,
  RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// Only the chart types the sanitizer allows are registered, which keeps this chunk small.
echarts.use([
  BarChart, BoxplotChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart,
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, MarkPointComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, UniversalTransition, CanvasRenderer,
]);

export { echarts };
export type ChartInstance = ReturnType<typeof echarts.init>;
