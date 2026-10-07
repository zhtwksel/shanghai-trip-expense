import { emptyState, validateState, type State } from '../domain/accounting';
export interface TripRepository { load(): State; save(state: State): void }
export class LocalTripRepository implements TripRepository {
  constructor(private storage: Storage, private key = 'shanghai-trip-expense:v1') {}
  load(): State { const raw = this.storage.getItem(this.key); return raw === null ? emptyState() : validateState(JSON.parse(raw)); }
  save(state: State): void { this.storage.setItem(this.key, JSON.stringify(validateState(state))); }
}
