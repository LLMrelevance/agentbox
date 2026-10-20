// A picture opened from a thread steps through the pictures of its own part of
// the conversation, not every picture the thread ever drew.
//
// What broke: on a long design thread a click on one picture opened it over a
// row of 28 thumbnails, most of them from rounds long past, and the open one was
// lost among them. The ask: only the pictures from the same conversation,
// including the one clicked. Measured in a built window on a four-round thread
// (scripts/scratch harness, 16 pictures): a click on a round-4 picture gave a
// strip of all 16, from the first screenshot to the last. picturesOnScreen read
// every picture in the pane.
//
// And a picture in a folder grid was listed under its bare file name while its
// click passed the full path, so it never found itself and opened alone.
//
// A part is a turn of yours and everything said after it, up to your next turn:
// the same sections the thread already rules off.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadParts } from '../renderer/src/her-turns.ts';
import { picturesBeside } from '../renderer/src/picture-view.ts';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';

const you = { who: 'you' };
const agent = { who: 'agent' };
const work = { kind: 'work' };

describe('which part of the thread each message is in', () => {
  it('your turn and the reply under it are one part, and your next turn starts the next', () => {
    expect(threadParts([you, agent, you, agent])).toEqual([0, 0, 1, 1]);
  });

  it('keeps every message of a long reply, and the work between them, in your part', () => {
    expect(threadParts([you, work, agent, work, agent, agent, you, agent])).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('keeps two of your messages in a row in one part', () => {
    expect(threadParts([you, you, agent, you, agent])).toEqual([0, 0, 0, 1, 1]);
  });

  it('puts what the agent said before you ever spoke in a part of its own', () => {
    expect(threadParts([agent, agent, you, agent])).toEqual([0, 0, 1, 1]);
  });

  it('starts a new part across the cut middle, whatever opens the far side', () => {
    expect(threadParts([you, agent, agent, agent], 1)).toEqual([0, 0, 1, 1]);
    expect(threadParts([you, agent, you, agent], 1)).toEqual([0, 0, 1, 1]);
  });
});

describe('the thread says which part each block is in', () => {
  const md = (text) => text;
  const html = renderToStaticMarkup(createElement(Thread, {
    events: [
      { at: 1, who: 'you', text: 'first ask' },
      { at: 2, who: 'it', text: 'first reply' },
      { at: 3, who: 'you', text: 'second ask' },
      { at: 4, who: 'it', text: 'second reply' },
    ],
    name: 'Claude', md, onWhole: () => {}, landOn: 'x',
  }));
  const partOf = (text) => {
    const at = html.indexOf(text);
    const open = html.lastIndexOf('class="thread-block', at);
    return /data-exchange="(\d+)"/.exec(html.slice(open, html.indexOf('>', open)))?.[1];
  };

  it('marks your ask and its reply alike, and the next ask apart', () => {
    expect(partOf('first ask')).toBe('0');
    expect(partOf('first reply')).toBe('0');
    expect(partOf('second ask')).toBe('1');
    expect(partOf('second reply')).toBe('1');
  });

  it('gives each message in a chat a part of its own, since a chat has no turns', () => {
    const chat = renderToStaticMarkup(createElement(Thread, {
      events: [{ at: 1, who: 'you', text: 'one' }, { at: 2, who: 'you', by: 'p-2', text: 'two' }],
      name: 'Claude', md, onWhole: () => {}, landOn: 'x', chat: true,
    }));
    const parts = [...chat.matchAll(/class="thread-block[^"]*"[^>]*data-exchange="(\d+)"/g)].map((m) => m[1]);
    expect(parts).toHaveLength(2);
    expect(new Set(parts).size).toBe(2);
  });
});

describe('the pictures a click steps through', () => {
  const shot = (path, section, url = `img://${path}`) => ({ path, url, section });
  const thread = [
    shot('attachments/pasted-1.png', '0'),
    shot('designs/r1/a.png', '0'),
    shot('designs/r1/b.png', '0'),
    shot('designs/r2/a.png', '1'),
    shot('designs/r2/b.png', '1'),
    shot('designs/r2/c.png', '1'),
  ];

  it('are the ones in its own part, in reading order, with the clicked one open', () => {
    const { pictures, start } = picturesBeside(thread, 4);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/a.png', 'designs/r2/b.png', 'designs/r2/c.png']);
    expect(start).toBe(1);
  });

  it('include the picture you sent with your ask', () => {
    const { pictures, start } = picturesBeside(thread, 2);
    expect(pictures.map((p) => p.path)).toEqual(['attachments/pasted-1.png', 'designs/r1/a.png', 'designs/r1/b.png']);
    expect(start).toBe(2);
  });

  it('is the one picture alone when its part has no other', () => {
    const { pictures, start } = picturesBeside([shot('a.png', '0'), shot('b.png', '1')], 1);
    expect(pictures.map((p) => p.path)).toEqual(['b.png']);
    expect(start).toBe(0);
  });

  it('shows a file once, however many times its part draws it', () => {
    const twice = [shot('designs/r2/a.png', '1', 'img://demo/designs/r2/a.png'), shot('/demo/designs/r2/a.png', '1', 'img://demo/designs/r2/a.png?look=2'), shot('designs/r2/b.png', '1')];
    const { pictures, start } = picturesBeside(twice, 1);
    expect(pictures.map((p) => p.path)).toEqual(['designs/r2/a.png', 'designs/r2/b.png']);
    expect(start).toBe(0);
  });

  it('keeps the same file in another part out of this one', () => {
    const reused = [shot('designs/shot.png', '0'), shot('designs/other.png', '1'), shot('designs/shot.png', '1')];
    const { pictures, start } = picturesBeside(reused, 2);
    expect(pictures.map((p) => p.path)).toEqual(['designs/other.png', 'designs/shot.png']);
    expect(start).toBe(1);
  });

  it('has nothing to show for a click that matched no picture', () => {
    expect(picturesBeside(thread, -1)).toEqual({ pictures: [], start: 0 });
  });
});

describe('every picture tells the viewer what it opens and where it was clicked', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

  it('a picture in a message names the path its click opens', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: 'designs/r1/a.png', roots: ['/demo'], onOpen: () => {} }));
    expect(html).toContain('data-picture="designs/r1/a.png"');
  });

  it('a picture in a folder grid names its whole path, not its bare name', () => {
    const shotButton = focus.slice(focus.indexOf('className="folder-preview-shot"'), focus.indexOf('</button>', focus.indexOf('className="folder-preview-shot"')));
    expect(shotButton).toMatch(/data-picture=\{file\}/);
    expect(shotButton).toMatch(/onOpen\(file, e\.currentTarget\)/);
  });

  it('the click hands over the picture that was pressed, all the way to the viewer', () => {
    expect(focus).toMatch(/onClick=\{\(e\) => onOpen\(path, e\.currentTarget\)\}/);
    expect(focus).toMatch(/if \(opensAsPicture\(href\)\) \{ openPicture\(href, from\); return; \}/);
  });
});
