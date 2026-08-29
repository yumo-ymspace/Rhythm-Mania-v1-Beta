import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(501).json({
    error:
      'OAuth token exchange is not wired until OSU_CLIENT_SECRET, DATABASE_URL, and SESSION_SECRET are confirmed. Fill .env and ask to enable the callback.',
  });
}
