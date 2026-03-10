import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ContextService } from '../context.service';
import { routes } from '../app.routes';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  it('renders the active context badge', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const contextService = TestBed.inject(ContextService);
    contextService.setActiveContext('organization');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostElement = fixture.nativeElement as HTMLElement;
    const badge = hostElement.querySelector('[data-testid="context-badge"]');
    expect(badge?.textContent).toContain('Organization: Atlas Ops');
  });

  it('redirects to the system admin landing page on a system context switch', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
    });

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/calendar');

    fixture.componentInstance.switchContext('system');
    await fixture.whenStable();

    expect(router.url).toBe('/admin/setup');
  });
});
