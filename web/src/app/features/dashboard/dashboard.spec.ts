import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { OverviewStats } from '../../core/models/monitor.model';
import { MonitorService } from '../../core/services/monitor.service';
import { Dashboard } from './dashboard';

const overview: OverviewStats = {
  period: '24h',
  sampleCount: 0,
  uptimePercentage: null,
  averageApiResponseTimeMs: null,
  openIncidentCount: 0,
  methodology: 'Test',
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        {
          provide: MonitorService,
          useValue: {
            getMonitors: () => of([]),
            getOverview: () => of(overview),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
