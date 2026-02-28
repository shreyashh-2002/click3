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
 * This is "read-only" as it only performs GET requests.
 */
export async function fetchNiagaraChildren(parentPath: string) {
  if (!NIAGARA_URL || !NIAGARA_USER || !NIAGARA_PASS) {
    throw new Error("Niagara connection details are not configured in .env");
  }

  const auth = Buffer.from(`${NIAGARA_USER}:${NIAGARA_PASS}`).toString('base64');
  
  // Note: This URL structure assumes a standard Niagara 4 REST API endpoint
  // Adjust the path according to your specific WebService configuration
  const url = `${NIAGARA_URL}/api/v1/read?ord=${encodeURIComponent(parentPath)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      cache: 'no-store', // Always get fresh data
    });

    if (!response.ok) {
      throw new Error(`Station responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error("Niagara Fetch Error:", error);
    throw new Error(error.message || "Failed to connect to Niagara station.");
  }
}

/**
 * Recursively extracts all ORDs starting from a base path.
 * This is the "Automated Discovery" engine.
 */
export async function discoverAllOrds(startPath: string): Promise<string[]> {
  const foundOrds: string[] = [];

  async function crawl(path: string) {
    const data = await fetchNiagaraChildren(path);
    
    // Logic depends on the specific JSON schema returned by your station's API
    if (data && Array.isArray(data.children)) {
      for (const child of data.children) {
        if (child.type === 'Folder' || child.type === 'Device' || child.type === 'Container') {
          await crawl(child.ord);
        } else if (child.type.includes('Point')) {
          foundOrds.push(child.ord);
        }
      }
    }
  }

  await crawl(startPath);
  return foundOrds;
}
