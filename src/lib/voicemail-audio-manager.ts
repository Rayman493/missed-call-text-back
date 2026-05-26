// Centralized voicemail audio manager that works at the audio-element level
// Ensures only one voicemail can play at a time by directly controlling HTMLAudioElement instances

type PlaybackStateListener = (voicemailId: string, isPlaying: boolean) => void;

class VoicemailAudioManager {
  private audioRegistry: Map<string, HTMLAudioElement> = new Map();
  private currentPlayingId: string | null = null;
  private listeners: Set<PlaybackStateListener> = new Set();

  // Register an audio element with the manager
  registerAudio(voicemailId: string, audioElement: HTMLAudioElement): void {
    console.log('[VoicemailAudioManager] Registering audio element:', voicemailId, 'element:', audioElement);
    
    // Check for duplicate registration
    const existingAudio = this.audioRegistry.get(voicemailId);
    if (existingAudio && existingAudio !== audioElement) {
      console.warn('[VoicemailAudioManager] DUPLICATE DETECTED - Cleaning up stale audio element for:', voicemailId, 'existing:', existingAudio, 'new:', audioElement);
      
      // Clean up the stale audio element before replacing
      try {
        existingAudio.pause();
        this.notifyListeners(voicemailId, false);
        
        // Remove src if it's a stale duplicate
        if (existingAudio.src && existingAudio.src.startsWith('blob:')) {
          console.log('[VoicemailAudioManager] Revoking stale blob URL for:', voicemailId);
          URL.revokeObjectURL(existingAudio.src);
          existingAudio.src = '';
        }
        
        // Clear any event listeners by cloning the node
        const clone = existingAudio.cloneNode(false) as HTMLAudioElement;
        existingAudio.parentNode?.replaceChild(clone, existingAudio);
        
        console.log('[VoicemailAudioManager] Cleaned up stale duplicate audio element for:', voicemailId);
      } catch (error) {
        console.error('[VoicemailAudioManager] Error cleaning up duplicate audio element:', error);
      }
    } else if (existingAudio === audioElement) {
      console.log('[VoicemailAudioManager] Audio element already registered for:', voicemailId, 'skipping duplicate');
      return;
    }
    
    this.audioRegistry.set(voicemailId, audioElement);
    console.log('[VoicemailAudioManager] Audio element registered successfully:', voicemailId, 'total registered:', this.audioRegistry.size);
  }

  // Unregister an audio element from the manager
  unregisterAudio(voicemailId: string): void {
    console.log('[VoicemailAudioManager] Unregistering audio element:', voicemailId);
    
    const audioElement = this.audioRegistry.get(voicemailId);
    if (audioElement) {
      // Pause the audio element before unregistering
      try {
        if (!audioElement.paused) {
          console.log('[VoicemailAudioManager] Pausing audio element before unregister:', voicemailId);
          audioElement.pause();
          this.notifyListeners(voicemailId, false);
        }
      } catch (error) {
        console.error('[VoicemailAudioManager] Error pausing audio element during unregister:', error);
      }
    }
    
    this.audioRegistry.delete(voicemailId);
    console.log('[VoicemailAudioManager] Audio element unregistered:', voicemailId, 'remaining registered:', this.audioRegistry.size);
    
    // Clear current playing if this was the active one
    if (this.currentPlayingId === voicemailId) {
      console.log('[VoicemailAudioManager] Clearing current playing ID:', voicemailId);
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
    console.log('[VoicemailAudioManager] Pausing all except:', voicemailId, 'currently playing:', this.currentPlayingId, 'total registered:', this.audioRegistry.size);
    
    let pausedCount = 0;
    
    // First, pause the currently playing voicemail if different
    if (this.currentPlayingId && this.currentPlayingId !== voicemailId) {
      const currentAudio = this.audioRegistry.get(this.currentPlayingId);
      if (currentAudio) {
        console.log('[VoicemailAudioManager] Pausing current playing voicemail:', this.currentPlayingId);
        try {
          currentAudio.pause();
          this.notifyListeners(this.currentPlayingId, false);
          pausedCount++;
        } catch (error) {
          console.error('[VoicemailAudioManager] Error pausing current playing voicemail:', this.currentPlayingId, error);
        }
      }
      this.currentPlayingId = null;
    }

    // Then, pause any other playing audio elements (defensive check)
    this.audioRegistry.forEach((audio, id) => {
      if (id !== voicemailId) {
        try {
          if (!audio.paused) {
            console.log('[VoicemailAudioManager] Defensive pause of playing voicemail:', id);
            audio.pause();
            this.notifyListeners(id, false);
            pausedCount++;
          }
        } catch (error) {
          console.error('[VoicemailAudioManager] Error in defensive pause of voicemail:', id, error);
        }
      }
    });

    // DOM-level safety fallback: pause any other audio elements in the DOM
    const allAudioElements = document.querySelectorAll('audio');
    console.log('[VoicemailAudioManager] DOM safety fallback: found', allAudioElements.length, 'audio elements in DOM');
    
    allAudioElements.forEach((audioElement) => {
      const htmlAudio = audioElement as HTMLAudioElement;
      const elementVoicemailId = htmlAudio.dataset.voicemailId;
      
      if (elementVoicemailId && elementVoicemailId !== voicemailId) {
        try {
          if (!htmlAudio.paused) {
            console.log('[VoicemailAudioManager] DOM safety fallback: pausing voicemail:', elementVoicemailId);
            htmlAudio.pause();
            pausedCount++;
          }
        } catch (error) {
          console.error('[VoicemailAudioManager] Error in DOM safety fallback pause:', elementVoicemailId, error);
        }
      }
    });
    
    console.log('[VoicemailAudioManager] Total paused', pausedCount, 'audio elements, keeping:', voicemailId);
  }

  // Request to play a specific voicemail
  async requestPlay(voicemailId: string): Promise<boolean> {
    console.log('[VOICEMAIL DEBUG] requestPlay called for voicemail:', voicemailId);
    
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

  // Pause all audio elements (for cleanup when leaving page)
  pauseAll(): void {
    console.log('[VoicemailAudioManager] Pausing all audio elements for cleanup, total:', this.audioRegistry.size);
    
    let pausedCount = 0;
    this.audioRegistry.forEach((audio, id) => {
      try {
        if (!audio.paused) {
          console.log('[VoicemailAudioManager] Cleanup pause of voicemail:', id);
          audio.pause();
          this.notifyListeners(id, false);
          pausedCount++;
        }
      } catch (error) {
        console.error('[VoicemailAudioManager] Error in cleanup pause of voicemail:', id, error);
      }
    });
    
    this.currentPlayingId = null;
    console.log('[VoicemailAudioManager] Cleanup completed, paused', pausedCount, 'audio elements');
  }

  // Get debug information
  getDebugInfo(): { [key: string]: any } {
    return {
      currentPlayingId: this.currentPlayingId,
      registeredCount: this.audioRegistry.size,
      registeredIds: Array.from(this.audioRegistry.keys()),
      listenerCount: this.listeners.size,
      playingStates: Array.from(this.audioRegistry.entries()).map(([id, audio]) => ({
        id,
        paused: audio.paused,
        currentTime: audio.currentTime,
        duration: audio.duration
      }))
    };
  }
}

// Create a singleton instance for global use
export const voicemailAudioManager = new VoicemailAudioManager();

// Export a hook for easy integration with React components
export function useVoicemailAudioManager() {
  return voicemailAudioManager;
}
