# Bug: sunburst center disc renders enormous on shallow/focused views

**Status:** fixed — root causes found & patched; suite green (79/79), typecheck ✅; awaiting manual visual check of examples 05/07 before push
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

**Both root causes are now found — see §9 for full derivations.** Summary:
(1) the stretch loop drops each band's original thickness (underfill by
exactly `n·minThickness`); (2) the multiplicative chain can *hump* — a
near-limit span's factor (~10⁶ at λ=1) inflates mid-chain boundaries above R
before tight later factors pull them back, violating monotonicity in either
branch. §9 also documents two latent hazards and open design questions.

<details><summary>Original handoff notes (pre-debug, kept for record)</summary>

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
</details>

### Suggested approach

Trust §5 math, re-derive step-by-step against the code rather than patching.
Add a temporary debug probe test (pattern used before, see git log) that
prints spans/bands/E for the first failing trial before changing logic.

### Definition of done

`npm run typecheck && npm test` green (76+ tests incl. ring suite), then
manually check `examples/05-deep-map/index.html`: thesis disc ≤ ~1/3 of
radius focused or not; wedges still collapse; icicle example 07 loads and
share-link buttons work. Then commit (doc + fix together).

---

## 9. Debug session findings (root causes confirmed, fixes drafted)

State at session start: working tree **clean** — everything from the previous
session was already committed in `2aa438a` (local `main`, 1 ahead of origin,
not pushed). Test baseline: 76 pass / 2 fail (the two ring tests), typecheck ✅.

### 9.1 Red test #1 "degrades predictably" — SOLVED: stretch loop drops original thicknesses

Failure message: outer edge `329.908` vs radius `350.966`, diff `21.058`.

The degraded-branch stretch in `computeRingBoundaries()`:

```ts
let cursor = bands[1]!;                       // starts at B(1)
for (let i = 0; i < bandCount; i++) {
  cursor += weights[i]! * (excess / weightTotal);   // share only!
  bands[i + 2] = cursor;
}
```

`cursor` accumulates **only each band's share of the excess** and never adds
back the band's own pre-stretch thickness. The final boundary therefore lands
at `B(1) + excess` instead of the old outer + excess.

Numeric confirmation (exact, not approximate): on these trials every span is
≤ 0.02, so all λ=1 factors are ≪ 1 and the pure chain collapses below B(1);
every band sits on its `minThickness` floor. Hence

```
oldOuter = B(1) + n·minThickness
excess   = R − oldOuter = R − B(1) − n·minThickness
produced = B(1) + excess = R − n·minThickness
diff     = n · 0.015 · R
```

Observed diff 21.058 / (0.015 × 350.966) = **4.0005** ⇒ the failing trial had
exactly n=4 bands (`depthCount ∈ [3,7]` in that test). Arithmetic matches to
5 decimal places — this is the bug, not a hypothesis.

Fix direction: accumulate `originalThickness[i] + share[i]` per band (or
rebuild positions additively from thicknesses). Trivial.

### 9.2 Red test #2 "renderer-realistic spans" — SOLVED: chain humping (non-monotone intermediate boundaries)

Failure message: monotonicity assert saw `bands[i]=243.97` directly after
`bands[i−1]=7165.05` (radius ≤ 450 in that suite).

Mechanism — **the multiplicative chain itself can be non-monotone mid-chain**:

- Spans are clamped to `SPAN_MAX = 2/K − 1e-6` (K=3 ⇒ 0.6666657).
- At λ=1 a clamped span gives factor `k = 2x/(2−x)` with `x = 2 − 3e-6`
  ⇒ **k ≈ 1.33 × 10⁶**. Even unclamped near-limit spans give k in the
  hundreds/thousands (s=0.66 ⇒ k≈999).
- A later tiny span gives k < 1 (s=0.04 ⇒ k≈0.128).

So the running position `a ← a·k` can jump far above R at the big-factor band
and be multiplied back below it by subsequent tight factors. Neither
`buildChain()` nor the binary search guards against this: the search drives
the **final product** toward R, not the **running maximum**, and the
`minThickness` floor only prevents downward steps, never upward ones.

Consequences, both observed/derivable:

1. Degraded branch: `buildChain(1)` emits `[0, B₁, ~7000, ..., ~250]` —
   non-monotone before the stretch even runs.
2. Feasible branch: same hump can appear mid-chain at the found λ* (product
   ends at R while an interior boundary overshoots R then falls back).

This also **clears the handoff's indexing suspicion**: the stretch weights'
alignment (`spans[i] ↔ bands[i+1], bands[i+2]`) is correct, and the test
helper's E replicates the implementation formula exactly. The failure was
never about which trial/branch or mis-indexed weights.

### 9.3 Deeper issue exposed: §5 has a soundness gap (needs design decision)

The λ-chain construction implicitly assumes the chain profile is usable as a
boundary layout. It guarantees:

- final element ≤ R under the found λ (monotone search ✓),
- each band individually AT its relaxed cap.

It does **not** guarantee intermediate monotonicity when per-band factors are
heterogeneous (one near-limit span followed by tight ones) — §9.2. And caps
are only *upper bounds*: a feasible monotone full-fill allocation may still
exist where the humped band takes less than its cap. So this is not
infeasibility of the input; it is a defect of the construction.

Candidate resolutions (tradeoffs included for review):

| Option | Idea | Problem |
| --- | --- | --- |
| F1 | During build, cap each step: `t_i ≤ R − pos` | Capping early bands shrinks all downstream products multiplicatively ⇒ final < R ⇒ breaks exact fill; needs post-pass → reintroduces the exact machinery attempts C–E died on |
| F2 | Detect hump pre-build (∃ prefix product > R/B₁); route those inputs to a budgeted single-shot constructor | Needs a second constructor whose ratio bounds must satisfy test contract §6; more code but no loops |
| F3 | Clamp spans harder so no single factor can dominate (e.g. cap k_d itself at some k_max) | Changes the meaning of K and the closed-form E the tests recompute; strict invariant may be violated where it was achievable |

Recommendation to evaluate first: **F2**, with drafts built like the degraded
fix below (per-band draft thicknesses clamped into `[floor, remaining]`,
then one additive rebalance ∝ K·s·mid evaluated once). Same shape as the
degraded path ⇒ one shared code path, no interacting loops, deterministic.

### 9.4 Two latent hazards in the feasible branch (found while re-deriving)

Even with §9.2 handled:

1. **Snap-down hazard.** The binary search minimizes the *pure* `chainOuter(λ)`,
   but `buildChain(lo)` additionally applies `minThickness` floors, which can
   push the actual outer above R; `bands[last] = radius` then snaps *down*,
   thinning or inverting the last band. Fix: make the search objective the
   **floored** chain outer (i.e. use `buildChain(λ)[last]` directly), so the
   final snap is upward float-noise only.
2. **Degenerate corner.** If even at λ→min the floored outer exceeds R (tiny
   radii, many bands: `B₁ + n·minThickness > R`), nothing fits; need an
   explicit fallback (e.g. equal slices of `R − B₁`) rather than letting the
   search return an over-full chain.

### 9.5 Draft fix sketch (uncommitted, unverified — expert review requested)

```ts
// Feasible branch: search on the floored outer.
const chainOuter = (λ) => { /* walk factors AND floors, return last */ };

// Degraded branch (also usable as the F2 constructor):
// 1. Draft thicknesses from λ=1 chain positions, de-humped:
//    t_i = clamp(prod_i − prod_{i−1}, minThickness, R − B₁)
//    (kills the 10⁶-factor hump: one band can never claim more than all
//     available space; negative steps become floors)
// 2. If Σ t_i + B₁ ≥ R: equal slices of R − B₁ (deterministic, filled).
// 3. Else place drafts, then ONE additive pass:
//    excess = R − current outer; shares ∝ K·s·mid at draft geometry.
//    Shares sum exactly to excess ⇒ exact fill by construction.
```

Preserves §5 invariants: B₁ anchored once, one monotone search, one additive
pass, nothing iterated. Open question for review: does the de-humped draft +
single-shot rebalance satisfy the §6 ratio bound (`maxRatio ≤ K·(R/E)·1.25+0.05`)
on the feasible-branch hump cases, where the bound assumes the strict chain?
Back-of-envelope says yes (humped cases have astronomically large R/E), but
it should be proven or fuzz-tested, not assumed.

### 9.6 Session log

1. Read handoff, ran suite: 76/78 pass, both failures reproduce deterministically.
2. Re-derived §5 vs `src/core/ringLayout.ts`; audited weights indexing (§8
   suspicion cleared — alignment correct).
3. Failure #1: derived `produced = R − n·minThickness`; matched observed diff
   to n=4 exactly ⇒ stretch-loop dropped-thickness bug confirmed.
4. Failure #2: reproduced numbers via clamp math (`k(SPAN_MAX) ≈ 1.33e6`),
   identified chain-humping as the cause of `7165 → 244`.
5. Found feasible-branch snap-down hazard + degenerate corner (§9.4).
6. Drafted fixes (§9.5); flagged §5 soundness gap (§9.3) for design review
   before implementing. No code changed yet this session.

### 9.7 Resolution (external review + unified λ* rewrite)

An external review found the **true root cause underneath both §9 symptoms and
the whole §9.3 "soundness gap"**: an algebra error in the original design.

**The missing +1.** From §2, `k_d = 2Ks/(2−Ks)` caps *thickness relative to
inner edge* (`w/a`), not outer/inner (`b/a`). Since `b = a + w`:

```
correct boundary multiplier:  m_d = 1 + k_d = (2 + λKs) / (2 − λKs)  ≥ 1
what §5/code used:            k_d        = 2λKs / (2 − λKs)          can be < 1
```

The doc's §2 chain `B(d+1) ≤ B(d) · k_d` was itself wrong. With `k_d < 1`
(tight spans) boundaries multiplied *inward*; a wide-then-tight span sequence
exploded then collapsed — exactly the §9.2 hump (`7165 → 244`). The F1–F3
candidate fixes in §9.3 treated symptoms of this error and are retracted.

With `m_d ≥ 1` every boundary is monotone by construction, and a stronger
property emerges: on a λ-chain each band sits *exactly at* its relaxed cap,
so its true-constraint aspect ratio is precisely **λ** (identity:
`t = pos·(m−1)` and `λ·K·s·mid = pos·k` are equal). Therefore:

**Unified algorithm (shipped):** one binary search for the unique λ\* with
`chainOuter(λ*) = R` over λ ∈ (0, ∞) (doubling expansion, then 60 bisections),
on the floored chain outer so the final snap to R is upward float noise only.
No feasible/degraded branch, no additive stretch pass.

- λ\* ≤ 1: strict sliver invariant holds with exact fill (feasible case).
- λ\* > 1: input is geometrically impossible and **every band degrades
  uniformly by exactly λ\*** — provably no local explosions.
- Degenerate corner kept: if even zero relaxation overshoots R
  (`B₁ + n·minThickness > R`), equal slices of the available space.
- Center anchor B₁ untouched by all of the above.

**Test contract change (§6 amendment, evidence-based).** The old degraded
bound `maxRatio ≤ K·(R/E)·1.25 + 0.05` was never a valid theorem — it was
derived under the broken algebra where collapsed E made it vacuous. A probe
over the fuzz suite showed ~90% of impossible-input trials violate it under
any sane allocator (worst ratios 100–125× vs bound ≈11–13; filling R when the
strict chain reaches E≈0.28R forces lifts of ~λ\*≈95, not f=R/E≈3.5). The
contract now asserts what is actually guaranteed per band:

```
thickness_i ≤ max(λ* · K·s_i·mid_i , minThickness) · (1+ε)
```

with λ\* recomputed in the test helper via the same recursion (floors
included). Floors legitimately lift ratios above λ\* only at sub-10px scales
(documented tradeoff).

**Results:** 79/79 tests green, typecheck clean. Sanity check (radius 400):
focused 7-level view center disc = 0.233·R; shallow wide = 0.320·R (both
≤ ~⅓, vs the reported ~90% before). Remaining: manual visual check of
`examples/05-deep-map/index.html` and icicle example 07 share buttons, then push.
