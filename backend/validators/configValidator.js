/* =====================================================
   SHARED CONFIG VALIDATOR
   Location: backend/validators/configValidator.js

   One rule set. farmValidator.js chooses the structure-type
   field name.
===================================================== */

const DIMENSION_LIMITS = require("../../shared/farm-limits.json");
const INDIA_LOCATIONS = require("../../shared/india-locations.json");

/* ===================== HELPERS ===================== */

/** A finite number strictly greater than zero. */
const isValidPositiveDecimal = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
};

const isLettersOnly = (value) => typeof value === "string" && /^[a-zA-Z\s.'-]+$/.test(value);

/** District names can include numbers in India (e.g. North 24 Parganas). */
const isDistrictName = (value) => typeof value === "string" && /^[a-zA-Z0-9\s.'-]+$/.test(value);

const isOneOf = (value, allowed) => allowed.includes(value);

const isWithinLimits = (value, field) => {
  const { min, max } = DIMENSION_LIMITS[field];
  const num = Number(value);
  return num >= min && num <= max;
};

const rangeMessage = (label, field) => {
  const { min, max } = DIMENSION_LIMITS[field];
  return `${label} must be between ${min} and ${max} m`;
};

/* ===================== ALLOWED VALUES ===================== */

const VALID_COVER_MATERIALS = ["uv_polyfilm", "uv-polyfilm", "shade_net", "shade-net", "insect_net", "insect-net", "glass"];
const VALID_CROPS = ["tomato", "capsicum", "cucumber", "lettuce", "strawberry", "gerbera"];
const VALID_IRRIGATION_SYSTEMS = ["drip", "sprinkler", "fogger", "hydroponic_nft", "hydroponic-nft"];
const VALID_STRUCTURE_TYPES = ["naturally-ventilated", "climate-controlled", "shade-net"];
const VALID_ROOF_TYPES = ["flat", "gable", "gothic"];
const VALID_STRUCTURE_MATERIALS = ["galvanized_iron", "gi-steel", "galvanized-iron", "aluminium", "bamboo"];
const VALID_SIDE_VENTILATION = ["none", "manual-rollup", "motorized-rollup", "louver"];
const VALID_DOOR_TYPES = ["single-sliding", "double-sliding", "roll-up", "curtain"];

/**
 * @param {{ typeField: string, typeLabel: string }} options
 * @returns {(data: object) => Record<string, string>} field-keyed error map; empty when valid
 */
function createConfigValidator({ typeField, typeLabel }) {
  return (data) => {
    const errors = {};
    const {
      length,
      width,
      gutterHeight,
      ridgeHeight,
      roofType,
      structureMaterial,
      coverMaterial,
      sideVentilation,
      doorType,
      selectedCrop,
      irrigationSystem,
      stateName,
      district,
    } = data;
    const structureType = data[typeField];

    /* ---------- DIMENSIONS ---------- */
    if (!isValidPositiveDecimal(length)) {
      errors.length = "Length must be a positive number";
    } else if (!isWithinLimits(length, "length")) {
      errors.length = rangeMessage("Length", "length");
    }

    if (!isValidPositiveDecimal(width)) {
      errors.width = "Breadth must be a positive number";
    } else if (!isWithinLimits(width, "width")) {
      errors.width = rangeMessage("Breadth", "width");
    }

    /* ---------- HEIGHTS ---------- */
    if (!isValidPositiveDecimal(gutterHeight)) {
      errors.gutterHeight = "Gutter height must be a positive number";
    } else if (!isWithinLimits(gutterHeight, "gutterHeight")) {
      errors.gutterHeight = rangeMessage("Gutter height", "gutterHeight");
    }

    if (!isValidPositiveDecimal(ridgeHeight)) {
      errors.ridgeHeight = "Ridge height must be a positive number";
    } else if (roofType !== "flat" && !isWithinLimits(ridgeHeight, "ridgeHeight")) {
      // Flat roofs lock ridge to gutter height, so the gutter range applies instead.
      errors.ridgeHeight = rangeMessage("Ridge height", "ridgeHeight");
    }

    if (isValidPositiveDecimal(gutterHeight) && isValidPositiveDecimal(ridgeHeight)) {
      if (roofType === "flat" && Math.abs(Number(ridgeHeight) - Number(gutterHeight)) > 0.001) {
        errors.heightLogic = "For flat roof, ridge height must be equal to gutter height";
      } else if (roofType !== "flat" && Number(ridgeHeight) <= Number(gutterHeight)) {
        errors.heightLogic = "Ridge height must be greater than gutter height";
      }
    }

    /* ---------- STRUCTURE & COVER ---------- */
    if (!structureType) {
      errors[typeField] = `${typeLabel} type is required`;
    } else if (!isOneOf(structureType, VALID_STRUCTURE_TYPES)) {
      errors[typeField] = `${typeLabel} type selection is invalid`;
    }

    if (!roofType) {
      errors.roofType = "Roof type is required";
    } else if (!isOneOf(roofType, VALID_ROOF_TYPES)) {
      errors.roofType = "Roof type selection is invalid";
    }

    if (!structureMaterial) {
      errors.structureMaterial = "Structure material is required";
    } else if (!isOneOf(structureMaterial, VALID_STRUCTURE_MATERIALS)) {
      errors.structureMaterial = "Structure material selection is invalid";
    }

    if (!coverMaterial) {
      errors.coverMaterial = "Cover material is required";
    } else if (!isOneOf(coverMaterial, VALID_COVER_MATERIALS)) {
      errors.coverMaterial = "Cover material selection is invalid";
    }

    /* ---------- TYPE COMPATIBILITY ---------- */
    if (structureType === "shade-net") {
      if (coverMaterial !== "shade_net" && coverMaterial !== "shade-net") {
        errors.coverMaterial = "For shade-net type, cover material must be Shade Net";
      }
      if (sideVentilation !== "none") {
        errors.sideVentilation = "For shade-net type, side ventilation must be None";
      }
      if (doorType !== "curtain") {
        errors.doorType = "For shade-net type, door entry must be Curtain";
      }
    }

    /* ---------- VENTILATION ---------- */
    if (!sideVentilation) {
      errors.sideVentilation = "Side ventilation selection is required";
    } else if (!errors.sideVentilation && !isOneOf(sideVentilation, VALID_SIDE_VENTILATION)) {
      errors.sideVentilation = "Side ventilation selection is invalid";
    }

    if (!doorType) {
      errors.doorType = "Door type is required";
    } else if (!errors.doorType && !isOneOf(doorType, VALID_DOOR_TYPES)) {
      errors.doorType = "Door type selection is invalid";
    }

    /* ---------- CULTIVATION ---------- */
    if (!selectedCrop) {
      errors.selectedCrop = "Crop selection is required";
    } else if (!isOneOf(selectedCrop, VALID_CROPS)) {
      errors.selectedCrop = "Crop selection is invalid";
    }

    if (!irrigationSystem) {
      errors.irrigationSystem = "Irrigation system selection is required";
    } else if (!isOneOf(irrigationSystem, VALID_IRRIGATION_SYSTEMS)) {
      errors.irrigationSystem = "Irrigation system selection is invalid";
    }

    /* ---------- LOCATION ---------- */
    if (!stateName || !isLettersOnly(stateName)) {
      errors.stateName = "State name is required and may contain letters, spaces, apostrophes, periods, or hyphens";
    } else if (!Object.prototype.hasOwnProperty.call(INDIA_LOCATIONS, stateName)) {
      errors.stateName = "State is not supported";
    }

    if (district && !isDistrictName(district)) {
      errors.district = "District name may contain letters, numbers, spaces, apostrophes, periods, or hyphens";
    } else if (district && !errors.stateName && !INDIA_LOCATIONS[stateName].includes(district)) {
      errors.district = "District does not belong to the selected state";
    }

    return errors;
  };
}

module.exports = { createConfigValidator };
