import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useGameStore } from './store/useGameStore';

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
  const ambientTimer = useRef(null);

  const synthPadRef = useRef({
    oscillators: [],
    gains: [],
    filter: null,
    lfo: null,
    lfoGain: null,
    masterGain: null,
    active: false,
    timer: null
  });

  const stopSynthPad = () => {
    const pad = synthPadRef.current;
    if (!pad.active || !audioContext.current) return;

    try {
      const now = audioContext.current.currentTime;
      if (pad.masterGain) {
        pad.masterGain.gain.cancelScheduledValues(now);
        pad.masterGain.gain.setValueAtTime(pad.masterGain.gain.value, now);
        pad.masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      }

      if (pad.timer) {
        clearInterval(pad.timer);
        pad.timer = null;
      }

      const oscsToStop = [...pad.oscillators, pad.lfo].filter(Boolean);
      const masterToDisconnect = pad.masterGain;

      setTimeout(() => {
        oscsToStop.forEach(osc => {
          try { osc.stop(); } catch(e) {}
          try { osc.disconnect(); } catch(e) {}
        });
        
        try { pad.lfoGain.disconnect(); } catch(e) {}
        try { pad.filter.disconnect(); } catch(e) {}
        try { masterToDisconnect.disconnect(); } catch(e) {}
      }, 1600);
    } catch (e) {
      console.warn('Error stopping synth pad:', e);
    }

    pad.oscillators = [];
    pad.gains = [];
    pad.filter = null;
    pad.lfo = null;
    pad.lfoGain = null;
    pad.masterGain = null;
    pad.active = false;
  };

  const startSynthPad = () => {
    if (!musicEnabled || !audioContext.current) return;

    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }

    const pad = synthPadRef.current;
    if (pad.active) return;

    try {
      const now = audioContext.current.currentTime;

      // 1. Create nodes
      pad.masterGain = audioContext.current.createGain();
      pad.masterGain.gain.setValueAtTime(0, now);
      pad.masterGain.gain.linearRampToValueAtTime(0.22 * volume, now + 2.0);

      pad.filter = audioContext.current.createBiquadFilter();
      pad.filter.type = 'lowpass';
      pad.filter.frequency.setValueAtTime(750, now);
      pad.filter.Q.setValueAtTime(5.0, now);

      pad.lfo = audioContext.current.createOscillator();
      pad.lfo.type = 'sine';
      pad.lfo.frequency.setValueAtTime(0.08, now);

      pad.lfoGain = audioContext.current.createGain();
      pad.lfoGain.gain.setValueAtTime(320, now);

      // 2. Connect LFO to Filter
      pad.lfo.connect(pad.lfoGain);
      pad.lfoGain.connect(pad.filter.frequency);

      // 3. Create 4 voice oscillators
      const dayChords = [
        [220.00, 329.63, 493.88, 739.99],
        [261.63, 392.00, 587.33, 880.00]
      ];
      const nightChords = [
        [146.83, 220.00, 329.63, 349.23],
        [164.81, 246.94, 369.99, 392.00]
      ];
      const bossChords = [
        [130.81, 164.81, 207.65, 261.63],
        [146.83, 185.00, 233.08, 293.66]
      ];

      const isBoss = useGameStore.getState().bossActive;
      const isDay = useGameStore.getState().isDay;
      const currentProg = isBoss ? bossChords : (isDay ? dayChords : nightChords);
      const startingChord = currentProg[0];

      for (let i = 0; i < 4; i++) {
        const osc = audioContext.current.createOscillator();
        osc.type = (i % 2 === 0) ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(startingChord[i], now);

        const vGain = audioContext.current.createGain();
        const baseVolume = (osc.type === 'sawtooth') ? 0.06 : 0.12;
        vGain.gain.setValueAtTime(baseVolume, now);

        osc.connect(vGain);
        vGain.connect(pad.filter);

        pad.oscillators.push(osc);
        pad.gains.push(vGain);
      }

      pad.filter.connect(pad.masterGain);
      pad.masterGain.connect(audioContext.current.destination);

      pad.lfo.start(now);
      pad.oscillators.forEach(osc => osc.start(now));
      pad.active = true;

      // 4. Step-Scheduler loop
      let step = 0;
      pad.timer = setInterval(() => {
        if (!audioContext.current) return;
        step++;

        const freshState = useGameStore.getState();
        const loopBoss = freshState.bossActive;
        const loopDay = freshState.isDay;
        const prog = loopBoss ? bossChords : (loopDay ? dayChords : nightChords);
        const nextChord = prog[step % prog.length];
        
        const changeTime = audioContext.current.currentTime;
        nextChord.forEach((freq, idx) => {
          if (pad.oscillators[idx]) {
            pad.oscillators[idx].frequency.cancelScheduledValues(changeTime);
            pad.oscillators[idx].frequency.setValueAtTime(pad.oscillators[idx].frequency.value, changeTime);
            pad.oscillators[idx].frequency.exponentialRampToValueAtTime(freq, changeTime + 3.5);
          }
        });
      }, 8000);

    } catch (e) {
      console.warn('Error starting synth pad:', e);
    }
  };

  useEffect(() => {
    if (musicEnabled) {
      if (audioContext.current) startSynthPad();
    } else {
      stopSynthPad();
      if (ambientTimer.current) clearTimeout(ambientTimer.current);
    }
  }, [musicEnabled]);

  useEffect(() => {
    if (synthPadRef.current.masterGain && synthPadRef.current.active && audioContext.current) {
      const now = audioContext.current.currentTime;
      synthPadRef.current.masterGain.gain.cancelScheduledValues(now);
      synthPadRef.current.masterGain.gain.setValueAtTime(synthPadRef.current.masterGain.gain.value, now);
      synthPadRef.current.masterGain.gain.linearRampToValueAtTime(0.22 * volume, now + 0.5);
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      stopSynthPad();
      if (ambientTimer.current) clearTimeout(ambientTimer.current);
    };
  }, []);

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

    // NEW: Enhanced magic system sounds
    sounds.current.magicCast = generateMagicCastSound();
    sounds.current.magicHit = generateMagicHitSound();
    sounds.current.magicExplosion = generateMagicExplosionSound();
    sounds.current.magicCharge = generateMagicChargeSound();
    sounds.current.levelUp = generateLevelUpSound();
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

  // Enhanced magic system sounds
  const generateMagicCastSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.6;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq1 = 440 + Math.sin(t * 30) * 150;
      const freq2 = 880 + Math.cos(t * 25) * 200;
      const freq3 = 220 + Math.sin(t * 40) * 100;

      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t) * 0.5;
      const sample3 = Math.sin(2 * Math.PI * freq3 * t) * 0.3;

      const envelope = Math.sin(Math.PI * t / duration) * Math.exp(-t * 1.5);
      channelData[i] = (sample1 + sample2 + sample3) * envelope * 0.15;
    }

    return buffer;
  };

  const generateMagicHitSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.3;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const freq = 300 + Math.sin(t * 50) * 200;
      const tone = Math.sin(2 * Math.PI * freq * t);

      const envelope = Math.exp(-t * 8);
      channelData[i] = (noise * 0.4 + tone * 0.6) * envelope * 0.3;
    }

    return buffer;
  };

  const generateMagicExplosionSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 1.0;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() - 0.5) * 2;
      const freq = 100 - t * 80; // Descending boom
      const tone = Math.sin(2 * Math.PI * freq * t);

      const envelope = Math.exp(-t * 3);
      channelData[i] = (noise * 0.7 + tone * 0.3) * envelope * 0.4;
    }

    return buffer;
  };

  const generateMagicChargeSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.8;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const freq = 200 + t * 400; // Rising charge sound
      const sample = Math.sin(2 * Math.PI * freq * t);

      const envelope = t / duration * Math.exp(-t * 0.5);
      channelData[i] = sample * envelope * 0.2;
    }

    return buffer;
  };

  const generateLevelUpSound = () => {
    if (!audioContext.current) return null;

    const sampleRate = audioContext.current.sampleRate;
    const duration = 1.5;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;

      // Triumphant chord progression
      const freq1 = 440; // A
      const freq2 = 554.37; // C#
      const freq3 = 659.25; // E
      const freq4 = 880; // A octave

      const sample1 = Math.sin(2 * Math.PI * freq1 * t);
      const sample2 = Math.sin(2 * Math.PI * freq2 * t);
      const sample3 = Math.sin(2 * Math.PI * freq3 * t);
      const sample4 = Math.sin(2 * Math.PI * freq4 * t) * 0.5;

      const envelope = Math.sin(Math.PI * t / duration) * Math.exp(-t * 0.8);
      channelData[i] = (sample1 + sample2 + sample3 + sample4) * envelope * 0.1;
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
    startSynthPad();
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
    playTone,
    audioContext: audioContext.current,
    sounds: sounds.current
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
};

// Sound effect hooks for different actions
export const useGameSounds = () => {
  const { playSound, playSpatialSound } = useSounds();
  const spatialTrigger = useGameStore(state => state.playSpatialSound);

  return {
    playBlockPlace: (pos, type = 'grass') => {
      const rate = type === 'stone' || type === 'cobblestone' ? 0.7 : type === 'wood' ? 1.2 : 1;
      if (spatialTrigger && pos) spatialTrigger('blockPlace', pos, rate);
      else playSound('blockPlace', rate);
    },
    playBlockBreak: (pos, type = 'grass') => {
      const rate = type === 'stone' || type === 'cobblestone' ? 0.6 : type === 'wood' ? 1.3 : 0.9;
      if (spatialTrigger && pos) spatialTrigger('blockBreak', pos, rate);
      else playSound('blockBreak', rate);
    },
    playFootstep: (pos, type = 'grass') => {
      const rate = type === 'stone' || type === 'cobblestone' ? 0.8 : 1.1;
      if (spatialTrigger && pos) spatialTrigger('footstep', pos, rate, 5);
      else playSound('footstep', rate);
    },
    playJump: () => playSound('jump'),
    playPickup: () => playSound('pickup'),
    playCraft: () => playSound('craft'),
    playMagic: () => playSound('magic'),
    // Combat sounds
    playAttack: () => playSound('attack', 0.9 + Math.random() * 0.2),
    playSwing: () => playSound('swing', 0.8 + Math.random() * 0.4),
    playHit: () => playSound('hit', 0.9 + Math.random() * 0.2),
    playDefeat: () => playSound('defeat'),
    // Enhanced magic sounds
    playMagicCast: () => playSound('magicCast', 0.9 + Math.random() * 0.2),
    playMagicHit: () => playSound('magicHit', 0.8 + Math.random() * 0.4),
    playMagicExplosion: () => playSound('magicExplosion', 0.9 + Math.random() * 0.2),
    playMagicCharge: () => playSound('magicCharge'),
    playLevelUpSound: () => playSound('levelUp')
  };
};