import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import {
  HistoryPeriod,
  HistoryResponse,
  Incident,
  Monitor,
  MonitorStats,
  OverviewStats,
} from '../models/monitor.model';

@Injectable({ providedIn: 'root' })
export class MonitorService {
  private readonly http = inject(HttpClient);

  getMonitors(): Observable<Monitor[]> {
    return this.http.get<Monitor[]>('/api/monitors').pipe(timeout({ first: 10_000 }));
  }

  getOverview(period: HistoryPeriod): Observable<OverviewStats> {
    return this.http
      .get<OverviewStats>('/api/overview', { params: this.periodParams(period) })
      .pipe(timeout({ first: 10_000 }));
  }

  getHistory(monitorId: string, period: HistoryPeriod): Observable<HistoryResponse> {
    return this.http
      .get<HistoryResponse>(`/api/monitors/${encodeURIComponent(monitorId)}/history`, {
        params: this.periodParams(period),
      })
      .pipe(timeout({ first: 10_000 }));
  }

  getStats(monitorId: string, period: HistoryPeriod): Observable<MonitorStats> {
    return this.http
      .get<MonitorStats>(`/api/monitors/${encodeURIComponent(monitorId)}/stats`, {
        params: this.periodParams(period),
      })
      .pipe(timeout({ first: 10_000 }));
  }

  getIncidents(period: HistoryPeriod, monitorId?: string): Observable<Incident[]> {
    let params = this.periodParams(period);
    if (monitorId) params = params.set('monitorId', monitorId);
    return this.http.get<Incident[]>('/api/incidents', { params }).pipe(timeout({ first: 10_000 }));
  }

  private periodParams(period: HistoryPeriod): HttpParams {
    return new HttpParams().set('period', period);
  }
}
