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
  const url = `${baseUrl}/api/v1/read?ord=${encodeURIComponent(path)}`;

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
      if (response.status === 401) throw new Error("Niagara Authentication failed.");
      if (response.status === 404) throw new Error(`ORD not found: ${path}`);
      if (response.status === 503) throw new Error("503"); // Special code for busy station
      throw new Error(`Station error: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error("Request timed out.");
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
  const MAX_REQUESTS = 100; // Increased limit for deeper discovery
  const MAX_DEPTH = 8; // Deeper recursion

  async function crawl(path: string, depth: number = 0) {
    if (depth > MAX_DEPTH || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    // Politeness Delay: Wait 500ms between requests to avoid 503 errors
    await sleep(500);

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const type = (child.type || '').toLowerCase();
          
          // Improved Point Detection: Capture Writable, Proxy, Point, and standard value types
          const isPoint = 
            type.includes('point') || 
            type.includes('writable') || 
            type.includes('proxy') ||
            type.includes('numeric') ||
            type.includes('boolean') ||
            type.includes('enum') ||
            type.includes('string');

          // Improved Folder Detection: Capture common containers
          const isFolder = 
            type.includes('folder') || 
            type.includes('device') || 
            type.includes('network') ||
            type.includes('driver') ||
            type.includes('service') ||
            type.includes('container');
          
          if (isPoint) {
            foundOrds.add(child.ord);
          } else if (isFolder && depth < MAX_DEPTH && foundOrds.size < 200) {
            await crawl(child.ord, depth + 1);
          }
        }
      }
    } catch (e: any) {
      if (e.message === '503') {
        console.warn("Station reported 503. Stopping crawl early.");
        return; 
      }
      if (depth === 0) throw e;
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
