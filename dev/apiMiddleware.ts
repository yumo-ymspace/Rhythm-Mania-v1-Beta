import type { IncomingMessage, ServerResponse } from 'node:http';
import { catalogSearch, getAuthMe, getOsuAuthorizeUrl } from '../api/_lib/handlers';

function send(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extraHeaders ?? {})) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(body));
}

export async function handleDevApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? 'localhost:5173';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/api/auth/me') {
    send(res, 200, await getAuthMe(req.headers.cookie));
    return;
  }

  if (pathname === '/api/auth/osu/url') {
    const result = getOsuAuthorizeUrl();
    if ('error' in result) {
      send(res, 501, result);
      return;
    }
    res.statusCode = 302;
    res.setHeader('Location', result.url);
    res.end();
    return;
  }

  if (pathname === '/api/auth/osu/callback') {
    send(res, 501, {
      error: 'OAuth callback requires Vercel Functions plus OSU_CLIENT_SECRET. Fill .env and use vercel dev, or confirm production env.',
    });
    return;
  }

  if (pathname === '/api/catalog/search') {
    const q = url.searchParams.get('q') ?? '';
    const result = await catalogSearch(q, req.headers.cookie);
    send(res, result.status, result.body);
    return;
  }

  send(res, 404, { error: 'Not found' });
}
