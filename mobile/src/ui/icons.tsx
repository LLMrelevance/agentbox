// The desktop's own glyphs, drawn the same way: thin strokes, square ends.
import Svg, { Circle, Path } from 'react-native-svg';
import { color } from './theme';

type P = { size?: number; tint?: string };

export const Back = ({ size = 22, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="m14 6-6 6 6 6" /></Svg>
);

export const Gear = ({ size = 18, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export const Tick = ({ size = 22, tint = 'rgba(238, 96, 24, 0.5)' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.7} strokeLinecap="square"><Path d="m4 12.5 5 5L20 6.5" /></Svg>
);

export const More = ({ size = 20, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={tint}><Circle cx={5} cy={12} r={1.6} /><Circle cx={12} cy={12} r={1.6} /><Circle cx={19} cy={12} r={1.6} /></Svg>
);
