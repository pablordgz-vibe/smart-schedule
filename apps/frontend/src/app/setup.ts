import { Component } from '@angular/core';

@Component({
  selector: 'app-setup',
  standalone: true,
  template: `
    <div class="setup-container">
      <h1>Smart Schedule Setup</h1>
      <p>Welcome to your new Smart Schedule instance. Let's get you set up.</p>
      
      <div class="wizard-step">
        <h2>1. Deployment Mode</h2>
        <p>Current mode: <strong>Community Edition (Self-hosted)</strong></p>
      </div>

      <div class="actions">
        <button disabled>Next: Integrations</button>
      </div>
    </div>
  `,
  styles: [`
    .setup-container {
      max-width: 600px;
      margin: 100px auto;
      padding: 40px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      font-family: sans-serif;
    }
    h1 { color: #333; }
    .wizard-step { margin: 20px 0; padding: 20px; border: 1px solid #eee; border-radius: 4px; }
    .actions { margin-top: 30px; text-align: right; }
    button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:disabled { background: #ccc; cursor: not-allowed; }
  `]
})
export class SetupComponent {}
