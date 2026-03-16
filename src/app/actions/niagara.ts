'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4.
 * 
 * Updated to use the /ord/ servlet path and station:|slot:/ prefix 
 * as verified by the user's working URL.
 */

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
      // Handle simple paths like "Config" or "/Config"
      cleanPath = `station:|slot:/${cleanPath.replace(/^\/+/, '')}`;
    }
  }

  // Use the /ord/ servlet path confirmed by the user: https://[IP]/ord/[ORD]
  const url = `${baseUrl}/ord/${encodeURIComponent(cleanPath)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json', // Request JSON data from the ORD servlet
      },
      next: { revalidate: 0 },
      signal: controller.signal
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
    if (error.name === 'AbortError') throw new Error("TIMEOUT");
    throw error;
  }
}

/**
 * Verifies connectivity and returns station info using the /ord/ servlet.
 */
export async function testNiagaraConnection(creds: NiagaraCredentials) {
  try {
    // Try to read the station root using the working ORD path
    const data = await proxyFetchOrd('station:|slot:/', creds);
    return {
      success: true,
      stationName: data.name || data.stationName || "Niagara Station",
      type: data.type || "BStation"
    };
  } catch (error: any) {
    console.error("Test Connection Error:", error);
    throw error;
  }
}

/**
 * Server-side crawler to discover all ORDs using the /ord/ servlet.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 100; 
  const MAX_DEPTH = 6;

  async function crawl(path: string, depth: number = 0) {
    if (depth > MAX_DEPTH || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    // Politeness Delay
    await sleep(400);

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const type = (child.type || '').toLowerCase();
          const ord = child.ord || '';
          
          // Detect points: Look for common Niagara point types
          const isPoint = 
            type.includes('point') || 
            type.includes('writable') || 
            type.includes('proxy') ||
            type.includes('numeric') ||
            type.includes('boolean') ||
            child.value !== undefined ||
            child.out !== undefined;

          // Folders to explore
          const isFolder = 
            type.includes('folder') || 
            type.includes('device') || 
            type.includes('network') ||
            type.includes('container') ||
            (Array.isArray(child.children) && child.children.length > 0);
          
          // Skip system folders to save on requests
          if (ord.toLowerCase().includes('/services')) continue;

          if (isPoint) {
            foundOrds.add(ord);
          } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 200) {
            await crawl(ord, depth + 1);
          }
        }
      }
    } catch (e: any) {
      if (e.message === 'STATION_BUSY') return; 
      // If the root path fails, we want to know, but sub-paths can fail silently
      if (depth === 0) throw e;
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
