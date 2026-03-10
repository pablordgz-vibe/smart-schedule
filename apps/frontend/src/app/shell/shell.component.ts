import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-container">
      <header class="app-header">
        <div class="logo" i18n>SmartSchedule</div>
        <div class="context-switcher">
          <span class="context-badge" i18n>Personal</span>
        </div>
        <div class="user-profile">
          <div class="avatar" i18n>U</div>
        </div>
      </header>

      <nav class="app-nav">
        <ul data-testid="main-nav">
          <li>
            <a routerLink="/home" routerLinkActive="active" data-testid="nav-home">
              <span class="icon">🏠</span>
              <span class="label" i18n>Home</span>
            </a>
          </li>
          <li>
            <a routerLink="/calendar" routerLinkActive="active" data-testid="nav-calendar">
              <span class="icon">📅</span>
              <span class="label" i18n>Calendar</span>
            </a>
          </li>
          <li>
            <a routerLink="/tasks" routerLinkActive="active" data-testid="nav-tasks">
              <span class="icon">✅</span>
              <span class="label" i18n>Tasks</span>
            </a>
          </li>
          <li>
            <a routerLink="/schedules" routerLinkActive="active" data-testid="nav-schedules">
              <span class="icon">📜</span>
              <span class="label" i18n>Schedules</span>
            </a>
          </li>
        </ul>
      </nav>

      <main class="app-main">
        <router-outlet></router-outlet>
      </main>

      <nav class="mobile-nav">
        <a routerLink="/home" routerLinkActive="active">🏠</a>
        <a routerLink="/calendar" routerLinkActive="active">📅</a>
        <a routerLink="/tasks" routerLinkActive="active">✅</a>
        <a routerLink="/schedules" routerLinkActive="active">📜</a>
      </nav>
    </div>
  `,
  styles: [`
    .app-container {
      display: grid;
      grid-template-areas:
        "header header"
        "nav main";
      grid-template-columns: 240px 1fr;
      grid-template-rows: 64px 1fr;
      height: 100vh;
      background-color: var(--bg-app);
    }

    .app-header {
      grid-area: header;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--spacing-6);
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-default);
      z-index: 10;
    }

    .logo {
      font-size: var(--font-size-xl);
      font-weight: 700;
      color: var(--color-primary-600);
    }

    .context-badge {
      background-color: var(--color-primary-100);
      color: var(--color-primary-700);
      padding: var(--spacing-1) var(--spacing-3);
      border-radius: 9999px;
      font-size: var(--font-size-sm);
      font-weight: 600;
    }

    .app-nav {
      grid-area: nav;
      background-color: var(--bg-surface);
      border-right: 1px solid var(--border-default);
      padding: var(--spacing-4);
    }

    .app-nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .app-nav a {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: var(--spacing-2);
      transition: all 0.2s;
      margin-bottom: var(--spacing-1);
    }

    .app-nav a:hover {
      background-color: var(--color-neutral-100);
      color: var(--text-primary);
    }

    .app-nav a.active {
      background-color: var(--color-primary-50);
      color: var(--color-primary-600);
      font-weight: 600;
    }

    .app-main {
      grid-area: main;
      padding: var(--spacing-6);
      overflow-y: auto;
    }

    .mobile-nav {
      display: none;
    }

    @media (max-width: 768px) {
      .app-container {
        grid-template-areas:
          "header"
          "main";
        grid-template-columns: 1fr;
        grid-template-rows: 64px 1fr;
      }

      .app-nav {
        display: none;
      }

      .mobile-nav {
        display: flex;
        justify-content: space-around;
        align-items: center;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 64px;
        background-color: var(--bg-surface);
        border-top: 1px solid var(--border-default);
        z-index: 10;
      }

      .mobile-nav a {
        font-size: 1.5rem;
        text-decoration: none;
        padding: var(--spacing-2);
      }

      .mobile-nav a.active {
        color: var(--color-primary-600);
      }

      .app-main {
        padding-bottom: 80px;
      }
    }
  `]
})
export class ShellComponent {}
