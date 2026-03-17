'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Refactored to provide deep diagnostics for network and security issues.
 */

// Allow self-signed certificates common in JACEs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
 * Proxies a read request to a Niagara station using the /ord/ servlet.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials): Promise<ServerActionResult<any>> {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { 
          success: false, 
          error: "AUTH_FAILED",
          diagnostic: "Niagara rejected your credentials. Ensure 'Basic Auth' is enabled in the WebService and your password is correct."
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          error: "CORS_OR_PERMISSION_DENIED",
          diagnostic: "Access forbidden. Check 'Allowed Origins' (CORS) in the Niagara WebService or User Permissions."
        };
      }
      if (response.status === 404) return { success: false, error: "NOT_FOUND", diagnostic: "The ORD path was not found on the station." };
      return { success: false, error: `STATION_ERROR_${response.status}`, diagnostic: `The station returned an unexpected HTTP ${response.status} status.` };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: "INVALID_CONTENT_TYPE",
        diagnostic: "Station returned HTML/Text instead of JSON. This usually happens if you are redirected to a login page. Check 'Basic Auth' settings."
      };
    }

    try {
      const data = await response.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: "PARSE_ERROR", diagnostic: "Failed to parse JSON response from the station." };
    }

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') return { success: false, error: "TIMEOUT", diagnostic: "The station took too long to respond (10s). Check your connection." };
    
    return { 
      success: false, 
      error: "NETWORK_ERROR", 
      diagnostic: error.message || "Unknown network error. Ensure the station is reachable and allows HTTPS connections." 
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
  } catch (e: any) {
    return { success: false, error: "CRASH", diagnostic: "The server action encountered an unhandled exception." };
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
  const MAX_DEPTH = 5;

  async function crawl(path: string, depth: number = 0): Promise<string | void> {
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
    } else if (!result.success && depth === 0) {
      return result.diagnostic || result.error;
    }
  }

  try {
    const initialCrawlError = await crawl(startPath);
    if (initialCrawlError) return { success: false, error: "DISCOVERY_FAILED", diagnostic: initialCrawlError };
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    return { success: false, error: "CRITICAL_FAILURE", diagnostic: "Discovery engine crashed." };
  }
}
