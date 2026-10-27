import { Component, input } from '@angular/core';
import { Incident } from '../../../../core/models/monitor.model';

@Component({
  selector: 'app-incident-list',
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentList {
  readonly incidents = input<readonly Incident[]>([]);

  duration(incident: Incident): string {
    const end = incident.endedAt ? new Date(incident.endedAt).getTime() : Date.now();
    const milliseconds = Math.max(0, end - new Date(incident.startedAt).getTime());
    const minutes = Math.floor(milliseconds / 60_000);
    if (minutes < 60) return `${minutes} perc`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) return `${hours} óra ${remainingMinutes} perc`;
    return `${Math.floor(hours / 24)} nap ${hours % 24} óra`;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }
}
