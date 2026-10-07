import { GoogleTripRepository } from './googleRepository';
// Prepared only. Existing UI stays local until the user supplies and verifies the deployed URL.
export function createSharedRepository(): GoogleTripRepository | null {
 const url = import.meta.env.VITE_GOOGLE_SCRIPT_URL?.trim();
 return url ? new GoogleTripRepository(url) : null;
}
