import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Monitor } from '../../../../core/models/monitor.model';
import { MonitorCard } from './monitor-card';

const monitor: Monitor = {
  id: 'example',
  name: 'Example VPS',
  host: '192.0.2.1',
  port: 443,
  status: 'UP',
  ping: true,
  pingLatencyMs: 12,
  tcp: true,
  tcpConnectTimeMs: 8,
  api: { online: true, httpStatus: 200, responseTimeMs: 42, error: null },
  consecutiveFailures: 0,
  lastCheckedAt: '2026-01-01T00:00:00.000Z',
  lastSuccessfulAt: '2026-01-01T00:00:00.000Z',
  recentChecks: [{ checkedAt: '2026-01-01T00:00:00.000Z', status: 'UP' }],
  isStale: false,
};

describe('MonitorCard', () => {
  let component: MonitorCard;
  let fixture: ComponentFixture<MonitorCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MonitorCard);
    fixture.componentRef.setInput('monitor', monitor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
