import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { VOICES, makeNoise } from './audio/synthVoices';
import { DAY_CHORDS, NIGHT_CHORDS, BOSS_CHORDS, arpeggiatorBpm } from './audio/musicTheory';
import { useGameStore } from './store/useGameStore';
import { surfaceBlockAt } from './world/climate.js';
import { biomeAmbience } from './audio/biomeAmbience.js';

// Ambient chord progressions for mood adjustments

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

  // Subscribe reactively to hostile counts and boss state for dynamic soundtrack scaling
  const activeHostiles = useGameStore(state => state.activeHostilesCount) || 0;
  const bossActive = useGameStore(state => state.bossActive) || false;

  const arpeggiatorRef = useRef({
    timer: null,
    nextNoteTime: 0.0,
    noteIndex: 0,
    masterGain: null,
    active: false,
    fadeTimer: null
  });

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

  // Biome-ambient wind bed: a looping noise voice whose filter/gain track the player's biome
  // (climate.surfaceBlockAt(playerPosition) -> biomeAmbience). Lives + dies with the synthPad.
  const windBedRef = useRef({ source: null, filter: null, gain: null, active: false });

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

      // Fade the biome-ambient wind bed out with the pad (disconnected in the setTimeout below).
      const wb = windBedRef.current;
      if (wb.active && wb.gain) {
        wb.gain.gain.cancelScheduledValues(now);
        wb.gain.gain.setValueAtTime(wb.gain.gain.value, now);
        wb.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
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
        try { if (wb.source) { wb.source.stop(); wb.source.disconnect(); } } catch(e) {}
        try { wb.filter && wb.filter.disconnect(); } catch(e) {}
        try { wb.gain && wb.gain.disconnect(); } catch(e) {}
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
    windBedRef.current = { source: null, filter: null, gain: null, active: false };
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

      // 3. Create 4 voice oscillators referencing global mood chords
      const isBoss = useGameStore.getState().bossActive;
      const isDay = useGameStore.getState().isDay;
      const currentProg = isBoss ? BOSS_CHORDS : (isDay ? DAY_CHORDS : NIGHT_CHORDS);
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

      // Biome-ambient wind bed: a looping noise voice; its filter/gain track the player's biome
      // (ramped in the step loop below). A subtle under-layer beneath the music.
      const wb = windBedRef.current;
      const noiseBuf = makeNoise(audioContext.current, 2.0);
      wb.source = audioContext.current.createBufferSource();
      wb.source.buffer = noiseBuf; wb.source.loop = true;
      wb.filter = audioContext.current.createBiquadFilter();
      wb.filter.type = 'bandpass'; wb.filter.frequency.setValueAtTime(900, now); wb.filter.Q.setValueAtTime(0.7, now);
      wb.gain = audioContext.current.createGain(); wb.gain.gain.setValueAtTime(0, now);
      wb.source.connect(wb.filter); wb.filter.connect(wb.gain); wb.gain.connect(audioContext.current.destination);
      wb.source.start(now); wb.active = true;

      // 4. Step-Scheduler loop
      let step = 0;
      pad.timer = setInterval(() => {
        if (!audioContext.current) return;
        step++;

        const freshState = useGameStore.getState();
        const loopBoss = freshState.bossActive;
        const loopDay = freshState.isDay;
        const prog = loopBoss ? BOSS_CHORDS : (loopDay ? DAY_CHORDS : NIGHT_CHORDS);
        const nextChord = prog[step % prog.length];
        
        const changeTime = audioContext.current.currentTime;
        nextChord.forEach((freq, idx) => {
          if (pad.oscillators[idx]) {
            pad.oscillators[idx].frequency.cancelScheduledValues(changeTime);
            pad.oscillators[idx].frequency.setValueAtTime(pad.oscillators[idx].frequency.value, changeTime);
            pad.oscillators[idx].frequency.exponentialRampToValueAtTime(freq, changeTime + 3.5);
          }
        });

        // Biome-ambient: ramp the wind bed toward the player's current-biome character.
        const wb2 = windBedRef.current;
        if (wb2.active && wb2.filter) {
          const pp = freshState.playerPosition || { x: 0, z: 0 };
          const { surfaceBlock, isWater } = surfaceBlockAt(pp.x, pp.z);
          const amb = biomeAmbience(surfaceBlock, isWater);
          wb2.filter.frequency.linearRampToValueAtTime(amb.cutoff, changeTime + 2.0);
          wb2.gain.gain.linearRampToValueAtTime(amb.gain * volume, changeTime + 2.0);
        }
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

  const getArpeggiatorBpm = () => {
    const s = useGameStore.getState();
    return arpeggiatorBpm(s.bossActive, s.activeHostilesCount || 0);
  };

  const stopArpeggiator = () => {
    const arp = arpeggiatorRef.current;
    if (!arp.active) return;
    
    if (arp.timer) {
      clearInterval(arp.timer);
      arp.timer = null;
    }
    
    if (arp.masterGain && audioContext.current) {
      try {
        const now = audioContext.current.currentTime;
        arp.masterGain.gain.cancelScheduledValues(now);
        arp.masterGain.gain.setValueAtTime(arp.masterGain.gain.value, now);
        arp.masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      } catch (e) {}
    }
    
    arp.active = false;
  };

  const startArpeggiator = () => {
    if (!musicEnabled || !audioContext.current) return;

    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }

    const arp = arpeggiatorRef.current;
    if (arp.active) return;

    try {
      const now = audioContext.current.currentTime;
      if (!arp.masterGain) {
        arp.masterGain = audioContext.current.createGain();
        arp.masterGain.connect(audioContext.current.destination);
      }
      arp.masterGain.gain.cancelScheduledValues(now);
      arp.masterGain.gain.setValueAtTime(0, now);
      arp.masterGain.gain.linearRampToValueAtTime(0.75 * volume, now + 1.2);

      arp.nextNoteTime = now + 0.05;
      arp.noteIndex = 0;
      arp.active = true;

      // Ahead-of-time scheduler tick loop (checks note queue every 25ms)
      arp.timer = setInterval(() => {
        if (!audioContext.current || !arp.active) return;

        const currentBpm = getArpeggiatorBpm();
        const secondsPerBeat = 60.0 / currentBpm;
        const stepDuration = secondsPerBeat / 4; // 16th notes progression

        const scheduleAheadTime = 0.1; // schedule 100ms in advance
        const ctxTime = audioContext.current.currentTime;

        while (arp.nextNoteTime < ctxTime + scheduleAheadTime) {
          const playTime = arp.nextNoteTime;
          
          const isBoss = useGameStore.getState().bossActive;
          const isDay = useGameStore.getState().isDay;
          const currentProg = isBoss ? BOSS_CHORDS : (isDay ? DAY_CHORDS : NIGHT_CHORDS);
          
          // Rotate chord divisions every 16 steps
          const chordIndex = Math.floor(arp.noteIndex / 16) % currentProg.length;
          const chord = currentProg[chordIndex] || currentProg[0];
          
          // Evolving 16th pluck patterns representing dynamic danger
          const pattern = [0, 2, 1, 3, 2, 1, 3, 1];
          const noteFreq = chord[pattern[arp.noteIndex % pattern.length]];

          // Tri-oscillator synthesised plucked timbre
          const osc = audioContext.current.createOscillator();
          const noteGain = audioContext.current.createGain();
          const filter = audioContext.current.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(noteFreq, playTime);

          noteGain.gain.setValueAtTime(0, playTime);
          noteGain.gain.linearRampToValueAtTime(0.24, playTime + 0.005);
          noteGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.16);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(900 + (Math.sin(arp.noteIndex * 0.5) * 200), playTime);
          filter.frequency.exponentialRampToValueAtTime(280, playTime + 0.14);
          filter.Q.setValueAtTime(4.0, playTime);

          osc.connect(filter);
          filter.connect(noteGain);
          noteGain.connect(arp.masterGain);

          osc.start(playTime);
          osc.stop(playTime + 0.28);

          const cachedOsc = osc;
          const cachedFilter = filter;
          const cachedGain = noteGain;
          setTimeout(() => {
            try {
              cachedOsc.disconnect();
              cachedFilter.disconnect();
              cachedGain.disconnect();
            } catch(e) {}
          }, 400);

          arp.nextNoteTime += stepDuration;
          arp.noteIndex = (arp.noteIndex + 1) % 64;
        }
      }, 25);
    } catch(e) {
      console.warn('Error starting arpeggiator:', e);
    }
  };

  // Dynamic arpeggiator scaling hook reacting to hostile tally
  useEffect(() => {
    if (!audioContext.current) return;

    if (musicEnabled && (activeHostiles > 0 || bossActive)) {
      if (arpeggiatorRef.current.fadeTimer) {
        clearTimeout(arpeggiatorRef.current.fadeTimer);
        arpeggiatorRef.current.fadeTimer = null;
      }
      
      if (!arpeggiatorRef.current.active) {
        startArpeggiator();
      } else {
        try {
          const now = audioContext.current.currentTime;
          arpeggiatorRef.current.masterGain.gain.cancelScheduledValues(now);
          arpeggiatorRef.current.masterGain.gain.setValueAtTime(arpeggiatorRef.current.masterGain.gain.value, now);
          arpeggiatorRef.current.masterGain.gain.linearRampToValueAtTime(0.75 * volume, now + 0.5);
        } catch(e) {}
      }
    } else {
      if (arpeggiatorRef.current.active && arpeggiatorRef.current.masterGain) {
        try {
          const now = audioContext.current.currentTime;
          arpeggiatorRef.current.masterGain.gain.cancelScheduledValues(now);
          arpeggiatorRef.current.masterGain.gain.setValueAtTime(arpeggiatorRef.current.masterGain.gain.value, now);
          arpeggiatorRef.current.masterGain.gain.linearRampToValueAtTime(0.0, now + 1.8);
          
          if (arpeggiatorRef.current.fadeTimer) {
            clearTimeout(arpeggiatorRef.current.fadeTimer);
          }
          
          arpeggiatorRef.current.fadeTimer = setTimeout(() => {
            stopArpeggiator();
          }, 2000);
        } catch(e) {
          stopArpeggiator();
        }
      }
    }
  }, [activeHostiles, bossActive, musicEnabled, volume]);

  useEffect(() => {
    return () => {
      stopSynthPad();
      stopArpeggiator();
      if (ambientTimer.current) clearTimeout(ambientTimer.current);
      if (arpeggiatorRef.current.fadeTimer) clearTimeout(arpeggiatorRef.current.fadeTimer);
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
    // S3-M1: the voice bank lives in audio/synthVoices.js — one registry, one loop.
    for (const [name, make] of Object.entries(VOICES)) {
      sounds.current[name] = make(audioContext.current);
    }
  };



  // NEW: Attack sound generation functions
  // ===== Aspect verb SFX (the 2026-06-10 audio design doc; ALL-SYNTH policy #74) =====
  // WILDHEART roar — OWED since B1 shipped audio-silent: low saw sweep + beating growl + noise + sub.

  // VOIDHAND grab — rising triangle chirp + the WHOLE-TONE shimmer partials (the Aspect motif stinger).

  // HURL launch — a filtered-noise whoosh sweeping down (mass leaving the hand).

  // SLAM — the heavy verb: click transient + 90Hz thump + sub drop (pairs with the camera kick).

  // ANVIL HIT — the gold 3x moment: a bright metallic FM ping over the impact.

  // SOULBIND bind — the grab-chirp's resolved sibling: two whole-tone steps that LAND (binding completes).

  // ELEMANCER (S2-B4-M6): the four element voices — each zone kind speaks at its spawn
  // moment. All-synth (#74); the bridge plays them spatially at the zone position.










  // Enhanced magic system sounds





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
    playHeartbeat: () => playSound('heartbeat'), // low-health danger pulse (HeartbeatAudio)
    // Combat sounds
    playAttack: () => playSound('attack', 0.9 + Math.random() * 0.2),
    playSwing: () => playSound('swing', 0.8 + Math.random() * 0.4),
    playHit: () => playSound('hit', 0.9 + Math.random() * 0.2),
    playDefeat: () => playSound('defeat'),
    // Enhanced magic sounds
    playMagicCast: () => playSound('magicCast', 0.9 + Math.random() * 0.2),
    playMagicHit: () => playSound('magicHit', 0.8 + Math.random() * 0.4),
    // Aspect verb SFX (spatial when a position is known; frame-loop call sites use the
    // store-registered playSpatialSound directly with these registry names)
    playRoar: (pos) => { if (spatialTrigger && pos) spatialTrigger('roar', pos, 1, 30); else playSound('roar'); },
    playGrab: (pos) => { if (spatialTrigger && pos) spatialTrigger('grab', pos, 1, 20); else playSound('grab'); },
    playHurl: (pos) => { if (spatialTrigger && pos) spatialTrigger('hurl', pos, 1, 25); else playSound('hurl'); },
    playSlam: (pos) => { if (spatialTrigger && pos) spatialTrigger('slam', pos, 1, 30); else playSound('slam'); },
    playAnvilHit: (pos) => { if (spatialTrigger && pos) spatialTrigger('anvilHit', pos, 1, 35); else playSound('anvilHit'); },
    playBind: (pos) => { if (spatialTrigger && pos) spatialTrigger('bind', pos, 1, 25); else playSound('bind'); },
    playMagicExplosion: () => playSound('magicExplosion', 0.9 + Math.random() * 0.2),
    playMagicCharge: () => playSound('magicCharge'),
    playLevelUpSound: () => playSound('levelUp'),
    // UI foley (panel open/close) — subtle menu chrome responsiveness
    playUIOpen: () => playSound('uiOpen'),
    playUIClose: () => playSound('uiClose')
  };
};