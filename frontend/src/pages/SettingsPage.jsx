import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Boxes, CircleUser, Image as ImageIcon, Inbox, KeyRound, ListTree, Palette, Puzzle, SlidersHorizontal, Users } from 'lucide-react'
import TopBar from '../components/board/TopBar.jsx'
import { pagesAPI } from '../services/api.js'
import ProfileSection from '../components/settings/ProfileSection.jsx'
import AppearanceSection from '../components/settings/AppearanceSection.jsx'
import PasswordSection from '../components/settings/PasswordSection.jsx'
import GeneralSection from '../components/settings/GeneralSection.jsx'
import IntegrationsSection from '../components/settings/IntegrationsSection.jsx'
import UsersSection from '../components/settings/UsersSection.jsx'
import BookmarkPreferencesSection from '../components/settings/BookmarkPreferencesSection.jsx'
import BrowserExtensionSection from '../components/settings/BrowserExtensionSection.jsx'
import ImagesSection from '../components/settings/ImagesSection.jsx'
import InboxSection from '../components/settings/InboxSection.jsx'
import { useInbox } from '../context/InboxContext.jsx'

const PREFERENCE_TABS = [
  { id: 'profile', label: 'Profile', icon: CircleUser, sections: [ProfileSection] },
  { id: 'appearance', label: 'Appearance', icon: Palette, sections: [AppearanceSection] },
  { id: 'password', label: 'Password', icon: KeyRound, sections: [PasswordSection] },
  { id: 'extension', label: 'Browser Extension', icon: Puzzle, sections: [BrowserExtensionSection] },
  { id: 'bookmarks', label: 'Bookmarks', icon: ListTree, sections: [BookmarkPreferencesSection] },
  { id: 'images', label: 'Images', icon: ImageIcon, sections: [ImagesSection] },
  { id: 'inbox', label: 'Inbox', icon: Inbox, sections: [InboxSection] },
]

const ADMIN_TABS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal, sections: [GeneralSection] },
  { id: 'integrations', label: 'Integrations', icon: Boxes, sections: [IntegrationsSection] },
  { id: 'users', label: 'Users', icon: Users, sections: [UsersSection] },
]

export default function SettingsPage({ mode = 'preferences' }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pendingCount } = useInbox()
  const tabs = mode === 'admin' ? ADMIN_TABS : PREFERENCE_TABS
  const requestedTab = searchParams.get('tab')
  const [localActive, setLocalActive] = useState(tabs[0].id)
  const active = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : localActive
  const current = tabs.find((tab) => tab.id === active) || tabs[0]
  const [pages, setPages] = useState([])

  useEffect(() => {
    pagesAPI.list().then(setPages).catch(() => {})
  }, [])

  const addPage = async () => {
    const name = window.prompt('New page name')
    if (!name?.trim()) return
    const page = await pagesAPI.create(name.trim())
    navigate(`/p/${page.id}`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        pages={pages}
        currentPageId={null}
        onSelectPage={(id) => navigate(`/p/${id}`)}
        onAddPage={addPage}
        canEdit={false}
        showSearch={false}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-6 text-2xl font-semibold text-white">
          {mode === 'admin' ? 'Administration' : 'User Preferences'}
        </h1>

        <div className="rounded-3xl border border-white/10 bg-white/3 p-4 sm:p-5">
        <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setLocalActive(tab.id)
                  setSearchParams((currentParams) => {
                    const next = new URLSearchParams(currentParams)
                    next.set('tab', tab.id)
                    return next
                  }, { replace: true })
                }}
                className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  active === tab.id
                    ? 'bg-accent/15 font-medium text-white'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.id === 'inbox' && pendingCount > 0 && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

          <div className="min-w-0">
            {current.sections.map((Section, index) => (
              <Section key={`${current.id}-${index}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
