import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { colors } from '@/theme';

/**
 * Icon wrapper mapping the semantic names the original UI used (FontAwesome 5/6
 * "fa-solid" glyphs) onto the FontAwesome6 glyph set bundled with @expo/vector-icons.
 * Keeps call-sites readable: <Icon name="phone" size={24} />.
 */
const NAME_MAP: Record<string, React.ComponentProps<typeof FontAwesome6>['name']> = {
  gear: 'gear',
  'wave-square': 'wave-square',
  history: 'clock-rotate-left',
  microphone: 'microphone',
  'microphone-slash': 'microphone-slash',
  phone: 'phone',
  'phone-slash': 'phone-slash',
  'phone-alt': 'phone',
  'chevron-down': 'chevron-down',
  keyboard: 'keyboard',
  play: 'play',
  pause: 'pause',
  'exchange-alt': 'right-left',
  'delete-left': 'delete-left',
  'arrow-left': 'arrow-left',
  plus: 'plus',
  copy: 'copy',
  trash: 'trash',
  eye: 'eye',
  'eye-slash': 'eye-slash',
  'address-card': 'address-card',
  'network-wired': 'network-wired',
  link: 'link',
  'link-slash': 'link-slash',
  pen: 'pen',
  'check-circle': 'circle-check',
  'exclamation-triangle': 'triangle-exclamation',
  'times-circle': 'circle-xmark',
  'info-circle': 'circle-info',
  times: 'xmark'
};

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = colors.white }: IconProps) {
  const glyph = NAME_MAP[name] ?? 'circle-question';
  return <FontAwesome6 name={glyph} size={size} color={color} />;
}
