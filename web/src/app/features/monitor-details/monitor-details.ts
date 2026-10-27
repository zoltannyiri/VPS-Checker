import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  defer,
  exhaustMap,
  finalize,
  forkJoin,
  merge,
  tap,
  timer,
} from 'rxjs';
import {
  ChartPoint,
  HistoryPeriod,
  HistoryPoint,
  Incident,
  Monitor,
  MonitorStats,
  MonitorStatus,
} from '../../core/models/monitor.model';
import { MonitorService } from '../../core/services/monitor.service';
import { IncidentList } from './components/incident-list/incident-list';
import { ResponseTimeChart } from './components/response-time-chart/response-time-chart';

@Component({
  selector: 'app-monitor-details',
  imports: [RouterLink, ResponseTimeChart, IncidentList],
  templateUrl: './monitor-details.html',
  styleUrl: './monitor-details.css',
})
export class MonitorDetails {
  private readonly monitorService = inject(MonitorService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manualRefresh = new Subject<void>();

  readonly monitorId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly monitor = signal<Monitor | null>(null);
  readonly history = signal<HistoryPoint[]>([]);
  readonly stats = signal<MonitorStats | null>(null);
  readonly incidents = signal<Incident[]>([]);
  readonly selectedPeriod = signal<HistoryPeriod>('24h');
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly periodOptions: ReadonlyArray<{ value: HistoryPeriod; label: string }> = [
    { value: '24h', label: '24 óra' },
    { value: '7d', label: '7 nap' },
    { value: '30d', label: '30 nap' },
  ];

  readonly apiChartPoints = computed<ChartPoint[]>(() =>
    this.history()
      .filter((point) => point.apiResponseTimeMs !== null)
      .map((point) => ({ timestamp: point.checkedAt, value: point.apiResponseTimeMs! })),
  );
  readonly pingChartPoints = computed<ChartPoint[]>(() =>
    this.history()
      .filter((point) => point.pingLatencyMs !== null)
      .map((point) => ({ timestamp: point.checkedAt, value: point.pingLatencyMs! })),
  );
  readonly tcpChartPoints = computed<ChartPoint[]>(() =>
    this.history()
      .filter((point) => point.tcpConnectTimeMs !== null)
      .map((point) => ({ timestamp: point.checkedAt, value: point.tcpConnectTimeMs! })),
  );
  readonly recentHistory = computed(() => [...this.history()].reverse().slice(0, 50));

  constructor() {
    merge(timer(0, 15_000), this.manualRefresh)
      .pipe(
        exhaustMap(() =>
          defer(() => {
            this.loading.set(true);
            const period = this.selectedPeriod();
            return forkJoin({
              monitors: this.monitorService.getMonitors(),
              history: this.monitorService.getHistory(this.monitorId, period),
              stats: this.monitorService.getStats(this.monitorId, period),
              incidents: this.monitorService.getIncidents(period, this.monitorId),
            });
          }).pipe(
            tap(({ monitors, history, stats, incidents }) => {
              this.monitor.set(monitors.find((monitor) => monitor.id === this.monitorId) ?? null);
              this.history.set(history.points);
              this.stats.set(stats);
              this.incidents.set(incidents);
              this.errorMessage.set(null);
            }),
            catchError((error: unknown) => {
              this.errorMessage.set(this.describeError(error));
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  refresh(): void {
    this.manualRefresh.next();
  }

  setPeriod(period: HistoryPeriod): void {
    if (period === this.selectedPeriod()) return;
    this.selectedPeriod.set(period);
    this.refresh();
  }

  statusLabel(status: MonitorStatus): string {
    if (status === 'UP') return 'Online';
    if (status === 'DEGRADED') return 'Figyelmeztetés';
    if (status === 'DOWN') return 'Offline';
    return 'Ismeretlen';
  }

  statusClass(status: MonitorStatus): string {
    if (status === 'UP') return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30';
    if (status === 'DEGRADED') return 'bg-amber-500/10 text-amber-300 ring-amber-500/30';
    if (status === 'DOWN') return 'bg-rose-500/10 text-rose-300 ring-rose-500/30';
    return 'bg-slate-500/10 text-slate-300 ring-slate-500/30';
  }

  availability(value: boolean | null): string {
    if (value === true) return 'Elérhető';
    if (value === false) return 'Sikertelen';
    return 'Nincs adat';
  }

  formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
  }

  formatMs(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value} ms`;
  }

  formatPercentage(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`;
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 404)
      return 'A monitor nem található.';
    if (error instanceof HttpErrorResponse && error.status === 0)
      return 'A monitoring backend nem érhető el.';
    return 'A részletes monitoringadatok betöltése sikertelen.';
  }
}
