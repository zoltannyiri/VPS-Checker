import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { MonitorDetails } from './features/monitor-details/monitor-details';

export const routes: Routes = [
  { path: '', component: Dashboard, pathMatch: 'full' },
  { path: 'monitors/:id', component: MonitorDetails },
  { path: '**', redirectTo: '' },
];
