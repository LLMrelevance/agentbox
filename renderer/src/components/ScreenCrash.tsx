// Without this, a throw anywhere in the screen unmounts the whole tree and
// leaves an empty window that only ⌘R brings back.
import { Component, type ReactNode } from 'react';
import { LogoOrbit } from './LogoOrbit';
import { afterACrash, writeHeldBeforeReload } from '../after-a-crash';
import { chord } from '../this-keyboard';

export const CRASHED_TWICE = `This screen hit an error twice in a row. Press ${chord('⌘R')} to reload it.`;

type Props = {
  children: ReactNode;
  // Tests pass these; the app uses the real ones.
  reload?: () => void;
  report?: (error: Error) => void;
};

const sendCrash = (error: Error) => {
  try {
    Promise.resolve(window.zero?.crash?.({ name: error?.name ?? 'Error', message: error?.message ?? '', stack: error?.stack ?? '' })).catch(() => {});
  } catch {}
};

export class ScreenCrash extends Component<Props, { crashed: 'reload' | 'stay' | null }> {
  state = { crashed: null as 'reload' | 'stay' | null };

  static getDerivedStateFromError() {
    return { crashed: 'reload' as const };
  }

  componentDidCatch(error: Error) {
    // A caught error never reaches the window's 'error' listener in main.tsx.
    (this.props.report ?? sendCrash)(error);
    const next = afterACrash(Date.now());
    if (next === 'stay') { this.setState({ crashed: 'stay' }); return; }
    void writeHeldBeforeReload().then(() => (this.props.reload ?? (() => window.location.reload()))());
  }

  render() {
    const { crashed } = this.state;
    if (!crashed) return this.props.children;
    return crashed === 'stay'
      ? <div className="boot boot-stuck" role="alert"><LogoOrbit /><p>{CRASHED_TWICE}</p></div>
      : <div className="boot" role="status"><LogoOrbit /></div>;
  }
}
