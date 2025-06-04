import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const SoundContext = createContext();

export const useSounds = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSounds must be used within a SoundProvider');
  }
  return context;
};

export const SoundProvider = ({ children }) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [volume, setVolume] = useState(0.5);
  
  // Audio context for sound effects
  const audioContext = useRef(null);
  const sounds = useRef({});

  useEffect(() => {
    // Initialize Web Audio API
    try {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }

    // Generate procedural sounds
    generateSounds();
  }, []);

  const generateSounds = () => {
    if (!audioContext.current) return;

    // Generate block place sound
    sounds.current.blockPlace = generateTone(200, 0.1, 'square');
    sounds.current.blockBreak = generateTone(150, 0.15, 'sawtooth');
    sounds.current.footstep = generateNoise(0.05);
    sounds.current.jump = generateTone(300, 0.2, 'sine');
    sounds.current.pickup = generateTone(400, 0.1, 'sine');
    sounds.current.craft = generateTone(350, 0.3, 'triangle');
    sounds.current.magic = generateMagicSound();
    
    // NEW: Attack and combat sounds
    sounds.current.attack = generateAttackSound();
    sounds.current.hit = generateHitSound();
    sounds.current.defeat = generateDefeatSound();
    sounds.current.swing = generateSwingSound();
  };

  const generateTone = (frequency, duration, type = 'sine') => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      let sample = 0;

      switch (type) {
        case 'sine':
          sample = Math.sin(2 * Math.PI * frequency * t);
          break;
        case 'square':
          sample = Math.sin(2 * Math.PI * frequency * t) > 0 ? 1 : -1;
          break;
        case 'sawtooth':
          sample = 2 * (t * frequency - Math.floor(t * frequency + 0.5));
          break;
        case 'triangle':
          sample = 2 * Math.abs(2 * (t * frequency - Math.floor(t * frequency + 0.5))) - 1;
          break;
      }

      // Apply envelope
      const envelope = Math.exp(-t * 5);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
  };

  const generateNoise = (duration) => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const envelope = Math.exp(-i / frameCount * 10);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.1;
    }

    return buffer;
  };

  // NEW: Attack sound generation functions
  const generateAttackSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.2;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 180 + Math.sin(t * 50) * 30;
      const sample = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.exp(-t * 8);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
  };

  const generateHitSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.15;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const tone = Math.sin(2 * Math.PI * 120 * t);
      const envelope = Math.exp(-t * 12);
      channelData[i] = (noise * 0.7 + tone * 0.3) * envelope * 0.4;
    }

    return buffer;
  };

  const generateDefeatSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.8;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 200 - t * 150; // Descending frequency
      const sample = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.exp(-t * 2);
      channelData[i] = sample * envelope * 0.3;
    }

    return buffer;
  };

  const generateSwingSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 80 + t * 200; // Rising whoosh sound
      const noise = (Math.random() - 0.5) * 2;
      const tone = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.sin(Math.PI * t / duration);
      channelData[i] = (noise * 0.8 + tone * 0.2) * envelope * 0.2;
    }

    return buffer;
  };

  const generateMagicSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.5;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq1 = 440 + Math.sin(t * 20) * 100;
      const freq2 = 660 + Math.cos(t * 15) * 80;
      
      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t);
      
      const envelope = Math.exp(-t * 2);
      channelData[i] = (sample1 + sample2) * envelope * 0.2;
    }

    return buffer;
  };

  const playSound = (soundName, playbackRate = 1) => {
    if (!soundEnabled || !audioContext.current || !sounds.current[soundName]) return;

    try {
      const source = audioContext.current.createBufferSource();
      const gainNode = audioContext.current.createGain();
      
      source.buffer = sounds.current[soundName];
      source.playbackRate.value = playbackRate;
      gainNode.gain.value = volume;
      
      source.connect(gainNode);
      gainNode.connect(audioContext.current.destination);
      
      source.start();
    } catch (error) {
      console.warn('Error playing sound:', error);
    }
  };

  const playBackgroundMusic = () => {
    if (!musicEnabled || !audioContext.current) return;

    // Generate ambient background music
    const generateAmbientMusic = () => {
      const notes = [220, 246.94, 277.18, 329.63, 369.99, 415.30]; // A3 to G#4
      const duration = 2;
      
      setTimeout(() => {
        const randomNote = notes[Math.floor(Math.random() * notes.length)];
        const randomDuration = 1 + Math.random() * 2;
        playTone(randomNote, randomDuration, 0.1);
        
        if (musicEnabled) {
          generateAmbientMusic();
        }
      }, duration * 1000 + Math.random() * 3000);
    };

    generateAmbientMusic();
  };

  const playTone = (frequency, duration, volumeLevel = 0.3) => {
    if (!audioContext.current) return;

    try {
      const oscillator = audioContext.current.createOscillator();
      const gainNode = audioContext.current.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      
      gainNode.gain.setValueAtTime(0, audioContext.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(volumeLevel * volume, audioContext.current.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + duration);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.current.destination);
      
      oscillator.start();
      oscillator.stop(audioContext.current.currentTime + duration);
    } catch (error) {
      console.warn('Error playing tone:', error);
    }
  };

  const value = {
    soundEnabled,
    setSoundEnabled,
    musicEnabled,
    setMusicEnabled,
    volume,
    setVolume,
    playSound,
    playBackgroundMusic,
    playTone
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
};

// Sound effect hooks for different actions
export const useGameSounds = () => {
  const { playSound } = useSounds();

  return {
    playBlockPlace: () => playSound('blockPlace', 0.8 + Math.random() * 0.4),
    playBlockBreak: () => playSound('blockBreak', 0.8 + Math.random() * 0.4),
    playFootstep: () => playSound('footstep', 0.9 + Math.random() * 0.2),
    playJump: () => playSound('jump'),
    playPickup: () => playSound('pickup'),
    playCraft: () => playSound('craft'),
    playMagic: () => playSound('magic'),
    // NEW: Combat sounds
    playAttack: () => playSound('attack', 0.9 + Math.random() * 0.2),
    playSwing: () => playSound('swing', 0.8 + Math.random() * 0.4),
    playHit: () => playSound('hit', 0.9 + Math.random() * 0.2),
    playDefeat: () => playSound('defeat')
  };
};