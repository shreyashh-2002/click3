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
      'User-Agent': 'Niagara-Dev-Tool/1.0 (NextJS Proxy)',
      'X-Requested-With': 'XMLHttpRequest', // Mandatory to prevent HTML redirects
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
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
  
  // STEP 1: Initial GET to establish session context
  console.log(`[Niagara Auth]: 1. Pre-login GET to ${baseUrl}/login`);
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

  if (response.status === 302 || response.status === 200) {
    const redirectPath = response.headers['location'];
    
    // Check for auth failure
    if (redirectPath && redirectPath.includes('auth=fail')) {
      console.error(`[Niagara Auth Error]: Login rejected (auth=fail)`);
      throw new Error("LOGIN_REJECTED");
    }

    // STEP 3: Follow success redirect
    if (redirectPath) {
      const redirectUrl = redirectPath.startsWith('http') ? redirectPath : `${baseUrl}${redirectPath}`;
      const currentCookies = Array.from(new Set(sessionCookies.map(c => c.split(';')[0]))).join('; ');
      
      console.log(`[Niagara Auth]: 3. Following redirect to ${redirectUrl}...`);
      
      const followRes = await performRequest(redirectUrl, 'GET', {
        'Cookie': currentCookies,
        'Referer': baseUrl + '/login',
        'Origin': baseUrl
      });

      if (followRes.headers['set-cookie']) {
        const finalCookies = followRes.headers['set-cookie'];
        sessionCookies = [...sessionCookies, ...(Array.isArray(finalCookies) ? finalCookies : [finalCookies])];
      }
    }

    return Array.from(new Set(
      sessionCookies.map(c => c.split(';')[0])
    )).join('; ');
  }

  throw new Error("LOGIN_REJECTED");
}

export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  try {
    const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
    let cleanPath = path.startsWith('station:|slot:/') ? path : `station:|slot:/${path.replace(/^\/+/, '')}`;
    
    // CRITICAL: Force JSON format via query parameter
    const url = `${baseUrl}/ord/${cleanPath}?format=json`;

    // 1. Get Session Cookie
    let sessionCookie = '';
    if (creds.manualCookie && creds.manualCookie.trim() !== '') {
      console.log(`[Niagara Auth]: Using Manual Cookie Bypass`);
      sessionCookie = creds.manualCookie;
    } else {
      sessionCookie = await loginToNiagara(creds);
    }

    // 2. Perform Request
    console.log(`[Niagara Request]: GET ${url}`);
    const result = await performRequest(url, 'GET', {
      'Cookie': sessionCookie,
      'Accept': 'application/json', // Strictly request JSON
      'X-Niagara-Accept': 'application/json', // Force JSON on strict JACEs
      'Referer': baseUrl + '/',
      'Origin': baseUrl
    });

    const contentType = result.headers['content-type'] || '';
    console.log(`[Niagara Response]: Status ${result.status}, Content-Type: ${contentType}`);

    if (result.status === 200) {
      // Robust JSON detection
      const isJsonHeader = contentType.toLowerCase().includes('application/json');
      const bodyText = result.data.trim();
      const looksLikeJson = bodyText.startsWith('{') || bodyText.startsWith('[');

      if (isJsonHeader || looksLikeJson) {
        try {
          const json = JSON.parse(result.data);
          return { success: true, data: json };
        } catch (e) {
          return { success: false, error: "PARSE_ERROR", diagnostic: "Invalid JSON format received." };
        }
      } else {
        const bodySnippet = result.data.substring(0, 150).replace(/\s+/g, ' ').trim();
        console.warn(`[Niagara Format Error]: Station returned HTML snippet: "${bodySnippet}..."`);
        
        return { 
          success: false, 
          error: "PARSE_ERROR", 
          diagnostic: "Station returned HTML instead of JSON. Ensure 'JSON' is an allowed Media Type in the Niagara WebService for the user/profile."
        };
      }
    }

    return { 
      success: false, 
      error: `STATION_ERROR_${result.status}`, 
      diagnostic: `Station returned status ${result.status}.` 
    };

  } catch (err: any) {
    console.error("[Niagara Proxy Error]:", err.message || err);
    return { 
      success: false, 
      error: err.message === "LOGIN_REJECTED" ? "AUTH_FAILED" : "NETWORK_ERROR", 
      diagnostic: err.message === "LOGIN_REJECTED" 
        ? "Session login failed. Check credentials." 
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
    return { success: false, error: "AUTH_FAILED", diagnostic: "Could not establish session." };
  }
  
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;

  async function crawl(path: string, depth: number = 0) {
    if (depth > 2 || visitedPaths.has(path) || requestCount >= 30) return;
    visitedPaths.add(path);
    requestCount++;

    // CRITICAL: Force JSON format via query parameter
    const url = `${baseUrl}/ord/${path}?format=json`;
    
    try {
      const response = await performRequest(url, 'GET', { 
        'Cookie': sessionCookie, 
        'Accept': 'application/json',
        'X-Niagara-Accept': 'application/json',
        'Referer': baseUrl + '/',
        'Origin': baseUrl
      });
      
      const contentType = response.headers['content-type'] || '';
      if (response.status === 200 && (contentType.toLowerCase().includes('json') || response.data.trim().startsWith('{'))) {
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
