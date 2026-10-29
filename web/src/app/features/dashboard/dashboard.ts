import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
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
  HistoryPeriod,
  Monitor,
  MonitorStatus,
  OverviewStats,
} from '../../core/models/monitor.model';
import { MonitorService } from '../../core/services/monitor.service';
import { MonitorCard } from './components/monitor-card/monitor-card';
import { StatCard } from './components/stat-card/stat-card';

type StatusFilter = 'ALL' | MonitorStatus;

@Component({
  imports: [FormsModule, MonitorCard, StatCard],
  selector: 'app-dashboard',
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly monitorService = inject(MonitorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manualRefresh = new Subject<void>();

  readonly monitors = signal<Monitor[]>([]);
  readonly searchQuery = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly loading = signal(true);
  readonly backendConnected = signal<boolean | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly lastSynchronizedAt = signal<Date | null>(null);
  readonly selectedPeriod = signal<HistoryPeriod>('24h');
  readonly overview = signal<OverviewStats | null>(null);
  readonly periodOptions: ReadonlyArray<{ value: HistoryPeriod; label: string }> = [
    { value: '24h', label: '24 óra' },
    { value: '7d', label: '7 nap' },
    { value: '30d', label: '30 nap' },
  ];

  readonly filteredMonitors = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    const selectedStatus = this.statusFilter();

    return this.monitors().filter((monitor) => {
      const matchesQuery =
        query.length === 0 ||
        monitor.name.toLocaleLowerCase().includes(query) ||
        monitor.host.toLocaleLowerCase().includes(query);
      const matchesStatus = selectedStatus === 'ALL' || monitor.status === selectedStatus;

      return matchesQuery && matchesStatus;
    });
  });

  readonly totalCount = computed(() => this.monitors().length);
  readonly onlineCount = computed(
    () => this.monitors().filter((monitor) => monitor.status === 'UP').length,
  );
  readonly degradedCount = computed(
    () => this.monitors().filter((monitor) => monitor.status === 'DEGRADED').length,
  );
  readonly offlineCount = computed(
    () => this.monitors().filter((monitor) => monitor.status === 'DOWN').length,
  );

  constructor() {
    merge(timer(0, 60_000), this.manualRefresh)
      .pipe(
        exhaustMap(() =>
          defer(() => {
            this.loading.set(true);
            return forkJoin({
              monitors: this.monitorService.getMonitors(),
              overview: this.monitorService.getOverview(this.selectedPeriod()),
            });
          }).pipe(
            tap(({ monitors, overview }) => {
              this.monitors.set(monitors);
              this.overview.set(overview);
              this.backendConnected.set(true);
              this.errorMessage.set(null);
              this.lastSynchronizedAt.set(new Date());
            }),
            catchError((error: unknown) => {
              this.backendConnected.set(false);
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

  formatPercentage(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`;
  }

  formatMilliseconds(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value} ms`;
  }

  setStatusFilter(value: string): void {
    if (
      value === 'ALL' ||
      value === 'UNKNOWN' ||
      value === 'UP' ||
      value === 'DEGRADED' ||
      value === 'DOWN'
    ) {
      this.statusFilter.set(value);
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'A backend nem érhető el.';
      }
      return `A monitoradatok lekérése sikertelen (HTTP ${error.status}).`;
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return 'A backend nem válaszolt időben.';
    }

    return 'Ismeretlen hiba történt a monitoradatok lekérésekor.';
  }
}
