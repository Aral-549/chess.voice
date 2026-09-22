# Contributing to VoiceChessmate

Thanks for your interest. This project has an unusual engineering discipline
for its size, because it is assistive software: a wrong move announced
confidently to a player who cannot see the board is worse than no answer at
all. The rules below exist to protect that guarantee.

## The one rule that matters

**Prefer making no move over making a wrong move.**

Every accuracy threshold, confirmation prompt, and rejected-parse path in this
codebase follows from that sentence. If a change makes the agent more likely to
act on an uncertain interpretation, it will not be merged, however much it
improves the happy path.

## Workflow

### 1. Contract before code

Behaviour lives in `contracts/` as plain input → expected-output tables, not in
code comments. Before changing a module's behaviour, check for its contract.

- If a contract exists, your change must match it — or amend the contract in a
  separate, clearly-labelled commit that a human reviews first.
- If no contract exists for what you are building, write one first and open it
  for review before implementing.

Where code and contract disagree, **the contract is the specification and the
code is the bug**. (Example: the token route's rate limit drifted to 60/min
while `contracts/assemblyai-voice-engine.md` case 2 specified 10/min. The code
was corrected, not the contract.)

### 2. Never grade your own work

Do not write tests that confirm code you just wrote, in the same pass. Either
hand off to a separate reviewer, or explicitly switch modes: your goal becomes
finding inputs that **break** what you just wrote, not confirming it works.

### 3. Tests are additive, not editable

`src/lib/__tests__/` holds hand-verified ground truth for chess legality, move
parsing, and the voice protocol. You may add cases. You may not rewrite or
delete existing ones without explicit human approval — a failing golden test is
a signal about your change, not a file that needs updating.

### 4. Every behaviour change needs a matching test change

A change to `src/lib/` (chess engine, tool handlers, voice engine) with no
corresponding test or contract change is incomplete, regardless of how obvious
it looks.

### 5. Bugs become permanent regression tests

Every bug gets an entry in `BUGLOG.md` and a test case that would have caught
it. A fix without the regression case is not fixed — it is hidden until the
next refactor.

## Definition of done

- [ ] Contract exists in `contracts/` and matches the implemented behaviour
- [ ] `npm test` passes, including new cases for this change
- [ ] `npx tsc --noEmit` and `npm run lint` are clean
- [ ] An adversarial pass has been run against the change
- [ ] If this closes a bug, `BUGLOG.md` and a regression case were both updated

## Local setup

```bash
npm install
cp .env.local.example .env.local   # add your AssemblyAI key
npm run dev
```

```bash
npm test              # 335 tests, 14 files
npx tsc --noEmit      # strict typecheck
npm run lint
```

## Accessibility requirements

This is not a preference list. A pull request that breaks any of these will be
rejected:

- **Every feature needs a keyboard path.** Voice complements the keyboard; it
  never replaces it. Blind players are expert keyboard users, and speech
  recognition can mishear — the keyboard cannot.
- **Do not add bare single-letter global shortcuts.** They collide with screen
  reader browse-mode quick keys and with algebraic notation. Keep
  `role="application"` scoped to the game area and move entry in its own field.
- **Announce through ARIA live regions.** A screen reader is already running at
  the user's tuned speech rate; live regions reach it instantly and respect
  that rate.
- **Never rely on colour alone** to convey state.

## Commit messages

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
Explain *why* in the body when the change is not self-evident.
