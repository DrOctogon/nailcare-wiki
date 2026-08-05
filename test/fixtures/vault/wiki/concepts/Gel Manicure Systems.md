---
type: concept
title: "Gel Manicure Systems"
address: c-000003
created: 2026-06-12
updated: 2026-07-02
tags:
  - concept
  - nail-care
  - gel
  - chemistry
status: developing
related:
  - "[[Nail Care Market Segmentation]]"
  - "[[Chen 2012 Gel Manicure Study]]"
---

# Gel Manicure Systems

LED-cured **nail** coatings that outlast conventional polish. The salon-substitute
tier of [[At-Home Nail Care Disruption]].

## Cure kinetics

Photoinitiator conversion under a UV/LED lamp follows first-order decay, so the
un-cured monomer fraction after time $t$ is:

$$
C(t) = C_0 \, e^{-k t}
$$

where $C_0$ is the initial monomer concentration and $k$ the cure-rate constant.

## Estimating cure time

```ts
// Seconds to reach a target un-cured fraction.
function cureTime(target: number, k: number): number {
  return -Math.log(target) / k;
}
```

Clinical durability concerns are reviewed in [[Chen 2012 Gel Manicure Study]].
