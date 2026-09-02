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

import { describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ALLOWED_HOSTS,
  handleCors,
  isAllowedHost,
  isAllowedOrigin,
  isSameOriginRequest,
  validateRequestOrigin,
} from '../api/_lib/response';

describe('API origin and host validation', () => {
  describe('isAllowedHost', () => {
    it('accepts rhythm-mania.com, beta.rhythm-mania.com, and v1.rhythm-mania.com in both prod and dev', () => {
      expect(isAllowedHost('rhythm-mania.com', true)).toBe(true);
      expect(isAllowedHost('rhythm-mania.com', false)).toBe(true);
      expect(isAllowedHost('beta.rhythm-mania.com', true)).toBe(true);
      expect(isAllowedHost('beta.rhythm-mania.com', false)).toBe(true);
      expect(isAllowedHost('v1.rhythm-mania.com', true)).toBe(true);
      expect(isAllowedHost('v1.rhythm-mania.com', false)).toBe(true);
      expect(isAllowedHost('RHYTHM-MANIA.COM', true)).toBe(true);
      expect(isAllowedHost('BETA.RHYTHM-MANIA.COM', true)).toBe(true);
      expect(isAllowedHost('V1.RHYTHM-MANIA.COM', true)).toBe(true);
      expect(isAllowedHost('rhythm-mania.com:443', true)).toBe(true);
      expect(isAllowedHost('beta.rhythm-mania.com:443', true)).toBe(true);
      expect(isAllowedHost('v1.rhythm-mania.com:443', true)).toBe(true);
    });

    it('rejects unauthorized hostnames and subdomains in production', () => {
      expect(isAllowedHost('evil.com', true)).toBe(false);
      expect(isAllowedHost('sub.rhythm-mania.com', true)).toBe(false);
      expect(isAllowedHost('rhythm-mania.com.attacker.com', true)).toBe(false);
      expect(isAllowedHost('fake-rhythm-mania.com', true)).toBe(false);
      expect(isAllowedHost('localhost', true)).toBe(false);
      expect(isAllowedHost('127.0.0.1', true)).toBe(false);
      expect(isAllowedHost('', true)).toBe(false);
      expect(isAllowedHost(undefined, true)).toBe(false);
      expect(isAllowedHost(null, true)).toBe(false);
    });

    it('allows localhost and 127.0.0.1 in non-production environments', () => {
      expect(isAllowedHost('localhost', false)).toBe(true);
      expect(isAllowedHost('localhost:3000', false)).toBe(true);
      expect(isAllowedHost('127.0.0.1', false)).toBe(true);
      expect(isAllowedHost('127.0.0.1:5173', false)).toBe(true);
      expect(isAllowedHost('evil.com', false)).toBe(false);
    });
  });

  describe('isAllowedOrigin', () => {
    it('accepts valid https origins for allowed domains in production', () => {
      expect(isAllowedOrigin('https://rhythm-mania.com', true)).toBe(true);
      expect(isAllowedOrigin('https://beta.rhythm-mania.com', true)).toBe(true);
      expect(isAllowedOrigin('https://v1.rhythm-mania.com', true)).toBe(true);
      expect(isAllowedOrigin('http://rhythm-mania.com', true)).toBe(false);
      expect(isAllowedOrigin('http://beta.rhythm-mania.com', true)).toBe(false);
      expect(isAllowedOrigin('http://v1.rhythm-mania.com', true)).toBe(false);
      expect(isAllowedOrigin('https://evil.com', true)).toBe(false);
    });

    it('rejects malformed and non-HTTP(S) origins', () => {
      expect(isAllowedOrigin('javascript:alert(1)', false)).toBe(false);
      expect(isAllowedOrigin('data:text/html,test', false)).toBe(false);
      expect(isAllowedOrigin('ftp://rhythm-mania.com', false)).toBe(false);
      expect(isAllowedOrigin('', false)).toBe(false);
      expect(isAllowedOrigin(null, false)).toBe(false);
    });
  });

  describe('validateRequestOrigin', () => {
    it('accepts requests from rhythm-mania.com and beta.rhythm-mania.com', () => {
      const req = {
        headers: {
          host: 'rhythm-mania.com',
          origin: 'https://rhythm-mania.com',
        },
      } as unknown as VercelRequest;

      expect(validateRequestOrigin(req)).toBe(true);
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('rejects requests with cross-site Sec-Fetch-Site', () => {
      const req = {
        headers: {
          'sec-fetch-site': 'cross-site',
          host: 'rhythm-mania.com',
          origin: 'https://rhythm-mania.com',
        },
      } as unknown as VercelRequest;

      expect(validateRequestOrigin(req)).toBe(false);
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('rejects requests with unauthorized Origin header', () => {
      const req = {
        headers: {
          host: 'rhythm-mania.com',
          origin: 'https://malicious-site.com',
        },
      } as unknown as VercelRequest;

      expect(validateRequestOrigin(req)).toBe(false);
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('rejects requests with unauthorized Referer header', () => {
      const req = {
        headers: {
          host: 'rhythm-mania.com',
          referer: 'https://malicious-site.com/exploit',
        },
      } as unknown as VercelRequest;

      expect(validateRequestOrigin(req)).toBe(false);
      expect(isSameOriginRequest(req)).toBe(false);
    });
  });

  describe('handleCors', () => {
    it('sets CORS headers for allowed origins and blocks unauthorized origins', () => {
      const headers: Record<string, string> = {};
      let statusCode = 200;
      let ended = false;

      const res = {
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
          return this;
        },
        status(code: number) {
          statusCode = code;
          return this;
        },
        end() {
          ended = true;
          return this;
        },
        json() {
          return this;
        },
      } as unknown as VercelResponse;

      const validReq = {
        method: 'OPTIONS',
        headers: {
          host: 'rhythm-mania.com',
          origin: 'https://beta.rhythm-mania.com',
        },
      } as unknown as VercelRequest;

      const handled = handleCors(validReq, res);
      expect(handled).toBe(true);
      expect(headers['access-control-allow-origin']).toBe('https://beta.rhythm-mania.com');
      expect(statusCode).toBe(204);
      expect(ended).toBe(true);
    });

    it('blocks OPTIONS request from unauthorized origin with 403', () => {
      let statusCode = 200;
      let jsonPayload: unknown = null;

      const res = {
        setHeader() {
          return this;
        },
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          jsonPayload = payload;
          return this;
        },
      } as unknown as VercelResponse;

      const badReq = {
        method: 'OPTIONS',
        headers: {
          host: 'rhythm-mania.com',
          origin: 'https://evil.attacker.org',
        },
      } as unknown as VercelRequest;

      const handled = handleCors(badReq, res);
      expect(handled).toBe(true);
      expect(statusCode).toBe(403);
      expect(jsonPayload).toEqual(expect.objectContaining({ success: false }));
    });
  });
});