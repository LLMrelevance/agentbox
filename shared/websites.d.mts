// Types for shared/websites.mjs, the rules the main process and the screen
// share about a page off the open web: which addresses are one, what the
// pane's header calls it, and where its sign-ins go.

/** The session partition a website's cookies and sign-ins live in. */
export const WEBSITE_PARTITION: string;

/** Is this an ordinary page on the web, rather than a local app or a file? */
export function isWebsiteAddress(src: string | undefined | null): boolean;

/** The site and the last steps of the path, for the pane's header. */
export function websiteCrumb(src: string | undefined | null): string[];

/** Can this page embed a website in a browser of its own (Electron only)? */
export function canFrameAWebsite(doc: { createElement(tag: string): unknown } | null | undefined): boolean;
