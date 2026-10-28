import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { watchDocumentOverflow } from '../document-preview';
import '../document-preview.css';

export function DocumentPreview({ children, onOpenFull }: { children: ReactNode; onOpenFull?: () => void }) {
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const returnToPreview = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    if (returnToPreview.current) {
      returnToPreview.current = false;
      frame.current?.scrollIntoView({ block: 'nearest' });
    }
    if (!expanded && content.current && frame.current) {
      return watchDocumentOverflow(content.current, frame.current, setOverflow);
    }
  }, [expanded]);

  return (
    <div className="document-preview">
      <div id={id} ref={frame} className={`document-preview-frame${expanded ? ' is-expanded' : overflow || onOpenFull ? ' is-cut' : ''}`}>
        <div ref={content}>{children}</div>
      </div>
      {(overflow || expanded || onOpenFull) && (
        <button type="button" className="document-preview-toggle" aria-expanded={onOpenFull ? undefined : expanded} aria-controls={onOpenFull ? undefined : id}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
          onClick={() => {
            if (onOpenFull) { onOpenFull(); return; }
            returnToPreview.current = expanded;
            setExpanded(!expanded);
          }}>
          {expanded ? 'Show preview' : 'Show full document'}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
          </svg>
        </button>
      )}
    </div>
  );
}
