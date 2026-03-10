import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ContextService } from './context.service';
import { routeAreaGuard } from './route-area.guard';

describe('routeAreaGuard', () => {
  it('redirects disallowed routes to the active context fallback', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    const contextService = TestBed.inject(ContextService);
    const router = TestBed.inject(Router);
    contextService.setActiveContext('personal');

    const result = TestBed.runInInjectionContext(() =>
      routeAreaGuard({ data: { area: 'system-admin' } } as never, {} as never),
    );

    expect(router.serializeUrl(result as ReturnType<typeof router.parseUrl>)).toBe('/home');
  });
});
