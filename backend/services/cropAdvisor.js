const { IRRIGATION_PROFILES, CROP_LIBRARY, CROPS_BY_CLIMATE_GROUP, PUBLISHED_YIELDS } = require("../data/cultivation");

/** Tags a crop with where its yield comes from: a published trial, or null when it is the app's own estimate. */
const withYieldSource = (crop) => {
  const published = PUBLISHED_YIELDS[crop.name];
  return {
    ...crop,
    yieldSource: published ? { basis: published.basis, source: published.source, url: published.url, note: published.note } : null,
  };
};

/** Zone-ranked crop list with the user's selected crop pinned first. */
const rankCrops = (climateGroup, selectedCrop, irrigationSystem) => {
  const baseCrops = (CROPS_BY_CLIMATE_GROUP[climateGroup] || CROPS_BY_CLIMATE_GROUP.Composite).map(
    ([name, suitability, expectedYield, season, notes]) => ({ name, suitability, expectedYield, season, notes })
  );

  const selectedProfile = CROP_LIBRARY[selectedCrop];
  const irrigationNote = (IRRIGATION_PROFILES[irrigationSystem]?.notes ?? [])[0] || "";
  const selectedName = selectedProfile?.name;
  let selectedSuggestion = null;

  const suggestions = baseCrops.map((crop) => {
    const isSelected = crop.name === selectedName;
    const next = {
      ...crop,
      isSelected,
      notes: isSelected ? `${crop.notes} Selected crop focus. ${irrigationNote}`.trim() : crop.notes,
    };
    if (isSelected) selectedSuggestion = next;
    return next;
  });

  if (!selectedSuggestion && selectedProfile) {
    selectedSuggestion = {
      name: selectedProfile.name,
      suitability: selectedProfile.suitabilityByZone[climateGroup] || selectedProfile.suitabilityByZone.Composite,
      expectedYield: selectedProfile.expectedYield,
      season: selectedProfile.season,
      notes: `${selectedProfile.notes} ${irrigationNote}`.trim(),
      isSelected: true,
    };
  }

  if (!selectedSuggestion) return suggestions;
  return [selectedSuggestion, ...suggestions.filter((crop) => crop.name !== selectedSuggestion.name)];
};

const deriveCrops = (climateGroup, selectedCrop, irrigationSystem) =>
  rankCrops(climateGroup, selectedCrop, irrigationSystem).map(withYieldSource);

const toSuggestionText = (crops, climateGroup) => {
  const lines = crops.map(
    (crop) => `- ${crop.name} (${crop.suitability}): ${crop.expectedYield}${crop.yieldSource ? " (published trials)" : " (unverified estimate)"}, ${crop.season}. ${crop.notes}`
  );
  return [`Suggested crops for ${climateGroup} conditions:`, "", ...lines].join("\n");
};

module.exports = { deriveCrops, toSuggestionText };
