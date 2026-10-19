import { beforeEach, describe, expect, it } from 'vitest';
import { INDIAN_DISTRICTS, INDIAN_STATES } from '@/types/greenhouse';
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENTS,
  ENVIRONMENT_STORAGE_KEY,
  MAPPED_DISTRICTS,
  MAPPED_STATES,
  SKY_STORAGE_KEY,
  environmentForLocation,
  readEnvironmentChoice,
  readSkyChoice,
  resolveEnvironment,
  saveSceneChoice,
} from '@/lib/sceneEnvironment';

describe('landscape for a location', () => {
  it('has a landscape for every state the app offers, and no stray states', () => {
    expect([...MAPPED_STATES].sort()).toEqual([...INDIAN_STATES].sort());
  });

  it('only overrides districts that exist in their state', () => {
    for (const [state, district] of MAPPED_DISTRICTS) {
      expect(INDIAN_DISTRICTS[state], state).toContain(district);
    }
  });

  it('gives every district of every state one of the known landscapes', () => {
    for (const state of INDIAN_STATES) {
      for (const district of INDIAN_DISTRICTS[state]) {
        expect(ENVIRONMENTS).toContain(environmentForLocation(state, district));
      }
    }
  });

  it('follows the state, with districts that differ', () => {
    expect(environmentForLocation('Maharashtra', 'Pune')).toBe('deccan');
    expect(environmentForLocation('Maharashtra', 'Ratnagiri')).toBe('coastal');
    expect(environmentForLocation('Rajasthan', 'Jaisalmer')).toBe('arid');
    expect(environmentForLocation('Himachal Pradesh', 'Shimla')).toBe('mountains');
    expect(environmentForLocation('West Bengal', 'Darjeeling')).toBe('mountains');
    expect(environmentForLocation('Tamil Nadu', 'Nilgiris')).toBe('hills');
    expect(environmentForLocation('', '')).toBe(DEFAULT_ENVIRONMENT);
  });

  it('uses the pick over the location, except on Auto', () => {
    expect(resolveEnvironment('auto', 'Kerala', 'Kottayam')).toBe('coastal');
    expect(resolveEnvironment('arid', 'Kerala', 'Kottayam')).toBe('arid');
  });
});

describe('remembered picks', () => {
  beforeEach(() => window.localStorage.clear());

  it('reads back what was saved, and ignores anything unknown', () => {
    expect(readEnvironmentChoice()).toBe('auto');
    expect(readSkyChoice()).toBe('day');
    saveSceneChoice(ENVIRONMENT_STORAGE_KEY, 'mountains', 'auto');
    saveSceneChoice(SKY_STORAGE_KEY, 'night', 'day');
    expect(readEnvironmentChoice()).toBe('mountains');
    expect(readSkyChoice()).toBe('night');
    window.localStorage.setItem(ENVIRONMENT_STORAGE_KEY, 'moon');
    expect(readEnvironmentChoice()).toBe('auto');
  });

  it('stores nothing for the defaults', () => {
    saveSceneChoice(ENVIRONMENT_STORAGE_KEY, 'auto', 'auto');
    expect(window.localStorage.getItem(ENVIRONMENT_STORAGE_KEY)).toBeNull();
  });
});
