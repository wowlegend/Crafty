import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import { GameMethods } from './GameMethods';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { useGameStore } from './store/useGameStore';
import { isCaptureMode } from './devtest/captureMode';
import { OUTLINE } from './render/characterStyle';
import { TIERS } from './render/quality';
import { Panel, StatBar, Icon } from './ui/primitives/index.js';
import { useT } from './i18n/i18n.js';

import { BOSS_CONFIG } from './game/bossConfig.js';
