// Source: Figma Design System | UI kit, file qEnvppqqUuqQSFLRnLke3I, Colors page.
// The numbered entries follow the kit's light-to-dark order; no chart colors are synthesized.
export const kitColors = {
  ink: '#0B0B0B',
  white: '#FFFFFF',
  canvas: '#F9F7FC',
  gray: ['#9F9F9F', '#909090', '#818181', '#737373', '#646464', '#464646'],
  violet: [
    '#F4EFFE', '#E9DFFC', '#DECFFB', '#D3BFF9', '#BE9FF6', '#A87FF3',
    '#925FF0', '#784DC7', '#5E3A9E', '#432876', '#361F61', '#29154D',
    '#1C0C38', '#0F0324',
  ],
  green: [
    '#F6FFF6', '#EDFFEC', '#E3FEE3', '#DAFED9', '#C8FEC7', '#B5FDB4',
    '#A3FDA1', '#83E281', '#64C661', '#44AB42', '#349D32', '#258F22',
    '#158212', '#057402',
  ],
} as const;

// Alternating light and dark kit tones give neighboring pie segments at least 3:1 contrast.
export const chartColors = [
  kitColors.violet[6],
  kitColors.green[6],
  kitColors.green[13],
  kitColors.violet[3],
  kitColors.violet[11],
  kitColors.green[3],
  kitColors.ink,
  kitColors.violet[1],
] as const;
