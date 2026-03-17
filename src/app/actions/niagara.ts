'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Refactored to return result objects instead of throwing errors.
 * This prevents 500 Internal Server Errors in the browser console.
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
};

/**
 * Proxies a read request to a Niagara station using the /ord/ servlet.
 * Returns a result object instead of throwing.
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
          error: "AUTH_FAILED: Invalid credentials or Basic Auth is disabled in WebService." 
        };
      }
      if (response.status === 404) return { success: false, error: `NOT_FOUND: ${cleanPath}` };
      if (response.status === 503) return { success: false, error: "STATION_BUSY: Niagara is rejecting requests." };
      return { success: false, error: `STATION_ERROR_${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') return { success: false, error: "TIMEOUT: Station did not respond in time." };
    if (error.code === 'ECONNREFUSED') return { success: false, error: "CONNECTION_REFUSED: IP is valid but station is not listening." };
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
       return { success: false, error: "NETWORK_UNREACHABLE: Check your network/VPN connection." };
    }
    
    return { success: false, error: error.message || "Unknown communication error." };
  }
}

/**
 * Verifies connectivity and returns station info.
 */
export async function testNiagaraConnection(creds: NiagaraCredentials): Promise<ServerActionResult<{ stationName: string; type: string }>> {
  try {
    const result = await proxyFetchOrd('station:|slot:/', creds);
    
    if (result.success) {
      return {
        success: true,
        data: {
          stationName: result.data.name || result.data.stationName || "Niagara Station",
          type: result.data.type || "BStation"
        }
      };
    }
    
    return { success: false, error: result.error };
  } catch (e: any) {
    return { success: false, error: "Internal test failure." };
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
          type.includes('boolean') ||
          child.value !== undefined ||
          child.out !== undefined;

        const isFolder = 
          type.includes('folder') || 
          type.includes('device') || 
          type.includes('network') ||
          type.includes('container');
        
        if (ord.toLowerCase().includes('/services')) continue;

        if (isPoint) {
          foundOrds.add(ord);
        } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 100) {
          await crawl(ord, depth + 1);
        }
      }
    } else if (!result.success && depth === 0) {
      return result.error;
    }
  }

  try {
    const initialCrawlError = await crawl(startPath);
    if (initialCrawlError) return { success: false, error: initialCrawlError };
    
    return { success: true, data: Array.from(foundOrds) };
  } catch (e: any) {
    return { success: false, error: "Critical discovery failure." };
  }
}
