// A picture in a thread opens large in the middle of the window, not in the
// side pane.
//
// What broke: a click on a picture opened it in the document pane beside the
// thread, at half the window and squeezed by the message column. The ask was
// "just to see it larger and in the center". Measured on the build: a click on
// a picture in a message called onOpenDoc, which is the pane.
//
// This pins the part with no picture: which clicks open the floating view, and
// the zoom and stepping arithmetic it uses. The look is in the screenshots on
// the thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  opensAsPicture, fitScale, clickZoom, zoomBy, stepTo, MAX_ZOOM, moveFrame, MIN_FRAME, panToKeep,
} from '../renderer/src/picture-view.ts';

describe('which clicks open the floating view', () => {
  it('opens every picture kind the pane knew', () => {
    for (const p of ['attachments/pasted-55706.png', 'designs/w-1/round8/1-eight-words.png', '/Users/x/shot.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg', 'shot.png?v=2']) {
      expect(opensAsPicture(p), p).toBe(true);
    }
  });

  it('leaves pages, notes, changes, films and web pages where they went before', () => {
    for (const p of ['designs/options.html', 'STATE.md', 'w-1.change', 'take.mp4', 'report.pdf', 'https://example.com/a.png', 'designs/', '', null, undefined]) {
      expect(opensAsPicture(p), String(p)).toBe(false);
    }
  });

  it('is asked before the pane in the thread', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    const open = focus.slice(focus.indexOf('const openHref'));
    expect(open.indexOf('opensAsPicture(href)')).toBeGreaterThan(-1);
    expect(open.indexOf('opensAsPicture(href)')).toBeLessThan(open.indexOf('onOpenDoc(href)'));
  });
});

describe('how big it is drawn', () => {
  it('fits a big screenshot inside the box', () => {
    expect(fitScale({ w: 3420, h: 2130 }, { w: 1710, h: 1065 })).toBeCloseTo(0.5);
    expect(fitScale({ w: 1000, h: 4000 }, { w: 1600, h: 1000 })).toBeCloseTo(0.25);
  });

  it('never blows a small picture up past its own size', () => {
    expect(fitScale({ w: 200, h: 100 }, { w: 1600, h: 1000 })).toBe(1);
  });

  it('draws nothing broken before the picture has a size', () => {
    expect(fitScale({ w: 0, h: 0 }, { w: 1600, h: 1000 })).toBe(1);
  });
});

describe('zooming in', () => {
  it('a click on a fitted picture goes to its real pixels', () => {
    expect(clickZoom(1, 0.5)).toBeCloseTo(2);
  });

  it('a picture already at its real size doubles instead', () => {
    expect(clickZoom(1, 1)).toBe(2);
    expect(clickZoom(1, 0.8)).toBe(2);
  });

  it('a click on a zoomed picture fits it again', () => {
    expect(clickZoom(2, 0.5)).toBe(1);
    expect(clickZoom(1.02, 0.5)).toBe(1);
  });

  // A click zoomed into the middle of the picture wherever it landed; on a
  // screenshot with its content at the top that showed empty background.
  it('zooms into the spot that was clicked, not the middle', () => {
    expect(panToKeep({ x: 300, y: -200 }, { x: 0, y: 0 }, 1, 2)).toEqual({ x: -300, y: 200 });
  });

  it('a click in the middle zooms in place', () => {
    expect(panToKeep({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 2)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the point still from a zoom that is already panned', () => {
    const pan = { x: -100, y: 40 }, at = { x: 250, y: 120 };
    const next = panToKeep(at, pan, 2, 3);
    // The picture point under the pointer is (at - pan) / zoom before and after.
    expect((at.x - next.x) / 3).toBeCloseTo((at.x - pan.x) / 2);
    expect((at.y - next.y) / 3).toBeCloseTo((at.y - pan.y) / 2);
  });

  it('a wheel or a pinch stays between fitted and the most zoom', () => {
    expect(zoomBy(1, 0.5)).toBe(1);
    expect(zoomBy(MAX_ZOOM, 2)).toBe(MAX_ZOOM);
    expect(zoomBy(2, 1.5)).toBeCloseTo(3);
  });
});

// A resize used to store the pointer's start in the window's frame, so the next
// move of the bar measured from the old corner: a 420 px drag right threw the
// window 866 px left, off the screen.
describe('moving and resizing the floating window', () => {
  const at = { x: 211, y: 87, w: 1498, h: 907 };

  it('a move after a resize lands where it was dragged', () => {
    const sized = moveFrame(at, 'size', -620, -330);
    expect(sized).toEqual({ x: 211, y: 87, w: 878, h: 577 });
    expect(moveFrame(sized, 'move', 420, 120)).toEqual({ x: 631, y: 207, w: 878, h: 577 });
  });

  it('keeps only the frame, never where the pointer was', () => {
    expect(Object.keys(moveFrame(at, 'size', 10, 10)).sort()).toEqual(['h', 'w', 'x', 'y']);
    expect(Object.keys(moveFrame(at, 'move', 10, 10)).sort()).toEqual(['h', 'w', 'x', 'y']);
  });

  it('never shrinks below a usable size', () => {
    expect(moveFrame(at, 'size', -5000, -5000)).toEqual({ x: 211, y: 87, w: MIN_FRAME.w, h: MIN_FRAME.h });
  });

  it('never lets the bar go above the top of the window', () => {
    expect(moveFrame(at, 'move', 0, -500).y).toBe(0);
    expect(moveFrame(at, 'move', 0, -87).y).toBe(0);
    expect(moveFrame(at, 'move', 0, -86).y).toBe(1);
  });
});

describe('stepping through the thread', () => {
  it('moves one picture each way', () => {
    expect(stepTo(1, 4, 1)).toBe(2);
    expect(stepTo(1, 4, -1)).toBe(0);
  });

  it('stops at either end instead of wrapping', () => {
    expect(stepTo(0, 4, -1)).toBe(0);
    expect(stepTo(3, 4, 1)).toBe(3);
  });

  it('holds still with one picture', () => {
    expect(stepTo(0, 1, 1)).toBe(0);
  });
});
