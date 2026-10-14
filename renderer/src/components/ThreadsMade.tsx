// THE THREADS A THREAD MADE, IN LINE (w-2e8aa16f0f). One bordered row per
// thread, its title and where it stands, and the row opens it. The same list
// an agent answering in a chat shows for the tasks it opened, approved in the
// messages redesign; here it sits under a task whose agent filed threads.
//
// AND THE PRESSES THAT ANSWER ONE (w-9cf2b43110, w-554834e749). Every thread an
// agent files is a proposal waiting on you, and answering it used to mean
// leaving this thread, finding that one's own row and acting there, once per
// thread: "it ends up in my inbox with no clear next step." The next step is
// now in the row that names it, and there are two of them.
//
// DO IN THIS THREAD, or START NEW THREAD (w-554834e749). Approve was the only
// real answer, and it always meant a new thread: "I want to be able to do more
// than just reject or offer subthreads... have the agent not make that a
// different thread and just do it in our thread." Each press says in full what
// it does, because the bare word was the confusing part ("make sure it's extra
// clear"). Chosen off three rounds of drawings: the new thread is the press in
// the accent, as an outline rather than a solid block ("the orange backgrounds
// are a little bit too bright"), and this thread is the grey one beside it.
//
// THERE IS NO NO. It was drawn under the cursor, and "No basically means
// reject, so it's a different functionality"; "ignoring it is basically
// rejecting it". A proposal you leave alone never runs. One you want gone is
// closed from its own row like any other thread.
//
// ONE ROW AT A TIME. There is no press that answers the lot, and that is the
// decision rather than an omission: three proposals are three decisions, and
// this app has already been burned once by a key that approved on her behalf
// (the E-key history in App.tsx's `resolve`). What each row carries is its own.
//
// THE ROW IS A DIV, NOT A BUTTON, which it was until the press arrived: no
// browser accepts a button inside a button. The press to open is its own
// control filling the row, so the row looks identical and the presses can
// never be mistaken for each other.
import type { ThreadStateWord } from '../types';
import { stateWord } from '../threads-made';
import './threads-made.css';

export interface MadeRow {
  id: string;
  title: string;
  state: ThreadStateWord | null;
  /** Waiting on a press from you (`approvableFiled`, ../threads-made.ts). */
  approve?: boolean;
  /** One line of what the proposal is for (`proposalLine`, ../threads-made.ts). */
  detail?: string;
}

export const START_NEW = 'Start new thread';
export const DO_HERE = 'Do in this thread';
export const DISMISS = 'Dismiss';

// DESIGN ROUND, w-fcb5fdc2e5: four looks drawn side by side with today's, by a
// switch only the drawing harness sets. Goes when one is picked.
type Look = 'cards' | 'hover' | 'seg' | 'one';
const LOOKS: Look[] = ['cards', 'hover', 'seg', 'one'];
const lookNow = (): Look | null => {
  try {
    const v = globalThis.localStorage?.getItem('zero.proposal.look') as Look | null;
    return v && LOOKS.includes(v) ? v : null;
  } catch { return null; }
};

export function ThreadsMade(props: Parameters<typeof ThreadsMadeNow>[0] & { onDismiss?: (id: string) => void }) {
  const look = lookNow();
  if (!look) return <ThreadsMadeNow {...props} />;
  return <ThreadsMadeLook look={look} {...props} />;
}

function ThreadsMadeLook({ look, rows, onOpen, onApprove, onHere, onDismiss, label }: Parameters<typeof ThreadsMade>[0] & { look: Look }) {
  if (!rows.length) return null;
  const canPress = (r: MadeRow) => !!onApprove && !!r.approve;
  const asks = rows.filter(canPress);
  const rest = rows.filter((r) => !canPress(r));
  if (!asks.length) return <ThreadsMadeNow rows={rows} onOpen={onOpen} label={label} />;
  // A proposal waits in Later, but what it is waiting on is you.
  const word = (r: MadeRow) => (canPress(r) ? stateWord('waiting') : stateWord(r.state));
  const cls = (r: MadeRow) => `made-state ${canPress(r) ? 'waiting' : r.state ?? ''}`;

  const answers = (r: MadeRow, words: { here: string; start: string; no: string }, hereFirst = false) => {
    const go = <button type="button" className="pa pa-go" aria-label={`${START_NEW}: ${r.title}`} onClick={() => onApprove!(r.id)}>{words.start}</button>;
    const here = onHere && <button type="button" className="pa pa-here" aria-label={`${DO_HERE}: ${r.title}`} onClick={() => onHere(r.id)}>{words.here}</button>;
    return (
      <>
        {hereFirst ? <>{here}{go}</> : <>{go}{here}</>}
        {onDismiss && <button type="button" className="pa pa-no" aria-label={`${DISMISS}: ${r.title}`} title={`${DISMISS}: it will not run`} onClick={() => onDismiss(r.id)}>{words.no}</button>}
      </>
    );
  };
  const full = { here: DO_HERE, start: START_NEW, no: DISMISS };
  const restList = (rs: MadeRow[], heading?: string) => rs.length > 0 && (
    <div className="made-rest">
      {heading && <div className="made-rest-label">{heading}</div>}
      {rs.map((r) => (
        <button type="button" key={r.id} className="made-rest-row" onClick={() => onOpen(r.id)}>
          <span className="made-title">{r.title}</span>
          <span className={cls(r)}>{word(r)}</span>
        </button>
      ))}
    </div>
  );
  const count = asks.length === 1 ? 'One proposal waiting on you' : `${asks.length} proposals waiting on you`;

  if (look === 'cards') {
    return (
      <div className="made look-cards">
        <div className="made-label">{count}</div>
        <div className="made-cards">
          {asks.map((r) => (
            <div className="made-card" key={r.id}>
              <button type="button" className="made-card-open" onClick={() => onOpen(r.id)}>
                <span className="made-card-title">{r.title}</span>
                {r.detail && <span className="made-card-detail">{r.detail}</span>}
              </button>
              <div className="made-card-answers">{answers(r, full)}</div>
            </div>
          ))}
        </div>
        {restList(rest, 'Also from this thread')}
      </div>
    );
  }

  if (look === 'one') {
    const r = asks[0];
    return (
      <div className="made look-one">
        <div className="made-one" key={r.id}>
          <div className="made-one-head">
            <span>Proposed by the agent</span>
            {asks.length > 1 && (
              <span className="made-one-count">
                1 of {asks.length}
                <span className="made-one-dots">{asks.map((a, i) => <i key={a.id} className={i === 0 ? 'on' : ''} />)}</span>
              </span>
            )}
          </div>
          <button type="button" className="made-card-open" onClick={() => onOpen(r.id)}>
            <span className="made-card-title">{r.title}</span>
            {r.detail && <span className="made-card-detail">{r.detail}</span>}
          </button>
          <div className="made-card-answers">{answers(r, full)}</div>
        </div>
        {restList([...asks.slice(1), ...rest], 'Also from this thread')}
      </div>
    );
  }

  // 'hover' and 'seg': still a list, one row per thread.
  return (
    <div className={`made look-${look}`}>
      <div className="made-label">{count}</div>
      <div className="made-list">
        {[...asks, ...rest].map((r) => {
          const press = canPress(r);
          return (
            <div className={press ? 'made-row made-ask' : 'made-row'} key={r.id}>
              <button type="button" className="made-open" onClick={() => onOpen(r.id)}>
                {press && look === 'hover' && <span className="made-dot" aria-hidden />}
                <span className="made-title">{r.title}</span>
                {(!press || look === 'hover') && <span className={cls(r)}>{word(r)}</span>}
              </button>
              {press && look === 'hover' && <div className="made-acts">{answers(r, { here: 'Do here', start: 'New thread', no: DISMISS })}</div>}
              {press && look === 'seg' && <div className="made-seg">{answers(r, { here: DO_HERE, start: START_NEW, no: '✕' }, true)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThreadsMadeNow({ rows, onOpen, onApprove, onHere, label }: {
  rows: MadeRow[];
  onOpen: (id: string) => void;
  /** Start it as its own thread: the approval that has always been here. */
  onApprove?: (id: string) => void;
  /**
   * Do it in this thread instead: sends the proposal back to the thread that
   * filed it and closes it (`doItHereWrites`, ../threads-made.ts).
   */
  onHere?: (id: string) => void;
  label?: string;
}) {
  if (!rows.length) return null;
  // WHILE ANY OF THEM WAITS FOR A YES, THE LIST SAYS SO (w-d2744c6daa): "I
  // often miss these filed tasks... they're not very visible and it's really
  // easy to skip them." One had waited 22 hours under a closed thread. Chosen
  // off seven rounds of drawings: the list's outer border goes orange, the
  // label reads "Still waiting on you" in white, and the waiting rows come
  // first. Only a row this list can actually answer counts, so a list drawn
  // without the press, or one holding a review, stays quiet.
  const canPress = (r: MadeRow) => !!onApprove && !!r.approve;
  const waiting = rows.some(canPress);
  const shown = waiting ? [...rows.filter(canPress), ...rows.filter((r) => !canPress(r))] : rows;
  // THE PRESSES STAND WHERE THE STATE WORD WOULD (2026-10-05). A row waiting
  // on you carries them where it would have said NEEDS YOU, so nothing is held
  // in reserve on the other rows and every row ends at the same right-hand edge.
  return (
    <div className={waiting ? 'made made-waiting' : 'made'}>
      {(waiting || label) && <div className="made-label">{waiting ? 'Still waiting on you' : label}</div>}
      <div className="made-list">
        {shown.map((r) => {
          const press = canPress(r);
          return (
            <div className="made-row" key={r.id}>
              {/* The word stays INSIDE the press that opens the thread, so on
                  every row that carries no answer the whole width of the row
                  is still the way in. */}
              <button type="button" className="made-open" onClick={() => onOpen(r.id)}>
                <span className="made-title">{r.title}</span>
                {!press && <span className={`made-state ${r.state ?? ''}`}>{stateWord(r.state)}</span>}
              </button>
              {/* NAMED WITH THE THREAD EACH ONE IS ABOUT. Several rows each say
                  the same words, so the bare words tell a screen reader, and a
                  hovering cursor, nothing about which proposal it is. */}
              {press && onHere && (
                <button
                  type="button"
                  className="made-here"
                  aria-label={`${DO_HERE}: ${r.title}`}
                  title={`${DO_HERE}: ${r.title}`}
                  onClick={() => onHere(r.id)}
                >
                  {DO_HERE}
                </button>
              )}
              {press && (
                <button
                  type="button"
                  className="made-approve"
                  aria-label={`${START_NEW}: ${r.title}`}
                  title={`${START_NEW}: ${r.title}`}
                  onClick={() => onApprove!(r.id)}
                >
                  {START_NEW}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
