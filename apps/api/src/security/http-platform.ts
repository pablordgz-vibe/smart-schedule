import type { FastifyReply } from 'fastify';
import {
  serialize as serializeCookie,
  type SerializeOptions,
} from 'cookie';
import type { ApiRequest } from './request-context.types';

export const sessionCookieName =
  process.env.SESSION_COOKIE_NAME || 'smart_schedule_session';

const sessionCookieOptions: SerializeOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'strict',
  secure: true,
};

export function clearSessionCookie(reply: FastifyReply) {
  clearCookie(reply, sessionCookieName, sessionCookieOptions.path);
}

export function setSessionCookie(reply: FastifyReply, cookieValue: string) {
  setCookie(reply, sessionCookieName, cookieValue, {
    ...sessionCookieOptions,
  });
}

export function clearCookie(
  reply: FastifyReply,
  cookieName: string,
  path = '/',
) {
  appendSetCookieHeader(
    reply,
    serializeCookie(cookieName, '', {
      ...sessionCookieOptions,
      expires: new Date(0),
      maxAge: 0,
      path,
    }),
  );
}

export function setCookie(
  reply: FastifyReply,
  cookieName: string,
  value: string,
  options?: SerializeOptions,
) {
  appendSetCookieHeader(
    reply,
    serializeCookie(cookieName, value, {
      ...sessionCookieOptions,
      ...options,
    }),
  );
}

export function getHeaderValue(
  request: Pick<ApiRequest, 'headers'>,
  headerName: string,
) {
  const value = request.headers[headerName.toLowerCase()];

  if (Array.isArray(value)) {
    return (
      value.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.length > 0,
      ) ?? null
    );
  }

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseCookieHeader(request: Pick<ApiRequest, 'headers'>) {
  const cookieHeader = getHeaderValue(request, 'cookie');
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return [part, ''] as const;
        }

        return [
          decodeURIComponent(part.slice(0, separatorIndex)),
          decodeURIComponent(part.slice(separatorIndex + 1)),
        ] as const;
      }),
  );
}

export function getRequestIp(request: ApiRequest) {
  if (typeof request.ip === 'string' && request.ip.length > 0) {
    return request.ip;
  }

  const forwardedFor = getHeaderValue(request, 'x-forwarded-for');
  if (forwardedFor) {
    return (
      forwardedFor
        .split(',')
        .map((value) => value.trim())
        .find(Boolean) ?? forwardedFor
    );
  }

  return request.raw?.socket.remoteAddress ?? 'unknown';
}

export function getRequestResource(request: ApiRequest) {
  const url =
    typeof request.originalUrl === 'string' && request.originalUrl.length > 0
      ? request.originalUrl
      : request.url;

  return `${request.method} ${url}`;
}

export function getRoutePath(request: ApiRequest) {
  const routePath =
    typeof request.routeOptions?.url === 'string'
      ? request.routeOptions.url
      : null;

  return routePath ?? request.url;
}

function appendSetCookieHeader(reply: FastifyReply, cookieValue: string) {
  const existingHeader = reply.getHeader('set-cookie');
  const nextHeaderValue = Array.isArray(existingHeader)
    ? [...existingHeader, cookieValue]
    : typeof existingHeader === 'string'
      ? [existingHeader, cookieValue]
      : cookieValue;

  reply.header('set-cookie', nextHeaderValue);
}
