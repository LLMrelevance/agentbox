import { createContext, useContext, type ReactNode } from 'react';
import { ticketPieces, TICKET_HREF } from '../ticket-references';

export const TicketNavigation = createContext<((id: string) => void) | null>(null);

export function TicketLink({ id, children }: { id: string; children: ReactNode }) {
  const open = useContext(TicketNavigation);
  if (!open) return <>{children}</>;
  return <a className="ticket-reference" href={TICKET_HREF + id} onClick={e => {
    e.preventDefault(); e.stopPropagation(); open(id);
  }} onKeyDown={e => e.stopPropagation()}>{children}</a>;
}

export function TicketText({ text }: { text: string }) {
  return <>{ticketPieces(text).map((p, i) => p.id
    ? <TicketLink key={i} id={p.id}>{p.text}</TicketLink> : p.text)}</>;
}
