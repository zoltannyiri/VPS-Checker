import { Component, computed, input } from '@angular/core';

export type StatCardColor = 'blue' | 'green' | 'yellow' | 'red';
export type StatCardIcon =
  'servers' | 'online' | 'warning' | 'offline' | 'uptime' | 'latency' | 'incident';

@Component({
  imports: [],
  selector: 'app-stat-card',
  styleUrl: './stat-card.css',
  templateUrl: './stat-card.html',
})
export class StatCard {
  readonly title = input.required<string>();
  readonly value = input.required<number | string>();
  readonly color = input<StatCardColor>('blue');
  readonly icon = input<StatCardIcon>('servers');
  readonly description = input<string>('');

  readonly accentClasses = computed(() => {
    switch (this.color()) {
      case 'green':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
      case 'yellow':
        return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300';
      case 'red':
        return 'border-red-500/40 bg-red-500/10 text-red-300';
      case 'blue':
        return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
    }
  });
}
