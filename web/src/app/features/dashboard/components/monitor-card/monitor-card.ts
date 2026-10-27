import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Monitor, MonitorStatus } from '../../../../core/models/monitor.model';
import { UptimeTimeline } from '../uptime-timeline/uptime-timeline';

@Component({
  imports: [RouterLink, UptimeTimeline],
  selector: 'app-monitor-card',
  styleUrl: './monitor-card.css',
  templateUrl: './monitor-card.html',
})
export class MonitorCard {
  readonly monitor = input.required<Monitor>();

  readonly statusLabel = computed(() => this.labelForStatus(this.monitor().status));
  readonly statusClasses = computed(() => this.classesForStatus(this.monitor().status));

  availabilityLabel(value: boolean | null): string {
    if (value === true) return 'Elérhető';
    if (value === false) return 'Sikertelen';
    return 'Ismeretlen';
  }

  availabilityClasses(value: boolean | null): string {
    if (value === true) return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30';
    if (value === false) return 'bg-red-500/10 text-red-300 ring-red-500/30';
    return 'bg-slate-500/10 text-slate-300 ring-slate-500/30';
  }

  formatLastChecked(value: string | null): string {
    if (value === null) return 'Még nem történt ellenőrzés';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  metric(value: number | null): string {
    return value === null ? '—' : `${value} ms`;
  }

  private labelForStatus(status: MonitorStatus): string {
    switch (status) {
      case 'UP':
        return 'Online';
      case 'DEGRADED':
        return 'Figyelmeztetés';
      case 'DOWN':
        return 'Offline';
      case 'UNKNOWN':
        return 'Ismeretlen';
    }
  }

  private classesForStatus(status: MonitorStatus): string {
    switch (status) {
      case 'UP':
        return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30';
      case 'DEGRADED':
        return 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/30';
      case 'DOWN':
        return 'bg-red-500/10 text-red-300 ring-red-500/30';
      case 'UNKNOWN':
        return 'bg-slate-500/10 text-slate-300 ring-slate-500/30';
    }
  }
}
