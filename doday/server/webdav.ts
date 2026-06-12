// WebDAV-Client für JSON-Dateien in der Nextcloud.
// Bewusst nur fetch (kein tsdav): Für einfache Dateien reichen GET/PUT/MKCOL –
// tsdav kommt erst in Phase 3 für CalDAV (Aufgaben/Termine) dazu.
//
// Konflikt-Schutz über ETags: Beim Schreiben schicken wir das ETag des
// gelesenen Stands mit (If-Match). Hat jemand anderes die Datei inzwischen
// geändert, antwortet Nextcloud mit 412 → WebDavConflictError → der Aufrufer
// lädt neu und wendet seine Änderung erneut an (Konzept: "Registry ist klein,
// das ist billig").

/** Die Datei wurde extern geändert (ETag passt nicht mehr) */
export class WebDavConflictError extends Error {}

export class WebDavClient {
  constructor(
    private baseUrl: string,
    private user: string,
    private appPassword: string,
  ) {}

  /** /Notes/DoDay/x.json → https://…/remote.php/dav/files/<user>/Notes/DoDay/x.json */
  private davUrl(path: string): string {
    const segments = path.split('/').filter(Boolean).map(encodeURIComponent);
    return `${this.baseUrl}/remote.php/dav/files/${encodeURIComponent(this.user)}/${segments.join('/')}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const token = Buffer.from(`${this.user}:${this.appPassword}`).toString('base64');
    return { Authorization: `Basic ${token}`, ...extra };
  }

  /** JSON-Datei lesen; null = Datei existiert (noch) nicht */
  async getJson<T>(path: string): Promise<{ data: T; etag: string | null } | null> {
    const res = await fetch(this.davUrl(path), { headers: this.headers() });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`WebDAV GET ${path} fehlgeschlagen: ${res.status}`);
    }
    const text = await res.text();
    return { data: JSON.parse(text) as T, etag: res.headers.get('etag') };
  }

  /** JSON-Datei schreiben; mit etag = If-Match (Konflikt → WebDavConflictError) */
  async putJson(path: string, data: unknown, etag?: string): Promise<string | null> {
    const headers = this.headers({ 'Content-Type': 'application/json; charset=utf-8' });
    if (etag) {
      headers['If-Match'] = etag;
    }
    const res = await fetch(this.davUrl(path), {
      method: 'PUT',
      headers,
      body: JSON.stringify(data, null, 2),
    });
    if (res.status === 412) {
      throw new WebDavConflictError(`${path} wurde extern geändert (ETag-Konflikt)`);
    }
    if (!res.ok) {
      throw new Error(`WebDAV PUT ${path} fehlgeschlagen: ${res.status}`);
    }
    return res.headers.get('etag');
  }

  /** Ordnerkette anlegen (MKCOL je Ebene); "existiert schon" (405) ist okay */
  async ensureFolder(path: string): Promise<void> {
    let current = '';
    for (const segment of path.split('/').filter(Boolean)) {
      current += `/${segment}`;
      const res = await fetch(this.davUrl(current), {
        method: 'MKCOL',
        headers: this.headers(),
      });
      if (!res.ok && res.status !== 405) {
        throw new Error(`WebDAV MKCOL ${current} fehlgeschlagen: ${res.status}`);
      }
    }
  }
}
