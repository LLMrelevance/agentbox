// What Neo's tool calls do in the inbox (renderer/src/neo/bridge.ts). The
// plan review (2026-10-16) found two ways a voice assistant goes wrong here:
// it acts on whatever row is open by the time the call lands rather than the
// one it was talking about, and it carries out "merge it" off a misheard word.
// So every action names a thread id and is refused if that thread is gone,
// and a pick whose words merge, ship, delete or push comes back `needs_yes`
// until the call says it was confirmed.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge, describeScreen, screenFor } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Pricing page copy', status: 'open', result: 'Two drafts ready. Which one?\n\n## Options\n1. Ship draft A (recommended)\n2. Rewrite' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'Fix the login bug', status: 'open', result: 'Fixed.' },
  { id: 'w-c', product: 'p2', productName: 'Site', title: 'New hero image', status: 'open' },
];

function setup({ focused = null, list = rows } = {}) {
  const calls = [];
  const rec = (name) => vi.fn(async (...a) => { calls.push([name, ...a]); });
  const deps = {
    rows: () => list,
    focused: () => focused,
    outside: () => false,
    options: (r) => (r.id === 'w-a' ? [{ n: 1, text: 'Ship draft A (recommended)' }, { n: 2, text: 'Rewrite' }] : []),
    summary: (r) => (r.result ?? '').split('\n')[0],
    projects: () => [{ slug: 'p1', name: 'Agentbox' }, { slug: 'p2', name: 'Site' }],
    open: rec('open'), pick: rec('pick'), reply: rec('reply'), close: rec('close'),
    compose: vi.fn(async (text, product) => { calls.push(['compose', text, product]); return { id: 'w-new' }; }),
    undo: vi.fn(async () => { calls.push(['undo']); return 'done'; }),
    glow: rec('glow'),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('acting on a named thread', () => {
  it('opens the thread it named and lights it up', async () => {
    const { act, calls } = setup();
    const r = await act('open_thread', { id: 'w-b' });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['open', rows[1]]);
    expect(calls.some(([n]) => n === 'glow')).toBe(true);
  });

  it('refuses a thread that is no longer in the inbox, and touches nothing', async () => {
    const { act, calls } = setup();
    const r = await act('reply', { id: 'w-gone', text: 'hi' });
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('replies on the named thread, not on the one that is open', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('reply', { id: 'w-b', text: 'Thanks, close it after the test.' });
    expect(calls).toContainEqual(['reply', rows[1], 'Thanks, close it after the test.', { attach: true }]);
  });

  it('closes the named thread', async () => {
    const { act, calls } = setup();
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['close', rows[2]]);
  });

  it('does not claim a close the app stopped to ask about', async () => {
    const { act, deps } = setup();
    deps.close = async () => 'asked';
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });
});

describe('picking an option', () => {
  it('asks first when the option would ship or merge', async () => {
    const { act, calls } = setup();
    const r = await act('pick_option', { id: 'w-a', n: 1 });
    expect(r).toMatchObject({ ok: false, status: 'needs_yes' });
    expect(r.said).toMatch(/Ship draft A/);
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('goes ahead once the person said yes to the option it asked about', async () => {
    const { act, calls } = setup();
    await act('pick_option', { id: 'w-a', n: 1 });
    const r = await act('pick_option', { id: 'w-a', n: 1, confirmed: true });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['pick', rows[0], 1]);
  });

  // Codex review, 2026-10-16: a bare `confirmed: true` was enough, so a yes
  // could carry out an option nobody had read out.
  it('asks anyway when the call claims a yes it never asked for', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1, confirmed: true })).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('does not let a yes carry over to an option whose words changed meanwhile', async () => {
    const { act, calls, deps } = setup();
    await act('pick_option', { id: 'w-a', n: 1 });
    deps.options = () => [{ n: 1, text: 'Delete the branch' }];
    expect(await act('pick_option', { id: 'w-a', n: 1, confirmed: true })).toMatchObject({ ok: false, status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('does not let a yes for one thread pick on another', async () => {
    const list = [rows[0], { ...rows[1], id: 'w-z' }];
    const { act, calls, deps } = setup({ list });
    deps.options = () => [{ n: 1, text: 'Ship draft A (recommended)' }];
    await act('pick_option', { id: 'w-a', n: 1 });
    expect(await act('pick_option', { id: 'w-z', n: 1, confirmed: true })).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('says so when the app asked its own question instead of picking', async () => {
    const { act, deps } = setup();
    deps.pick = async () => 'asked';
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });

  it('picks a harmless option without asking', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['pick', rows[0], 2]);
  });

  it('refuses an option number the thread does not offer', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 3 })).toMatchObject({ ok: false, status: 'refused' });
    expect(await act('pick_option', { id: 'w-b', n: 1 })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });
});

describe('moving through the inbox', () => {
  it('opens the first thread when none is open', async () => {
    const { act, calls } = setup();
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[0]]);
  });

  it('opens the one after the open thread', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[1]]);
  });

  it('says so at the end of the inbox rather than wrapping round', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    const r = await act('next_thread', {});
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'open')).toBe(false);
  });
});

describe('a new thread', () => {
  it('goes to the project named, by name or slug', async () => {
    const { act, calls } = setup();
    await act('new_thread', { text: 'Make the hero warmer', project: 'site' });
    expect(calls).toContainEqual(['compose', 'Make the hero warmer', 'p2']);
  });

  it('goes to the open thread\'s project when none is named', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    await act('new_thread', { text: 'Another one' });
    expect(calls).toContainEqual(['compose', 'Another one', 'p2']);
  });

  it('refuses a project that does not exist rather than guessing', async () => {
    const { act, calls } = setup();
    expect(await act('new_thread', { text: 'x', project: 'Nope' })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });
});

describe('what Neo is told the screen shows', () => {
  it('lists the inbox with ids, and the open thread with its summary and options', () => {
    const { deps } = setup({ focused: rows[0] });
    const s = describeScreen(deps);
    expect(s).toMatch(/w-a/);
    expect(s).toMatch(/Fix the login bug/);
    expect(s).toMatch(/Open thread: Pricing page copy/);
    expect(s).toMatch(/1\. Ship draft A/);
  });

  it('says when nothing is waiting', () => {
    const { deps } = setup({ list: [] });
    expect(describeScreen(deps)).toMatch(/nothing waiting/i);
  });

  it('keeps a long inbox short', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `w-${i}`, product: 'p1', productName: 'A', title: `Thread ${i}`, status: 'open' }));
    const { deps } = setup({ list: many });
    const s = describeScreen(deps);
    expect(s).toMatch(/Thread 0\b/);
    expect(s).not.toMatch(/Thread 39/);
    expect(s).toMatch(/40 threads/);
  });

  it('get_screen answers with the same description', async () => {
    const { act, deps } = setup();
    const r = await act('get_screen', {});
    expect(r).toMatchObject({ ok: true, said: describeScreen(deps) });
  });
});

describe('undo', () => {
  it('undoes the last thing, and says when there is nothing to undo', async () => {
    const { act, deps } = setup();
    expect(await act('undo', {})).toMatchObject({ ok: true });
    deps.undo.mockResolvedValueOnce('none');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/nothing/) });
  });

  it('leaves an old action for the person to take back with Z', async () => {
    const { act, deps } = setup();
    deps.undo.mockResolvedValueOnce('old');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/press Z/) });
  });
});

// She said "option one" and Neo still asked her to approve (2026-10-16). Her
// own words naming the option are the yes; a yes is asked for only when Neo
// is inferring the pick ("do it", "sounds good").
describe('the person naming the option is the yes', () => {
  const heard = (words) => ({ heard: words });
  it.each(['option one', 'Option 1.', 'go with the first one', 'merge it', 'yeah merge it', 'one'])('"%s" picks Merge it at once', async (words) => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1 }, heard(words.replace('merge', 'ship')))).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['pick', rows[0], 1]);
  });

  it.each(['do it', 'sounds good', 'yes', 'option two', "don't ship it", 'wait, not option one', 'what does option one do', 'option one?'])('"%s" still asks', async (words) => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1 }, heard(words))).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });
});

describe('films and sounds in the open thread', () => {
  it('plays the one asked for and says its name', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async (action, n) => ({ name: `clip-${n}.mp4`, count: 2 }));
    expect(await act('media', { action: 'play', n: 2 })).toMatchObject({ ok: true, said: expect.stringMatching(/clip-2\.mp4/) });
    expect(deps.media).toHaveBeenCalledWith('play', 2);
  });

  it('plays the first when none is named', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async () => ({ name: 'a.mp4', count: 1 }));
    await act('media', { action: 'play' });
    expect(deps.media).toHaveBeenCalledWith('play', 1);
  });

  it('says so when the thread has none', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async () => null);
    expect(await act('media', { action: 'play' })).toMatchObject({ ok: false, said: expect.stringMatching(/no film|nothing to play/i) });
  });

  it('lists them in what Neo is told is on screen', () => {
    const { deps } = setup({ focused: rows[0] });
    deps.mediaNames = () => ['walkthrough.mp4', 'voice-a.m4a'];
    expect(describeScreen(deps)).toMatch(/1\. walkthrough\.mp4/);
  });
});

// "When it goes into a new task, I expect it to really quickly summarize what
// I need to know" (2026-10-16). It stayed quiet: opening said only "Opened X".
describe('opening a thread hands Neo what to brief her with', () => {
  it('carries the latest from the agent and the options', async () => {
    const { act } = setup();
    const r = await act('open_thread', { id: 'w-a' });
    expect(r.said).toMatch(/Two drafts ready/);
    expect(r.said).toMatch(/1\. Ship draft A/);
  });

  it('and so does moving to the next one', async () => {
    const { act } = setup();
    const r = await act('next_thread', {});
    expect(r.said).toMatch(/Pricing page copy/);
    expect(r.said).toMatch(/Options/);
  });
});

describe('any command by name', () => {
  function withCommands(extra = {}) {
    const ran = [];
    const t = setup();
    t.deps.commands = () => [
      { id: 'pause', label: 'Pause agents', hint: 'no new sessions spawn', run: () => ran.push('pause') },
      { id: 'flip-view', label: 'Show as a board', keywords: 'view board list columns', run: () => ran.push('flip-view') },
      { id: 'done', label: 'Close Task', run: () => ran.push('done') },
      { id: 'keyhints', label: 'Turn on keyboard shortcut hints', run: () => ran.push('keyhints') },
    ];
    Object.assign(t.deps, extra);
    return { ...t, ran };
  }

  it('finds commands by her words, best first, without reading out the whole list', async () => {
    const { act } = withCommands();
    const r = await act('find_commands', { query: 'board' });
    expect(r.said).toMatch(/flip-view.*Show as a board/);
    expect(r.said).not.toMatch(/keyboard shortcut hints/);
  });

  it('puts the rare word first: "open the settings" finds Settings, not every Open', async () => {
    const { act, deps } = withCommands();
    deps.commands = () => [
      { id: 'open-terminal', label: 'Open Terminal', run: () => {} },
      { id: 'demo', label: 'Open a demo inbox', run: () => {} },
      { id: 'settings', label: 'Settings…', hint: 'the workspace, and every project', run: () => {} },
    ];
    const r = await act('find_commands', { query: 'open the settings' });
    expect(r.said.split('\n')[0]).toMatch(/\[settings\]/);
  });

  it('says when nothing matches', async () => {
    const { act } = withCommands();
    expect(await act('find_commands', { query: 'teleport' })).toMatchObject({ ok: false });
  });

  it('runs a harmless command at once', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'flip-view' })).toMatchObject({ ok: true, said: expect.stringMatching(/Show as a board/) });
    expect(ran).toEqual(['flip-view']);
  });

  it('refuses an id that is not in the list now', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'rm-rf' })).toMatchObject({ ok: false, status: 'refused' });
    expect(ran).toEqual([]);
  });

  it('asks before one that stops agents or closes work, unless her words named it', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'pause' }, { heard: 'do that' })).toMatchObject({ status: 'needs_yes' });
    expect(ran).toEqual([]);
    expect(await act('run_command', { id: 'pause' }, { heard: 'pause the agents' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['pause']);
  });

  it('takes a yes after asking', async () => {
    const { act, ran } = withCommands();
    await act('run_command', { id: 'done' }, { heard: 'yeah do it' });
    expect(await act('run_command', { id: 'done', confirmed: true }, { heard: 'yes' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['done']);
  });
});

describe('scrolling and showing', () => {
  it('scrolls, and says when there is nothing to scroll', async () => {
    const { act, deps } = setup();
    deps.scroll = vi.fn(() => true);
    expect(await act('scroll', { where: 'up' })).toMatchObject({ ok: true });
    expect(deps.scroll).toHaveBeenCalledWith('up');
    deps.scroll = () => false;
    expect(await act('scroll', { where: 'up' })).toMatchObject({ ok: false });
  });

  it('shows the pictures she named in the layout she asked for', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['a.png', 'b.png', 'c.png'];
    deps.show = vi.fn(async () => true);
    expect(await act('show', { pictures: [1, 3], layout: 'side_by_side' })).toMatchObject({ ok: true });
    expect(deps.show).toHaveBeenCalledWith([1, 3], 'side_by_side');
  });

  it('refuses a picture number the thread does not have', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['a.png'];
    deps.show = vi.fn(async () => true);
    expect(await act('show', { pictures: [1, 3], layout: 'side_by_side' })).toMatchObject({ ok: false, said: expect.stringMatching(/1 picture/) });
    expect(deps.show).not.toHaveBeenCalled();
  });

  it('lists the pictures in what Neo is told is on screen', () => {
    const { deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['round9.png', 'round10.png'];
    expect(describeScreen(deps)).toMatch(/Pictures in the latest message:\n1\. round9\.png/);
  });
});

describe('what Neo reads of an agent\'s words', () => {
  it('names a picture rather than spelling out its address, and drops markdown', async () => {
    const { act, deps } = setup();
    deps.summary = () => '**Three drafts.** ![design 1](data:image/png;base64,AAAA) and [the doc](https://x.y/z)';
    const r = await act('open_thread', { id: 'w-a' });
    expect(r.said).toMatch(/Three drafts\. \[picture: design 1\] and the doc/);
    expect(r.said).not.toMatch(/base64|https|\*\*/);
  });
});

// Codex review, 2026-10-16 (third pass).
describe('a yes is for the thing it was asked about', () => {
  it('a yes to approving one thread does not approve the next one opened', async () => {
    const ran = [];
    const t = setup({ focused: rows[0] });
    let target = rows[0];
    t.deps.focused = () => target;
    t.deps.commands = () => [{ id: 'approve', label: 'Approve Recommended', run: () => ran.push(target.id) }];
    expect(await t.act('run_command', { id: 'approve' }, { heard: 'do it' })).toMatchObject({ status: 'needs_yes' });
    target = rows[1];
    expect(await t.act('run_command', { id: 'approve', confirmed: true }, { heard: 'yes' })).toMatchObject({ status: 'needs_yes' });
    expect(ran).toEqual([]);
  });

  it('a curly apostrophe still says no', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1 }, { heard: 'don\u2019t ship it' })).toMatchObject({ status: 'needs_yes' });
    const t2 = setup();
    t2.deps.commands = () => [{ id: 'pause', label: 'Pause agents', run: () => calls.push(['pause']) }];
    expect(await t2.act('run_command', { id: 'pause' }, { heard: 'don\u2019t pause the agents' })).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick' || n === 'pause')).toBe(false);
  });
});

describe('a command is done when it is done', () => {
  it('waits for a command that takes a moment, and reports one that fails', async () => {
    const t = setup();
    let finished = false;
    t.deps.commands = () => [
      { id: 'flip-view', label: 'Show as a board', run: async () => { await new Promise((r) => setTimeout(r, 20)); finished = true; } },
      { id: 'keyhints', label: 'Turn on hints', run: async () => { throw new Error('no'); } },
    ];
    expect(await t.act('run_command', { id: 'flip-view' })).toMatchObject({ ok: true });
    expect(finished).toBe(true);
    expect(await t.act('run_command', { id: 'keyhints' })).toMatchObject({ ok: false, status: 'failed' });
  });

  it('"Close Task" goes the way close_thread does, so a close the app paused on is not called done', async () => {
    const t = setup({ focused: rows[2] });
    t.deps.close = async () => 'asked';
    t.deps.commands = () => [{ id: 'done', label: 'Close Task', run: () => { throw new Error('should go through close'); } }];
    expect(await t.act('run_command', { id: 'done' }, { heard: 'close it' })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });
});

// "Tried to reopen it, but that thread's not in the inbox anymore" while the
// JARVIS thread sat at the top of her search, marked Working (2026-10-16): Neo
// looked only in Needs you, and a thread an agent is on is In progress.
describe('a thread is found wherever it is', () => {
  it('opens a thread that is in progress, not only one that needs her', async () => {
    const t = setup();
    const working = { id: 'w-run', product: 'p1', productName: 'Agentbox', title: 'JARVIS for Agentbox', status: 'claimed' };
    t.deps.threadsAnywhere = () => [...rows, working];
    expect(await t.act('open_thread', { id: 'w-run' })).toMatchObject({ ok: true });
    expect(t.calls).toContainEqual(['open', working]);
  });

  it('still says so when a thread is nowhere at all', async () => {
    const t = setup();
    t.deps.threadsAnywhere = () => rows;
    expect(await t.act('open_thread', { id: 'w-nowhere' })).toMatchObject({ ok: false, said: expect.not.stringMatching(/inbox/) });
  });

  it('get_screen offers the threads that are in progress too, so Neo can name them', () => {
    const t = setup();
    t.deps.threadsAnywhere = () => [...rows, { id: 'w-run', product: 'p1', productName: 'Agentbox', title: 'JARVIS for Agentbox', status: 'claimed' }];
    expect(describeScreen(t.deps)).toMatch(/Also open:[\s\S]*\[w-run\] JARVIS for Agentbox/);
  });
});

// "It'd be very helpful for the agent to just do that as it's describing it.
// The idea is principally that Neo or our JARVIS shows us, without using our
// hands, exactly what we need to know to make a decision as quickly as
// possible" (her words, 2026-10-16). Opening a thread puts the latest
// message's pictures up by itself.
describe('opening a thread shows what she needs to decide', () => {
  function withPictures(latest, names) {
    const t = setup();
    t.deps.pictureNames = () => names;
    t.deps.latestPictureCount = () => latest;
    t.deps.waitForPictures = async () => {};
    t.deps.show = vi.fn(async () => true);
    return t;
  }

  // Put up beside the thread, never over it (her words: "make sure any
  // screenshot used for context does not take over the user's screen").
  it('puts a single picture up beside the thread', async () => {
    const t = withPictures(1, ['only.png', 'older.png']);
    const r = await t.act('open_thread', { id: 'w-a' });
    expect(t.deps.show).toHaveBeenCalledWith([1], 'peek');
    expect(r.said).toMatch(/beside the thread now/i);
  });

  it('and two to four the same way', async () => {
    const t = withPictures(3, ['a.png', 'b.png', 'c.png', 'old.png']);
    await t.act('next_thread', {});
    expect(t.deps.show).toHaveBeenCalledWith([1, 2, 3], 'peek');
  });

  it('shows the first four of more', async () => {
    const t = withPictures(6, ['1', '2', '3', '4', '5', '6']);
    await t.act('open_thread', { id: 'w-a' });
    expect(t.deps.show).toHaveBeenCalledWith([1, 2, 3, 4], 'peek');
  });

  it('shows nothing when the latest message has no pictures, even if older ones do', async () => {
    const t = withPictures(0, ['old.png']);
    await t.act('open_thread', { id: 'w-a' });
    expect(t.deps.show.mock.calls.filter(([, layout]) => layout !== 'close')).toEqual([]);
  });
});

// "I had an image in the chat that I wanted to provide along with the
// feedback you were going to paste. You kept sending messages but never sent
// the image" (her words, 2026-10-16).
describe('a picture in her reply box goes with Neo\'s words when she means it', () => {
  it('asks the app to send the box\'s pictures with the words', async () => {
    const t = setup();
    t.deps.reply = vi.fn(async () => 'with-pictures');
    const r = await t.act('reply', { id: 'w-b', text: 'Here is the bug, see the screenshot.', attach: true });
    expect(t.deps.reply).toHaveBeenCalledWith(rows[1], 'Here is the bug, see the screenshot.', { attach: true });
    expect(r.said).toMatch(/with the pictures/);
  });

  it('says so when there was no picture to send', async () => {
    const t = setup();
    t.deps.reply = vi.fn(async () => 'no-pictures');
    expect((await t.act('reply', { id: 'w-b', text: 'see the image', attach: true })).said).toMatch(/no picture in the reply box/);
  });
});

// "When I ask Neo to snooze the current thread for 10 minutes, Neo confirms
// that it was snoozed, but the thread remains visible on the screen and the
// PNG image is still displayed" (2026-10-16). Neo ran ⌘K's Later row, which
// only opens the time picker, and said it was done; the picture it had put
// up stayed up.
describe('putting a thread off', () => {
  function withLater() {
    const t = setup({ focused: rows[0] });
    t.deps.later = vi.fn(async () => {});
    t.deps.show = vi.fn(async () => true);
    t.deps.now = () => Date.parse('2026-10-16T17:00:00');
    return t;
  }

  it('moves the thread to Later for the minutes she said, with the time on it', async () => {
    const t = withLater();
    const r = await t.act('later', { id: 'w-a', minutes: 10 });
    expect(t.deps.later).toHaveBeenCalledWith(rows[0], Date.parse('2026-10-16T17:10:00'), expect.stringMatching(/10 minutes/));
    expect(r).toMatchObject({ ok: true, said: expect.stringMatching(/Later.*10 minutes/) });
  });

  it('takes a clock time too', async () => {
    const t = withLater();
    await t.act('later', { id: 'w-a', at: '2026-10-17T09:00' });
    expect(t.deps.later).toHaveBeenCalledWith(rows[0], Date.parse('2026-10-17T09:00:00'), expect.any(String));
  });

  it('refuses a time in the past or with nothing to go on, and moves nothing', async () => {
    const t = withLater();
    expect(await t.act('later', { id: 'w-a', at: '2026-10-15T09:00' })).toMatchObject({ ok: false });
    expect(await t.act('later', { id: 'w-a' })).toMatchObject({ ok: false });
    expect(t.deps.later).not.toHaveBeenCalled();
  });

  it('takes down any picture it had up', async () => {
    const t = withLater();
    await t.act('later', { id: 'w-a', minutes: 10 });
    expect(t.deps.show).toHaveBeenCalledWith([], 'close');
  });

  it('will not run ⌘K\'s Later row, which only opens the picker, and says to use a time', async () => {
    const t = withLater();
    const ran = [];
    t.deps.commands = () => [{ id: 'snooze', label: 'Later', run: () => ran.push('later-picker') }];
    expect(await t.act('run_command', { id: 'snooze' })).toMatchObject({ ok: false, said: expect.stringMatching(/later/) });
    expect(ran).toEqual([]);
  });
});

describe('a picture Neo put up comes down when the thread changes', () => {
  it.each([['next_thread', {}], ['open_thread', { id: 'w-b' }], ['close_thread', { id: 'w-a' }]])('%s takes it down first', async (name, args) => {
    const t = setup({ focused: rows[0] });
    t.deps.show = vi.fn(async () => true);
    await t.act(name, args);
    expect(t.deps.show.mock.calls[0]).toEqual([[], 'close']);
  });
});

// From the report that landed on the wrong thread (her screenshot, 2026-10-16):
// "The assistant switched to the wrong task, snoozed the wrong item, and then
// was unable to return to the original JARVIS task ... confirm the actual
// state change before reporting success, and provide a reliable way to
// return to the task the user requested."
describe('acting on the thread she means, and getting back to it', () => {
  it('"this one" means the thread on screen, whatever id came with the call', async () => {
    const t = setup({ focused: rows[1] });
    t.deps.later = vi.fn(async () => 'done');
    t.deps.now = () => Date.parse('2026-10-16T17:00:00');
    await t.act('later', { id: 'w-a', minutes: 10 }, { heard: 'snooze this one for ten minutes' });
    expect(t.deps.later.mock.calls[0][0]).toBe(rows[1]);
  });

  it('a thread named by id with no "this" is the one named', async () => {
    const t = setup({ focused: rows[1] });
    t.deps.later = vi.fn(async () => 'done');
    t.deps.now = () => Date.parse('2026-10-16T17:00:00');
    await t.act('later', { id: 'w-a', minutes: 10 }, { heard: 'snooze the pricing one for ten minutes' });
    expect(t.deps.later.mock.calls[0][0]).toBe(rows[0]);
  });

  it('does not say a thread was put off when it is still there', async () => {
    const t = setup({ focused: rows[0] });
    t.deps.later = vi.fn(async () => 'asked');
    t.deps.now = () => Date.parse('2026-10-16T17:00:00');
    expect(await t.act('later', { id: 'w-a', minutes: 10 })).toMatchObject({ ok: false });
  });

  it('goes back to the thread she was on before Neo moved her', async () => {
    let open = rows[0];
    const t = setup();
    t.deps.focused = () => open;
    t.deps.open = vi.fn((r) => { open = r; });
    await t.act('next_thread', {});
    expect(open).toBe(rows[1]);
    expect(await t.act('go_back', {})).toMatchObject({ ok: true, said: expect.stringMatching(/Pricing page copy/) });
    expect(open).toBe(rows[0]);
  });

  it('says so when there is nowhere to go back to', async () => {
    const t = setup({ focused: rows[0] });
    expect(await t.act('go_back', {})).toMatchObject({ ok: false });
  });
});

// "When I ask Neo to give feedback, it often appears to create a new task or
// thread instead of adding the feedback to the existing JARVIS task"
// (2026-10-16).
describe('feedback is a reply, not new work', () => {
  it('refuses a new thread she did not ask for in words', async () => {
    const t = setup({ focused: rows[0] });
    expect(await t.act('new_thread', { text: 'Neo kept the picture up' }, { heard: 'give that as feedback' })).toMatchObject({ ok: false, said: expect.stringMatching(/reply/) });
    expect(t.calls.some(([n]) => n === 'compose')).toBe(false);
  });

  it('starts one when she asks for new work', async () => {
    const t = setup({ focused: rows[0] });
    expect(await t.act('new_thread', { text: 'Redo the pricing page' }, { heard: 'start a new task to redo the pricing page' })).toMatchObject({ ok: true });
  });
});

// "If a screenshot is present alongside feedback, it should probably be
// treated as an implicit request to send that screenshot with the message"
// (her words, 2026-10-16).
describe('a screenshot in the reply box goes with the words by default', () => {
  it('asks for the box\'s pictures without being told to, and says nothing when there were none', async () => {
    const t = setup();
    t.deps.reply = vi.fn(async () => 'no-pictures');
    const r = await t.act('reply', { id: 'w-b', text: 'feedback' });
    expect(t.deps.reply).toHaveBeenCalledWith(rows[1], 'feedback', { attach: true });
    expect(r.said).toBe('Sent.');
  });

  it('leaves them out when she says so', async () => {
    const t = setup();
    t.deps.reply = vi.fn(async () => undefined);
    await t.act('reply', { id: 'w-b', text: 'just the words', attach: false });
    expect(t.deps.reply).toHaveBeenCalledWith(rows[1], 'just the words', { attach: false });
  });
});

// What the Decisions trial run is told is on screen (plans/neo-decisions.md).
describe('the screen for the trial run', () => {
  it('has the open thread with its options and pictures, the threads listed, and the commands', () => {
    const t = setup({ focused: rows[0] });
    t.deps.pictureNames = () => ['a.png', 'b.png'];
    t.deps.commands = () => [{ id: 'pause', label: 'Pause agents', run: () => {} }];
    t.deps.threadsAnywhere = () => [...rows, { id: 'w-run', product: 'p1', title: 'Working one', status: 'claimed' }, { id: 'w-old', product: 'p1', title: 'Done one', status: 'done' }];
    const s = screenFor(t.deps, true);
    expect(s.open).toMatchObject({ id: 'w-a', title: 'Pricing page copy', options: [{ n: 1, text: 'Ship draft A (recommended)' }, { n: 2, text: 'Rewrite' }], pictures: [{ n: 1, name: 'a.png' }, { n: 2, name: 'b.png' }] });
    expect(s.rows.map((r) => r.id)).toEqual(['w-a', 'w-b', 'w-c', 'w-run']);
    expect(s.commands).toEqual([{ id: 'pause', label: 'Pause agents' }]);
    expect(s.canGoBack).toBe(true);
  });

  it('has no open thread when none is open', () => {
    expect(screenFor(setup().deps, false).open).toBeNull();
  });

  it('knows when there is somewhere to go back to', async () => {
    let open = rows[0];
    const t = setup();
    t.deps.focused = () => open;
    t.deps.open = (r) => { open = r; };
    const act = neoBridge(t.deps);
    expect(act.canGoBack()).toBe(false);
    await act('next_thread', {});
    expect(act.canGoBack()).toBe(true);
  });
});

// Same report: with no picture in the latest message, its design page is what
// she needs to decide, so opening the thread opens that beside it.
describe('opening a thread shows the latest message\'s design page when it has no picture', () => {
  it('opens the first file of the latest message', async () => {
    const t = setup();
    t.deps.pictureNames = () => ['old.jpg'];
    t.deps.latestPictureCount = () => 0;
    t.deps.waitForPictures = async () => {};
    t.deps.show = vi.fn(async () => true);
    t.deps.fileNames = () => ['section3-into-2m04-r3.html'];
    t.deps.openFile = vi.fn(async () => true);
    const r = await t.act('open_thread', { id: 'w-a' });
    expect(t.deps.openFile).toHaveBeenCalledWith(1);
    expect(t.deps.show.mock.calls.filter(([, l]) => l !== 'close')).toEqual([]);
    expect(r.said).toMatch(/section3-into-2m04-r3\.html/);
  });

  it('a file can be opened by its number', async () => {
    const t = setup({ focused: rows[0] });
    t.deps.fileNames = () => ['a.html', 'b.html'];
    t.deps.openFile = vi.fn(async () => true);
    expect(await t.act('open_file', { n: 2 })).toMatchObject({ ok: true, said: expect.stringMatching(/b\.html/) });
    expect(t.deps.openFile).toHaveBeenCalledWith(2);
    expect(await t.act('open_file', { n: 3 })).toMatchObject({ ok: false });
  });

  it('the screen for the Decisions API lists the files', () => {
    const t = setup({ focused: rows[0] });
    t.deps.fileNames = () => ['a.html'];
    expect(screenFor(t.deps, false).open.files).toEqual([{ n: 1, name: 'a.html' }]);
  });
});
