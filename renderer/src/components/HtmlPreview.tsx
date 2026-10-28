import { onPhone } from '../phone-screen';
import { DocumentPreview } from './DocumentPreview';

export function HtmlPreview({ url, path, onOpen }: { url: string; path: string; onOpen: () => void }) {
  return (
    <DocumentPreview onOpenFull={onOpen}>
      <iframe className="one-frame" src={url} title={path} scrolling="no" tabIndex={-1}
        sandbox={onPhone() ? 'allow-scripts' : 'allow-scripts allow-same-origin'} />
    </DocumentPreview>
  );
}
