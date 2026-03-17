'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Supports two modes:
 * 1. Manual Cookie Override: Bypasses login logic using a browser-captured JSESSIONID.
 * 2. Automated Stateful Auth: GET /login -> POST /j_security_check -> Follow Redirect.
 */

import https from 'https';
import querystring from 'querystring';

export type NiagaraCredentials = {
  url: string;
  user: string;
  pass: string;
  manualCookie?: string; // Optional browser-captured cookie bypass
};

export type ServerActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  diagnostic?: string;
};

/**
 * Performs a low-level HTTPS request with support for self-signed certificates.
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
    agent: new https.Agent({ rejectUnauthorized: false }), // Ignore self-signed certs
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
 * Logs into Niagara using the stateful j_security_check flow.
 */
async function loginToNiagara(creds: NiagaraCredentials): Promise<string> {
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  
  // STEP 1: Initial GET to establish session context (Mandatory for N4)
  console.log(`[Niagara Auth]: 1. Initial GET to ${baseUrl}/login`);
  const initialRes = await performRequest(`${baseUrl}/login`, 'GET', {
    'Referer': baseUrl + '/',
    'Origin': baseUrl
  });
  
  let sessionCookies: string[] = initialRes.headers['set-cookie'] || [];
  const initialCookieStr = Array.isArray(sessionCookies) ? sessionCookies.map(c => c.split(';')[0]).join('; ') : '';

  // STEP 2: POST credentials to j_security_check
  const loginUrl = `${baseUrl}/j_security_check`;
  const postData = querystring.stringify({
    'j_username': creds.user,
    'j_password': creds.pass
  });

  console.log(`[Niagara Auth]: 2. Attempting POST to ${loginUrl}`);

  const response = await performRequest(loginUrl, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData).toString(),
    'Cookie': initialCookieStr,
    'Referer': baseUrl + '/login',
    'Origin': baseUrl
  }, postData);

  // Capture new cookies from POST
  if (response.headers['set-cookie']) {
    const newCookies = response.headers['set-cookie'];
    sessionCookies = [...sessionCookies, ...(Array.isArray(newCookies) ? newCookies : [newCookies])];
  }

  console.log(`[Niagara Auth Debug]: POST Status: ${response.status}`);
  
  if (response.status === 302 || response.status === 200) {
    const redirectPath = response.headers['location'];
    
    // Check for explicit auth failure in redirect URL
    if (redirectPath && redirectPath.includes('auth=fail')) {
      console.error(`[Niagara Auth Error]: Login rejected by station (auth=fail)`);
      throw new Error("LOGIN_REJECTED");
    }

    // STEP 3: Follow the Success Redirect to "activate" the session
    if (redirectPath) {
      const redirectUrl = redirectPath.startsWith('http') ? redirectPath : `${baseUrl}${redirectPath}`;
      const currentCookies = Array.from(new Set(sessionCookies.map(c => c.split(';')[0]))).join('; ');
      
      console.log(`[Niagara Auth]: 3. Following success redirect to ${redirectUrl}...`);
      
      const followRes = await performRequest(redirectUrl, 'GET', {
        'Cookie': currentCookies,
        'Referer': baseUrl + '/login',
        'Origin': baseUrl
      });

      // Capture final set of activation cookies
      if (followRes.headers['set-cookie']) {
        const finalCookies = followRes.headers['set-cookie'];
        sessionCookies = [...sessionCookies, ...(Array.isArray(finalCookies) ? finalCookies : [finalCookies])];
      }
    }

    // Consolidate final cookie string
    const finalCookieStr = Array.from(new Set(
      sessionCookies.map(c => c.split(';')[0])
    )).join('; ');

    console.log("[Niagara Auth Debug] FINAL CONSOLIDATED COOKIES:", finalCookieStr);

    if (!finalCookieStr.includes('JSESSIONID')) {
      console.warn("[Niagara Auth Warning]: No JSESSIONID found in response cookies!");
    }

    return finalCookieStr;
  }

  console.error(`[Niagara Auth]: Failed. Status: ${response.status}`);
  throw new Error("LOGIN_REJECTED");
}

export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    let cleanPath = path.startsWith('station:|slot:/') ? path : `station:|slot:/${path.replace(/^\/+/, '')}`;
    const url = `${baseUrl}/ord/${cleanPath}`;

    // 1. Get Activated Session Cookie
    let sessionCookie = '';
    if (creds.manualCookie && creds.manualCookie.trim() !== '') {
      console.log(`[Niagara Auth]: Using Manual Cookie Bypass`);
      sessionCookie = creds.manualCookie;
    } else {
      sessionCookie = await loginToNiagara(creds);
    }

    // 2. Perform actual ORD request with the cookie and CSRF headers
    console.log(`[Niagara Request]: GET ${url}`);
    const result = await performRequest(url, 'GET', {
      'Cookie': sessionCookie,
      'Accept': 'application/json',
      'Referer': baseUrl + '/',
      'Origin': baseUrl
    });

    console.log(`[Niagara Response]: Status ${result.status} for ${url}`);

    if (result.status === 200) {
      try {
        const json = JSON.parse(result.data);
        return { success: true, data: json };
      } catch (e) {
        return { 
          success: false, 
          error: "PARSE_ERROR", 
          diagnostic: "Station returned non-JSON data. Ensure the user has permission to view this ORD." 
        };
      }
    }

    if (result.status === 302 || result.status === 301) {
      return {
        success: false,
        error: "SESSION_INCOMPLETE",
        diagnostic: "The session was established but the request was still redirected. Check 'Allowed Origins' and ensure 'Read' permission for the ORD servlet."
      };
    }

    return { 
      success: false, 
      error: `STATION_ERROR_${result.status}`, 
      diagnostic: `The station rejected the request with status ${result.status}.` 
    };

  } catch (err: any) {
    console.error("[Niagara Proxy Error]:", err.message || err);
    return { 
      success: false, 
      error: err.message === "LOGIN_REJECTED" ? "AUTH_FAILED" : "NETWORK_ERROR", 
      diagnostic: err.message === "LOGIN_REJECTED" 
        ? "Session login failed. Redirected to auth=fail. Check credentials." 
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
    return { success: false, error: "ACTION_FAILED", diagnostic: "Internal server error while testing connection." };
  }
}

export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<ServerActionResult<string[]>> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  
  let sessionCookie = '';
  try {
    if (creds.manualCookie && creds.manualCookie.trim() !== '') {
      sessionCookie = creds.manualCookie;
    } else {
      sessionCookie = await loginToNiagara(creds);
    }
  } catch (e) {
    return { success: false, error: "AUTH_FAILED", diagnostic: "Could not establish session for discovery." };
  }
  
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;

  async function crawl(path: string, depth: number = 0) {
    if (depth > 2 || visitedPaths.has(path) || requestCount >= 30) return;
    visitedPaths.add(path);
    requestCount++;

    const url = `${baseUrl}/ord/${path}`;
    
    try {
      const response = await performRequest(url, 'GET', { 
        'Cookie': sessionCookie, 
        'Accept': 'application/json',
        'Referer': baseUrl + '/',
        'Origin': baseUrl
      });
      
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