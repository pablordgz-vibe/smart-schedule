import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-setup',
  template: `
    <div class="setup-container">
      <h1>Deployment Setup</h1>
      <p>Configure your SmartSchedule instance.</p>
    </div>
  `,
  styles: [
    `
      .setup-container {
        max-width: 600px;
        margin: 100px auto;
        padding: var(--spacing-8);
        background-color: var(--bg-surface);
        border-radius: var(--spacing-4);
        box-shadow: var(--shadow-md);
      }
    `,
  ],
})
export class SetupComponent {}
