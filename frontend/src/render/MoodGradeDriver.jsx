import { useContext, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposerContext } from '@react-three/postprocessing';
import { HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { skyFrameRef } from './mood';

// MoodGradeDriver -- writes the colour grade (saturation/brightness/contrast) onto the LIVE HueSaturation +
// BrightnessContrast post effects each frame (reached via the composer context, cached on first frame).
//
// The grade is the published sky frame's (render/mood.js skyFrameRef: the colour script's per-key grade under the
// danger overlays). A re-sample of the mood with no cycle would hold the grade at noon's whatever the hour.
export const MoodGradeDriver = () => {
  const ctx = useContext(EffectComposerContext);
  const hueRef = useRef(null);
  const bcRef = useRef(null);
  useFrame(() => {
    if ((!hueRef.current || !bcRef.current) && ctx && ctx.composer) {
      for (const pass of ctx.composer.passes || []) {
        const effects = pass && pass.effects;
        if (!Array.isArray(effects)) continue;
        for (const e of effects) {
          if (!hueRef.current && e instanceof HueSaturationEffect) hueRef.current = e;
          if (!bcRef.current && e instanceof BrightnessContrastEffect) bcRef.current = e;
        }
      }
    }
    const hue = hueRef.current, bc = bcRef.current;
    if (!hue && !bc) return;
    const g = skyFrameRef.current.grade;
    if (hue) hue.saturation = g.saturation;
    if (bc) { bc.brightness = g.brightness; bc.contrast = g.contrast; }
  });
  return null;
};
