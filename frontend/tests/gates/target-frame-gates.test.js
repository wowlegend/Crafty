// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import { TargetFrame } from '../../src/ui/TargetFrame.jsx';

// THE NAMEPLATE IS RENDERED, NOT GREPPED.
//
// All three assertions here used to read source text: `/targetEntity:/` against the store file,
// `/targetEntity|setTargetEntity/` against Components.jsx, and `/Panel/` + `/targetEntity/` +
// `/isCaptureMode\(\)/` against TargetFrame.jsx. Every one of them is satisfiable without the feature
// working — the alternation in the second matches either token anywhere in a 1300-line file, and
// `/Panel/` matches the import line alone. None could see whether a nameplate ever appears, whether it
// shows the target it was given, or whether capture actually suppresses it.
//
// The component is a plain memo over one store selector, so jsdom renders it directly. Converting all
// three removes a member from the frozen source-grep population, which may fall freely.
//
// `createElement` rather than JSX so the file keeps its .test.js extension: gate-shape keys the frozen
// population on the exact path, and renaming a gate mid-conversion is how you mint a NEW ledger member.
afterEach(() => {
  cleanup();
  exitCaptureMode();
  useGameStore.setState({ targetEntity: null });
});

const MOB = { id: 7, name: 'zombie', health: 6, maxHealth: 20, isAlly: false };

describe('target-frame gates', () => {
  it('the store carries a targetEntity mirror that round-trips', () => {
    expect(useGameStore.getInitialState()).toHaveProperty('targetEntity');
    useGameStore.setState({ targetEntity: MOB });
    expect(useGameStore.getState().targetEntity).toEqual(MOB);
  });

  it('renders nothing with no target — and the nameplate WITH one (presence before absence)', () => {
    // The absence assertion is worthless until the same instrument has shown it can see the positive
    // case in the same run, so the order here is deliberate.
    const { container: empty } = render(createElement(TargetFrame));
    expect(empty.textContent, 'a nameplate rendered with no target').toBe('');
    cleanup();

    useGameStore.setState({ targetEntity: MOB });
    render(createElement(TargetFrame));
    expect(screen.getByText('zombie')).toBeTruthy();
    expect(screen.getByText('6/20'), 'the nameplate does not show the target health it was given').toBeTruthy();
  });

  it('is capture-SUPPRESSED even with a live target', () => {
    useGameStore.setState({ targetEntity: MOB });
    enterCaptureMode();
    const { container } = render(createElement(TargetFrame));
    expect(container.textContent, 'the nameplate rendered under capture, so it would sit in the baselines').toBe('');
  });
});
