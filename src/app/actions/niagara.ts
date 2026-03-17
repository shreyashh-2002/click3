'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Exclusively uses Session-based (Cookie) Authentication.
 * 1. POSTs to /login with j_username/j_password.
 * 2. Follows the 302 Redirect to 'activate' the session.
 * 3. Captures all 'Set-Cookie' headers.
 * 4. Uses the full cookie string and CSRF headers (Referer/Origin) for subsequent requests.
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
 * Logs into Niagara and returns the fully activated session cookie.
 * Follows the 302 redirect to ensure the session is marked as 'active' by the JACE.
 */
async function loginToNiagara(creds: NiagaraCredentials): Promise<string> {
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  const loginUrl = `${baseUrl}/login`;
  
  const postData = querystring.stringify({
    'j_username': creds.user,
    'j_password': creds.pass
  });

  console.log(`[Niagara Auth]: 1. Attempting POST to ${loginUrl}`);

  // Step 1: POST credentials
  const response = await performRequest(loginUrl, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData).toString(),
    'Referer': baseUrl + '/',
    'Origin': baseUrl
  }, postData);

  let cookies = response.headers['set-cookie'] || [];
  
  if (response.status === 302 || response.status === 200) {
    // Step 2: Follow the redirect to activate the session
    const redirectPath = response.headers['location'];
    if (redirectPath) {
      const redirectUrl = redirectPath.startsWith('http') ? redirectPath : `${baseUrl}${redirectPath}`;
      const cookieStr = Array.isArray(cookies) ? cookies.map(c => c.split(';')[0]).join('; ') : '';
      
      console.log(`[Niagara Auth]: 2. Following redirect to ${redirectUrl} to activate session...`);
      
      const followRes = await performRequest(redirectUrl, 'GET', {
        'Cookie': cookieStr,
        'Referer': baseUrl + '/',
        'Origin': baseUrl
      });

      // Capture any additional cookies from the redirect (like niagara_session)
      if (followRes.headers['set-cookie']) {
        const newCookies = followRes.headers['set-cookie'];
        cookies = [...(Array.isArray(cookies) ? cookies : [cookies]), ...(Array.isArray(newCookies) ? newCookies : [newCookies])];
      }
      
      console.log(`[Niagara Auth]: 3. Session activated. Status: ${followRes.status}`);
    }

    // Prepare final cookie string for future requests
    const finalCookieStr = Array.from(new Set(
      (Array.isArray(cookies) ? cookies : [cookies]).map(c => c.split(';')[0])
    )).join('; ');

    console.log("[Niagara Auth Debug] FINAL CONSOLIDATED COOKIES:", finalCookieStr);
    return finalCookieStr;
  }

  console.error(`[Niagara Auth]: Failed. Status: ${response.status}. Headers:`, response.headers);
  throw new Error("LOGIN_REJECTED");
}

export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    let cleanPath = path.startsWith('station:|slot:/') ? path : `station:|slot:/${path.replace(/^\/+/, '')}`;
    const url = `${baseUrl}/ord/${cleanPath}`;

    // 1. Get Activated Session Cookie
    const sessionCookie = await loginToNiagara(creds);

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
          diagnostic: "Station returned non-JSON data. The station might be returning an HTML error page." 
        };
      }
    }

    if (result.status === 302 || result.status === 301) {
      return {
        success: false,
        error: "SESSION_EXPIRED",
        diagnostic: "The session was established but the request was still redirected. Check 'Allowed Origins' and ensure the user has 'Invoke' permissions for the ORD servlet."
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
        ? "Session login failed. Check credentials and ensure the user is not locked out in Niagara." 
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
    sessionCookie = await loginToNiagara(creds);
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