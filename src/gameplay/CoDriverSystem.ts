import * as THREE from 'three';
import { RallyStageWorld } from '../world/RallyStageWorld';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';

export interface PaceNote {
  distance: number;
  severity: 1 | 2 | 3 | 4 | 5 | 6 | 'hairpin' | 'crest';
  direction: 'left' | 'right' | 'crest';
  calloutText: string;
  badgeColor: string;
}

/**
 * CoDriverSystem
 * Real-time rally co-driver with:
 * - Spline lookahead curvature & crest evaluation 60 - 90m ahead
 * - Animated HUD visual pace note banner (arrow, severity number, distance)
 * - Synthesized voice audio callouts 2.0 - 3.0s before corner entry
 */
export class CoDriverSystem {
  public hudElement!: HTMLElement;
  private iconElement!: HTMLElement;
  private textElement!: HTMLElement;
  private distElement!: HTMLElement;

  private currentNote: PaceNote | null = null;
  private lastSpokenText = '';
  private lastSpokenTime = 0;
  public speechEnabled = true;

  constructor(private rallyWorld: RallyStageWorld, private vehicle: CustomRallyVehicle) {
    this.hudElement = this.createHudElement();
    document.body.appendChild(this.hudElement);
  }

  private createHudElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'codriver-hud';
    container.style.position = 'fixed';
    container.style.top = '22px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.display = 'none';
    container.style.alignItems = 'center';
    container.style.gap = '14px';
    container.style.background = 'rgba(15, 23, 42, 0.88)';
    container.style.border = '2px solid rgba(255, 255, 255, 0.18)';
    container.style.borderRadius = '14px';
    container.style.padding = '8px 22px';
    container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    container.style.zIndex = '999';
    container.style.pointerEvents = 'none';
    container.style.fontFamily = 'monospace, sans-serif';
    container.style.backdropFilter = 'blur(8px)';
    container.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

    // Badge Icon (Arrow & Severity Number)
    this.iconElement = document.createElement('div');
    this.iconElement.style.width = '48px';
    this.iconElement.style.height = '48px';
    this.iconElement.style.borderRadius = '10px';
    this.iconElement.style.display = 'flex';
    this.iconElement.style.alignItems = 'center';
    this.iconElement.style.justifyContent = 'center';
    this.iconElement.style.fontSize = '28px';
    this.iconElement.style.fontWeight = '900';
    this.iconElement.style.color = '#ffffff';
    this.iconElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
    container.appendChild(this.iconElement);

    // Callout Text description
    const textContainer = document.createElement('div');
    textContainer.style.display = 'flex';
    textContainer.style.flexDirection = 'column';

    this.textElement = document.createElement('div');
    this.textElement.style.fontSize = '18px';
    this.textElement.style.fontWeight = 'bold';
    this.textElement.style.color = '#f8fafc';
    this.textElement.style.letterSpacing = '1px';
    textContainer.appendChild(this.textElement);

    this.distElement = document.createElement('div');
    this.distElement.style.fontSize = '13px';
    this.distElement.style.color = '#94a3b8';
    this.distElement.style.marginTop = '2px';
    textContainer.appendChild(this.distElement);

    container.appendChild(textContainer);
    return container;
  }

  public update(dt: number): void {
    if (!this.vehicle.chassisMesh || !this.vehicle.chassisBody) return;

    const carPos = this.vehicle.chassisMesh.position;
    const linvel = this.vehicle.chassisBody.linvel();
    const speedMs = Math.hypot(linvel.x, linvel.z);

    // Dynamic lookahead based on speed: ~2.5 seconds ahead (min 45m, max 100m)
    const lookaheadMeters = THREE.MathUtils.clamp(speedMs * 2.4, 45, 95);

    // Find nearest point along spline
    const currentU = this.getClosestSplineU(carPos);
    const targetU = (currentU + (lookaheadMeters / this.rallyWorld.totalLength)) % 1.0;

    // Evaluate curvature and crest at target
    const note = this.evaluatePaceNoteAt(targetU, currentU, lookaheadMeters);

    if (note) {
      this.currentNote = note;
      this.displayPaceNote(note, Math.round(lookaheadMeters));

      // Audio callout if new note and enough time elapsed
      const now = performance.now();
      if (note.calloutText !== this.lastSpokenText && (now - this.lastSpokenTime > 3200)) {
        this.speakPaceNote(note.calloutText);
        this.lastSpokenText = note.calloutText;
        this.lastSpokenTime = now;
      }
    } else {
      this.hidePaceNote();
    }
  }

  private evaluatePaceNoteAt(targetU: number, currentU: number, distAhead: number): PaceNote | null {
    const delta = 0.006;
    const uPrev = (targetU - delta + 1.0) % 1.0;
    const uNext = (targetU + delta) % 1.0;

    const ptPrev = this.rallyWorld.spline.getPointAt(uPrev);
    const ptMid = this.rallyWorld.spline.getPointAt(targetU);
    const ptNext = this.rallyWorld.spline.getPointAt(uNext);

    // Curvature in XZ plane
    const v1 = new THREE.Vector2(ptMid.x - ptPrev.x, ptMid.z - ptPrev.z).normalize();
    const v2 = new THREE.Vector2(ptNext.x - ptMid.x, ptNext.z - ptMid.z).normalize();
    const crossZ = v1.x * v2.y - v1.y * v2.x; // 2D cross product gives turning direction

    // Elevation crest check: peak height in middle
    const dy1 = ptMid.y - ptPrev.y;
    const dy2 = ptNext.y - ptMid.y;
    const d2y = dy2 - dy1;
    const isCrest = (d2y < -0.35 && ptMid.y > 4.0);

    const absTurn = Math.abs(crossZ);

    if (isCrest && absTurn < 0.06) {
      return {
        distance: distAhead,
        severity: 'crest',
        direction: 'crest',
        calloutText: 'Crest, flat out',
        badgeColor: '#0ea5e9',
      };
    }

    if (absTurn < 0.028) {
      return null; // Straightaway
    }

    const isLeft = crossZ > 0;
    const dirStr = isLeft ? 'Left' : 'Right';
    const arrowSymbol = isLeft ? '⮵' : '⮴';

    let severity: 1 | 2 | 3 | 4 | 5 | 6 | 'hairpin' = 6;
    let badgeColor = '#22c55e';
    let text = `${dirStr} 6`;

    if (absTurn > 0.22) {
      severity = 'hairpin';
      badgeColor = '#b91c1c';
      text = `Hairpin ${dirStr}`;
    } else if (absTurn > 0.16) {
      severity = 1;
      badgeColor = '#dc2626';
      text = `${dirStr} 1 tightens`;
    } else if (absTurn > 0.11) {
      severity = 2;
      badgeColor = '#ef4444';
      text = `${dirStr} 2`;
    } else if (absTurn > 0.075) {
      severity = 3;
      badgeColor = '#f97316';
      text = `${dirStr} 3`;
    } else if (absTurn > 0.048) {
      severity = 4;
      badgeColor = '#eab308';
      text = `${dirStr} 4`;
    } else if (absTurn > 0.035) {
      severity = 5;
      badgeColor = '#84cc16';
      text = `${dirStr} 5`;
    }

    return {
      distance: distAhead,
      severity,
      direction: isLeft ? 'left' : 'right',
      calloutText: isCrest ? `${text} over crest` : text,
      badgeColor,
    };
  }

  private displayPaceNote(note: PaceNote, distMeters: number): void {
    this.hudElement.style.display = 'flex';
    this.hudElement.style.opacity = '1';

    let iconText = '';
    if (note.severity === 'crest') {
      iconText = '▲';
    } else if (note.severity === 'hairpin') {
      iconText = note.direction === 'left' ? '⮌' : '⮎';
    } else {
      const arrow = note.direction === 'left' ? '←' : '→';
      iconText = `${arrow}${note.severity}`;
    }

    this.iconElement.textContent = iconText;
    this.iconElement.style.backgroundColor = note.badgeColor;

    this.textElement.textContent = note.calloutText.toUpperCase();
    this.distElement.textContent = `IN ${distMeters} METERS`;
  }

  private hidePaceNote(): void {
    this.hudElement.style.opacity = '0';
  }

  private speakPaceNote(text: string): void {
    if (!this.speechEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Cancel any lingering utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.25; // Crisp rally cadence
      utterance.pitch = 1.05;
      utterance.volume = 0.9;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David')));
      if (engVoice) {
        utterance.voice = engVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      // Ignore audio synthesis restriction
    }
  }

  private getClosestSplineU(pos: THREE.Vector3): number {
    const totalSamples = 160;
    let closestU = 0;
    let minDistSq = Infinity;

    for (let i = 0; i < totalSamples; i++) {
      const u = i / totalSamples;
      const pt = this.rallyWorld.spline.getPointAt(u);
      const dSq = (pos.x - pt.x) ** 2 + (pos.z - pt.z) ** 2;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestU = u;
      }
    }
    return closestU;
  }

  public reset(): void {
    this.lastSpokenText = '';
    this.lastSpokenTime = 0;
    this.hidePaceNote();
  }

  public dispose(): void {
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
  }
}
