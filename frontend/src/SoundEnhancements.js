import React, { useEffect, useRef } from 'react';

// Enhanced Sound System with Level Up and Magic Sounds
export const useSoundEnhancements = () => {
  const audioContextRef = useRef(null);
  const soundsRef = useRef({});

  useEffect(() => {
    // Initialize Web Audio API
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported');
    }
  }, []);

  // Create sound with Web Audio API
  const createSound = (frequency, duration, type = 'sine', volume = 0.3) => {
    if (!audioContextRef.current) return;

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContextRef.current.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + duration);
    
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + duration);
  };

  // Level up sound effect
  const playLevelUpSound = () => {
    if (!audioContextRef.current) return;
    
    // Create triumphant level up sound
    const notes = [
      { freq: 523.25, time: 0, duration: 0.3 }, // C5
      { freq: 659.25, time: 0.2, duration: 0.3 }, // E5
      { freq: 783.99, time: 0.4, duration: 0.3 }, // G5
      { freq: 1046.5, time: 0.6, duration: 0.5 }  // C6
    ];
    
    notes.forEach(note => {
      setTimeout(() => {
        createSound(note.freq, note.duration, 'triangle', 0.4);
      }, note.time * 1000);
    });
    
    // Add harmonic
    setTimeout(() => {
      createSound(1046.5, 1.0, 'sine', 0.2);
    }, 800);
  };

  // Magic casting sounds
  const playMagicCastSound = (spellType = 'fire') => {
    if (!audioContextRef.current) return;
    
    const spellSounds = {
      fire: () => {
        // Crackling fire sound
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            createSound(200 + Math.random() * 300, 0.1, 'sawtooth', 0.3);
          }, i * 50);
        }
      },
      ice: () => {
        // Crystalline ice sound
        const notes = [800, 1000, 1200, 1400];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            createSound(freq, 0.3, 'triangle', 0.25);
          }, i * 100);
        });
      },
      lightning: () => {
        // Electric crackle
        createSound(2000, 0.05, 'square', 0.4);
        setTimeout(() => createSound(1500, 0.1, 'sawtooth', 0.3), 100);
        setTimeout(() => createSound(1000, 0.15, 'triangle', 0.2), 200);
      },
      arcane: () => {
        // Mysterious arcane sound
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            createSound(400 + i * 200, 0.4, 'sine', 0.2);
          }, i * 150);
        }
      }
    };
    
    if (spellSounds[spellType]) {
      spellSounds[spellType]();
    }
  };

  // Magic impact sounds
  const playMagicImpactSound = (spellType = 'fire') => {
    if (!audioContextRef.current) return;
    
    const impactSounds = {
      fire: () => {
        createSound(150, 0.3, 'sawtooth', 0.5);
        setTimeout(() => createSound(80, 0.4, 'square', 0.3), 100);
      },
      ice: () => {
        createSound(1200, 0.2, 'triangle', 0.4);
        setTimeout(() => createSound(600, 0.3, 'sine', 0.3), 100);
      },
      lightning: () => {
        createSound(2500, 0.1, 'square', 0.6);
        setTimeout(() => createSound(100, 0.3, 'sawtooth', 0.4), 50);
      },
      arcane: () => {
        createSound(500, 0.4, 'triangle', 0.4);
        setTimeout(() => createSound(750, 0.3, 'sine', 0.3), 200);
      }
    };
    
    if (impactSounds[spellType]) {
      impactSounds[spellType]();
    }
  };

  // Experience gain sound
  const playXPGainSound = (amount) => {
    if (!audioContextRef.current) return;
    
    // Higher pitch for more XP
    const baseFreq = 440 + (amount * 10);
    createSound(baseFreq, 0.2, 'triangle', 0.3);
    setTimeout(() => {
      createSound(baseFreq * 1.5, 0.1, 'sine', 0.2);
    }, 100);
  };

  // Wind sound for grass effects
  const playWindSound = () => {
    if (!audioContextRef.current) return;
    
    // Subtle wind whoosh
    createSound(60 + Math.random() * 40, 2.0, 'sawtooth', 0.1);
  };

  // Expose functions globally
  useEffect(() => {
    window.playLevelUpSound = playLevelUpSound;
    window.playMagicCastSound = playMagicCastSound;
    window.playMagicImpactSound = playMagicImpactSound;
    window.playXPGainSound = playXPGainSound;
    window.playWindSound = playWindSound;
  }, []);

  return {
    playLevelUpSound,
    playMagicCastSound,
    playMagicImpactSound,
    playXPGainSound,
    playWindSound
  };
};

// Performance monitoring for audio
export const AudioPerformanceMonitor = () => {
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const monitor = () => {
      frameCount++;
      const now = performance.now();
      
      if (now - lastTime > 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastTime));
        
        // Log performance if FPS drops below 45
        if (fps < 45) {
          console.warn(`Performance warning: ${fps} FPS`);
        }
        
        frameCount = 0;
        lastTime = now;
      }
      
      requestAnimationFrame(monitor);
    };
    
    monitor();
  }, []);

  return null;
};

export default useSoundEnhancements;
