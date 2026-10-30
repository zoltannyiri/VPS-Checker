
import { Component, computed, input } from '@angular/core';
import { Incident } from '../../../../core/models/monitor.model';

@Component({
  selector: 'app-incident-list',
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentList {
  readonly incidents = input<readonly Incident[]>([]);

  readonly displayIncidents = computed(() =>
    this.incidents().map((incident) => {
      const error = (incident.error ?? '')
        .replace(/\r\n/g, '\n')
        .trim();

      const sections = error.split(/\n[ \t]*\n/);

      const sshIndex = sections.findIndex((section) =>
        /^(SSH-diagnosztika|Az SSH-diagnosztika)\b/i.test(
          section.trim(),
        ),
      );

      const observedError =
        sshIndex === -1
          ? error
          : sections.slice(0, sshIndex).join('\n\n').trim();

      const sshLines =
        sshIndex === -1
          ? []
          : sections
              .slice(sshIndex)
              .join('\n\n')
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);

      return {
        ...incident,
        observedError,
        sshLines,
      };
    }),
  );

  duration(incident: Incident): string {
    const end = incident.endedAt
      ? new Date(incident.endedAt).getTime()
      : Date.now();

    const milliseconds = Math.max(
      0,
      end - new Date(incident.startedAt).getTime(),
    );

    const minutes = Math.floor(milliseconds / 60_000);

    const seconds = Math.floor(milliseconds / 1000);

    if (minutes < 60) return `${minutes} perc`;

    if (seconds < 60) {
      return `${seconds} mp`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours < 24) {
      return `${hours} óra ${remainingMinutes} perc`;
    }

    return `${Math.floor(hours / 24)} nap ${hours % 24} óra`;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('hu-HU');
  }
}
