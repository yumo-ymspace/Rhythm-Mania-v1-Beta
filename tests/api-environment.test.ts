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
import { getEnvConfig, isProductionEnvironment } from '../api/_lib/env';
import healthHandler from '../api/health';
import configHandler from '../api/config';

describe('server environment configuration', () => {
  it('returns valid environment shape', () => {
    const env = getEnvConfig();
    expect(env).toBeDefined();
    expect(typeof env.isProduction).toBe('boolean');
    expect(isProductionEnvironment()).toBe(env.isProduction);
  });
});

describe('stateless API endpoints', () => {
  it('health endpoint returns status ok without database fields', async () => {
    let statusCode = 0;
    let jsonPayload: any = null;

    const req = {
      method: 'GET',
      headers: { host: 'localhost:3000' },
    } as unknown as VercelRequest;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(payload: any) {
        jsonPayload = payload;
        return this;
      },
    } as unknown as VercelResponse;

    await healthHandler(req, res);

    expect(statusCode).toBe(200);
    expect(jsonPayload).toMatchObject({
      success: true,
      data: {
        status: 'ok',
      },
    });
    expect(jsonPayload.data.database).toBeUndefined();
  });

  it('config endpoint returns offline client flags', async () => {
    let statusCode = 0;
    let jsonPayload: any = null;

    const req = {
      method: 'GET',
      headers: { host: 'localhost:3000' },
    } as unknown as VercelRequest;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(payload: any) {
        jsonPayload = payload;
        return this;
      },
    } as unknown as VercelResponse;

    await configHandler(req, res);

    expect(statusCode).toBe(200);
    expect(jsonPayload).toMatchObject({
      success: true,
      data: {
        appName: expect.any(String),
        supportedModes: [3],
        features: {
          accounts: false,
          leaderboards: 'local',
          replays: 'local',
        },
      },
    });
  });
});
