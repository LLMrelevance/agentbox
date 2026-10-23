// WHERE A REPLY WENT, ON THE LINE ABOVE THE REPLY BOX OF THE THREAD IT MOVED
// HER TO (w-4465054f04). Picked from six drawings; the corner card it replaces
// was far from where she was looking and gone in six seconds.
export function SentLine({ title, undoes, onBack, onUndo }: {
  title: string;
  undoes: boolean;
  onBack: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="sent-line" role="status">
      <span className="sent-line-dot" aria-hidden="true" />
      <span className="sent-line-said">Sent to <span className="sent-line-title">{title}</span></span>
      <span className="sent-line-keys">
        <button type="button" className="sent-line-key" onClick={onBack}><kbd>O</kbd><span className="sent-line-word">Back</span></button>
        {undoes && <button type="button" className="sent-line-key" onClick={onUndo}><kbd>Z</kbd><span className="sent-line-word">Undo</span></button>}
      </span>
    </div>
  );
}
