import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@smart-schedule/contracts';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  get() {
    return this.storage.getStore();
  }

  run<T>(requestContext: RequestContext, callback: () => T) {
    return this.storage.run(requestContext, callback);
  }
}
