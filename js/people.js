// Affichage des contacts, partagé par le répertoire et l'agenda.

export const fullName = (c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.company || 'Sans nom';
export const initials = (c) => fullName(c).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const domainOf = (c) => c.domain || 'Autre';
export const byName = (a, b) => fullName(a).localeCompare(fullName(b), 'fr');

/** Noms des participants encore présents dans le répertoire. */
export function participantNames(contactIds, contacts) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return (contactIds ?? []).map((id) => byId.get(id)).filter(Boolean).map(fullName);
}
