import { WORLD_CONFIG, CourseSectionDef } from './worldConfig';

export interface CourseSample {
  x: number;
  z: number;
  heading: number; // 0 = +Z, positive turns toward +X
}

export interface NearestCentrelineResult {
  distance: number;
  s: number;
}

export interface SectionMetadata {
  readonly id: number;
  readonly type: 'STRAIGHT' | 'RIGHT' | 'LEFT';
  readonly sStart: number;
  readonly sEnd: number;
  readonly length: number;
  readonly x0: number;
  readonly z0: number;
  readonly h0: number;
  readonly radius?: number;
  readonly cx?: number;
  readonly cz?: number;
  readonly hEnd: number;
  readonly xEnd: number;
  readonly zEnd: number;
}

// Compute analytical section boundaries once
function buildSections(): { sections: SectionMetadata[]; totalLength: number } {
  const sections: SectionMetadata[] = [];
  let s = 0.0;
  let x = 0.0;
  let z = 0.0;
  let h = 0.0;

  for (const def of WORLD_CONFIG.sections) {
    const sStart = s;
    const x0 = x;
    const z0 = z;
    const h0 = h;
    let len = 0.0;
    let cx: number | undefined;
    let cz: number | undefined;

    if (def.type === 'STRAIGHT') {
      len = def.length!;
      x = x0 + len * Math.sin(h0);
      z = z0 + len * Math.cos(h0);
    } else if (def.type === 'RIGHT') {
      const R = def.radius!;
      const ang = (def.angleDeg! * Math.PI) / 180.0;
      len = R * ang;
      cx = x0 + R * Math.cos(h0);
      cz = z0 - R * Math.sin(h0);
      const hEnd = h0 + ang;
      x = cx - R * Math.cos(hEnd);
      z = cz + R * Math.sin(hEnd);
      h = hEnd;
    } else if (def.type === 'LEFT') {
      const R = def.radius!;
      const ang = (def.angleDeg! * Math.PI) / 180.0;
      len = R * ang;
      cx = x0 - R * Math.cos(h0);
      cz = z0 + R * Math.sin(h0);
      const hEnd = h0 - ang;
      x = cx + R * Math.cos(hEnd);
      z = cz - R * Math.sin(hEnd);
      h = hEnd;
    }

    const sEnd = sStart + len;
    s = sEnd;

    sections.push({
      id: def.id,
      type: def.type,
      sStart,
      sEnd,
      length: len,
      x0,
      z0,
      h0,
      radius: def.radius,
      cx,
      cz,
      hEnd: h,
      xEnd: x,
      zEnd: z,
    });
  }

  return { sections, totalLength: s };
}

const { sections: BUILT_SECTIONS, totalLength: TOTAL_LENGTH } = buildSections();

export const totalLength: number = TOTAL_LENGTH;

export function sectionAt(s: number): SectionMetadata {
  if (s <= 0) return BUILT_SECTIONS[0];
  if (s >= TOTAL_LENGTH) return BUILT_SECTIONS[BUILT_SECTIONS.length - 1];

  for (let i = 0; i < BUILT_SECTIONS.length; i++) {
    const sec = BUILT_SECTIONS[i];
    if (s >= sec.sStart && s <= sec.sEnd) {
      return sec;
    }
  }
  return BUILT_SECTIONS[BUILT_SECTIONS.length - 1];
}

export function sample(s: number): CourseSample {
  if (s <= 0.0) {
    const s0 = BUILT_SECTIONS[0];
    return {
      x: s0.x0 + s * Math.sin(s0.h0),
      z: s0.z0 + s * Math.cos(s0.h0),
      heading: s0.h0,
    };
  }

  if (s >= TOTAL_LENGTH) {
    const sLast = BUILT_SECTIONS[BUILT_SECTIONS.length - 1];
    const ds = s - sLast.sEnd;
    return {
      x: sLast.xEnd + ds * Math.sin(sLast.hEnd),
      z: sLast.zEnd + ds * Math.cos(sLast.hEnd),
      heading: sLast.hEnd,
    };
  }

  const sec = sectionAt(s);
  const ds = s - sec.sStart;

  if (sec.type === 'STRAIGHT') {
    return {
      x: sec.x0 + ds * Math.sin(sec.h0),
      z: sec.z0 + ds * Math.cos(sec.h0),
      heading: sec.h0,
    };
  } else if (sec.type === 'RIGHT') {
    const h = sec.h0 + ds / sec.radius!;
    return {
      x: sec.cx! - sec.radius! * Math.cos(h),
      z: sec.cz! + sec.radius! * Math.sin(h),
      heading: h,
    };
  } else {
    const h = sec.h0 - ds / sec.radius!;
    return {
      x: sec.cx! + sec.radius! * Math.cos(h),
      z: sec.cz! - sec.radius! * Math.sin(h),
      heading: h,
    };
  }
}

export function distToCentreline(x: number, z: number): NearestCentrelineResult {
  let bestDistSq = Infinity;
  let bestS = 0.0;

  for (let i = 0; i < BUILT_SECTIONS.length; i++) {
    const sec = BUILT_SECTIONS[i];

    if (sec.type === 'STRAIGHT') {
      const dx = x - sec.x0;
      const dz = z - sec.z0;
      const sinH = Math.sin(sec.h0);
      const cosH = Math.cos(sec.h0);
      const t = Math.max(0.0, Math.min(sec.length, dx * sinH + dz * cosH));
      const px = sec.x0 + t * sinH;
      const pz = sec.z0 + t * cosH;
      const distSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestS = sec.sStart + t;
      }
    } else if (sec.type === 'RIGHT') {
      const R = sec.radius!;
      const vx = x - sec.cx!;
      const vz = z - sec.cz!;
      const h = Math.atan2(vz, -vx);
      let dh = ((h - sec.h0 + Math.PI) % (2.0 * Math.PI)) - Math.PI;
      if (dh < 0.0) dh += 2.0 * Math.PI;
      const ang = (sec.sEnd - sec.sStart) / R;
      const dhClamped = Math.max(0.0, Math.min(ang, dh));
      const hClamped = sec.h0 + dhClamped;
      const px = sec.cx! - R * Math.cos(hClamped);
      const pz = sec.cz! + R * Math.sin(hClamped);
      const distSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestS = sec.sStart + dhClamped * R;
      }
    } else if (sec.type === 'LEFT') {
      const R = sec.radius!;
      const vx = x - sec.cx!;
      const vz = z - sec.cz!;
      const h = Math.atan2(-vz, vx);
      let dh = ((sec.h0 - h + Math.PI) % (2.0 * Math.PI)) - Math.PI;
      if (dh < 0.0) dh += 2.0 * Math.PI;
      const ang = (sec.sEnd - sec.sStart) / R;
      const dhClamped = Math.max(0.0, Math.min(ang, dh));
      const hClamped = sec.h0 - dhClamped;
      const px = sec.cx! + R * Math.cos(hClamped);
      const pz = sec.cz! - R * Math.sin(hClamped);
      const distSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestS = sec.sStart + dhClamped * R;
      }
    }
  }

  return {
    distance: Math.sqrt(bestDistSq),
    s: bestS,
  };
}

export const CourseGeometry = {
  sample,
  totalLength,
  distToCentreline,
  sectionAt,
  sections: BUILT_SECTIONS,
};
