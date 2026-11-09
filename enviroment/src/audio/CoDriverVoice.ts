/**
 * Real-Time Synthesized Co-Driver Voice Announcer for Apex Rally.
 * Uses the Web Speech API to vocalize rally pace-notes in real time with
 * authentic rapid cadence and urgent inflection.
 */
export class CoDriverVoice {
  private isEnabled = true;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.initVoice();
  }

  private initVoice(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Look for crisp English voices (e.g. UK / US)
      this.voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Male') || v.name.includes('David') || v.name.includes('Google'))) 
        || voices.find(v => v.lang.startsWith('en')) 
        || null;
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Speaks a pace-note urgently with rally cadence
   */
  public speakPaceNote(noteText: string): void {
    if (!this.isEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Cancel any previous utterance to avoid lag
    window.speechSynthesis.cancel();

    // Clean up exclamation marks and shorthand
    const utterance = new SpeechSynthesisUtterance(noteText);
    if (this.voice) {
      utterance.voice = this.voice;
    }

    utterance.rate = 1.25; // Rapid rally co-driver tempo
    utterance.pitch = 1.05; // Slightly elevated alert pitch
    utterance.volume = 0.85;

    window.speechSynthesis.speak(utterance);
  }

  public toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return this.isEnabled;
  }
}

