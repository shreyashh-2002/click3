'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4 REST API.
 * 
 * These functions run on the server to bypass CORS and hide station credentials.
 */

export type NiagaraCredentials = {
  url: string;
  user: string;
  pass: string;
};

/**
 * Helper to add a delay between requests.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Proxies a read request to a Niagara station with a timeout.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials) {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
  // Ensure the URL is clean
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  
  // Clean path: ensure we handle slot:/ correctly
  let cleanPath = path;
  if (!cleanPath.startsWith('slot:/') && !cleanPath.startsWith('station:|slot:/')) {
    cleanPath = `slot:/${cleanPath.replace(/^\/+/, '')}`;
  }

  const url = `${baseUrl}/api/v1/read?ord=${encodeURIComponent(cleanPath)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
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
 * Server-side crawler to discover all ORDs.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 150; 
  const MAX_DEPTH = 10;

  async function crawl(path: string, depth: number = 0) {
    if (depth > MAX_DEPTH || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    // Politeness Delay: Slow down for the JACE
    await sleep(500);

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const type = (child.type || '').toLowerCase();
          
          // Broad Point Detection: Capture anything that looks like a point or value
          const isPoint = 
            type.includes('point') || 
            type.includes('writable') || 
            type.includes('proxy') ||
            type.includes('numeric') ||
            type.includes('boolean') ||
            type.includes('enum') ||
            type.includes('string') ||
            child.value !== undefined ||
            child.out !== undefined;

          // Folder Detection: Capture containers
          const isFolder = 
            type.includes('folder') || 
            type.includes('device') || 
            type.includes('network') ||
            type.includes('driver') ||
            type.includes('service') ||
            type.includes('container') ||
            (Array.isArray(child.children) && child.children.length > 0);
          
          // Skip the "Services" folder as it is usually massive and irrelevant
          if (child.ord.toLowerCase().includes('/services')) continue;

          if (isPoint) {
            foundOrds.add(child.ord);
          } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 300) {
            await crawl(child.ord, depth + 1);
          }
        }
      } else if (data && !Array.isArray(data.children)) {
          // If we hit a single point directly
          foundOrds.add(data.ord || path);
      }
    } catch (e: any) {
      if (e.message === 'STATION_BUSY') return; 
      if (depth === 0) throw e; // Re-throw top-level errors (like 401)
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
