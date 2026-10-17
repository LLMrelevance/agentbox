// "You said there were nine images, but there were only three distinct
// designs, repeated twice, and you pulled images from much earlier in the
// thread instead of the current line" (2026-10-16). Neo numbered every picture
// the thread drew, oldest first, the same file once per place it appeared.
// Now each file counts once, the latest message's pictures are 1, 2, 3, and
// older ones are listed after them as earlier.
import { describe, expect, it } from 'vitest';
import { orderPictures } from '../renderer/src/neo/show.ts';
import { describeScreen } from '../renderer/src/neo/bridge.ts';

const pic = (src, block) => ({ src, block });

describe('which pictures Neo counts, and in what order', () => {
  it('counts a file once however many times the thread draws it', () => {
    const got = orderPictures([pic('a.png', 1), pic('b.png', 1), pic('c.png', 1), pic('a.png', 2), pic('b.png', 2), pic('c.png', 2), pic('a.png', 3), pic('b.png', 3), pic('c.png', 3)]);
    expect(got.order.length).toBe(3);
  });

  it('numbers the latest message\'s pictures first, in their own order', () => {
    const got = orderPictures([pic('old1.png', 1), pic('old2.png', 1), pic('new1.png', 5), pic('new2.png', 5), pic('new3.png', 5)]);
    expect(got.order.map((i) => got.srcs[i])).toEqual(['new1.png', 'new2.png', 'new3.png', 'old2.png', 'old1.png']);
    expect(got.latest).toBe(3);
  });

  it('a file repeated in the latest message keeps its place there, not its older one', () => {
    const got = orderPictures([pic('a.png', 1), pic('z.png', 1), pic('b.png', 4), pic('a.png', 4)]);
    expect(got.order.map((i) => got.srcs[i])).toEqual(['b.png', 'a.png', 'z.png']);
    expect(got.latest).toBe(2);
  });

  it('treats the same file asked for again (?look=2) as the same picture', () => {
    const got = orderPictures([pic('agentbox-img://file/x/a.png', 1), pic('agentbox-img://file/x/a.png?look=2', 2)]);
    expect(got.order.length).toBe(1);
  });

  it('has nothing to count in a thread with no pictures', () => {
    expect(orderPictures([])).toEqual({ order: [], srcs: [], latest: 0 });
  });
});

describe('what Neo is told about them', () => {
  const deps = (names, latest) => ({
    rows: () => [], focused: () => ({ id: 'w-1', product: 'p', title: 'T' }), outside: () => false,
    options: () => [], summary: () => '', pictureNames: () => names, latestPictureCount: () => latest,
  });

  it('says which are in the latest message and which are earlier', () => {
    const said = describeScreen(deps(['n1.png', 'n2.png', 'o1.png'], 2));
    expect(said).toMatch(/Pictures in the latest message:\n1\. n1\.png\n2\. n2\.png/);
    expect(said).toMatch(/Earlier in the thread:\n3\. o1\.png/);
  });

  it('says nothing of earlier ones when there are none', () => {
    expect(describeScreen(deps(['n1.png'], 1))).not.toMatch(/Earlier/);
  });
});

// "Screenshots may be getting shown on screen ... but they end up blocking the
// screen entirely" (2026-10-16). Neo lifted her own pasted screenshot of the
// app over the app. Her own pictures are never the "latest message's".
describe('her own pasted pictures', () => {
  it('are not what Neo puts up: the latest agent message\'s pictures are', () => {
    const got = orderPictures([pic('design.png', 1), { src: 'attachments/pasted-1.png', block: 2, mine: true }]);
    expect(got.order.map((i) => got.srcs[i])).toEqual(['design.png', 'attachments/pasted-1.png']);
    expect(got.latest).toBe(1);
  });

  it('a thread whose only pictures are hers has none to put up', () => {
    expect(orderPictures([{ src: 'attachments/pasted-1.png', block: 1, mine: true }]).latest).toBe(0);
  });
});

// "Whenever Neo puts up pictures she picks the first in the thread, super
// outdated. almost always we're only talking about the most recent message
// tho, esp regarding artifacts, like 99% of the time" (her words,
// 2026-10-16). The latest message held a design page and no pictures, so
// "latest" fell back to the last message that had pictures, far up the thread.
describe('the latest message is the latest message', () => {
  it('when the agent\'s latest message has no pictures, none count as latest', () => {
    const got = orderPictures([pic('storyboard.jpg', 1), pic('options2.jpg', 1)], 9);
    expect(got.latest).toBe(0);
    expect(got.order).toHaveLength(2);
  });

  it('pictures in the agent\'s latest message are the latest', () => {
    const got = orderPictures([pic('old.jpg', 1), pic('new.jpg', 9)], 9);
    expect(got.order.map((i) => got.srcs[i])).toEqual(['new.jpg', 'old.jpg']);
    expect(got.latest).toBe(1);
  });
});
