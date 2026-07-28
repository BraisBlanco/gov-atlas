# Data contract — how to add a country

Read [METHODOLOGY.md](METHODOLOGY.md) first. This document is the mechanics.

Your worked example is Spain: [`data/countries/ES.yml`](../data/countries/ES.yml) and
[`data/cabinets/ES-2023-11-21.yml`](../data/cabinets/ES-2023-11-21.yml). Copy its shape.

## The two files you create, and nothing else

```
data/countries/<ISO2>.yml            country metadata + a sourced population figure
data/cabinets/<ISO2>-<YYYY-MM-DD>.yml   one cabinet: its entities and its sources
```

Both are self-contained: sources live inside the cabinet file, not in a shared registry.
That is what lets several curators work at once without ever touching the same file. **Do
not edit any file outside these two paths.** If you believe a shared file needs to change —
a new policy area, a new exclusion reason — say so in your hand-off notes instead of
editing it; a new taxonomy id silently changes every country's comparison row.

## Procedure

1. **Find the legal instrument.** The decree, gazette publication or statute that
   *enumerates* the departments. This is the tier-1 source and it does most of the work. In
   Spain it is Real Decreto 829/2023; most countries have an equivalent. Prefer the
   consolidated text, and record which amendment it reflects in the source `note`.
2. **Archive it.** Get a real snapshot URL from a web archive. Do not invent a timestamp
   and do not paste the live URL into `archive_url` — the validator rejects both.
3. **List every entity in the official order.** Set `order` to follow the source's own
   sequence, and include the bodies you will *not* count.
4. **Classify.** `counts_as_ministry` plus, when false, an `exclusion_reason`.
5. **Tag policy areas** from `data/taxonomy/policy-areas.yml`, most prominent first.
6. **Handle the head of government.** Add the PM's office as an entity with
   `has_cabinet_seat: true`, `counts_as_ministry: false`,
   `exclusion_reason: head_of_government_office`. This is what makes the seat count come
   out right.
7. **Write `methodology_notes`** for anything a reader could reasonably dispute — in both
   languages, and especially any figure that differs from what other sources publish.
8. **Run the gate:** `npm run validate` must be clean before you finish.

## Field notes that are not obvious

**`name_en_provenance` / `name_es_provenance`** — `official` only when the government
itself publishes that name in that language (the Netherlands, Ireland and Malta do).
Otherwise `translated`. Marking your own translation `official` is the one error the
validator cannot catch, and it misleads every reader of the other-language site.

**`has_cabinet_seat`** — does this entity's head sit in the cabinet? Drives
`cabinet_seats_count`, which is deliberately a different number from the ministry count.

**`shared_head_with`** — one minister, two departments. List each entity in the other, both
ways: the validator rejects a one-sided link, because a seat count that depends on
traversal order is not a count.

**`head_count`** — leave it at 1. Set 2 only for genuine co-ministers of equal rank heading
one department.

**`valid_from` / `valid_to`** — leave both null for a department that lasted the whole term.
For a mid-term change, close the old entity with `valid_to` and open a new one with
`valid_from`; never rewrite the old entry, or the historical record disappears.

**`order`** — a contiguous 1..n covering every entity in the file, including the excluded
ones.

**`quote`** — verbatim, in the source's original language, long enough that a reader can
confirm the claim without opening the document. For the instrument that enumerates the
departments, quote the whole enumeration; Spain's file shows this.

## Awkward cases and how to record them

| Situation | What to do |
| --- | --- |
| One minister, two departments | Two entities, `shared_head_with` on both, both counted, one seat |
| Deputy PM who also holds a ministry | One entity for the ministry, counted. The deputy-PM title adds nothing |
| Deputy PM with no department | One entity, not counted, `deputy_head_without_portfolio` |
| Minister without portfolio | Not counted, `minister_without_portfolio`, `has_cabinet_seat: true` |
| Chancellery constituted as a ministry by law | Count it, and add a `methodology_notes` entry giving both figures |
| Ministry merged mid-term | Close both old entities with `valid_to`, open the merged one with `valid_from` |
| Ministry renamed, same body | Close and reopen with the new name and dates. A rename is a fact, not a typo |
| Sources disagree on the count | Follow the higher tier, and explain the discrepancy in `methodology_notes` |
| Two official names for one body | One entity; record the second as `duplicate_entity` if a source lists it separately |
| Caretaker government | Record it as its own cabinet. Leave `left_office: null` only if it is the sitting one |

## What the gate enforces

Run `npm run validate`. It is not advisory — CI fails on any error. The rules, by name, are
in [`scripts/lib/rules.ts`](../scripts/lib/rules.ts); the ones that catch people out:

- `entity-source-unresolved` — you cited a source id that is not in the file.
- `source-archive-required` — a tier 1 or 2 source with no archived snapshot.
- `source-archive-same-as-url` / `source-archive-host-unknown` — `archive_url` must be a
  real snapshot on a real archive.
- `source-tier-type-mismatch` — only a gazette or statute may claim tier 1.
- `exclusion-reason-required` / `-forbidden` / `-unknown` — every uncounted entity says why,
  in the project's own vocabulary.
- `policy-area-required` — a counted ministry with no policy area vanishes from every
  comparison view, so it is an error rather than an omission.
- `shared-head-symmetry` — both sides of a shared portfolio must declare it.
- `cabinet-id-mismatch` / `cabinet-filename-mismatch` — id is `<ISO2>-<took_office>`, and
  the filename matches the id.
- `multiple-current-cabinets` — exactly one cabinet per country may have
  `left_office: null`.

Warnings do not fail the build but are read: `source-unused` usually means a forgotten
citation, and `counted-ministry-without-seat` usually means a misclassification.

## Before you hand off

- [ ] `npm run validate` clean, no errors
- [ ] `npm run build:data` succeeds and your country appears in `site/public/data/counts.csv`
- [ ] The derived `ministries_count` equals the number your tier-1 source states — if it
      does not, the disagreement is explained in `methodology_notes`
- [ ] Every `archive_url` opens and shows the cited text
- [ ] `npm run report:coverage` shows your country at grade A or B, or your notes explain
      why it cannot be
- [ ] Hand-off notes list: every judgement call you made, every entity you excluded and
      why, and any taxonomy id you wished existed
