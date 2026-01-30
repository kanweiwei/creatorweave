/**
 * WorkspaceLayout - main layout for the AI workbench.
 *
 * Composes: TopBar + Sidebar + Main content (WelcomeScreen or ConversationView)
 */

import { useState, useCallback } from 'react'
import { useConversationStore } from '@/store/conversation.store'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { ConversationView } from '@/components/agent/ConversationView'
import { WelcomeScreen } from '@/components/WelcomeScreen'

export function WorkspaceLayout() {
  const { activeConversationId, createNew, setActive } = useConversationStore()
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const handleStartConversation = useCallback(
    (text: string) => {
      const conv = createNew(text.slice(0, 30))
      setActive(conv.id)
      setPendingMessage(text)
    },
    [createNew, setActive]
  )

  const handleInitialMessageConsumed = useCallback(() => {
    setPendingMessage(null)
  }, [])

  const hasActiveConversation = !!activeConversationId

  return (
    <div className="flex h-screen flex-col bg-white">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {hasActiveConversation ? (
            <ConversationView
              initialMessage={pendingMessage}
              onInitialMessageConsumed={handleInitialMessageConsumed}
            />
          ) : (
            <WelcomeScreen onStartConversation={handleStartConversation} />
          )}
        </main>
      </div>
    </div>
  )
}
