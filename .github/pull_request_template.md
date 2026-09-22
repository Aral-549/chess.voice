## What this changes

<!-- One or two sentences. Why, not just what. -->

## Definition of done

<!-- See CONTRIBUTING.md. Tick honestly; an unticked box with a reason is fine,
     an incorrectly ticked one is not. -->

- [ ] Contract in `contracts/` exists and matches the implemented behaviour
- [ ] `npm test` passes, including new cases covering this change
- [ ] `npx tsc --noEmit` and `npm run lint` are clean
- [ ] An adversarial pass was run — I actively tried to break this, not just
      confirm it works
- [ ] If this closes a bug: `BUGLOG.md` updated **and** a regression case added

## Accessibility

- [ ] Every new interaction has a keyboard path
- [ ] No new bare single-letter global shortcuts
- [ ] New state changes are announced via ARIA live regions
- [ ] No information is conveyed by colour alone

## Move-safety

- [ ] This change cannot cause a move to be played on an uncertain
      interpretation. Where input was ambiguous, the agent still declines
      rather than guessing.

## How I tested this

<!-- Include the FEN of any position you tested against, if relevant. -->
