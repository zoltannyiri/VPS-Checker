import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MonitorService } from './monitor.service';

describe('MonitorService', () => {
  let service: MonitorService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MonitorService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads monitors from the backend API', () => {
    service.getMonitors().subscribe((monitors) => expect(monitors).toEqual([]));

    const request = httpTesting.expectOne('/api/monitors');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads persisted history for the selected period', () => {
    service.getHistory('portfolio', '7d').subscribe((response) => {
      expect(response.points).toEqual([]);
    });

    const request = httpTesting.expectOne(
      (candidate) =>
        candidate.url === '/api/monitors/portfolio/history' &&
        candidate.params.get('period') === '7d',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ monitorId: 'portfolio', period: '7d', points: [] });
  });
});
