export interface HostRedirect {
  status: 302 | 308;
  location: string;
}

export function createHostRouting(origins: {
  marketingUrl?: string;
  appBaseUrl?: string;
}):
  | ((request: {
      host: string | undefined;
      path: string;
      method: string;
    }) => HostRedirect | null)
  | null;
