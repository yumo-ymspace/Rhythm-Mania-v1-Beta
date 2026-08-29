import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthMe } from '../_lib/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = await getAuthMe(req.headers.cookie);
  res.status(200).json(body);
}
