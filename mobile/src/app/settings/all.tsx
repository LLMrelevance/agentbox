// OPTION C: every page on one scrolling page, each under its own heading.
import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { T } from '../../ui/parts';
import { computerLine } from '../../ui/SettingsHome';
import { SETTINGS_PAGES } from '../../ui/SettingsPages';
import { Page } from '../../ui/SettingsParts';
import { color, font } from '../../ui/theme';

export default function SettingsAll() {
  const c = useCloud();
  const s = useSettings();
  return (
    <Page title="Settings" back="Back to app" lede={computerLine(s, c.now)}>
      {SETTINGS_PAGES.filter((p) => p.shown(s)).map((p) => (
        <Section key={p.id} label={p.label} lede={p.lede}><p.Body /></Section>
      ))}
    </Page>
  );
}

function Section({ label, lede, children }: { label: string; lede?: string; children: React.ReactNode }) {
  return (
    <>
      <T style={{ fontSize: 19, lineHeight: 24, fontFamily: font.medium, letterSpacing: -0.3, marginTop: 52 }}>{label}</T>
      {lede ? <T style={{ fontSize: 13, lineHeight: 19, color: color.faint, marginTop: 6 }}>{lede}</T> : null}
      {children}
    </>
  );
}
