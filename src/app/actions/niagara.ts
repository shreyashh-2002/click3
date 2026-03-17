'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Supports both Basic and Digest Authentication schemes.
 * Includes verbose server-side logging for local debugging.
 */

import https from 'https';
import crypto from 'crypto';

export type NiagaraCredentials = {
  url: string;
  user: string;
  pass: string;
};

export type ServerActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  diagnostic?: string;
};

/**
 * Parses the WWW-Authenticate header for Digest parameters.
 */
function parseDigestHeader(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    if (!header) return params;
    
    const digestStart = header.indexOf('Digest ');
    if (digestStart === -1) return params;

    const challenge = header.substring(digestStart + 7);
    const parts = challenge.split(/,\s*(?=(?:[^"]|"[^"]*")*$)/);
    
    parts.forEach(part => {
      const [key, ...valParts] = part.split('=');
      const value = valParts.join('=');
      if (key && value) {
        params[key.trim().toLowerCase()] = value.replace(/"/g, '').trim();
      }
    });
  } catch (e) {
    console.error("[Niagara Digest Parse Error]:", header);
  }
  return params;
}

/**
 * Calculates the Digest response hash according to RFC 2617.
 */
function calculateDigestResponse(
  method: string,
  uri: string,
  creds: NiagaraCredentials,
  params: Record<string, string>,
  nc: string,
  cnonce: string
): string {
  const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');
  const ha1 = md5(`${creds.user}:${params.realm}:${creds.pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const qop = params.qop?.split(',')[0].trim();

  if (qop === 'auth' || qop === 'auth-int') {
    return md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  }
  return md5(`${ha1}:${params.nonce}:${ha2}`);
}

/**
 * Performs a request to a Niagara station, handling Digest handshake if needed.
 */
async function niagaraRequest(url: string, creds: NiagaraCredentials, authHeader?: string): Promise<any> {
  const parsedUrl = new URL(url);
  const options: https.RequestOptions = {
    method: 'GET',
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (NiagaraApp/1.0)',
    },
    agent: new https.Agent({ rejectUnauthorized: false }), 
    timeout: 10000,
  };

  if (authHeader) {
    options.headers!['Authorization'] = authHeader;
  } else {
    const basic = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
    options.headers!['Authorization'] = `Basic ${basic}`;
  }

  console.log(`[Niagara Request]: ${options.method} ${url} (Auth: ${authHeader ? 'Digest' : 'Basic'})`);

  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        const wwwAuth = (res.headers['www-authenticate'] as string) || '';
        console.log(`[Niagara Response]: Status ${res.statusCode} from ${parsedUrl.hostname}`);

        if (res.statusCode === 401) {
          console.log(`[Niagara Debug]: All Response Headers:`, JSON.stringify(res.headers, null, 2));
          
          if (wwwAuth.toLowerCase().includes('digest') && !authHeader) {
            console.log(`[Niagara Auth]: Station requested Digest handshake.`);
            const params = parseDigestHeader(wwwAuth);
            const nc = '00000001';
            const cnonce = crypto.randomBytes(8).toString('hex');
            const responseHash = calculateDigestResponse('GET', options.path!, creds, params, nc, cnonce);
            let digestHeader = `Digest username="${creds.user}", realm="${params.realm}", nonce="${params.nonce}", uri="${options.path}", response="${responseHash}"`;
            if (params.qop) digestHeader += `, qop=${params.qop.split(',')[0].trim()}, nc=${nc}, cnonce="${cnonce}"`;
            if (params.opaque) digestHeader += `, opaque="${params.opaque}"`;
            
            try {
              const retryData = await niagaraRequest(url, creds, digestHeader);
              resolve(retryData);
            } catch (e) {
              reject(e);
            }
            return;
          }

          console.error(`[Niagara Auth Error]: Rejected credentials for ${creds.user}`);
          return reject({ 
            error: "AUTH_FAILED", 
            diagnostic: `Niagara rejected credentials. WWW-Authenticate: "${wwwAuth || 'EMPTY'}". Check if Basic/Digest is enabled and the user is not locked.` 
          });
        }

        if (res.statusCode === 403) {
          return reject({ error: "FORBIDDEN", diagnostic: "Access denied. Check user permissions in Niagara." });
        }

        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          return reject({ error: "HTML_RESPONSE", diagnostic: "Station returned HTML (likely a login page redirect). Check WebService settings." });
        }
        
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject({ error: "PARSE_ERROR", diagnostic: "Received invalid JSON from station." });
          }
        } else {
          reject({ error: `STATION_ERROR_${res.statusCode}`, diagnostic: `Status: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e: any) => reject({ error: "NETWORK_ERROR", diagnostic: e.message }));
    req.on('timeout', () => { req.destroy(); reject({ error: "TIMEOUT", diagnostic: "Request timed out." }); });
  });
}

export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    let cleanPath = path.startsWith('station:|slot:/') ? path : `station:|slot:/${path.replace(/^\/+/, '')}`;
    const url = `${baseUrl}/ord/${cleanPath}`;
    const data = await niagaraRequest(url, creds);
    return { success: true, data };
  } catch (err: any) {
    console.error("[Niagara Proxy Logic Error]:", err);
    return { success: false, error: err.error || "SERVER_CRASH", diagnostic: err.diagnostic || "Unexpected error." };
  }
}

export async function testNiagaraConnection(creds: NiagaraCredentials): Promise<ServerActionResult<{ stationName: string; type: string }>> {
  try {
    const result = await proxyFetchOrd('station:|slot:/', creds);
    if (result.success && result.data) {
      return { success: true, data: { stationName: result.data.name || "Station", type: result.data.type || "BStation" } };
    }
    return result;
  } catch (e) {
    return { success: false, error: "ACTION_FAILED", diagnostic: "Test connection crashed internally." };
  }
}

export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<ServerActionResult<string[]>> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  async function crawl(path: string, depth: number = 0) {
    if (depth > 2 || visitedPaths.has(path) || requestCount >= 30) return;
    visitedPaths.add(path);
    requestCount++;
    const result = await proxyFetchOrd(path, creds);
    if (result.success && result.data && Array.isArray(result.data.children)) {
      for (const child of result.data.children) {
        if (child.ord?.includes('/services')) continue;
        const type = (child.type || '').toLowerCase();
        if (type.includes('point') || type.includes('numeric') || type.includes('boolean')) {
          foundOrds.add(child.ord);
        } else if (depth < 2) {
          await crawl(child.ord, depth + 1);
        }
      }
    }
  }
  try {
    await crawl(startPath);
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: e.message };
  }
}
