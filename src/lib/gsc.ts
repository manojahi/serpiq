import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import open from 'open';
import { google, type webmasters_v3 } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import { readConfig, readCredentials, writeConfig, writeCredentials, promptText } from './config.js';
import chalk from 'chalk';

const DEFAULT_CLIENT_ID =
  process.env.SERPIQ_GOOGLE_CLIENT_ID ||
  process.env.SEO_PILOT_GOOGLE_CLIENT_ID ||
  '';
const DEFAULT_CLIENT_SECRET =
  process.env.SERPIQ_GOOGLE_CLIENT_SECRET || process.env.SEO_PILOT_GOOGLE_CLIENT_SECRET || '';

const REDIRECT_URI = 'http://localhost:9999/callback';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const CALLBACK_PORT = 9999;

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export async function getOAuthClientConfig(): Promise<OAuthClientConfig> {
  const cfg = readConfig();
  let clientId = cfg.google_client_id || DEFAULT_CLIENT_ID;
  let clientSecret = cfg.google_client_secret || DEFAULT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log(chalk.yellow('\nGoogle OAuth credentials needed.'));
    console.log('Create OAuth credentials in Google Cloud Console:');
    console.log(`  ${chalk.cyan('https://console.cloud.google.com/apis/credentials')}`);
    console.log('  - Application type: Desktop app (or Web app with redirect URI ' + chalk.cyan(REDIRECT_URI) + ')');
    console.log('  - Enable the Search Console API on the project');
    console.log();
    if (!clientId) clientId = await promptText('Google Client ID: ');
    if (!clientSecret) clientSecret = await promptText('Google Client Secret: ');
    if (!clientId || !clientSecret) throw new Error('Google OAuth credentials are required for GSC access.');
    cfg.google_client_id = clientId;
    cfg.google_client_secret = clientSecret;
    writeConfig(cfg);
  }

  return { clientId, clientSecret };
}

function makeOAuthClient(config: OAuthClientConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, REDIRECT_URI);
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function runOAuthFlow(): Promise<void> {
  const config = await getOAuthClientConfig();
  const oauth2 = makeOAuthClient(config);
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE],
    state,
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });

  console.log(chalk.cyan('\nOpening browser to authenticate with Google...'));
  console.log(chalk.dim('If the browser does not open, visit:'));
  console.log(chalk.dim(authUrl));

  const code = await new Promise<string>((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | null = null;
    let settled = false;

    const shutdown = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      try { (server as any).closeAllConnections?.(); } catch {}
      try { server.close(); } catch {}
    };

    const finish = (err: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      shutdown();
      if (err) reject(err);
      else resolve(value!);
    };

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400, { Connection: 'close' }).end('Bad request');
          return;
        }
        const reqUrl = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404, { Connection: 'close' }).end('Not found');
          return;
        }
        const recvState = reqUrl.searchParams.get('state');
        const recvCode = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');
        if (error) {
          res.writeHead(400, { Connection: 'close' }).end(`Error: ${error}`);
          finish(new Error(`OAuth error: ${error}`));
          return;
        }
        if (recvState !== state || !recvCode) {
          res.writeHead(400, { Connection: 'close' }).end('State mismatch.');
          finish(new Error('State mismatch in OAuth callback.'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' });
        res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h2>serpIQ authenticated</h2><p>You can close this tab and return to the terminal.</p></body></html>`);
        finish(null, recvCode);
      } catch (e) {
        try { res.writeHead(500, { Connection: 'close' }).end('Internal error'); } catch {}
        finish(e as Error);
      }
    });

    server.on('error', err => finish(err));
    server.listen(CALLBACK_PORT, () => {
      open(authUrl).catch(() => undefined);
    });

    timeoutHandle = setTimeout(() => {
      finish(new Error('OAuth flow timed out (5 min).'));
    }, 5 * 60 * 1000);
    timeoutHandle.unref?.();
  });

  const { tokens } = await oauth2.getToken({
    code,
    codeVerifier: verifier,
    redirect_uri: REDIRECT_URI,
  });

  if (!tokens.refresh_token) {
    throw new Error('No refresh token returned. Try revoking access at https://myaccount.google.com/permissions and authenticate again.');
  }

  writeCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? SCOPE,
    token_type: tokens.token_type ?? 'Bearer',
  });

  console.log(chalk.green('✔ Google authentication saved to ~/.serpiq/credentials.json'));
}

export async function getAuthorizedClient() {
  const creds = readCredentials();
  if (!creds || !creds.refresh_token) {
    throw new Error('Not authenticated with Google. Run: npx serpiq auth');
  }
  const config = await getOAuthClientConfig();
  const oauth2 = makeOAuthClient(config);
  oauth2.setCredentials({
    refresh_token: creds.refresh_token,
    access_token: creds.access_token,
    expiry_date: creds.expiry_date,
    scope: creds.scope,
    token_type: creds.token_type,
  });
  return oauth2;
}

export async function getSearchConsoleClient() {
  const auth = await getAuthorizedClient();
  return google.webmasters({ version: 'v3', auth });
}

export async function listSites(): Promise<string[]> {
  const sc = await getSearchConsoleClient();
  const res = await sc.sites.list();
  return (res.data.siteEntry ?? []).map(s => s.siteUrl ?? '').filter(Boolean);
}

export async function resolveSite(input: string): Promise<string> {
  const sites = await listSites();
  if (sites.includes(input)) return input;

  const candidates: string[] = [input];
  if (input.startsWith('http')) {
    const u = new URL(input);
    candidates.push(`sc-domain:${u.hostname.replace(/^www\./, '')}`);
    if (!input.endsWith('/')) candidates.push(input + '/');
  } else if (input.startsWith('sc-domain:')) {
    const host = input.replace('sc-domain:', '');
    candidates.push(`https://${host}/`);
    candidates.push(`https://www.${host}/`);
  } else {
    candidates.push(`sc-domain:${input.replace(/^www\./, '')}`);
    candidates.push(`https://${input}/`);
    candidates.push(`https://www.${input}/`);
  }

  for (const c of candidates) {
    if (sites.includes(c)) return c;
  }

  const err = new Error(
    `Could not find GSC property "${input}".\n` +
      `Available properties:\n  ${sites.map(s => `- ${s}`).join('\n  ')}\n` +
      `Pass one of these to --site.`
  );
  throw err;
}

export interface QueryParams {
  startDate: string;
  endDate: string;
  dimensions: ('query' | 'page' | 'date' | 'country' | 'device' | 'searchAppearance')[];
  rowLimit?: number;
}

export async function searchAnalytics(site: string, params: QueryParams): Promise<webmasters_v3.Schema$ApiDataRow[]> {
  const sc = await getSearchConsoleClient();
  const res = await sc.searchanalytics.query({
    siteUrl: site,
    requestBody: {
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions,
      rowLimit: params.rowLimit ?? 1000,
    },
  });
  return res.data.rows ?? [];
}
