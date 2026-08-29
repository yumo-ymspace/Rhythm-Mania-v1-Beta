/**
 * Shared API handlers. Secrets stay in process.env (never VITE_*).
 * OAuth token exchange is not executed until env is present — confirm with the owner
 * before pointing these at a live database.
 */

export type OsuUserPublic = {
  osuId: number;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  countryCode: string | null;
  pp: number | null;
  globalRank: number | null;
  level: number | null;
};

export async function getAuthMe(_cookie: string | undefined): Promise<{ user: OsuUserPublic | null }> {
  // Session lookup requires DATABASE_URL + SESSION_SECRET. Until those are confirmed,
  // the profile chip is Guest.
  return { user: null };
}

export function getOsuAuthorizeUrl(): { url: string } | { error: string } {
  const clientId = process.env.OSU_CLIENT_ID;
  const redirect = process.env.OSU_REDIRECT_URI ?? 'http://localhost:5173/api/auth/osu/callback';
  const secret = process.env.OSU_CLIENT_SECRET;
  if (!clientId || !secret) {
    return {
      error:
        'osu! OAuth is not configured. Copy .env.example to .env and set OSU_CLIENT_ID, OSU_CLIENT_SECRET, OSU_REDIRECT_URI. Do not put secrets in VITE_* variables.',
    };
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'identify public',
    state: 'dev-unwired',
  });
  return { url: `https://osu.ppy.sh/oauth/authorize?${params.toString()}` };
}

export async function catalogSearch(
  _query: string,
  _cookie: string | undefined,
): Promise<{ status: number; body: unknown }> {
  return {
    status: 401,
    body: {
      error: 'Official osu! API v2 search requires a logged-in OAuth session. Sign in after filling server env, or import a local .osz.',
    },
  };
}
