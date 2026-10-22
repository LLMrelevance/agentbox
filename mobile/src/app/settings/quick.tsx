// OPTION E: the settings a phone is most likely reached for, first, then every page.
import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { computerLine, PageList } from '../../ui/SettingsHome';
import { AgentsAtOnce, AlertRows, PermissionRow, PhoneProjects, SettingSwitch } from '../../ui/SettingsPages';
import { Group, Page } from '../../ui/SettingsParts';

export default function SettingsQuick() {
  const c = useCloud();
  const s = useSettings();
  const w = s.settings?.workspace;
  return (
    <Page title="Settings" back="Back to app" lede={computerLine(s, c.now)}>
      <Group label="Quick settings">
        {w ? (
          <>
            <PermissionRow />
            <AgentsAtOnce first={false} />
            <SettingSwitch label="ADHD mode" k="adhdMode" copy={w.adhdMode} />
            <PhoneProjects first={false} />
            <AlertRows first={false} />
          </>
        ) : <AlertRows />}
      </Group>
      <PageList />
    </Page>
  );
}
