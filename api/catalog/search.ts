import type { VercelRequest, VercelResponse } from '@vercel/node';
import { catalogSearch } from '../_lib/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const result = await catalogSearch(q, req.headers.cookie);
  res.status(result.status).json(result.body);
}
