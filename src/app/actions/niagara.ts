
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
 * Proxies a read request to a Niagara station.
 */
export async function proxyFetchOrd(path: string, creds: NiagaraCredentials) {
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');
  const url = `${creds.url}/api/v1/read?ord=${encodeURIComponent(path)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Authentication failed.");
      throw new Error(`Station error: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Server Proxy Error:", error.message);
    throw new Error(error.message || "Could not connect to station.");
  }
}

/**
 * Server-side crawler to discover all ORDs.
 */
export async function discoverOrdsServer(startPath: string, creds: NiagaraCredentials): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();

  async function crawl(path: string, depth: number = 0) {
    if (depth > 15 || visitedPaths.has(path)) return;
    visitedPaths.add(path);

    try {
      const data = await proxyFetchOrd(path, creds);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const isPoint = (child.type || '').toLowerCase().includes('point');
          if (isPoint) {
            foundOrds.add(child.ord);
          } else {
            await crawl(child.ord, depth + 1);
          }
        }
      }
    } catch (e) {
      if (depth === 0) throw e;
      console.warn(`Skipping path ${path}`);
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
