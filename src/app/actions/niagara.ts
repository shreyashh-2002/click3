'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Updated to handle SSL verification issues and provide 
 * better error feedback for networking constraints.
 */

// This allows the server to talk to JACEs with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export type NiagaraCredentials = {
  url: string;
  user: string;
  pass: string;
};

/**
 * Helper to add a delay between requests to avoid overwhelming the JACE.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Proxies a read request to a Niagara station using the /ord/ servlet.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials) {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  
  // Clean path: Ensure it uses the station:|slot:/ prefix required by the ORD servlet
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
      if (response.status === 401) throw new Error("AUTH_FAILED");
      if (response.status === 404) throw new Error(`NOT_FOUND: ${cleanPath}`);
      if (response.status === 503) throw new Error("STATION_BUSY");
      throw new Error(`STATION_ERROR_${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Better Error Surfacing
    if (error.name === 'AbortError') throw new Error("TIMEOUT");
    if (error.code === 'ECONNREFUSED') throw new Error("CONNECTION_REFUSED");
    if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
       throw new Error("NETWORK_UNREACHABLE: The server cannot find this IP. Local IPs (192.168.x.x) only work if the app is running locally.");
    }
    
    throw error;
  }
}

/**
 * Verifies connectivity and returns station info using the /ord/ servlet.
 */
export async function testNiagaraConnection(creds: NiagaraCredentials) {
  try {
    const data = await proxyFetchOrd('station:|slot:/', creds);
    return {
      success: true,
      stationName: data.name || data.stationName || "Niagara Station",
      type: data.type || "BStation"
    };
  } catch (error: any) {
    console.error("Test Connection Error:", error.message);
    return { 
      success: false, 
      error: error.message || "Unknown error connecting to station."
    };
  }
}

/**
 * Server-side crawler to discover all ORDs using the /ord/ servlet.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 50; 
  const MAX_DEPTH = 5;

  async function crawl(path: string, depth: number = 0) {
    if (depth > MAX_DEPTH || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    await sleep(300);

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
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
      }
    } catch (e: any) {
      if (depth === 0) throw e;
    }
  }

  try {
    await crawl(startPath);
    return Array.from(foundOrds);
  } catch (error: any) {
    console.error("Discovery Error:", error.message);
    throw error;
  }
}