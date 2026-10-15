---
name: unslop
description: Cut the habits that make writing read as machine-made. Use on anything you write while building Agentbox that a person will read, including code comments, commit messages, docs, CLAUDE.md, test headers, pull request text and your answer at the end of a task, or when asked to unslop, de-slop or make writing plain.
---

# Unslop

Scan what you wrote for the patterns below and rewrite. Keep the meaning and
the facts. Plain and specific beats polished.

## Never touch

- **Someone's own words.** A quote, a pasted message, copy a person proposed.
  Keep it character for character.
- **Words the app already shows people.** Copy is part of the design here and
  the maintainer reviews it. Apply this to new copy you are writing, and flag
  existing copy rather than rewriting it on your own.

## Content

- **Empty -ing tails.** "...highlighting the need for", "ensuring that",
  "reflecting a shift". Cut them, or say the actual thing.
- **Vague sources.** "Experts say", "it is widely known". Name the source or
  cut the claim.
- **Generic endings.** "This makes the app more robust." Say what changed, or
  stop a sentence earlier.
- **Feelings instead of facts.** "Search feels snappier" becomes "search
  answers in 40 ms instead of 900". If a sentence could sit unchanged in
  another project's docs, it says nothing about this one.

## Words

- **Machine vocabulary.** Delve, crucial, pivotal, robust, seamless, leverage,
  utilize, enhance, foster, showcase, underscore, landscape, tapestry,
  testament, intricate, vibrant, additionally. Use the plain word: use, help,
  show, many, if.
- **Fancy "is".** "Serves as", "stands as", "acts as", "boasts". Write "is"
  or "has".
- **Metaphor nouns that pose as technical terms.** Surface, substrate, wedge,
  vector, primitive, harness (as a metaphor), north star, flywheel, paradigm.
  Pick the concrete word.
- **Filler.** "In order to" is "to". "Due to the fact that" is "because".
  "It is important to note that" goes.
- **Stacked hedges.** "Could potentially possibly" is "may".
- **Adverbs propping up a weak verb.** "Significantly improves" becomes the
  measured change.

## Shape

- **"Not just X, but Y."** Say Y.
- **Forced threes.** List as many things as there are.
- **Synonym cycling.** Pick one name for a thing and repeat it.
- **Passive voice that hides who acts.** "The file is parsed" becomes "the
  loader parses the file".
- **Dense sentences.** If a reader has to go back over it, split it. One idea
  per sentence.
- **Over-compression.** Arrows, dropped articles and verbless fragments make
  the reader decode. "Bad date → exit 2" becomes "A bad date exits with code
  2 and writes nothing."
- **Mannered lines.** Aphorisms, punchy fragments for effect, code that
  "holds" or "rides along". Say what it does.

## Punctuation and formatting

- **No em dashes.** Use a full stop or a comma.
- **Colons** only before a list or an example.
- **Bold** for the one thing a skimmer must not miss, not every noun.
- **No bold-label lists that repeat themselves**, like "**Speed:** Speed
  improved". A bold lead-in that names the item, followed by new detail, is
  fine.
- **Sentence case headings**, straight quotes, no decorative emoji.

## Talking to a person

- No "Great question", "Certainly!", "I hope this helps", "Let me know if".
- No preamble. Start with the answer.
- Say what you measured and what you did not. "I don't know" is fine.

Adapted from pstack's `unslop` skill,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
