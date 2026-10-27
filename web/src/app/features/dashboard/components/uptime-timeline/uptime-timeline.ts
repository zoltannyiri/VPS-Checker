import { Component, input } from '@angular/core';
import { MonitorStatus, RecentCheck } from '../../../../core/models/monitor.model';

@Component({
  selector: 'app-uptime-timeline',
  templateUrl: './uptime-timeline.html',
  styleUrl: './uptime-timeline.css',
})
export class UptimeTimeline {
  readonly checks = input<readonly RecentCheck[]>([]);

  segmentClass(status: MonitorStatus): string {
    switch (status) {
      case 'UP':
        return 'bg-emerald-400';
      case 'DEGRADED':
        return 'bg-amber-400';
      case 'DOWN':
        return 'bg-rose-500';
      case 'UNKNOWN':
        return 'bg-slate-600';
    }
  }

  label(status: MonitorStatus): string {
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

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }
}
