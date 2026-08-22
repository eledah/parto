# Bug: sunburst center disc renders enormous on shallow/focused views

**Status:** open — allocator rewrite in progress (see "Proposed fix")
**Discovered in:** v0.2.0 demo review (examples/05-deep-map)
**Affects:** `src/core/ringLayout.ts` → `computeRingBoundaries()`, both renderers

---

## 1. Symptom

On the 7-level deep map demo the thesis disc fills ~90% of the chart height.
Zooming into any main argument makes it worse (~95%). The outer argument rings
are correspondingly crushed into a thin band at the rim. Icicle layout is
unaffected visually but shares the same boundary math.

User report: *"the main thesis [is] way too large, like 90% of the height of
the box… super non-UX friendly."*

## 2. Background: what the allocator must do

Parto sizes radial bands so that no arc renders as a **sliver** — an arc
dramatically longer (radially) than it is wide (along its arc). For a band
with inner edge `a`, width `w`, minimum angular span `s` at that depth, and a
tolerance `K`:

```
w ≤ K · s · (a + a + w)/2
⇒ w ≤ a · 2Ks / (2 − Ks)        when Ks < 2   ("cap factor" k_d)
⇒ unconstrained                  when Ks ≥ 2   (arc already long enough)
```

So each band has a **multiplicative growth cap** over its inner edge, and the
whole layout is a chain `B(d+1) ≤ B(d) · k_d`. The center disc radius `B(1)`
must additionally respect `centerCap` (`chart.maxCenterRadius`, default
0.32·R). Renderer feeds per-depth minimum spans after "+N" wedge collapse, so
surviving spans are typically ≥ `spacing.minAngle` (0.045 rad).

## 3. Root cause of the giant thesis

The Phase-1 allocator enforced caps with a left-to-right repair pass, then
**rescaled all boundaries about the origin** to refill the radius:

```
repair:      B = [0, 0.08R, 0.23R, 0.34R]   (caps bound hard)
origin fill: ×(1/0.34) → B = [0, 0.24R, 0.68R, R]
```

Two compounding failures:

1. **Origin rescale re-inflates the center.** The cap `B(1) ≤ centerCap` was
   applied *before* the rescale and never re-checked after. On focused views
   (depth 2, few bands, large spans ⇒ caps bind immediately) the pre-scale
   total shrank to ~0.12·R, so the rescale factor hit ~8× and `B(1)` landed at
   ~⅔·R — the giant disc.
2. **The constraint is over-aggressive where slivers are impossible.** With
   large spans (wide views), `k_d ≈ 1.2–1.3` chokes natural growth even though
   no sliver could exist; everything then depends on the broken rescale.

Secondary finding (fuzz): for stacked tiny spans the strict invariant and a
fully-filled radius are **mutually exclusive** — max strict-feasible extent is

```
E = B(1) · ∏ k_d(s_d)
```

and when `E < R` something must give. Any fix must decide *what* gives,
deterministically.

## 4. Attempt log (why this is still open)

| Attempt | Idea | Failure mode |
| --- | --- | --- |
| A | Repair pass + origin rescale + re-clamp loop | Oscillated between cap-violation and constraint-violation across iterations; fuzz caught residual violations |
| B | Greedy maximal-fill fallback candidate | Same origin-rescale blowup (B₁ × 1.66) — scoring couldn't rescue post-hoc |
| C | Affine tail-fill keeping B(1) frozen | Inner bands adjacent to B(1) degrade by ~stretch-factor× when factor large (`mid` grows slower than thickness near the anchor); fuzz violation 60px vs 4px allowed |
| D | Water-filling with static headroom | Headroom measured at current geometry is zero exactly when caps bind (chicken-and-egg: growing a band raises its own allowed budget) — loop broke instantly, under-filled |
| E | Budget-weighted distributor, iterated | Weights ∝ mid which grows with own width → self-amplifying feedback → **non-monotonic output** `[0, 72, 804, 318]` on trial 142 (spans 0.262/0.040, R=401) |

Common thread: every iterative/patch approach fights the fact that the
constraint chain is *multiplicative* and its feasible extent is closed-form.
Stop patching; solve it directly.

## 5. Proposed fix (constructive λ-recursion)

Key insight: scaling relaxation λ over the constraint gives a monotone family
of chains:

```
k_d(λ) = 2λKs_d / (2 − λKs_d)        (λ ∈ (0, 1])
chainOuter(λ) = B(1) · ∏ k_d(λ)       strictly increasing in λ
E = chainOuter(1)                     maximum strict-feasible extent
```

Algorithm:

1. Anchor `B(1)` inside `[minThickness, centerCap]` — never touched again.
2. Clamp effective spans to `< 2/K` so every factor is finite.
3. If `E ≥ R`: binary-search the largest λ with `chainOuter(λ) ≤ R`
   (~50 iterations, exact to float precision). Build the chain with that λ;
   snap the last boundary to R. **Full fill + invariant guaranteed.**
4. If `E < R` (geometrically impossible input): emit the λ=1 chain (max
   strict extent), then a **single-shot** stretch of the shortfall distributed
   ∝ allowed arc budget `K·s·mid` evaluated once at λ=1 geometry.
   Single-shot cannot diverge (attempt E iterated it); ratios inflate by at
   most ≈ `R/E`, spread toward bands that can actually absorb width.
5. Enforce `minThickness` floors last; they only matter at sub-10px scales
   where visual continuity outranks exactness.

No oscillation is possible: there are no interacting loops, only one
monotone search and one additive pass.

### Why this fixes the demo

Focused deep-map view (spans ≈ 0.76 rad, K=3): `Ks ≥ 2` ⇒ bands **unconstrained**
⇒ power-curve proportions stand, `B(1)` stays at its clamped ~0.32·R. Sliver
cases (tiny spans) get genuine caps; impossible cases get predictable,
uniformly-degraded fill instead of gaps or explosions.

## 6. Test contract

- Monotonic boundaries, exact final fill, center ≤ cap — always.
- Strict sliver invariant whenever `E ≥ R` (test recomputes E from the same
  formula — renderer-realistic domain).
- Degraded inputs: bounded ratio lift (∝ R/E), still monotone, filled,
  capped. Fuzz splits into "feasible" and "impossible" suites accordingly.
- Regression test added: shallow/wide spans keep `B(1) ≤ centerCap`
  (this is the user-visible bug).

## 7. Related fix shipped alongside

`Parto.decodeZoomPath is not a function` (example 07): the CDN global bundle
only exposed `createArgumentMap`. `src/global.ts` now also publishes
`encodeZoomPath`, `decodeZoomPath`, and `ZOOM_PARAM`.

---

## 8. Handoff status (for the next engineer/agent)

**Design above is final. Implementation is ~80% done, 2 tests red.**

Working tree (uncommitted on `main`) contains:

- `src/core/ringLayout.ts` — rewritten to the λ-recursion design (typecheck ✅)
- `tests/ringLayout.test.ts` — new contract (feasible/degraded split, E helper)
- `BUG-ring-allocator.md` — this document
- Earlier today, already finished & verified separately:
  - `src/config.ts`: `spacing.sliverAspectRatio=3`, `chart.maxCenterRadius` 0.4→0.32
  - `src/render/SunburstRenderer.ts` + `IcicleRenderer.ts`: pass `aspectTolerance`
  - `src/global.ts`: exposes `encodeZoomPath`/`decodeZoomPath`/`ZOOM_PARAM`
    (fixes "Parto.decodeZoomPath is not a function" in example 07)

### Remaining failures (2, both in tests/ringLayout.test.ts)

1. "degrades predictably" — outer edge ≠ radius after single-shot stretch
   (330 vs 351). Stretch arithmetic is additively exact by construction, so
   suspect interaction between buildChain's minThickness floors and the
   excess computation, or an early-branch mixup. Debug with a probe printing
   spans/bands for the first failing trial.
2. "renderer-realistic spans" — maxRatio ≈ 244× on some trial ⇒ the degraded
   branch dumped nearly all excess into one band. Weights are ∝ K·s·mid
   pre-stretch; verify span indexing (`spans.slice(1)` alignment happened
   before; re-check), and whether the failing trial took the feasible branch
   with E computed differently between impl and test helper.

### Suggested approach

Trust §5 math, re-derive step-by-step against the code rather than patching.
Add a temporary debug probe test (pattern used before, see git log) that
prints spans/bands/E for the first failing trial before changing logic.

### Definition of done

`npm run typecheck && npm test` green (76+ tests incl. ring suite), then
manually check `examples/05-deep-map/index.html`: thesis disc ≤ ~1/3 of
radius focused or not; wedges still collapse; icicle example 07 loads and
share-link buttons work. Then commit (doc + fix together).
