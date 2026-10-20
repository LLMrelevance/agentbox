// A film or a sound in the phone's own player, as Safari draws `<video controls>`
// for the phone site; nothing on the page runs but the player.
import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { attr } from './PageFrame';

export function Player({ link, film, style }: { link: string; film: boolean; style?: ViewStyle }) {
  const tag = film ? 'video' : 'audio';
  // One source for as long as the link holds, so a redraw never starts the film again.
  const source = useMemo(() => ({ html: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:transparent}${tag}{display:block;width:100%;height:100%;object-fit:contain}</style><${tag} controls playsinline preload="metadata" src="${attr(link)}"></${tag}>` }), [tag, link]);
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <WebView source={source} originWhitelist={['*']} javaScriptEnabled={false} scrollEnabled={false}
        allowsInlineMediaPlayback allowsFullscreenVideo style={{ flex: 1, backgroundColor: 'transparent' }} />
    </View>
  );
}
