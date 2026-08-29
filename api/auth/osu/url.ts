import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOsuAuthorizeUrl } from '../../_lib/handlers';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const result = getOsuAuthorizeUrl();
  if ('error' in result) {
    res.status(501).json(result);
    return;
  }
  res.redirect(302, result.url);
}
