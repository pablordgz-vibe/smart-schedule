import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContextService } from './context.service';

describe('ContextService', () => {
  it('preserves end-user routes when switching from personal to organization', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ContextService);

    expect(service.resolveRouteForContext('organization', '/calendar')).toBe('/calendar');
  });

  it('falls back to the system landing route for system-only areas', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ContextService);

    expect(service.resolveRouteForContext('system', '/calendar')).toBe('/admin/setup');
  });
});
