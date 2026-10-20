import { normalizeFarmConfig, type FarmConfig } from "@/types/farm";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");

/** This app saves poultry setups only; the server never lists the polyhouse planner's records. */
export type ConfigurationType = "poultry";
export type AnyConfig = FarmConfig;

const toFarmConfig = (config: Partial<FarmConfig>): FarmConfig => normalizeFarmConfig(config);

export interface SavedConfiguration {
  id: string;
  name: string;
  configType: ConfigurationType;
  config: AnyConfig;
  updatedAt: string;
}

interface CreateConfigurationInput {
  name: string;
  configType: ConfigurationType;
  config: AnyConfig;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Request failed");
  }
  return payload as T;
}

function buildConfigurationServerError() {
  if (API_BASE_URL) {
    return `Cannot reach configuration server at ${API_BASE_URL}. Start backend and verify backend/.env (DATABASE_URL, SUPABASE_URL).`;
  }
  return "Cannot reach configuration server. Start backend and set VITE_API_BASE_URL in .env.";
}

async function requestConfigurations(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(buildConfigurationServerError());
  }
}

function normalizeSavedConfiguration(item: SavedConfiguration): SavedConfiguration {
  const configType = item.configType ?? "poultry";
  const config = toFarmConfig(item.config);
  return { ...item, configType, config };
}

export async function createConfiguration(token: string, input: CreateConfigurationInput) {
  const config = toFarmConfig(input.config);

  const response = await requestConfigurations(`${API_BASE_URL}/api/configurations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: input.name,
      configType: input.configType,
      config,
    }),
  });

  const payload = await parseResponse<{ configuration: SavedConfiguration }>(response);
  return normalizeSavedConfiguration(payload.configuration);
}

export async function listConfigurations(token: string) {
  const response = await requestConfigurations(`${API_BASE_URL}/api/configurations`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await parseResponse<{ configurations: SavedConfiguration[] }>(response);
  return payload.configurations.map(normalizeSavedConfiguration);
}

export async function deleteConfiguration(token: string, id: string) {
  const response = await requestConfigurations(
    `${API_BASE_URL}/api/configurations/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  await parseResponse<{ id: string }>(response);
}
