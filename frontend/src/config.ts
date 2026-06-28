export interface RuntimeConfig {
  userPoolId: string;
  appClientId: string;
  identityPoolId: string;
  agentRegistryTable: string;
  region: string;
}

let cached: RuntimeConfig | null = null;

export async function loadConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('/config.json', { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();

    const required: (keyof RuntimeConfig)[] = ['userPoolId', 'appClientId', 'identityPoolId', 'agentRegistryTable', 'region'];
    for (const k of required) {
      if (!cfg[k]) throw new Error(`Config missing: ${k}`);
    }

    cached = cfg as RuntimeConfig;
    return cached;
  } finally {
    clearTimeout(timeout);
  }
}
