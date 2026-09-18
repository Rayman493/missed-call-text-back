import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const pageClient = fs.readFileSync(path.join(root, 'src/app/dashboard/leads/[id]/page-client.tsx'), 'utf-8')
const conversationComposer = fs.readFileSync(path.join(root, 'src/components/ConversationComposer.tsx'), 'utf-8')
const mobileComposer = fs.readFileSync(path.join(root, 'src/components/MobileConversationComposer.tsx'), 'utf-8')

describe('Batch 2A conversation core polish', () => {
  it('separates inbound and outbound photo summary labels', () => {
    expect(pageClient).toContain('Customer sent')
    expect(pageClient).toContain('You sent')
    expect(pageClient).toContain("msg.direction === 'inbound'")
    expect(pageClient).toContain("msg.direction === 'outbound'")
  })

  it('fullscreen open/close anchors to true bottom when following latest', () => {
    // The fullscreen toggle effect gates on recorded followLatestRef intent and
    // re-anchors through the canonical reconciler (which resolves the active
    // post-toggle container at run time).
    const block = pageClient.match(/Preserve and restore scroll position when toggling full-screen[\s\S]*?}\s*,\s*\[isFullScreen\]\)/)
    expect(block).toBeTruthy()
    if (block) {
      expect(block[0]).toContain('reconcileConversationBottom')
      expect(block[0]).toContain('followLatestRef.current')
    }
  })

  it('desktop composer has a stable 48px base height', () => {
    expect(conversationComposer).toContain("minHeight: '48px'")
    expect(conversationComposer).toContain('min-h-[48px]')
    expect(conversationComposer).toMatch(/BASE_HEIGHT\s*=\s*48/)
  })

  it('mobile component composer has a stable 48px base height and no fieldSizing', () => {
    expect(mobileComposer).toContain("minHeight: '48px'")
    expect(mobileComposer).toContain('min-h-[48px]')
    expect(mobileComposer).not.toContain("fieldSizing: 'content'")
    expect(mobileComposer).toMatch(/BASE_HEIGHT\s*=\s*48/)
  })
})
