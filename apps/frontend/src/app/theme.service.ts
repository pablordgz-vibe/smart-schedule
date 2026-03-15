import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

type ThemeName = 'lofi' | 'night';

const themeStorageKey = 'smart-schedule-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly themeState = signal<ThemeName>(this.readInitialTheme());

  readonly theme = this.themeState.asReadonly();

  constructor() {
    effect(() => {
      const theme = this.themeState();
      this.document.documentElement.setAttribute('data-theme', theme);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(themeStorageKey, theme);
      }

      const themeColor = theme === 'night' ? '#161616' : '#f7f7f5';
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    });
  }

  isDarkMode() {
    return this.themeState() === 'night';
  }

  toggleTheme() {
    this.themeState.set(this.themeState() === 'night' ? 'lofi' : 'night');
  }

  private readInitialTheme(): ThemeName {
    if (typeof window === 'undefined') {
      return 'lofi';
    }

    return window.localStorage.getItem(themeStorageKey) === 'night' ? 'night' : 'lofi';
  }
}
