/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const OSU_OAUTH_STATE_COOKIE_NAME = 'rm_osu_oauth_state';

export function parseCookies(req: VercelRequest): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    try {
      list[name] = decodeURIComponent(value);
    } catch {
      // Ignore malformed cookies instead of allowing them to abort the request.
    }
  });

  return list;
}

function getCookieAttributes(maxAgeSeconds: number, secure: boolean): string {
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function appendSetCookie(res: VercelResponse, value: string): void {
  const existing = res.getHeader('Set-Cookie');
  const cookies = existing ? (Array.isArray(existing) ? existing : [String(existing)]) : [];
  res.setHeader('Set-Cookie', [...cookies, value]);
}

export function isSecureRequest(req: VercelRequest): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setOsuOAuthStateCookie(res: VercelResponse, state: string, secure: boolean): void {
  appendSetCookie(
    res,
    `${OSU_OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; ${getCookieAttributes(10 * 60, secure)}`
  );
}

export function clearOsuOAuthStateCookie(res: VercelResponse, secure: boolean): void {
  appendSetCookie(res, `${OSU_OAUTH_STATE_COOKIE_NAME}=; ${getCookieAttributes(0, secure)}`);
}

export function isValidOsuOAuthState(req: VercelRequest, state: string | undefined): boolean {
  const expected = parseCookies(req)[OSU_OAUTH_STATE_COOKIE_NAME];
  if (!expected || !state || expected.length !== state.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(state));
}
