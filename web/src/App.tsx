import { useEffect, useState } from 'react'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)

  useEffect(() => {
    setIsSupportedBrowser(isSupported())
  }, [])

  if (!isSupportedBrowser) {
    return <UnsupportedBrowser />
  }

  return <WorkspaceLayout />
}

export default App
