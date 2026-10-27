import { Component, computed, input } from '@angular/core';
import { ChartPoint } from '../../../../core/models/monitor.model';

type ChartColor = 'cyan' | 'blue' | 'violet';

interface SvgPoint extends ChartPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-response-time-chart',
  templateUrl: './response-time-chart.html',
  styleUrl: './response-time-chart.css',
})
export class ResponseTimeChart {
  readonly title = input.required<string>();
  readonly points = input<readonly ChartPoint[]>([]);
  readonly unit = input('ms');
  readonly color = input<ChartColor>('cyan');

  readonly maximum = computed(() => {
    const values = this.points().map((point) => point.value);
    return values.length === 0 ? null : Math.max(...values);
  });
  readonly average = computed(() => {
    const values = this.points().map((point) => point.value);
    return values.length === 0
      ? null
      : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
  });
  readonly svgPoints = computed<SvgPoint[]>(() => {
    const points = this.points();
    if (points.length === 0) return [];
    const max = Math.max(...points.map((point) => point.value), 1);
    return points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? 400 : 24 + (index / (points.length - 1)) * 752,
      y: 196 - (point.value / max) * 164,
    }));
  });
  readonly polyline = computed(() =>
    this.svgPoints()
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  );
  readonly strokeColor = computed(() => {
    if (this.color() === 'blue') return '#60a5fa';
    if (this.color() === 'violet') return '#a78bfa';
    return '#22d3ee';
  });

  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }
}
