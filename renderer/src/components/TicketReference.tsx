import { createContext, useContext, type ReactNode } from 'react';
import { ticketPieces, TICKET_HREF } from '../ticket-references';
import './ticket-reference.css';

export const TicketNavigation = createContext<{
  open: (id: string) => void;
  name: (id: string) => string | null;
} | null>(null);

function ThreadIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v10H8l-5 4V3z" /><path d="M7 7h6M7 10h4" /></svg>;
}

export function TicketLink({ id, children }: { id: string; children: ReactNode }) {
  const navigation = useContext(TicketNavigation);
  if (!navigation) return <>{children}</>;
  const name = navigation.name(id);
  if (!name) return <span className="ticket-reference ticket-reference-unavailable" title="This thread is not available."><ThreadIcon /><span className="ticket-reference-name">Unavailable thread</span></span>;
  return <a className="ticket-reference" href={TICKET_HREF + id} title={name} aria-label={`Open thread: ${name}`} onClick={e => {
    e.preventDefault(); e.stopPropagation(); navigation.open(id);
  }} onKeyDown={e => e.stopPropagation()}><ThreadIcon /><span className="ticket-reference-name">{name}</span></a>;
}

export function TicketText({ text }: { text: string }) {
  return <>{ticketPieces(text).map((p, i) => p.id
    ? <TicketLink key={i} id={p.id}>{p.text}</TicketLink> : p.text)}</>;
}
