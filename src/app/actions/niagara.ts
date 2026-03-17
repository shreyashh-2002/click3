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
  try {
    // Match key="value" or key=value
    const parts = header.substring(7).split(/,\s*(?=(?:[^"]|"[^"]*")*$)/);
    parts.forEach(part => {
      const [key, ...valParts] = part.split('=');
      const value = valParts.join('=');
      if (key && value) {
        params[key.trim().toLowerCase()] = value.replace(/"/g, '').trim();
      }
    });
  } catch (e) {
    console.error("Failed to parse Digest header:", header);
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    agent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 8000, // 8 seconds timeout
  };

  if (authHeader) {
    options.headers!['Authorization'] = authHeader;
  } else {
    // Start with Basic to trigger the challenge
    const basic = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
    options.headers!['Authorization'] = `Basic ${basic}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        // 1. Handle Digest Challenge
        if (res.statusCode === 401 && res.headers['www-authenticate']?.toLowerCase().includes('digest') && !authHeader) {
          const params = parseDigestHeader(res.headers['www-authenticate']);
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
          return reject({ 
            error: "AUTH_FAILED", 
            diagnostic: "Niagara rejected credentials. Check Application Director in Workbench. Note: Some Niagara stations require 'Basic' to be explicitly enabled in WebService." 
          });
        }
        
        // 3. Handle Permission Denied
        if (res.statusCode === 403) {
          return reject({ 
            error: "FORBIDDEN", 
            diagnostic: "Access denied. Check if 'CORS' Allowed Origins includes 'http://localhost:9002'." 
          });
        }

        // 4. Handle HTML Redirection (Common when ORD endpoint isn't ready)
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          return reject({
            error: "HTML_RESPONSE",
            diagnostic: "Station returned a web page instead of data. This usually means you are hitting a Login Page. Verify your ORD path exists."
          });
        }
        
        // 5. Success
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject({ 
              error: "PARSE_ERROR", 
              diagnostic: "Received invalid JSON from station. Are you sure the endpoint returns JSON?" 
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
      reject({ 
        error: "NETWORK_ERROR", 
        diagnostic: `Connection failed: ${e.message}. Check if Niagara is running and reachable at ${parsedUrl.hostname}.` 
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ 
        error: "TIMEOUT", 
        diagnostic: "Connection timed out. Niagara is taking too long to respond." 
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
    // Ensure we ALWAYS return a standard object to prevent 500 errors
    return { 
      success: false, 
      error: err.error || "CRITICAL_CRASH", 
      diagnostic: err.diagnostic || "An unexpected server error occurred while connecting to Niagara." 
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
  const MAX_REQUESTS = 30;
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
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: "Discovery engine failed during crawl." };
  }
}
