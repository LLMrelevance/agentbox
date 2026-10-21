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

## Sentences that only point at other sentences

The hardest kind to see, because each one reads fine alone. Caught on the
guide pages in October 2026, where three sentences in a row said one thing:
"Give every task its own git worktree. That is the whole technical answer, and
it is one command. The rest of this page is about the part that costs you
time." The first carries information. The second labels the first. The third
describes the page.

- **Pointer sentences.** They open with "That is", "This is", "It is", and the
  pointing is the whole sentence. "That is the point." "It is neither." "That
  is the entire design question." Cut them, or fold the fact into the sentence
  before.
- **Page talk.** Sentences about the document rather than its subject. "The
  rest of this page is for...", "more on that below", "this section covers".
  A link already does this.
- **Announcing a list before giving it.** "Three honest limits on that figure."
  Then the three limits. Give the three.

Read each sentence alone and ask what a reader loses if it goes. If the answer
is nothing, it goes. Replacing it with a fact beats deleting when you need the
length.

## Voice and rhythm, which the rules above do not catch

Everything above is about words. A page can pass all of it and still read as
machine-made, and in October 2026 one did, twice. What a measurement of eight
pieces by Julia Evans, Simon Willison and Dan Luu found, against six pages that
had already been unslopped:

| | Them | Us |
|---|---|---|
| First person per 1,000 words | 44.9 | 1.3 |
| Sentences opening with a bare command | 0.0% | 5.0% |
| Mean sentence length | 21.8 | 14.9 |
| Sentences over 25 words | 37.5% | 10% |

- **Never open a sentence with a bare command.** Not one of the eight does.
  "Give every task its own git worktree" is an instruction manual shouting at a
  stranger. Say what is true or what happened and let the reader draw the
  instruction out of it. Inside a numbered how-to step a command is fine.
- **Put a person in it.** Every reference opens with somebody in a situation:
  "I have never been a C programmer but every so often I need to compile a
  C/C++ program from source." Writing that reports work says who did the work.
- **Never invent the person.** "We" attaches only to something that actually
  happened. No war stories, no "in our experience", no anecdote that did not
  occur. Faked experience is worse than no voice at all, and if no true
  first-person claim fits, write a plain statement instead.
- **Vary the length.** Sentences all the same length are the machine rhythm,
  and that monotone is what gets read as incoherent. Let a thought run to its
  end in one sentence rather than chopping it into three.
- **Measure body prose and FAQ answers apart.** An answer under a question
  heading should stay short and say "you". Body prose should not. Averaging
  the two describes neither, and chasing the average pads the FAQ.

## Punctuation and formatting

- **No em dashes.** Use a full stop or a comma.
- **No colons in copy**, including before a list or a code block, where a full
  stop reads just as well. Her rule, and it beats what the references do.
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
