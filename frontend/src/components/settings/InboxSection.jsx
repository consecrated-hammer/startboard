import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { inboxAPI, errorMessage } from '../../services/api.js'
import { useInbox } from '../../context/InboxContext.jsx'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsKit.jsx'
import { btnSecondary } from '../ui.js'

export default function InboxSection() {
  const { refresh } = useInbox()
  const [items, setItems] = useState({ page_invites: [], bookmark_offers: [] })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const next = await inboxAPI.list()
    setItems(next)
    await refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    // Initial inbox bootstrap; async state updates happen inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((err) => setError(errorMessage(err)))
  }, [load])

  const act = async (fn) => {
    try {
      await fn()
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <SettingsSection
      title="Inbox"
      description="Accept or reject private page shares and bookmark copies sent by other users."
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

      <SettingsGroup className="mb-4">
        {items.page_invites.map((invite) => (
          <SettingsRow
            key={`page-${invite.id}`}
            label={invite.page_title}
            hint={`Page invite from ${invite.sender_display_name || invite.sender_username} · ${invite.can_edit ? 'editable' : 'read-only'} · ${invite.status}`}
            stack
          >
            <div className="flex gap-2">
              {invite.status === 'pending' && (
                <>
                  <button className={btnSecondary} onClick={() => act(() => inboxAPI.acceptPageInvite(invite.id))}>
                    <Check className="h-4 w-4" />
                    <span>Accept</span>
                  </button>
                  <button className={btnSecondary} onClick={() => act(() => inboxAPI.rejectPageInvite(invite.id))}>
                    <X className="h-4 w-4" />
                    <span>Reject</span>
                  </button>
                </>
              )}
            </div>
          </SettingsRow>
        ))}
        {items.page_invites.length === 0 && (
          <div className="px-4 py-4 text-sm text-slate-400">No page invites.</div>
        )}
      </SettingsGroup>

      <SettingsGroup>
        {items.bookmark_offers.map((offer) => (
          <SettingsRow
            key={`bookmark-${offer.id}`}
            label={offer.bookmark.title}
            hint={`Bookmark from ${offer.sender_display_name || offer.sender_username} · ${offer.status}`}
            stack
          >
            <div className="mb-2 text-xs text-slate-400">{offer.bookmark.url}</div>
            <div className="flex gap-2">
              {offer.status === 'pending' && (
                <>
                  <button className={btnSecondary} onClick={() => act(() => inboxAPI.acceptBookmarkOffer(offer.id))}>
                    <Check className="h-4 w-4" />
                    <span>Accept copy</span>
                  </button>
                  <button className={btnSecondary} onClick={() => act(() => inboxAPI.rejectBookmarkOffer(offer.id))}>
                    <X className="h-4 w-4" />
                    <span>Reject</span>
                  </button>
                </>
              )}
            </div>
          </SettingsRow>
        ))}
        {items.bookmark_offers.length === 0 && (
          <div className="px-4 py-4 text-sm text-slate-400">No bookmark offers.</div>
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
