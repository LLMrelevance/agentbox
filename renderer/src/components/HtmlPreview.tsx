import { onPhone } from '../phone-screen';
import { DocumentPreview } from './DocumentPreview';

export function HtmlPreview({ url, path, expanded, onExpandedChange }: {
  url: string; path: string; expanded: boolean; onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <DocumentPreview expanded={expanded} onExpandedChange={onExpandedChange} alwaysExpandable>
      <iframe key={expanded ? 'reader' : 'preview'} className={`one-frame${expanded ? ' is-expanded' : ''}`} src={url} title={path}
        scrolling={expanded ? 'auto' : 'no'} tabIndex={expanded ? 0 : -1}
        sandbox={onPhone() ? 'allow-scripts' : 'allow-scripts allow-same-origin'} />
    </DocumentPreview>
  );
}
