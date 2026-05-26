// Centralized voicemail audio manager that works at the audio-element level
// Ensures only one voicemail can play at a time by directly controlling HTMLAudioElement instances

type PlaybackStateListener = (voicemailId: string, isPlaying: boolean) => void;

class VoicemailAudioManager {
  private audioRegistry: Map<string, HTMLAudioElement> = new Map();
  private currentPlayingId: string | null = null;
  private listeners: Set<PlaybackStateListener> = new Set();

  // Register an audio element with the manager
  registerAudio(voicemailId: string, audioElement: HTMLAudioElement): void {
    console.log('[VoicemailAudioManager] Registering audio element:', voicemailId);
    this.audioRegistry.set(voicemailId, audioElement);
  }

  // Unregister an audio element from the manager
  unregisterAudio(voicemailId: string): void {
    console.log('[VoicemailAudioManager] Unregistering audio element:', voicemailId);
    this.audioRegistry.delete(voicemailId);
    
    // Clear current playing if this was the active one
    if (this.currentPlayingId === voicemailId) {
      this.currentPlayingId = null;
    }
  }

  // Add a listener for playback state changes
  addListener(listener: PlaybackStateListener): void {
    this.listeners.add(listener);
  }

  // Remove a listener for playback state changes
  removeListener(listener: PlaybackStateListener): void {
    this.listeners.delete(listener);
  }

  // Notify all listeners of playback state changes
  private notifyListeners(voicemailId: string, isPlaying: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(voicemailId, isPlaying);
      } catch (error) {
        console.error('[VoicemailAudioManager] Error in playback state listener:', error);
      }
    });
  }

  // Pause all audio elements except the specified one
  private pauseAllExcept(voicemailId: string): void {
    console.log('[VoicemailAudioManager] Pausing all except:', voicemailId, 'currently playing:', this.currentPlayingId);
    
    // If there's a currently playing voicemail, pause it
    if (this.currentPlayingId && this.currentPlayingId !== voicemailId) {
      const currentAudio = this.audioRegistry.get(this.currentPlayingId);
      if (currentAudio) {
        console.log('[VoicemailAudioManager] Pausing current playing voicemail:', this.currentPlayingId);
        currentAudio.pause();
        this.notifyListeners(this.currentPlayingId, false);
      }
      this.currentPlayingId = null;
    }

    // Pause any other playing audio elements (defensive check)
    this.audioRegistry.forEach((audio, id) => {
      if (id !== voicemailId && !audio.paused) {
        console.log('[VoicemailAudioManager] Defensive pause of playing voicemail:', id);
        audio.pause();
        this.notifyListeners(id, false);
      }
    });
  }

  // Request to play a specific voicemail
  async requestPlay(voicemailId: string): Promise<boolean> {
    console.log('[VoicemailAudioManager] Requesting play for voicemail:', voicemailId);
    
    const audioElement = this.audioRegistry.get(voicemailId);
    if (!audioElement) {
      console.error('[VoicemailAudioManager] Audio element not found for voicemail:', voicemailId);
      return false;
    }

    // If this is already the playing voicemail, do nothing
    if (this.currentPlayingId === voicemailId && !audioElement.paused) {
      console.log('[VoicemailAudioManager] Voicemail already playing:', voicemailId);
      return true;
    }

    // Pause all other voicemails first
    this.pauseAllExcept(voicemailId);

    // Set this as the current playing voicemail
    this.currentPlayingId = voicemailId;

    try {
      // Play the requested audio element
      await audioElement.play();
      console.log('[VoicemailAudioManager] Successfully started playing:', voicemailId);
      this.notifyListeners(voicemailId, true);
      return true;
    } catch (error) {
      console.error('[VoicemailAudioManager] Failed to play voicemail:', voicemailId, error);
      this.currentPlayingId = null;
      this.notifyListeners(voicemailId, false);
      return false;
    }
  }

  // Request to pause a specific voicemail
  requestPause(voicemailId: string): void {
    console.log('[VoicemailAudioManager] Requesting pause for voicemail:', voicemailId);
    
    const audioElement = this.audioRegistry.get(voicemailId);
    if (!audioElement) {
      console.error('[VoicemailAudioManager] Audio element not found for voicemail:', voicemailId);
      return;
    }

    // Pause the audio element
    audioElement.pause();
    
    // Clear current playing if this was the active one
    if (this.currentPlayingId === voicemailId) {
      this.currentPlayingId = null;
      this.notifyListeners(voicemailId, false);
    }
  }

  // Get the currently playing voicemail ID
  getCurrentPlayingId(): string | null {
    return this.currentPlayingId;
  }

  // Check if a specific voicemail is currently playing
  isPlaying(voicemailId: string): boolean {
    if (this.currentPlayingId !== voicemailId) {
      return false;
    }

    const audioElement = this.audioRegistry.get(voicemailId);
    return audioElement ? !audioElement.paused : false;
  }

  // Get all registered voicemail IDs
  getRegisteredIds(): string[] {
    return Array.from(this.audioRegistry.keys());
  }

  // Get the audio element for a specific voicemail
  getAudioElement(voicemailId: string): HTMLAudioElement | undefined {
    return this.audioRegistry.get(voicemailId);
  }
}

// Create a singleton instance for global use
export const voicemailAudioManager = new VoicemailAudioManager();

// Export a hook for easy integration with React components
export function useVoicemailAudioManager() {
  return voicemailAudioManager;
}
