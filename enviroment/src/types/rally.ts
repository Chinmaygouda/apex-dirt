import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

export type SurfaceType = 'asphalt' | 'gravel' | 'scree';

export interface SurfaceProperties {
  type: SurfaceType;
  friction: number;
  rollingResistance: number;
  dustEmitRate: number;
  smokeEmitRate: number;
  colorHex: number;
  name: string;
}

export interface SplinePointData {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  width: number;
  camberAngle: number; // in radians (positive = banked inwards)
  distanceAlongSpline: number;
  surface: SurfaceProperties;
  featureNote?: string;
}

export interface VehicleTelemetry {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  speedKmh: number;
  lateralSpeed: number; // m/s lateral scrub
  longitudinalSlip: number; // normalized slip ratio
  engineRpm: number;
  throttle: number;
  brake: number;
  isDeceleratingHard: boolean;
  wheelPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]; // FL, FR, RL, RR
  wheelGrounded: [boolean, boolean, boolean, boolean];
  currentSurface: SurfaceProperties;
}

export type WildlifeState = 'GRAZING' | 'ALERT' | 'CROSSING' | 'SAFE';

export interface WildlifeEntity {
  id: string;
  type: 'cow' | 'deer';
  mesh: THREE.Group;
  currentPosition: THREE.Vector3;
  homePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  state: WildlifeState;
  stateTimer: number;
  crossingProgress: number;
  alertHeadSnap: number;
  velocity: THREE.Vector3;
  
  // Articulation pivots
  headPivot?: THREE.Object3D;
  leftEar?: THREE.Object3D;
  rightEar?: THREE.Object3D;
  tailPivot?: THREE.Object3D;
  legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D]; // FL, FR, RL, RR
}

export interface SectorTiming {
  sectorIndex: number;
  splitTime: number; // in seconds
  deltaToBest: number; // in seconds (+/-)
}

export interface LapData {
  lapNumber: number;
  lapTime: number;
  sectors: number[];
  tookJokerLap: boolean;
  isValid: boolean;
}

