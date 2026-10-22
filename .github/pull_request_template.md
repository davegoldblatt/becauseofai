## Entry change

- One entry file per change (`data/entries/<id>.yaml`), plus a `history` line dated today.
- Link the primary source for anything that carries a number.
- Say which of the four tests the change affects, if any.

## Checks

- [ ] `npm run validate` passes locally
- [ ] Achieved dates come from the methods section or registry, not the headline
- [ ] Absolute effect given next to the relative one where both exist
- [ ] No grade was changed without an argument in the history line
