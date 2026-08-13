# Draft reply to pmndrs/postprocessing#750 — NOT POSTED

Posting to a public upstream issue is outward-facing, so it stays Kevin's call. This is the text, ready
to paste. Everything in it is measured, with the control stated, because the maintainer will act on it.

---

Thanks for looking so quickly.

**Your depth-texture theory is confirmed on my end for the GL errors.** I measured the production bundle
with an identical probe and a 12-second window on both builds, headless Chromium 151 with SwiftShader:

| build | `glBlitFramebuffer` console messages |
|---|---:|
| three 0.172.0 + postprocessing 6.39.1 | **6** — both `Read and write depth stencil attachments cannot be the same image` and `Depth/stencil buffer format combination not allowed for blit` |
| three 0.174.0 + postprocessing 6.39.4 | **0** |

The zero is against a control that produced a non-zero on the same instrument, so it is an absence rather
than a blind probe.

Worth flagging why this mattered to us beyond the noise: in a longer session the errors repeat until Chrome
emits *"too many errors, no more errors will be reported to the console for this context"* — after which a
genuine GL error later in that same context is silenced too. So the storm disables the channel our capture
harness watches, which is how it went unnoticed.

**On the missing sun, I cannot yet confirm or deny that r174 fixes it**, and I would rather say so than
guess. Upgrading to r174 changes our rendering globally — 19 of our 31 committed reference frames go over
tolerance, with a visibly more saturated sky — so I cannot currently separate "the sun is back" from "every
frame changed". Isolating that needs a controlled pair (r174 + 6.39.1 vs r174 + 6.39.4) which I have not
run yet. I will follow up with that result rather than leave it implied.

One detail from the original report that may help you reproduce, since our setup differs from the demo:
our `GodRaysEffect` light source is a sun disc that is **reparented into the effect's own `lightScene`**,
and the effect owns a `renderTargetLight` with its own `DepthTexture`, with `clearPass.enabled = false`.
If your demo's sun stays in the main scene, that difference is a plausible reason the demo renders fine on
r172 while ours does not.

Repro environment: three 0.172.0, @react-three/fiber 9.5, @react-three/postprocessing 3.0.4, Vite 6,
Chromium 151 headless (SwiftShader) and desktop macOS.
