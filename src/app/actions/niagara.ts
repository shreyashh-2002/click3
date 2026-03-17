'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Exclusively uses Session-based (Cookie) Authentication.
 * 1. POSTs to /login with j_username/j_password.
 * 2. Captures the 'Set-Cookie' header.
 * 3. Uses the cookie for subsequent ORD requests.
 */

import https from 'https';
import querystring from 'querystring';

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
 * Performs a low-level HTTPS request.
 */
async function performRequest(
  url: string, 
  method: string, 
  headers: Record<string, string> = {}, 
  body?: string
): Promise<{ status?: number; headers: any; data: string }> {
  const parsedUrl = new URL(url);
  const options: https.RequestOptions = {
    method,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...headers,
    },
    agent: new https.Agent({ rejectUnauthorized: false }), // Handle self-signed certs
    timeout: 15000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error("Timeout")); });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Logs into Niagara and returns the session cookie.
 */
async function loginToNiagara(creds: NiagaraCredentials): Promise<string> {
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  const loginUrl = `${baseUrl}/login`;
  
  const postData = querystring.stringify({
    'j_username': creds.user,
    'j_password': creds.pass
  });

  console.log(`[Niagara Auth]: Attempting session login for ${creds.user} at ${loginUrl}`);

  const response = await performRequest(loginUrl, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData).toString()
  }, postData);

  // Niagara 4 usually returns a 302 Found on successful login
  const cookies = response.headers['set-cookie'];
  if (cookies && Array.isArray(cookies)) {
    // Join all cookies into a single string for the header
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    console.log(`[Niagara Auth]: Success. Session cookie captured.`);
    return cookieStr;
  }

  console.error(`[Niagara Auth]: Failed. Status: ${response.status}. No cookies found.`);
  throw new Error("LOGIN_FAILED");
}

export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    let cleanPath = path.startsWith('station:|slot:/') ? path : `station:|slot:/${path.replace(/^\/+/, '')}`;
    const url = `${baseUrl}/ord/${cleanPath}`;

    // 1. Get Session Cookie
    const sessionCookie = await loginToNiagara(creds);

    // 2. Perform actual ORD request with the cookie
    console.log(`[Niagara Request]: GET ${url} (Auth: Session Cookie)`);
    const result = await performRequest(url, 'GET', {
      'Cookie': sessionCookie,
      'Accept': 'application/json'
    });

    if (result.status === 200) {
      try {
        const json = JSON.parse(result.data);
        return { success: true, data: json };
      } catch (e) {
        return { success: false, error: "PARSE_ERROR", diagnostic: "Station returned non-JSON data. Check if ORD endpoint is enabled." };
      }
    }

    return { 
      success: false, 
      error: `STATION_ERROR_${result.status}`, 
      diagnostic: `Status: ${result.status}. Session login worked, but the ORD request was rejected.` 
    };

  } catch (err: any) {
    console.error("[Niagara Proxy Error]:", err.message || err);
    return { 
      success: false, 
      error: err.message === "LOGIN_FAILED" ? "AUTH_FAILED" : "NETWORK_ERROR", 
      diagnostic: err.message === "LOGIN_FAILED" 
        ? "Session login rejected. Check username/password and ensure Niagara Web login is enabled." 
        : `Connection failed: ${err.message}` 
    };
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
    return { success: false, error: "ACTION_FAILED", diagnostic: "Connection logic crashed." };
  }
}

export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<ServerActionResult<string[]>> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  
  // Login once and reuse the cookie for discovery performance
  let sessionCookie = '';
  try {
    sessionCookie = await loginToNiagara(creds);
  } catch (e) {
    return { success: false, error: "AUTH_FAILED", diagnostic: "Could not establish session for discovery." };
  }
  
  async function crawl(path: string, depth: number = 0) {
    if (depth > 2 || visitedPaths.has(path) || requestCount >= 30) return;
    visitedPaths.add(path);
    requestCount++;

    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    const url = `${baseUrl}/ord/${path}`;
    
    try {
      const response = await performRequest(url, 'GET', { 'Cookie': sessionCookie, 'Accept': 'application/json' });
      if (response.status === 200) {
        const data = JSON.parse(response.data);
        if (data && Array.isArray(data.children)) {
          for (const child of data.children) {
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
    } catch (e) {
      console.warn(`[Discovery Warning]: Failed to crawl ${path}`);
    }
  }
  
  try {
    await crawl(startPath);
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: e.message };
  }
}