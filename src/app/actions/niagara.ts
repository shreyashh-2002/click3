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
    
    // Find where "Digest " starts
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

  // HA1 = MD5(username:realm:password)
  const ha1 = md5(`${creds.user}:${params.realm}:${creds.pass}`);
  
  // HA2 = MD5(method:digestURI)
  const ha2 = md5(`${method}:${uri}`);
  
  // Niagara usually uses qop="auth"
  const qop = params.qop?.split(',')[0].trim();

  if (qop === 'auth' || qop === 'auth-int') {
    // Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    return md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
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
      'User-Agent': 'NiagaraApp/1.0 (NextJS Server Action)',
    },
    agent: new https.Agent({ rejectUnauthorized: false }), // Handle self-signed certs
    timeout: 10000, // 10 seconds
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

        // 1. Handle Digest Challenge
        if (res.statusCode === 401 && wwwAuth.toLowerCase().includes('digest') && !authHeader) {
          console.log(`[Niagara Auth]: Station requested Digest handshake.`);
          const params = parseDigestHeader(wwwAuth);
          
          if (!params.nonce || !params.realm) {
             console.error(`[Niagara Auth Error]: Digest challenge missing realm or nonce.`);
             return reject({ error: "AUTH_FAILED", diagnostic: "Invalid Digest challenge from Niagara." });
          }

          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          const qop = params.qop?.split(',')[0].trim();
          
          const responseHash = calculateDigestResponse('GET', options.path!, creds, params, nc, cnonce);
          
          let digestHeader = `Digest username="${creds.user}", realm="${params.realm}", nonce="${params.nonce}", uri="${options.path}", response="${responseHash}"`;
          
          if (qop) {
            digestHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
          }
          if (params.opaque) {
            digestHeader += `, opaque="${params.opaque}"`;
          }
          
          try {
            const retryData = await niagaraRequest(url, creds, digestHeader);
            resolve(retryData);
          } catch (e) {
            reject(e);
          }
          return;
        }

        // 2. Handle Authentication Failure
        if (res.statusCode === 401) {
          console.error(`[Niagara Auth Error]: Rejected credentials for ${creds.user}`);
          console.error(`[Niagara Debug]: WWW-Authenticate Header: "${wwwAuth}"`);
          return reject({ 
            error: "AUTH_FAILED", 
            diagnostic: `Niagara rejected credentials. Station requested: ${wwwAuth || 'No scheme specified'}` 
          });
        }
        
        // 3. Handle Permission Denied
        if (res.statusCode === 403) {
          return reject({ 
            error: "FORBIDDEN", 
            diagnostic: "Access denied. Check if the user has 'Read' permissions on the station." 
          });
        }

        // 4. Handle HTML Redirection
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          console.warn(`[Niagara Data Warning]: Station returned HTML instead of JSON. Check the ORD path.`);
          return reject({
            error: "HTML_RESPONSE",
            diagnostic: "Station returned a web page (likely a login page) instead of data."
          });
        }
        
        // 5. Success
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            console.error(`[Niagara Parse Error]: Failed to parse JSON response.`);
            reject({ 
              error: "PARSE_ERROR", 
              diagnostic: "Received invalid JSON. Ensure the endpoint supports JSON responses." 
            });
          }
        } else {
          reject({ 
            error: `STATION_ERROR_${res.statusCode}`, 
            diagnostic: `Station responded with status code: ${res.statusCode}` 
          });
        }
      });
    });

    req.on('error', (e: any) => {
      console.error(`[Niagara Network Error]: ${e.message}`);
      reject({ 
        error: "NETWORK_ERROR", 
        diagnostic: `Connection failed: ${e.message}` 
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[Niagara Timeout]: Station took too long to respond.`);
      reject({ 
        error: "TIMEOUT", 
        diagnostic: "Connection timed out." 
      });
    });
  });
}

/**
 * Proxies a read request to a Niagara station.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
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

    const data = await niagaraRequest(url, creds);
    return { success: true, data };
  } catch (err: any) {
    console.error("[Niagara Proxy Logic Error]:", err);
    return { 
      success: false, 
      error: err.error || "SERVER_CRASH", 
      diagnostic: err.diagnostic || "An unexpected error occurred." 
    };
  }
}

/**
 * Verifies connectivity and returns station info.
 */
export async function testNiagaraConnection(creds: NiagaraCredentials): Promise<ServerActionResult<{ stationName: string; type: string }>> {
  try {
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
  } catch (e) {
    console.error("[Niagara Test Error]:", e);
    return { success: false, error: "ACTION_FAILED", diagnostic: "Test connection crashed internally." };
  }
}

/**
 * Server-side crawler to discover all ORDs.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<ServerActionResult<string[]>> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 50;
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
        } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 100) {
          await crawl(ord, depth + 1);
        }
      }
    }
  }

  try {
    await crawl(startPath);
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    console.error("[Niagara Discovery Error]:", e);
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: "Discovery engine failed during crawl." };
  }
}
