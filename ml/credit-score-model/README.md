# Credit score coach: dataset, model and validation

This folder builds the model behind the **Credit score coach** page (`/credit-score`). It
estimates a UK-style 0–999 credit score from a credit file, then tests what-if changes to
that file to work out which steps would help a particular person most.

```bash
pip install -r requirements.txt
python generate_dataset.py   # 120,000 profiles -> data/synthetic_credit_profiles.csv.gz (~3 MB)
python train_model.py        # ~4 min -> frontend/public/credit-coach/{model,fixtures}.json, results/metrics.json
```

Both scripts use a fixed random seed, so they produce the same output every time.
`cd frontend && npm run test:credit-coach` checks that the browser port gives the same
answers as Python.

> **Synthetic data only.** No real credit data or real agency scoring formula is used. The
> "true" scoring rules in `world.py` are made up, but realistic: they follow publicly known
> UK credit-file factors and include interactions, for example applications cost more on a
> short history. Every number below describes this simulated world.

## 1. The dataset

`generate_dataset.py` creates **120,000 profiles** with 19 credit-file features: card
utilisation, limits, missed payments (recent and older) and how long ago, defaults, CCJs,
account age, number of accounts, recent applications and new accounts, electoral roll,
payday loans, overdraft overruns, financial associations, rent reporting, house moves,
minimum-only payments. It also records context (age, income, whether they rent).

To make sure the advice works for every kind of person, the profiles come from **14
archetypes** plus a uniform "anything goes" slice (12%) that fills the gaps between them:

| Archetype | Share | Mean score | | Archetype | Share | Mean score |
|---|---|---|---|---|---|---|
| Established homeowner | 11.8% | 961 | | Student, thin file | 7.2% | 667 |
| Overextended cards | 9.2% | 605 | | New to the UK | 5.5% | 650 |
| Young professional | 9.1% | 800 | | Retired, low activity | 6.3% | 946 |
| Recovering after default | 7.4% | 578 | | Self-employed, irregular | 5.5% | 753 |
| Single parent, stretched | 5.5% | 640 | | Careful renter | 5.4% | 858 |
| High earner, high spend | 4.6% | 845 | | Payday-loan cycle | 4.4% | 436 |
| Financially linked | 3.7% | 820 | | Credit-hungry switcher | 3.6% | 704 |

Score bands across the dataset: Very poor 23%, Poor 25%, Fair 29%, Good 15%, Excellent 9%.

Labels are the hidden `oracle_score` plus noise (SD 22), like the differences you see
between agencies. That noise sets a floor: even a perfect model would be **17.2 points**
out on average.

## 2. Model comparison

We used 5-fold cross-validation on 96,000 profiles, then tested on 24,000 profiles that
were never used in training.

| Model | Test MAE | MAE vs noise-free truth | R² | Right band |
|---|---|---|---|---|
| Linear regression | 45.8 | 42.6 | 0.934 | 72.6% |
| Gradient boosting, monotonic constraints | 27.2 | 20.5 | 0.977 | 81.6% |
| **Gradient boosting (chosen)** | **19.2** | **7.3** | **0.989** | **86.6%** |

The chosen model is scikit-learn's `HistGradientBoostingRegressor`: 600 trees with up to
31 leaves each. It comes within 2 points of the noise floor. We expected monotonic
constraints to make the advice safer. In practice they cost a lot of accuracy, because
the constrained trees can't represent this world's interactions. They also ranked
actions worse (see below). The unconstrained model passes the stress test anyway.

## 3. Simulations: is the advice right?

A good fit doesn't guarantee good advice, so we tested the advice directly. For 6,000
test profiles we simulated the next 12 months under "carry on as now" and under each
change of habit that applies to that person: lower card use, register to vote, pause
applications, pay on time, pay more than the minimum, stop payday loans, stay in the
overdraft, report rent, remove a financial association, or build history with a
credit-builder card. `world.plan_profile` models how the file changes over time:
searches drop off after 12 months, defaults after 6 years, missed payments fade, and
accounts get older. We then compared the model's predicted gain for each step with the
true gain from the hidden formula.

| | Linear | GB monotonic | **GB (chosen)** |
|---|---|---|---|
| Model's #1 step is the truly best step (ties within 2 pts) | 87.2% | 83.5% | **94.5%** |
| Model's #1 step is in the true top 2 | 97.6% | 96.4% | **99.3%** |
| Mean rank correlation of all steps (Spearman) | 0.83 | 0.81 | **0.91** |
| Error in predicted points per step | 15.6 | 15.4 | **7.4** |
| #1 step actually lowers the score | 0.02% | 0.05% | **0.03%** |

**It works for every type of user.** The #1 step matches the truth for 90–99% of people in
every archetype (lowest: recovering after default 89.9%, payday cycle 90.1%) and in every
band (Very poor 93.0%, Poor 95.2%, Fair 94.9%, Good 94.4%, Excellent 98.8%). Point
estimates are least precise for the most damaged files (Very poor ±11 points), so the
page rounds to the nearest 5 and says "about".

**Stress test:** across 12,323 single improvements (one fewer missed payment, lower card
use, joining the electoral roll and so on), only 0.13% lowered the predicted score by
more than 5 points. The page also hides any step worth less than 3 points.

## 4. Patterns the model found

- **What matters most** (permutation importance, points of MAE lost when a feature is
  shuffled): card utilisation 63, account age 44, recent missed payments 43, time since
  last miss 17, applications 17, electoral roll 13, CCJ 13. Rent reporting and total limit
  matter least.
- **Utilisation has a sweet spot.** The average predicted score is flat from 5% to 15%
  use, starts falling at 20%, and drops sharply above 90%. That's why the page doesn't
  say "pay it all off": it picks the smallest pay-down that gets 85% of the benefit.
  Priya, for example, is told to get to about 20%, not 0%.
- **Short histories are fragile.** One extra application costs 17.8 points on a file
  under 2 years old, against 10.6 on a file over 10 years old. Joining the electoral roll
  is worth 73 points on a new file and 43 on an established one. The model learned both
  interactions without being told.
- **Ten situations** (k-means on the scaled features, named from each cluster's centre).
  The page uses these to tell people what usually helps others like them:

| Segment | Share | Median score | Most common #1 step | Median 12-month gain, all steps |
|---|---|---|---|---|
| Long, steady history | 29% | 937 | pause applications | +22 |
| Cards close to the limit | 20% | 692 | lower utilisation (69%) | +238 |
| Building a first track record | 13% | 710 | electoral roll | +155 |
| Juggling several credit problems | 7% | 252 | on-time payments | +579 |
| Brand new to credit | 6% | 683 | electoral roll | +118 |
| Linked to someone else's credit | 7% | 792 | lower utilisation / dissociate | +146 |
| Caught in short-term borrowing | 6% | 531 | lower utilisation | +374 |
| Rebuilding after a default | 5% | 397 | on-time payments | +393 |
| Rebuilding after a county court judgment | 4% | 474 | lower utilisation | +207 |
| Renting and building steadily | 4% | 806 | lower utilisation | +99 |

## 5. How it runs on the website

`train_model.py` exports the trees, bands and segment centres to
`frontend/public/credit-coach/model.json` (550 KB, about 150 KB gzipped). When someone
clicks **Improve my credit score** on the dashboard (or **Credit score coach** in the
menu), `/credit-score` downloads the model and runs `analyse()` from
`frontend/src/lib/credit-coach/engine.ts` in the browser. Their details never leave the
device. The page shows:

- the estimated score, band, points to the next band and similar-situation segment
- ranked steps with estimated points, timeframe, effort and plain-English how-tos (simple
  or detailed wording, depending on the accessibility settings)
- a 24-month projection: following the plan against carrying on as now
- what's helping and what's holding the score back, as points per factor
- a form to correct any detail. The plan updates straight away.

Each demo customer has a simulated credit file (`frontend/src/lib/credit-coach/profiles.ts`).
The SpendSense card balance comes from the live demo account, so a payment made in the
app changes the advice.
