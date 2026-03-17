'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Supports both Basic and Digest Authentication schemes.
 * Uses the native 'https' module to reliably bypass self-signed certificate errors.
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
  const parts = header.substring(7).split(/,\s*(?=(?:[^"]|"[^"]*")*$)/);
  parts.forEach(part => {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key.trim()] = value.replace(/"/g, '').trim();
    }
  });
  return params;
}

/**
 * Calculates the Digest response hash.
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
  
  // Standard Digest response calculation for qop="auth"
  if (params.qop === 'auth' || params.qop === 'auth-int') {
    return md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${params.qop}:${ha2}`);
  }
  
  // Legacy Digest (no qop)
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
      'User-Agent': 'Niagara-Point-Mapper-Dev',
    },
    agent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 10000,
  };

  if (authHeader) {
    options.headers!['Authorization'] = authHeader;
  } else {
    // Default to Basic as first attempt
    const basic = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
    options.headers!['Authorization'] = `Basic ${basic}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        // Handle Digest Challenge
        if (res.statusCode === 401 && res.headers['www-authenticate']?.includes('Digest') && !authHeader) {
          const params = parseDigestHeader(res.headers['www-authenticate']);
          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          const response = calculateDigestResponse('GET', options.path!, creds, params, nc, cnonce);
          
          const digestHeader = `Digest username="${creds.user}", realm="${params.realm}", nonce="${params.nonce}", uri="${options.path}", qop=${params.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}", opaque="${params.opaque || ''}"`;
          
          try {
            const retryData = await niagaraRequest(url, creds, digestHeader);
            resolve(retryData);
          } catch (e) {
            reject(e);
          }
          return;
        }

        if (res.statusCode === 401) return reject({ error: "AUTH_FAILED", diagnostic: "Niagara rejected credentials. Check Username/Password or WebService Auth schemes." });
        if (res.statusCode === 403) return reject({ error: "FORBIDDEN", diagnostic: "Access denied. Check User Permissions or CORS Origins." });
        
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject({ error: "PARSE_ERROR", diagnostic: "Station returned non-JSON data. Ensure the ORD path is correct and doesn't redirect to HTML." });
          }
        } else {
          reject({ error: `STATION_ERROR_${res.statusCode}`, diagnostic: `Unexpected status code from station: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e: any) => reject({ error: "NETWORK_ERROR", diagnostic: e.message }));
    req.on('timeout', () => { req.destroy(); reject({ error: "TIMEOUT", diagnostic: "Connection timed out." }); });
  });
}

/**
 * Proxies a read request to a Niagara station.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  
  let cleanPath = path;
  if (!cleanPath.startsWith('station:|slot:/')) {
    if (cleanPath.startsWith('slot:/')) {
      cleanPath = `station:|${cleanPath}`;
    } else {
      cleanPath = `station:|slot:/${cleanPath.replace(/^\/+/, '')}`;
    }
  }

  const url = `${baseUrl}/ord/${cleanPath}`;

  try {
    const data = await niagaraRequest(url, creds);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.error || "UNKNOWN", diagnostic: err.diagnostic || "An unhandled error occurred." };
  }
}

/**
 * Verifies connectivity and returns station info.
 */
export async function testNiagaraConnection(creds: NiagaraCredentials): Promise<ServerActionResult<{ stationName: string; type: string }>> {
  const result = await proxyFetchOrd('station:|slot:/', creds);
  if (result.success && result.data) {
    return {
      success: true,
      data: {
        stationName: result.data.name || result.data.stationName || "Niagara Station",
        type: result.data.type || "BStation"
      }
    };
  }
  return result;
}

/**
 * Server-side crawler to discover all ORDs.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<ServerActionResult<string[]>> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 30; // Reduced for Digest performance
  const MAX_DEPTH = 3;

  async function crawl(path: string, depth: number = 0) {
    if (depth > MAX_DEPTH || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    const result = await proxyFetchOrd(path, creds);
    
    if (result.success && result.data && Array.isArray(result.data.children)) {
      for (const child of result.data.children) {
        const type = (child.type || '').toLowerCase();
        const ord = child.ord || '';
        
        const isPoint = 
          type.includes('point') || 
          type.includes('writable') || 
          type.includes('proxy') ||
          type.includes('numeric') ||
          type.includes('boolean');

        const isFolder = 
          type.includes('folder') || 
          type.includes('device') || 
          type.includes('network');
        
        if (ord.toLowerCase().includes('/services')) continue;

        if (isPoint) {
          foundOrds.add(ord);
        } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 50) {
          await crawl(ord, depth + 1);
        }
      }
    }
  }

  try {
    await crawl(startPath);
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: "Discovery engine failed." };
  }
}
