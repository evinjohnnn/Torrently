// Mirrors handlers/spa/vault.go.

export interface Pledge {
  resourceId: string;
  name: string;
  amount: number;
  frozen: boolean;
  funded: boolean;
  vaulted: boolean;
  expiresIn?: number;
  streamUrl?: string;
}

export interface VaultData {
  stats?: {
    vaulted: number;
    loading: number;
    expiring: number;
    total: number | null;
    available: number | null;
    funded: number;
    frozen: number;
  };
  pledges: Pledge[];
  isFree: boolean;
}

/** services/statusview Badge: the state in the server's words. */
export interface Badge {
  tone: string;
  icon: string;
  pulse?: boolean;
  label: string;
  extra?: string;
}

/** One message of the status stream without session=1 (handlers/resource/status.go). */
export interface StreamStatus {
  state: string;
  progress: number;
  badge?: Badge;
}
