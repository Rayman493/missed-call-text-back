// Shared volume manager for consistent audio volume across all audio players
// Uses sessionStorage for session-scoped persistence

const VOLUME_STORAGE_KEY = 'replyflow-audio-volume';

class VolumeManager {
  private static instance: VolumeManager;
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private previousVolume: number = 1.0;
  private listeners: Set<(volume: number, isMuted: boolean) => void> = new Set();
  private registeredAudioElements: Set<HTMLAudioElement> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): VolumeManager {
    if (!VolumeManager.instance) {
      VolumeManager.instance = new VolumeManager();
    }
    return VolumeManager.instance;
  }

  private loadFromStorage(): void {
    try {
      if (typeof window !== 'undefined') {
        const saved = sessionStorage.getItem(VOLUME_STORAGE_KEY);
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.volume = parsed;
            this.previousVolume = parsed;
          }
        }
      }
    } catch (error) {
      console.error('[VolumeManager] Error loading volume from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(VOLUME_STORAGE_KEY, this.volume.toString());
      }
    } catch (error) {
      console.error('[VolumeManager] Error saving volume to storage:', error);
    }
  }

  getVolume(): number {
    return this.isMuted ? 0 : this.volume;
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  setVolume(newVolume: number): void {
    const clamped = Math.max(0, Math.min(1, newVolume));
    this.volume = clamped;
    this.previousVolume = clamped;
    this.isMuted = clamped === 0;
    this.saveToStorage();
    this.applyToAllRegisteredElements();
    this.notifyListeners();
  }

  toggleMute(): void {
    if (this.isMuted) {
      // Unmute - restore previous volume
      this.isMuted = false;
      this.volume = this.previousVolume > 0 ? this.previousVolume : 1.0;
    } else {
      // Mute - save current volume and set to 0
      this.previousVolume = this.volume;
      this.isMuted = true;
    }
    this.saveToStorage();
    this.applyToAllRegisteredElements();
    this.notifyListeners();
  }

  registerAudioElement(audio: HTMLAudioElement): void {
    this.registeredAudioElements.add(audio);
    // Apply current volume immediately on registration
    this.applyToAudioElement(audio);
  }

  unregisterAudioElement(audio: HTMLAudioElement): void {
    this.registeredAudioElements.delete(audio);
  }

  private applyToAllRegisteredElements(): void {
    this.registeredAudioElements.forEach(audio => {
      this.applyToAudioElement(audio);
    });
  }

  applyToAudioElement(audio: HTMLAudioElement): void {
    if (audio) {
      audio.volume = this.getVolume();
      audio.muted = this.isMuted;
    }
  }

  addListener(listener: (volume: number, isMuted: boolean) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (volume: number, isMuted: boolean) => void): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getVolume(), this.isMuted);
      } catch (error) {
        console.error('[VolumeManager] Error in listener:', error);
      }
    });
  }
}

// Export singleton instance
export const volumeManager = VolumeManager.getInstance();

// Export hook for React components
export function useVolumeManager() {
  return volumeManager;
}
