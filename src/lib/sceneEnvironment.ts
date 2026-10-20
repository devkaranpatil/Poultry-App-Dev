/**
 * The landscape and sky drawn around the shed. Each location has its own landscape (a Deccan
 * farm looks nothing like a Himalayan terrace or the Thar), chosen from the state and, where a
 * district differs from its state, the district. The grower can pick another one, or a different
 * sky, from the 3D view; the picks are remembered in the browser.
 */

export const ENVIRONMENTS = ['plains', 'deccan', 'coastal', 'arid', 'hills', 'mountains'] as const;
export type EnvironmentId = (typeof ENVIRONMENTS)[number];

export const SKIES = ['day', 'golden', 'overcast', 'night'] as const;
export type SkyId = (typeof SKIES)[number];

/** What the grower picked: 'auto' follows the location. */
export type EnvironmentChoice = EnvironmentId | 'auto';

/** Used before a location is chosen, and for a location the table does not know. */
export const DEFAULT_ENVIRONMENT: EnvironmentId = 'plains';
export const DEFAULT_SKY: SkyId = 'day';

/**
 * Each state's usual landscape:
 *  plains     Indo-Gangetic plain: flat green fields, scattered trees, a hazy horizon
 *  deccan     Deccan plateau: red-brown soil, dry grass, low flat-topped hills
 *  coastal    tropical coast: lush green, coconut palms, red laterite soil
 *  arid       Thar and Kutch: sand, low dunes, thorny scrub
 *  hills      North-East and Ghats: rolling green hills, dense trees, mist
 *  mountains  Himalaya: pines, terraces, snow-capped peaks behind
 */
const STATE_ENVIRONMENT: Record<string, EnvironmentId> = {
  'Andhra Pradesh': 'coastal',
  'Arunachal Pradesh': 'mountains',
  Assam: 'hills',
  Bihar: 'plains',
  Chhattisgarh: 'deccan',
  Goa: 'coastal',
  Gujarat: 'arid',
  Haryana: 'plains',
  'Himachal Pradesh': 'mountains',
  Jharkhand: 'deccan',
  Karnataka: 'deccan',
  Kerala: 'coastal',
  'Madhya Pradesh': 'deccan',
  Maharashtra: 'deccan',
  Manipur: 'hills',
  Meghalaya: 'hills',
  Mizoram: 'hills',
  Nagaland: 'hills',
  Odisha: 'coastal',
  Punjab: 'plains',
  Rajasthan: 'arid',
  Sikkim: 'mountains',
  'Tamil Nadu': 'coastal',
  Telangana: 'deccan',
  Tripura: 'hills',
  'Uttar Pradesh': 'plains',
  Uttarakhand: 'mountains',
  'West Bengal': 'plains',
};

/** Districts whose landscape differs from the rest of their state (keyed "State/District"). */
const DISTRICT_ENVIRONMENT: Record<string, EnvironmentId> = {
  // The Konkan coast.
  'Maharashtra/Mumbai City': 'coastal',
  'Maharashtra/Mumbai Suburban': 'coastal',
  'Maharashtra/Palghar': 'coastal',
  'Maharashtra/Raigad': 'coastal',
  'Maharashtra/Ratnagiri': 'coastal',
  'Maharashtra/Sindhudurg': 'coastal',
  'Maharashtra/Thane': 'coastal',
  // Coastal and Malnad Karnataka.
  'Karnataka/Udupi': 'coastal',
  'Karnataka/Dakshina Kannada': 'coastal',
  'Karnataka/Uttara Kannada': 'coastal',
  'Karnataka/Kodagu': 'hills',
  'Karnataka/Chikkamagaluru': 'hills',
  // The Western Ghats and the Nilgiris.
  'Kerala/Idukki': 'hills',
  'Kerala/Wayanad': 'hills',
  'Tamil Nadu/Nilgiris': 'hills',
  // Rayalaseema, inland Andhra, is plateau.
  'Andhra Pradesh/Anantapur': 'deccan',
  'Andhra Pradesh/Chittoor': 'deccan',
  'Andhra Pradesh/Kurnool': 'deccan',
  'Andhra Pradesh/YSR Kadapa': 'deccan',
  // South Gujarat is wet and green, unlike Kutch and Saurashtra.
  'Gujarat/Valsad': 'coastal',
  'Gujarat/Dang': 'hills',
  // Odisha's southern hills.
  'Odisha/Koraput': 'hills',
  'Odisha/Kandhamal': 'hills',
  // The Darjeeling Himalaya.
  'West Bengal/Darjeeling': 'mountains',
  'West Bengal/Kalimpong': 'mountains',
};

/** The landscape a location usually has. */
export function environmentForLocation(state: string, district: string): EnvironmentId {
  return DISTRICT_ENVIRONMENT[`${state}/${district}`] ?? STATE_ENVIRONMENT[state] ?? DEFAULT_ENVIRONMENT;
}

/** The landscape to draw: the grower's pick, or the location's own. */
export function resolveEnvironment(choice: EnvironmentChoice, state: string, district: string): EnvironmentId {
  return choice === 'auto' ? environmentForLocation(state, district) : choice;
}

export const ENVIRONMENT_STORAGE_KEY = 'farm.scene.environment';
export const SKY_STORAGE_KEY = 'farm.scene.sky';

export function readEnvironmentChoice(): EnvironmentChoice {
  try {
    const value = window.localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
    return value && (ENVIRONMENTS as readonly string[]).includes(value) ? (value as EnvironmentId) : 'auto';
  } catch {
    return 'auto';
  }
}

export function readSkyChoice(): SkyId {
  try {
    const value = window.localStorage.getItem(SKY_STORAGE_KEY);
    return value && (SKIES as readonly string[]).includes(value) ? (value as SkyId) : DEFAULT_SKY;
  } catch {
    return DEFAULT_SKY;
  }
}

/** Remembers a pick; the default is stored as nothing, so a later change of default still applies. */
export function saveSceneChoice(key: string, value: string, fallback: string) {
  try {
    if (value === fallback) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // The pick then lasts for this visit only.
  }
}

/** Every state and district the tables cover, for tests. */
export const MAPPED_STATES = Object.keys(STATE_ENVIRONMENT);
export const MAPPED_DISTRICTS = Object.keys(DISTRICT_ENVIRONMENT).map((key) => key.split('/') as [string, string]);

/**
 * How far the lights, fog, ground grid and zoom reach, from the larger side of the house. It
 * rounds up in 50 m steps so a drag does not rebuild the shadow camera on every metre.
 */
export function sceneReach(length: number, width: number) {
  const extent = Math.max(50, Math.ceil(Math.max(length, width) / 50) * 50);
  return {
    extent,
    shadowHalf: Math.max(80, extent * 0.6 + 10),
    fogNear: Math.max(110, extent * 1.2),
    fogFar: Math.max(320, extent * 3),
    grid: Math.max(200, extent * 2),
    maxDistance: Math.max(200, extent * 2.5),
  };
}

export type SceneReach = ReturnType<typeof sceneReach>;
