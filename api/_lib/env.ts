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

import dotenv from 'dotenv';

dotenv.config();

export interface ServerEnvConfig {
  osuClientId?: string;
  osuClientSecret?: string;
  isProduction: boolean;
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function getEnvConfig(): ServerEnvConfig {
  const osuClientId = process.env.OSU_CLIENT_ID;
  const osuClientSecret = process.env.OSU_CLIENT_SECRET;
  const isProduction = isProductionEnvironment();

  return {
    osuClientId,
    osuClientSecret,
    isProduction,
  };
}
