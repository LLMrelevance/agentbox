// CHATS HAS A ROW IN THE SIDEBAR WITH THE TEAM ON (w-2b3e1a85e5).
//
// w-b5f23cff71 took the Chats row and its page away once a team was on, so
// every chat opened under Everything else's cards. Then: "I also find myself,
// when wanting to message agents directly, navigating to the sidebar - that's
// where I would expect chats to be... It's the thought 'OH I need to message
// X' or something that is OK to induce going to the chats page." Read off
// App.tsx on 2026-10-28: the sidebar was handed `null` whenever teamMode was
// on. Now the row is back and opens the Chats page with its list beside the
// chat, and a card still opens that chat under the cards.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('with a team on', () => {
  it('the sidebar has its Chats row, which opens the Chats page', () => {
    expect(app).not.toContain('groups={teamMode ? null');
    expect(app).toContain('groups={teamMode ? roomsUi.sidebarGroups(chatsLit, teammatesUi.live ? openChatsPage : openGroupsPage)');
    expect(app).toMatch(/const openChatsPage = \(\) => \{ setChatsPage\(true\);/);
    expect(app).toMatch(/const openGroupsPage = \(\) => \{ setChatsPage\(true\);/);
  });

  it('the Chats page draws its list beside the chat and no cards over it', () => {
    expect(app).toContain('<ChatsContext.Provider value={teamMode && !chatsPage ? null : chatsValue}>');
    expect(app).toContain('inline: teamMode && !chatsPage,');
    expect(app).toMatch(/const inTeamChat = teamMode && inChats && !chatsPage;/);
    expect(app).toMatch(/const evOn = teamMode && !chatsPage && search === null/);
  });

  it('a card, Needs you or the Inbox row leaves the Chats page', () => {
    expect(app).toMatch(/const pickMember = \(key: string, tab[^)]*\) => \{\s*setChatsPage\(false\);/);
    expect(app).toMatch(/const goNeedsYou = \(\) => \{\s*setChatsPage\(false\);/);
    expect(app).toMatch(/const openView = \(next: View\) => \{ roomsUi\.leave\(\); setChatsPage\(false\);/);
  });

  it('lights the Chats row, not Inbox, while the Chats page is up', () => {
    expect(app).toContain('onGroupsPage={(roomShown || directOpen) && (!teamMode || chatsPage)}');
    expect(app).toContain('onTeammatesPage={teammatesShown && (!teamMode || chatsPage)}');
  });
});
