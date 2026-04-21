import { useEffect, useState } from 'react'
import { useAppStore } from './store/app'
import { initConnectionManager } from './lib/connection-manager'
import { startIncomingRing, stopIncomingRing, startOutgoingRing, stopOutgoingRing, stopAllRings } from './lib/sounds'
import FirstLaunch from './pages/FirstLaunch'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import GroupCallPanel from './components/GroupCallPanel'
import SettingsPanel from './components/SettingsPanel'
import IncomingRequestBanner from './components/IncomingRequest'
import IncomingCall from './components/IncomingCall'
import IncomingGroupCall from './components/IncomingGroupCall'

export default function App() {
  const profiles = useAppStore((s) => s.profiles)
  const activeProfile = useAppStore((s) => s.activeProfile)
  const groupCallActive = useAppStore((s) => s.groupCall.active)
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setActiveProfile = useAppStore((s) => s.setActiveProfile)
  const setContacts = useAppStore((s) => s.setContacts)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    window.api.identity.getProfiles().then((loaded) => {
      setProfiles(loaded)
      if (loaded.length > 0) setActiveProfile(loaded[0])
    })
  }, [])

  useEffect(() => {
    if (!activeProfile) return
    window.api.contacts.get(activeProfile.id).then(setContacts)
    const cm = initConnectionManager(activeProfile)
    return () => cm.destroy()
  }, [activeProfile?.id])

  // Call ringing sounds driven off call.status transitions
  useEffect(() => {
    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.call.status === prev.call.status) return
      stopAllRings()
      if (s.call.status === 'ringing') startIncomingRing()
      else if (s.call.status === 'calling') startOutgoingRing()
    })
    return () => { unsub(); stopAllRings() }
  }, [])

  if (profiles.length === 0 && activeProfile === null) return (
    <>
      <TitleBar />
      <FirstLaunch />
    </>
  )
  if (!activeProfile) return null

  function mainPanel() {
    if (groupCallActive) return <GroupCallPanel />
    if (showSettings) return <SettingsPanel />
    return <ConversationView />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Sidebar onSettings={() => setShowSettings((v) => !v)} />
        {mainPanel()}
      </div>
      <IncomingRequestBanner />
      <IncomingCall />
      <IncomingGroupCall />
    </div>
  )
}
