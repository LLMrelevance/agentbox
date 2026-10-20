import { Linking, View } from 'react-native';
import { blocksOf, spansOf } from '../lib/markdown';
import { T } from './parts';
import { color, font } from './theme';

const BODY = { fontSize: 15, lineHeight: 24, color: color.text };

function Line({ text, style }: { text: string; style?: object }) {
  return (
    <T style={[BODY, style]}>
      {spansOf(text).map((s, i) => (
        <T key={i}
          onPress={s.link ? () => { void Linking.openURL(s.link!); } : undefined}
          style={[BODY, style,
            s.bold && { fontFamily: font.semibold },
            s.code && { fontFamily: font.mono, fontSize: 13.5, color: color.dim },
            s.link && { textDecorationLine: 'underline', textDecorationColor: 'rgba(238,96,24,.6)' },
          ]}>{s.text}</T>
      ))}
    </T>
  );
}

/** An agent's message, the way the desktop draws one (markdown at 15px/1.6). */
export function Markdown({ text }: { text: string }) {
  return (
    <View style={{ gap: 10 }}>
      {blocksOf(text).map((b, i) => {
        if (b.kind === 'h') return <Line key={i} text={b.text} style={{ fontFamily: font.semibold, fontSize: 15, marginTop: i ? 6 : 0 }} />;
        if (b.kind === 'code') return <T key={i} style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 20, color: color.dim, backgroundColor: color.surface, padding: 10 }}>{b.text}</T>;
        if (b.kind === 'li') {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: -4 }}>
              <T style={[BODY, { color: color.faint, minWidth: 14 }]}>{b.mark}</T>
              <View style={{ flex: 1 }}><Line text={b.text} /></View>
            </View>
          );
        }
        return <Line key={i} text={b.text} />;
      })}
    </View>
  );
}
