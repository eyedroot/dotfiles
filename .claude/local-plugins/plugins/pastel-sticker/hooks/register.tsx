import type { Register, ThemeMessageRule, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

// Light only and fully still: plain SVG, no animation, shader or sound. Shapes stay
// in the upper part because the composer strip paints an opaque band over the
// lower scene; every message keeps a solid fill so no pattern lies behind words.
const { theme, problems } = makeColors({
  label: 'Pastel sticker',
  only: 'light',
  roles: { accent: '#4a5fc1', danger: '#c0392f', success: '#2f7a4f', warning: '#8f5d0c', pro: '#8a4fb5' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#a9cdb5',
        'surface-1': '#f8f3ea',
        'surface-2': '#fdfaf4',
        'text-primary': '#25212b',
        'text-secondary': '#3d374b',
        'text-muted': '#554e63',
      },
    },
  },
})

const INK = '#2b2540'

// The composer strip paints surface-1 over the scene and renders as #f8f3e9
// (verified 2026-11-25 on desktop). The scene's ground uses the same color so the
// strip's edge disappears.
const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" preserveAspectRatio="xMinYMin slice" width="100%" height="100%">
<defs>
<linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#8fd3f4"/>
<stop offset="0.5" stop-color="#cdb4f0"/>
<stop offset="1" stop-color="#f58fb8"/>
</linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#f8f3e9" stop-opacity="0"/>
<stop offset="0.75" stop-color="#f8f3e9" stop-opacity="1"/>
<stop offset="1" stop-color="#f8f3e9" stop-opacity="1"/>
</linearGradient>
</defs>
<rect width="1000" height="600" fill="url(#band)"/>
<rect width="1000" height="600" fill="url(#fade)"/>
<circle cx="50" cy="50" r="95" fill="#ffc8dd"/>
<circle cx="190" cy="40" r="22" fill="#ffe27a"/>
<path d="M28 170 q22 -26 44 0 t44 0 t44 0 t44 0" fill="none" stroke="#7aa2ff" stroke-width="9" stroke-linecap="round"/>
<polygon points="40,260 110,260 75,200" fill="#ffe27a"/>
<rect x="-30" y="340" width="120" height="44" rx="22" fill="#9fe0c0" transform="rotate(-24 30 362)"/>
<circle cx="900" cy="60" r="3" fill="#b5a0f0"/>
<circle cx="930" cy="60" r="3" fill="#b5a0f0"/>
<circle cx="960" cy="60" r="3" fill="#b5a0f0"/>
<circle cx="900" cy="90" r="3" fill="#b5a0f0"/>
<circle cx="930" cy="90" r="3" fill="#b5a0f0"/>
<circle cx="960" cy="90" r="3" fill="#b5a0f0"/>
<circle cx="900" cy="120" r="3" fill="#b5a0f0"/>
<circle cx="930" cy="120" r="3" fill="#b5a0f0"/>
<circle cx="960" cy="120" r="3" fill="#b5a0f0"/>
<path d="M830 40 V100 M800 70 H860" fill="none" stroke="#ff9aa2" stroke-width="10" stroke-linecap="round"/>
<path d="M1000 160 A110 110 0 0 0 890 270 L1000 270 Z" fill="#a8d8ff"/>
<circle cx="945" cy="312" r="34" fill="none" stroke="#ff9aa2" stroke-width="11"/>
<polygon transform="translate(930 400) scale(0.8) translate(-930 -515)" points="930,470 944,500 976,504 952,526 958,558 930,542 902,558 908,526 884,504 916,500" fill="#ffe27a"/>
</svg>`

const sticker: ThemeMessageRule = {
  color: '#25212b',
  radius: 18,
  padding: 14,
  borderWidth: 2,
  borderColor: INK,
}

const LOOK: ThemeSetArgs = {
  overrideColorScheme: 'light',
  colors: theme,
  backdrop: { scene: 'sticker-board', glass: false },
  style: {
    Text: { fontFamily: ['sans'], fontSize: 16, lineHeight: 27, letterSpacing: 0.1, color: '#25212b' },
    Heading: { fontFamily: ['sans'], fontWeight: 'bold', color: INK },
    // Four pastel stickers with a hard offset shadow, none tilted.
    UserMessage: [
      { ...sticker, backgroundColor: '#ffd6e0', shadow: { x: 3, y: 3, blur: 0, color: INK } },
      { ...sticker, backgroundColor: '#cfe8ff', shadow: { x: 3, y: 3, blur: 0, color: INK } },
      { ...sticker, backgroundColor: '#fff2a8', shadow: { x: 3, y: 3, blur: 0, color: INK } },
      { ...sticker, backgroundColor: '#c9f0dc', shadow: { x: 3, y: 3, blur: 0, color: INK } },
    ],
    AssistantMessage: [
      { ...sticker, radius: 14, backgroundColor: '#fffdfb', shadow: { x: 4, y: 4, blur: 0, color: '#b9a6f0' } },
      { ...sticker, radius: 14, backgroundColor: '#fffdfb', shadow: { x: 4, y: 4, blur: 0, color: '#9fd3f5' } },
    ],
    ToolUse: {
      fontFamily: ['mono'],
      color: '#3a3350',
      backgroundColor: '#efe9ff',
      borderColor: '#b9a6f0',
      borderWidth: 1,
      radius: 14,
      paddingX: 10,
    },
  },
}

export const register: Register = on => {
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Pastel shapes in the margins" />
  })

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    try {
      const set = await $.theme.set(LOOK)

      if (!set.isDrawn) {
        $.ui.status(set.reason)
      }
    } catch (error) {
      $.ui.log(String(error))
      await $.theme.set({ overrideColorScheme: 'light', colors: theme, backdrop: { color: '#f8f3e9' } })
    }

    return next(e)
  })
}
