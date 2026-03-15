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
 * Proxies a read request to a Niagara station with a timeout.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials) {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
  // Ensure the URL is clean
  const baseUrl = creds.url.endsWith('/') ? creds.url.slice(0, -1) : creds.url;
  const url = `${baseUrl}/api/v1/read?ord=${encodeURIComponent(path)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per request

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
      if (response.status === 401) throw new Error("Niagara Authentication failed. Check username/password.");
      if (response.status === 404) throw new Error(`ORD not found: ${path}`);
      throw new Error(`Station error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response received:", text.slice(0, 200));
      throw new Error("Station returned invalid data format (expected JSON). Ensure the REST API is enabled.");
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out for path: ${path}`);
    }
    console.error(`Server Proxy Error [${path}]:`, error.message);
    throw new Error(error.message || "Could not connect to station.");
  }
}

/**
 * Server-side crawler to discover all ORDs.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();
  let requestCount = 0;
  const MAX_REQUESTS = 100; // Safety limit to prevent infinite loops or long hangs

  async function crawl(path: string, depth: number = 0) {
    if (depth > 10 || visitedPaths.has(path) || requestCount >= MAX_REQUESTS) return;
    visitedPaths.add(path);
    requestCount++;

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const isPoint = (child.type || '').toLowerCase().includes('point');
          if (isPoint) {
            foundOrds.add(child.ord);
          } else {
            // Recursive discovery
            await crawl(child.ord, depth + 1);
          }
        }
      }
    } catch (e: any) {
      if (depth === 0) throw e; // Fail fast if the root path fails
      console.warn(`Skipping child path ${path}: ${e.message}`);
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
