#!/usr/bin/env python3
"""Throwaway probe (lane start-stall, fix round 2; removed in the lane's next commit, never part of the game).

arm.py variant raw          adds to the spec, on the runner, the pointerrawupdate listener e8b1acf7's spec had.
arm.py mutant <case> <dir>  writes the mutant's subject, anchor, replacement, label and mode into <dir> for
                            scripts/dev/mutate-e2e.sh, which applies it, runs the spec once and restores it.
Run from frontend/. Nothing it writes is committed.
"""
import pathlib
import sys

OUTLINE = '''        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex flex-col items-center">
          <h2 className="text-3xl font-bold text-text mb-2 font-mono tracking-widest" style={ON_WORLD_TEXT}>{t('world.generating')}</h2>
          <p className="text-success font-mono text-sm font-semibold" style={ON_WORLD_TEXT}>{t('world.buildingTerrain')}</p>
        </div>'''

CAPTION = '''        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex flex-col items-center">
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8), 0 2px 8px rgba(0, 0, 0, 0.9)' }}>
            {t('world.generating')}
          </h2>
          <p className="text-green-400 font-mono text-sm" style={{ textShadow: '0 1px 8px rgba(0, 0, 0, 0.9)' }}>{t('world.buildingTerrain')}</p>
        </div>'''

OLD_SCREEN = '''        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-6 shadow-lg shadow-green-500/50"></div>
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}>
            {t('world.generating')}
          </h2>
          <p className="text-green-400 font-mono text-sm animate-pulse">{t('world.buildingTerrain')}</p>
        </div>'''

BUILT = '  const [isWorldBuilt, setIsWorldBuilt] = useState(false);\n'

# The page stops answering for 60 s with no flood behind it: 20 s after the lock it releases the lock (the flood rides on
# it), then blocks its main thread. Memory has no input to queue, so only the answers arm can see it.
SILENCE = BUILT + '''  useEffect(() => {
    const onLock = () => {
      if (!document.pointerLockElement) return;
      document.removeEventListener('pointerlockchange', onLock);
      setTimeout(() => {
        document.exitPointerLock();
        setTimeout(() => { const end = performance.now() + 60000; while (performance.now() < end) { /* not answering */ } }, 300);
      }, 20000);
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);
'''

# A slow leak into the browser process (blob bytes go to the browser's blob registry): 8 MB every 500 ms from 60 s after
# the lock. Round 1's 4 MB/s raised the browser's floor about 1.8 MB/s (run 41268462804), so this should raise it about
# 7 MB/s: over 100 MB between the late window's halves, while the whole rise stays under the 600 MB bound.
SLOWLEAK = BUILT + '''  useEffect(() => {
    const keep = [];
    let id = null;
    const onLock = () => {
      if (!document.pointerLockElement || id !== null) return;
      id = 0;
      setTimeout(() => { id = setInterval(() => { keep.push(URL.createObjectURL(new Blob([new Uint8Array(8 << 20).fill(7)]))); }, 500); }, 60000);
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => { document.removeEventListener('pointerlockchange', onLock); clearInterval(id); };
  }, []);
'''

MUTANTS = {
    'e1': ('src/App.jsx', OUTLINE, OLD_SCREEN, 'E1 the screen as it was (bd06dacf): a translucent, blurred layer over the canvas with a spinning ring', ''),
    'e1b': ('src/App.jsx', OUTLINE, OLD_SCREEN, 'E1 again, a second sample', ''),
    'e1c': ('src/App.jsx', OUTLINE, OLD_SCREEN, 'E1 again, a third sample', ''),
    'silence': ('src/App.jsx', BUILT, SILENCE, 'M-silence: 20 s after the lock the page releases it and blocks its main thread for 60 s', ''),
    'slowleak': ('src/App.jsx', BUILT, SLOWLEAK, 'M-slowleak: from 60 s after the lock, 16 MB/s of blobs sent to the browser process', ''),
    'nobuild': ('src/world/Terrain.jsx', 'if (payload.cx === 0 && payload.cz === 0) {', 'if (payload.cx === 0 && payload.cz === 0 && false) {',
                'M-nobuild: the spawn chunk never marks the world built', ''),
    'nolock': ('src/MenuSystem.jsx', '    requestGameLock(useGameStore.getState());\n    if (isTouchDevice())', '    if (isTouchDevice())',
               'M-nolock: Start asks for no pointer lock, so nothing floods (INCONCLUSIVE, which CI must fail)', ''),
    'slowleak2': ('src/App.jsx', BUILT, SLOWLEAK, 'M-slowleak again, a second sample', ''),
    'e0b': ('src/App.jsx', 'A still caption at the foot of the screen', 'A still caption, at the foot of the screen', 'E0 identity again, a second sample', '--identity'),
    'e0': ('src/App.jsx', 'A still caption at the foot of the screen', 'A still caption, at the foot of the screen', 'E0 identity (a comment edit in App.jsx)', '--identity'),
}


def main():
    kind = sys.argv[1]
    if kind == 'variant':
        assert sys.argv[2] == 'raw', sys.argv[2]
        p = pathlib.Path('tests/e2e/start-before-built.spec.js')
        t = p.read_text()
        anchor = "  addEventListener('pointermove', (e) => {"
        assert t.count(anchor) == 1, 'pointermove counter not found'
        p.write_text(t.replace(anchor, "  addEventListener('pointerrawupdate', () => {}, { capture: true, passive: true }); // the round-1 probe's listener\n" + anchor))
        print('variant raw applied: a passive pointerrawupdate listener, as the committed spec of e8b1acf7 had')
        return
    case, out = sys.argv[2], pathlib.Path(sys.argv[3])
    subj, old, new, label, mode = MUTANTS[case]
    src = pathlib.Path(subj).read_text()
    assert src.count(old) == 1, f'{case}: anchor found {src.count(old)} times in {subj}'
    out.mkdir(parents=True, exist_ok=True)
    for name, val in (('subj', subj), ('old', old), ('new', new), ('label', label), ('mode', mode)):
        (out / name).write_text(val)
    print(f'mutant {case} ready: {label}')


main()
