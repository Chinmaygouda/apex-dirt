import * as THREE from 'three';

/**
 * Exact sampled pixel colors from the Hardpack Rally screenshots.
 * All art uses flat / vertex colors with zero image textures.
 */
export const PALETTE = {
  // Car colors
  CAR_BODY_LIT: '#BC0F28',       // User specified car red
  CAR_BODY_SHADOW: '#8E0B1E',    // Darker shade for shadow facets
  CAR_TAILGATE_DARK: '#0E0C12',  // Rear tailgate dark trim
  CAR_TRIM_BLACK: '#403C50',     // Satin black rear wing & trim
  CAR_TAILLIGHT_RED: '#ED403A',   // Left red taillight core
  CAR_TAILLIGHT_AMBER: '#B67952', // Left amber indicator lens
  CAR_TAILLIGHT_WHITE: '#9D9CA7', // Left white reverse lens
  CAR_PLATE_BG: '#F8FAFC',       // License plate white
  CAR_PLATE_TEXT: '#0F172A',     // License plate text

  // Road & Skid marks
  ROAD_DIRT_LIT: '#645F5E',      // Lit packed center soil
  ROAD_DIRT_CORNER: '#575551',   // Road dirt in corner
  ROAD_VERGE_GRASS: '#8C977D',   // Roadside sage grass verge
  SKIDMARK_LEFT: '#585554',      // Left fresh tread mark
  SKIDMARK_RIGHT: '#524D4A',     // Right fresh tread mark
  SKIDMARK_DRIFT: '#615B5B',     // Curved drift skid mark

  // Environment & Foliage
  SKY_ZENITH: '#5A5F65',         // Muted overcast/zenith
  SKY_HORIZON: '#67ADE6',        // User specified sky blue
  CLOUD_WHITE: '#F1F5F9',        // Clean white cloud facet
  DECIDUOUS_GREEN: '#485953',    // Deciduous foliage sage green
  PINE_GREEN: '#64746D',         // Pine tree spruce needle green
  TREE_TRUNK: '#6E7470',         // Timber bark
  CHEVRON_YELLOW: '#636855',     // Chevron sign yellow

  // Gate Posts (Sampled from media_...295, NO orange caps!)
  GATE_POST_LEFT: '#B9A092',     // Left gate post timber/stone body
  GATE_POST_RIGHT: '#AB998E',    // Right gate post timber/stone body
  GATE_POST_BAND: '#847062',     // Dark timber horizontal band

  // UI & HUD
  HUD_BG: 'rgba(15, 23, 42, 0.88)', // Dark translucent slate pill
  HUD_ACCENT_ORANGE: '#FF6D00',     // Tachometer redline & active badges
  HUD_TEXT_WHITE: '#F8FAFC',        // High-contrast clean white
  HUD_TEXT_MUTED: '#94A3B8',        // Secondary telemetry text
};

export const THREE_PALETTE = {
  carBodyLit: new THREE.Color(PALETTE.CAR_BODY_LIT),
  carBodyShadow: new THREE.Color(PALETTE.CAR_BODY_SHADOW),
  carTrimBlack: new THREE.Color(PALETTE.CAR_TRIM_BLACK),
  carTaillightRed: new THREE.Color(PALETTE.CAR_TAILLIGHT_RED),
  carTaillightAmber: new THREE.Color(PALETTE.CAR_TAILLIGHT_AMBER),
  carTaillightWhite: new THREE.Color(PALETTE.CAR_TAILLIGHT_WHITE),

  roadDirtLit: new THREE.Color(PALETTE.ROAD_DIRT_LIT),
  roadDirtShadow: new THREE.Color(PALETTE.ROAD_DIRT_CORNER),
  roadVergeGrass: new THREE.Color(PALETTE.ROAD_VERGE_GRASS),
  skidmarkDark: new THREE.Color(PALETTE.SKIDMARK_LEFT),
  skidmarkLeft: new THREE.Color(PALETTE.SKIDMARK_LEFT),
  skidmarkRight: new THREE.Color(PALETTE.SKIDMARK_RIGHT),
  skidmarkDrift: new THREE.Color(PALETTE.SKIDMARK_DRIFT),

  skyZenith: new THREE.Color(PALETTE.SKY_ZENITH),
  skyHorizon: new THREE.Color(PALETTE.SKY_HORIZON),
  cloudWhite: new THREE.Color(PALETTE.CLOUD_WHITE),
  deciduousGreen: new THREE.Color(PALETTE.DECIDUOUS_GREEN),
  pineGreen: new THREE.Color(PALETTE.PINE_GREEN),
  treeTrunk: new THREE.Color(PALETTE.TREE_TRUNK),
  chevronYellow: new THREE.Color(PALETTE.CHEVRON_YELLOW),

  gatePostLit: new THREE.Color(PALETTE.GATE_POST_LEFT),
  gatePostDark: new THREE.Color(PALETTE.GATE_POST_BAND),
  gatePostLeft: new THREE.Color(PALETTE.GATE_POST_LEFT),
  gatePostRight: new THREE.Color(PALETTE.GATE_POST_RIGHT),
};

export const PHYSICS_CONFIG = {
  SUBSTEP_HZ: 120,
  SUBSTEP_DT: 1 / 120,
  MAX_SUBSTEPS_PER_FRAME: 10,
  GRAVITY: -9.81,
};
