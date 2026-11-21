import type { EngineInterface, RenderInput } from 'claude-code'

import { cardRows, head, matchKey } from './catenoid'
import type { CardRow, Match } from './catenoid'
import { fit } from './cards'
import type { Palette } from './palette'

const MAX_CARDS = 3

function rowColor(palette: Palette, color: CardRow['color']): string {
  if (color === 'suggestion') return palette.accent
  if (color === 'success') return palette.ok
  if (color === 'warning') return palette.warning
  if (color === 'error') return palette.error
  if (color === 'subtle') return palette.muted

  return palette.text
}

// Rows of the repositories a prompt or answer named, for the pane. Drawn with
// Box and Text so the terminal and the desktop pane share it.
export function drawCatenoidSection($: EngineInterface, e: RenderInput, palette: Palette, matches: Match[], width: number) {
  const { Box, Text } = $.ui.resolve(e)
  const labelWidth = 9
  if (matches.length === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={palette.accent} weight="bold">
        {fit('CATENOID', width)}
      </Text>
      {matches.slice(0, MAX_CARDS).map(m => (
        <Box key={`cat:${matchKey(m)}`} flexDirection="column" marginTop={1}>
          <Text color={palette.text} weight="bold" wrap="wrap">
            {head(m)}
          </Text>
          {cardRows(m).map(row => (
            <Box key={`cat:${matchKey(m)}:${row.label}`} flexDirection="row">
              <Text color={palette.muted}>{row.label.padEnd(labelWidth)}</Text>
              <Text color={rowColor(palette, row.color)} wrap="wrap">
                {row.value}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}
