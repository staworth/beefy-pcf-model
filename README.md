# Beefy DAO - Protocol Coverage Fund Model

This is a simple one-page React app that models insurance premium purchases and the resulting cumulative coverage over time. It lets you tune purchase cadence, policy duration, and premium cost to see how coverage evolves on a monthly timeline.

Built by jackgale.eth (Staworth Limited).

## Model Overview

The chart and table visualize three series:

1. **Premium Purchases** (scatter, left axis)  
   The premium paid on each purchase date.
2. **Cumulative Premium Purchases** (line, left axis)  
   Running total of all premium purchases to date.
3. **Current Cumulative Coverage** (area, right axis)  
   The sum of non-expired premium purchases divided by the premium cost percentage.

Coverage calculation example:

- $800k of valid (non-expired) premium purchases
- 8% premium cost
- Coverage = $800k / 0.08 = $10M

## Configuration Parameters

- **Timescale (months)**: Total model duration (12–60 months).
- **Premium Value**: Amount for each recurring premium purchase ($1k–$500k).
- **Purchase Cadence (days)**: Days between purchases (1–365).
- **Policy Duration (days)**: How long each purchase remains valid (1–365).
- **Bootstrap Funding**: One-time day‑one purchase amount (default 0).
- **Premium Cost (%)**: Percentage applied to calculate coverage (1–30%).

## License

MIT
