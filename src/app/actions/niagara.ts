'use server';

/**
 * @fileOverview Server Actions for interacting with Niagara 4 REST API.
 * 
 * These functions run on the server to keep station credentials secure
 * and bypass CORS restrictions.
 */

const NIAGARA_URL = process.env.NIAGARA_URL;
const NIAGARA_USER = process.env.NIAGARA_USERNAME;
const NIAGARA_PASS = process.env.NIAGARA_PASSWORD;

/**
 * Fetches children of a given Niagara ORD path.
 */
export async function fetchNiagaraChildren(parentPath: string) {
  if (!NIAGARA_URL || !NIAGARA_USER || !NIAGARA_PASS) {
    throw new Error("Niagara connection details are not configured in the .env file. Please add NIAGARA_URL, NIAGARA_USERNAME, and NIAGARA_PASSWORD and restart the development server.");
  }

  const auth = Buffer.from(`${NIAGARA_USER}:${NIAGARA_PASS}`).toString('base64');
  
  // Standard Niagara REST API endpoint for reading ORDs
  const url = `${NIAGARA_URL}/api/v1/read?ord=${encodeURIComponent(parentPath)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      next: { revalidate: 0 }, // Ensure we don't cache station data indefinitely
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Authentication failed. Check NIAGARA_USERNAME and NIAGARA_PASSWORD in your .env file.");
      if (response.status === 404) throw new Error(`ORD not found: ${parentPath}`);
      throw new Error(`Station responded with ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Niagara Fetch Error:", error);
    // This often happens if the URL is wrong, the server isn't running, or it's a network issue.
    if (error.cause?.code === 'ENOTFOUND' || error.cause?.code === 'ECONNREFUSED') {
      throw new Error(`Could not connect to the Niagara station at ${NIAGARA_URL}. Ensure the URL is correct in your .env file and that you are on the same network.`);
    }
    throw new Error(error.message || "Failed to connect to the Niagara station.");
  }
}

/**
 * Recursively extracts all ORDs starting from a base path.
 * This is the "Automated Discovery" engine that handles deep nesting.
 */
export async function discoverAllOrds(startPath: string): Promise<string[]> {
  const foundOrds: Set<string> = new Set();
  const visitedPaths: Set<string> = new Set();

  async function crawl(path: string, depth: number = 0) {
    // Safety check for infinite loops or extremely deep structures
    if (depth > 20 || visitedPaths.has(path)) return;
    visitedPaths.add(path);

    try {
      const data = await fetchNiagaraChildren(path);
      
      if (data && Array.isArray(data.children)) {
        for (const child of data.children) {
          const isPoint = (child.type || '').toLowerCase().includes('point');

          if (isPoint) {
            foundOrds.add(child.ord);
          } else {
            // Aggressively assume anything not a point could be a container
            await crawl(child.ord, depth + 1);
          }
        }
      }
    } catch (e) {
        // If the root path fails, the initial call will throw.
        // In here, we can assume a failure means we tried to crawl a leaf node (like a Program object).
        // We can safely ignore this and continue with other branches.
        if (depth === 0) throw e;
        console.warn(`Skipping path ${path} (not a container or insufficient permissions).`);
    }
  }

  await crawl(startPath);
  return Array.from(foundOrds);
}
