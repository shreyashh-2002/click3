'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Uses the native 'https' module to reliably bypass self-signed certificate errors
 * and provide detailed diagnostics for JACE connectivity.
 */

import https from 'https';

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
 * Performs a request to a Niagara station using the 'https' module to handle self-signed certs.
 */
async function niagaraRequest(url: string, creds: NiagaraCredentials): Promise<any> {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
  
  const options: https.RequestOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
    // This is the magic fix for self-signed certificates
    agent: new https.Agent({
      rejectUnauthorized: false,
    }),
    timeout: 10000,
  };

  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject({ error: "AUTH_FAILED", diagnostic: "Niagara rejected credentials. Check WebService Basic Auth." });
        if (res.statusCode === 403) return reject({ error: "FORBIDDEN", diagnostic: "Access denied. Check User Permissions or CORS." });
        if (res.statusCode === 404) return reject({ error: "NOT_FOUND", diagnostic: "The ORD path was not found." });
        
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject({ error: "PARSE_ERROR", diagnostic: "Station returned non-JSON data. This usually means a redirect to a login page." });
          }
        } else {
          reject({ error: `STATION_ERROR_${res.statusCode}`, diagnostic: `Unexpected status code: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e: any) => {
      if (e.code === 'ECONNREFUSED') reject({ error: "CONNECTION_REFUSED", diagnostic: "The station refused the connection. Check IP/Port." });
      else if (e.code === 'ETIMEDOUT') reject({ error: "TIMEOUT", diagnostic: "Connection timed out." });
      else reject({ error: "NETWORK_ERROR", diagnostic: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ error: "TIMEOUT", diagnostic: "The request timed out after 10 seconds." });
    });
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

  // Use encodeURI for the whole thing, or encodeURIComponent for the ORD part if needed.
  // Niagara ORD servlets are picky about encoding.
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
  const MAX_REQUESTS = 50; 
  const MAX_DEPTH = 5;

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
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: "Discovery engine crashed." };
  }
}
