import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, ArrowUpRight, BarChart3, Check, Copy, Image as ImageIcon, Trash2 } from 'lucide-react'
import Modal from '../Modal.jsx'
import { btnDanger, btnPrimary, btnSecondary, input } from '../ui.js'
import { SettingsSection, SettingsGroup, SettingsRow, RangeField, ColorField, Select, Toggle } from '../settings/SettingsKit.jsx'
import PageSettingsPreview from './PageSettingsPreview.jsx'
import { adminAPI, errorMessage, imagesAPI, pagesAPI } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppState } from '../../context/AppStateContext.jsx'
import { useSaveToast } from '../../context/SaveToastContext.jsx'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'background', label: 'Background' },
  { id: 'columns', label: 'Layout' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'manage', label: 'Manage' },
]

// Tabs that materially change the page get a live preview pane; the rest
// (Sharing, Manage) don't, so the modal reclaims that width.
const PREVIEW_TABS = ['general', 'background', 'columns', 'preferences']
const BACKGROUND_TABS = [
  { id: 'source', label: 'Source' },
  { id: 'appearance', label: 'Appearance' },
]

export default function PageSettingsModal({ page, groups, onClose, onSaved, onDeleted }) {
  const { user } = useAuth()
  const { settings, preferences } = useAppState()
  const saveToast = useSaveToast()
  const isOwnerOrAdmin = user.role === 'admin' || page.is_owner
  const [activeTab, setActiveTab] = useState('general')
  const [backgroundTab, setBackgroundTab] = useState('source')
  const [imagePickerQuery, setImagePickerQuery] = useState('')
  const [imageSelectionFilter, setImageSelectionFilter] = useState('all')
  const [title, setTitle] = useState(page.title)
  const [description, setDescription] = useState(page.description || '')
  const [shared, setShared] = useState(page.visibility === 'shared')
  const [shareId, setShareId] = useState(page.share_id)
  const [users, setUsers] = useState([])
  const [managedImages, setManagedImages] = useState([])
  const [pageSingleImageId, setPageSingleImageId] = useState(page.bg_managed_image_id || '')
  const [pageRotationImageIds, setPageRotationImageIds] = useState([])
  const [privateInvites, setPrivateInvites] = useState([])
  const [inviteRecipient, setInviteRecipient] = useState('')
  const [inviteCanEdit, setInviteCanEdit] = useState(false)
  const [grants, setGrants] = useState({})
  const [layoutMode, setLayoutMode] = useState(page.layout_mode || (page.auto_balance ? 'balanced' : 'natural'))
  const [maxCols, setMaxCols] = useState(page.max_cols ?? 4)
  const [openNewTab, setOpenNewTab] = useState(page.open_new_tab ?? preferences.open_links_in_new_tab)
  const [singleRowOrder, setSingleRowOrder] = useState(page.single_row_order || 'natural')
  const [cardGap, setCardGap] = useState(page.card_gap ?? 12)
  const [cardGapX, setCardGapX] = useState(page.card_gap_x ?? 16)
  const [bookmarkGap, setBookmarkGap] = useState(page.bookmark_gap ?? 2)
  const [cardMaxWidth, setCardMaxWidth] = useState(page.card_max_width ?? 0)
  const [groupAlign, setGroupAlign] = useState(page.group_align || 'center')
  const [searchMode, setSearchMode] = useState(page.search_mode || 'inherit')
  const [showOverview, setShowOverview] = useState(page.show_overview ?? false)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(page.analytics_enabled ?? false)
  const [bgColor, setBgColor] = useState(page.bg_color || '')
  const [bgImage, setBgImage] = useState(page.bg_image || '')
  const [bgImageMode, setBgImageMode] = useState(page.bg_image_mode || 'external')
  const [bgManagedImageId, setBgManagedImageId] = useState(page.bg_managed_image_id || '')
  const [bgImageFit, setBgImageFit] = useState(page.bg_image_fit || 'cover')
  const [bgImagePosition, setBgImagePosition] = useState(page.bg_image_position || 'center')
  const [bgRenderEnabled, setBgRenderEnabled] = useState(page.bg_render_enabled ?? false)
  const [bgRenderWidth, setBgRenderWidth] = useState(page.bg_render_width || 1872)
  const [bgRenderHeight, setBgRenderHeight] = useState(page.bg_render_height || 922)
  const [bgRenderPosition, setBgRenderPosition] = useState(page.bg_render_position || 'center')
  const [bgSlideshowIntervalValue, setBgSlideshowIntervalValue] = useState(page.bg_slideshow_interval_value || 30)
  const [bgSlideshowIntervalUnit, setBgSlideshowIntervalUnit] = useState(page.bg_slideshow_interval_unit || 'seconds')
  const [bgSlideshowAdvanceMode, setBgSlideshowAdvanceMode] = useState(page.bg_slideshow_advance_mode || 'random')
  const [accent, setAccent] = useState(page.accent || '')
  const [bookmarkTitleColor, setBookmarkTitleColor] = useState(page.bookmark_title_color || '')
  const [iconColor, setIconColor] = useState(page.icon_color || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedShareLink, setCopiedShareLink] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const draftSaveTimerRef = useRef(null)
  const lastSavedDraftKeyRef = useRef('')
  const saveRequestIdRef = useRef(0)

  useEffect(() => {
    if (!isOwnerOrAdmin) return
    Promise.all([adminAPI.listUsers().catch(() => []), pagesAPI.getPermissions(page.id), pagesAPI.listInvites(page.id).catch(() => [])])
      .then(([allUsers, perms, invites]) => {
        setUsers(allUsers)
        setPrivateInvites(invites)
        const map = {}
        perms.forEach((permission) => { map[permission.user_id] = permission.can_edit ? 'edit' : 'view' })
        setGrants(map)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [page.id, isOwnerOrAdmin])

  useEffect(() => {
    imagesAPI.catalog().then((catalog) => {
      const images = catalog.images || []
      setManagedImages(images)
      const singleAllocation = images.find((image) => (image.allocations || []).some((allocation) => allocation.page_id === page.id && allocation.mode === 'single'))
      const rotationAllocations = images
        .filter((image) => (image.allocations || []).some((allocation) => allocation.page_id === page.id && allocation.mode === 'rotation'))
        .map((image) => image.id)
      setPageSingleImageId(singleAllocation?.id || page.bg_managed_image_id || '')
      setPageRotationImageIds(rotationAllocations)
      setDraftReady(true)
    }).catch(() => {})
    // Seed draft selections once per opened page. Later parent refreshes from
    // autosave should not overwrite the in-progress local draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  const shareLink = shareId ? `${window.location.origin}/s/${shareId}/${page.slug}` : ''
  const hasPreview = PREVIEW_TABS.includes(activeTab)
  const effectiveManagedImageId = bgImageMode === 'managed_single'
    ? Number(pageSingleImageId || 0)
    : bgImageMode === 'managed_rotation'
      ? Number(bgManagedImageId || pageRotationImageIds[0] || 0)
      : Number(bgManagedImageId || 0)
  const selectedManagedImage = managedImages.find((image) => image.id === effectiveManagedImageId)
  const previewManagedUrl = selectedManagedImage
    ? imagesAPI.originalUrl(selectedManagedImage.id)
    : ''
  const previewBgImage = bgImageMode === 'external'
    ? bgImage
    : bgImageMode === 'solid'
      ? ''
      : previewManagedUrl
  const activeBackgroundTab = BACKGROUND_TABS.some((tab) => tab.id === backgroundTab) ? backgroundTab : 'source'
  const isManagedMode = bgImageMode === 'managed_single' || bgImageMode === 'managed_rotation'
  const normalizedImageQuery = imagePickerQuery.trim().toLowerCase()
  const matchingManagedImages = normalizedImageQuery
    ? managedImages.filter((image) => {
      const allocations = image.allocations || []
      return image.original_name.toLowerCase().includes(normalizedImageQuery)
        || `${image.width || ''}x${image.height || ''}`.includes(normalizedImageQuery)
        || allocations.some((allocation) => allocation.page_title.toLowerCase().includes(normalizedImageQuery))
    })
    : managedImages
  const selectionFilterAllows = (selected) => imageSelectionFilter === 'all' || (imageSelectionFilter === 'selected' ? selected : !selected)
  const singlePickerImages = normalizedImageQuery
    ? matchingManagedImages.slice(0, 10)
    : managedImages.slice(0, 10)
  const rotationPickerImages = (normalizedImageQuery
    ? matchingManagedImages
    : managedImages)
      .filter(Boolean)
      .filter((image, index, arr) => arr.findIndex((item) => item.id === image.id) === index)
      .filter((image) => selectionFilterAllows(pageRotationImageIds.includes(image.id)))
      .slice(0, 12)
  const previewRotationImages = useMemo(
    () => pageRotationImageIds
      .map((imageId) => managedImages.find((image) => image.id === imageId))
      .filter(Boolean),
    [managedImages, pageRotationImageIds],
  )

  const buildDraftPayload = useCallback(() => {
    const desiredSingleId = bgImageMode === 'managed_single' ? Number(pageSingleImageId || 0) || null : null
    const desiredRotationIds = bgImageMode === 'managed_rotation' ? pageRotationImageIds.map(Number) : []
    return {
      title: title.trim() || page.title,
      description: description.trim() || null,
      layout_mode: layoutMode,
      max_cols: Number(maxCols),
      open_new_tab: openNewTab,
      auto_balance: layoutMode === 'balanced',
      single_row_order: singleRowOrder,
      card_gap: Number(cardGap),
      card_gap_x: Number(cardGapX),
      bookmark_gap: Number(bookmarkGap),
      card_max_width: Number(cardMaxWidth),
      group_align: groupAlign,
      search_mode: searchMode,
      show_overview: showOverview,
      analytics_enabled: analyticsEnabled,
      bg_image_mode: bgImageMode,
      bg_managed_image_id: bgImageMode === 'managed_single'
        ? desiredSingleId
        : bgImageMode === 'managed_rotation'
          ? (Number(bgManagedImageId || pageRotationImageIds[0] || 0) || null)
          : null,
      bg_image_fit: bgImageFit,
      bg_image_position: bgImagePosition,
      bg_render_enabled: bgRenderEnabled,
      bg_render_width: bgRenderEnabled ? Number(bgRenderWidth) : null,
      bg_render_height: bgRenderEnabled ? Number(bgRenderHeight) : null,
      bg_render_position: bgRenderPosition,
      bg_slideshow_enabled: bgImageMode === 'managed_rotation',
      bg_slideshow_interval_value: Number(bgSlideshowIntervalValue),
      bg_slideshow_interval_unit: bgSlideshowIntervalUnit,
      bg_slideshow_advance_mode: bgSlideshowAdvanceMode,
      bg_color: bgImageMode === 'solid' ? (bgColor.trim() || null) : null,
      bg_image: bgImageMode === 'external' ? bgImage.trim() : '',
      accent: accent.trim(),
      bookmark_title_color: bookmarkTitleColor.trim(),
      icon_color: iconColor.trim(),
      single_image_id: desiredSingleId,
      rotation_image_ids: desiredRotationIds,
    }
  }, [
    analyticsEnabled, bgColor, bgImage, bgImageFit, bgImageMode, bgManagedImageId, bgImagePosition,
    bgRenderEnabled, bgRenderHeight, bgRenderPosition, bgRenderWidth, bgSlideshowAdvanceMode,
    bgSlideshowIntervalUnit, bgSlideshowIntervalValue, cardGap, cardGapX,
    cardMaxWidth, description, groupAlign, layoutMode, maxCols, openNewTab, page.title, pageRotationImageIds,
    pageSingleImageId, searchMode, showOverview, singleRowOrder, title, bookmarkGap, accent, bookmarkTitleColor, iconColor,
  ])

  const persistDraft = useCallback(async () => {
    const requestId = ++saveRequestIdRef.current
    const draft = buildDraftPayload()
    const desiredSingleId = draft.single_image_id
    const desiredRotationIds = draft.rotation_image_ids
    saveToast.saving()
    try {
      await imagesAPI.replacePageAssignments(page.id, {
        single_image_id: desiredSingleId,
        rotation_image_ids: desiredRotationIds,
      })
      if (isOwnerOrAdmin) {
        const permissions = Object.entries(grants)
          .filter(([, level]) => level && level !== 'none')
          .map(([uid, level]) => ({ user_id: Number(uid), can_edit: level === 'edit' }))
        await pagesAPI.setPermissions(page.id, permissions)
      }
      await pagesAPI.update(page.id, {
        ...draft,
        single_image_id: undefined,
        rotation_image_ids: undefined,
      })
      if (requestId !== saveRequestIdRef.current) return
      lastSavedDraftKeyRef.current = JSON.stringify(draft)
      saveToast.saved()
      await onSaved?.()
    } catch (err) {
      if (requestId !== saveRequestIdRef.current) return
      setError(errorMessage(err))
      saveToast.failed()
    }
  }, [buildDraftPayload, grants, isOwnerOrAdmin, onSaved, page.id, saveToast])

  const draftKey = useMemo(() => JSON.stringify(buildDraftPayload()), [buildDraftPayload])

  useEffect(() => {
    if (!draftReady) return undefined
    if (!lastSavedDraftKeyRef.current) {
      lastSavedDraftKeyRef.current = draftKey
      return undefined
    }
    if (draftKey === lastSavedDraftKeyRef.current) return undefined
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(() => {
      persistDraft()
      draftSaveTimerRef.current = null
    }, 700)
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [draftKey, draftReady, persistDraft])

  useEffect(() => () => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
  }, [])

  const toggleShare = async () => {
    setBusy(true)
    setError('')
    try {
      if (shared) {
        await pagesAPI.unshare(page.id)
        setShared(false)
        setShareId(null)
      } else {
        const result = await pagesAPI.share(page.id)
        setShared(true)
        setShareId(result.share_id)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const duplicatePage = async () => {
    setBusy(true)
    try {
      const created = await pagesAPI.duplicate(page.id)
      onSaved?.()
      window.location.assign(`/p/${created.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const toggleArchive = async () => {
    setBusy(true)
    try {
      await pagesAPI.update(page.id, { is_archived: !page.is_archived })
      onSaved?.()
      if (!page.is_archived) onDeleted?.()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const removePage = async () => {
    const shareWarning = shared || page.share_id
      ? '\n\nWarning: this page currently has an active share link. Deleting it will immediately break that shared URL.'
      : ''
    if (!window.confirm(`Delete page "${page.title}" and all its bookmarks?${shareWarning}`)) return
    setBusy(true)
    try {
      await pagesAPI.remove(page.id)
      onDeleted?.()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const copyShareLink = async () => {
    if (!shareLink) return
    await navigator.clipboard?.writeText(shareLink)
    setCopiedShareLink(true)
    window.setTimeout(() => setCopiedShareLink(false), 1500)
  }

  const toggleRotationImage = (imageId) => {
    setPageRotationImageIds((current) => {
      const next = current.includes(imageId)
        ? current.filter((value) => value !== imageId)
        : [...current, imageId]
      if (!next.includes(Number(bgManagedImageId))) setBgManagedImageId(next[0] ? String(next[0]) : '')
      return next
    })
  }

  return (
    <Modal
      title={`Page settings for "${page.title}"`}
      size="6xl"
      onClose={onClose}
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-[0_10px_30px_rgba(244,63,94,0.12)]">
          <div className="font-medium text-rose-200">Couldn&apos;t save these settings</div>
          <div className="mt-1 text-rose-100/90">{error}</div>
        </div>
      )}

      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
              activeTab === tab.id ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={`grid gap-6 ${hasPreview ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="min-w-0">
          {activeTab === 'general' && (
            <>
              <SettingsSection title="General">
                <SettingsGroup>
                  <SettingsRow label="Page title" stack>
                    <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </SettingsRow>
                  <SettingsRow label="Description" stack>
                    <textarea className={`${input} min-h-28 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} />
                  </SettingsRow>
                </SettingsGroup>
              </SettingsSection>
            </>
          )}

          {activeTab === 'sharing' && (
            <SettingsSection title="Sharing & access">
              <SettingsGroup>
                {settings.allow_sharing ? (
                  <>
                    <SettingsRow label="Share page" hint="Anyone with the link can view this page read-only.">
                      <button className={shared ? btnSecondary : btnPrimary} onClick={toggleShare} disabled={busy}>
                        {shared ? 'Stop sharing' : 'Create link'}
                      </button>
                    </SettingsRow>
                    {shared && shareLink && (
                      <SettingsRow label="Link" stack>
                        <div className="flex gap-2">
                          <input className={input} readOnly value={shareLink} onFocus={(e) => e.target.select()} />
                          <button className={btnSecondary} onClick={copyShareLink}>{copiedShareLink ? 'Copied' : 'Copy'}</button>
                        </div>
                      </SettingsRow>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-400">Public sharing is disabled by the administrator.</div>
                )}
              </SettingsGroup>
              {isOwnerOrAdmin && (
                <div className="mt-4 space-y-4">
                  <SettingsGroup className="max-h-60 overflow-y-auto">
                    {users.filter((item) => item.id !== page.owner_id).map((item) => (
                      <SettingsRow key={item.id} label={item.display_name || item.username} hint={`@${item.username}`}>
                        <select
                          className={`${input} w-36 appearance-none`}
                          value={grants[item.id] || 'none'}
                          onChange={(e) => setGrants((current) => ({ ...current, [item.id]: e.target.value }))}
                        >
                          <option value="none">No access</option>
                          <option value="view">Can view</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </SettingsRow>
                    ))}
                  </SettingsGroup>

                  <SettingsSection title="Private invites" description="Share this page with an existing account by username or email.">
                    <SettingsGroup>
                      <SettingsRow label="Recipient" hint="Use an existing username or email." stack>
                        <input className={input} value={inviteRecipient} onChange={(e) => setInviteRecipient(e.target.value)} placeholder="@username or user@example.com" />
                      </SettingsRow>
                      <SettingsRow label="Editable invite">
                        <Toggle checked={inviteCanEdit} onChange={setInviteCanEdit} label="Editable invite" />
                      </SettingsRow>
                      <SettingsRow label="Create invite">
                        <button
                          className={btnPrimary}
                          onClick={async () => {
                            try {
                              await pagesAPI.invite(page.id, { recipient: inviteRecipient.trim(), can_edit: inviteCanEdit })
                              setInviteRecipient('')
                              setInviteCanEdit(false)
                              setPrivateInvites(await pagesAPI.listInvites(page.id))
                            } catch (err) {
                              setError(errorMessage(err))
                            }
                          }}
                        >
                          Create invite
                        </button>
                      </SettingsRow>
                    </SettingsGroup>
                    {privateInvites.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5">
                        {privateInvites.map((invite) => (
                          <div key={invite.id} className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 first:border-t-0">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-white">{invite.recipient_display_name || invite.recipient_username}</div>
                              <div className="truncate text-xs text-slate-400">
                                {invite.recipient_email} · {invite.can_edit ? 'editable' : 'read-only'} · {invite.status}
                              </div>
                            </div>
                            {invite.status === 'pending' && (
                              <button
                                className={btnSecondary}
                                onClick={async () => {
                                  try {
                                    await pagesAPI.revokeInvite(page.id, invite.id)
                                    setPrivateInvites(await pagesAPI.listInvites(page.id))
                                  } catch (err) {
                                    setError(errorMessage(err))
                                  }
                                }}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </SettingsSection>
                </div>
              )}
            </SettingsSection>
          )}

          {activeTab === 'background' && (
            <>
              <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
                {BACKGROUND_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBackgroundTab(tab.id)}
                    className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                      activeBackgroundTab === tab.id ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {activeBackgroundTab === 'source' && (
                <div className="grid gap-5 xl:grid-cols-2">
                  <SettingsSection title="Source">
                    <SettingsGroup>
                      <SettingsRow label="Background source" hint="Use a solid colour, external image, single image, or slideshow." stack>
                        <Select value={bgImageMode} onChange={(e) => setBgImageMode(e.target.value)}>
                          <option value="solid">Solid colour</option>
                          <option value="external">External URL</option>
                          <option value="managed_single">Single image</option>
                          <option value="managed_rotation">Slideshow</option>
                        </Select>
                      </SettingsRow>
                      {bgImageMode === 'solid' && (
                        <SettingsRow label="Background colour" hint="Choose the solid page background." stack>
                          <ColorField value={bgColor} onChange={setBgColor} />
                        </SettingsRow>
                      )}
                      {bgImageMode === 'external' && (
                        <SettingsRow label="Background image URL" hint="Optional page background URL." stack>
                          <input className={input} value={bgImage} onChange={(e) => setBgImage(e.target.value)} placeholder="https://…" />
                        </SettingsRow>
                      )}
                      {bgImageMode === 'managed_rotation' && (
                        <SettingsRow label="Slideshow settings" hint="Control how often the background changes and how the next image is chosen." stack>
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[120px_140px]">
                              <label>
                                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                  Every
                                </span>
                                <input className={input} type="number" value={bgSlideshowIntervalValue} onChange={(e) => setBgSlideshowIntervalValue(e.target.value)} />
                              </label>
                              <label>
                                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                  Unit
                                </span>
                                <Select value={bgSlideshowIntervalUnit} onChange={(e) => setBgSlideshowIntervalUnit(e.target.value)}>
                                  <option value="seconds">seconds</option>
                                  <option value="minutes">minutes</option>
                                </Select>
                              </label>
                            </div>
                            <label className="block max-w-sm">
                              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                Order
                              </span>
                              <Select value={bgSlideshowAdvanceMode} onChange={(e) => setBgSlideshowAdvanceMode(e.target.value)}>
                                <option value="sequential">sequential</option>
                                <option value="shuffle">shuffle</option>
                                <option value="random">random</option>
                              </Select>
                            </label>
                            <div className="space-y-1 rounded-2xl border border-white/8 bg-slate-950/30 px-3 py-2 text-xs leading-5 text-slate-300">
                              <div><span className="font-medium text-white">Sequential</span> walks through your selected images in order.</div>
                              <div><span className="font-medium text-white">Shuffle</span> mixes the set before stepping through it.</div>
                              <div><span className="font-medium text-white">Random</span> picks a new image unpredictably.</div>
                            </div>
                          </div>
                        </SettingsRow>
                      )}
                    </SettingsGroup>
                  </SettingsSection>

                  {isManagedMode && (
                    <SettingsSection title={bgImageMode === 'managed_single' ? 'Single image' : 'Slideshow images'}>
                      <SettingsGroup>
                        <div className="space-y-3 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white">Library</div>
                              <div className="text-xs text-slate-400">
                                {bgImageMode === 'managed_single'
                                  ? 'Pick one image for this page.'
                                  : 'Pick the images to include in this slideshow.'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={btnSecondary}
                              onClick={() => window.location.assign('/preferences?tab=images')}
                            >
                              <ImageIcon className="h-4 w-4" />
                              <span>Manage library</span>
                              <ArrowUpRight className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            className={input}
                            value={imagePickerQuery}
                            onChange={(e) => setImagePickerQuery(e.target.value)}
                            placeholder={bgImageMode === 'managed_single' ? 'Search by filename' : 'Search slideshow images'}
                          />
                          <div className="flex flex-wrap gap-2">
                            {['all', 'selected', 'unselected'].map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setImageSelectionFilter(value)}
                                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                  imageSelectionFilter === value
                                    ? 'border-accent/35 bg-accent/15 text-white'
                                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                {value === 'all' ? 'All' : value === 'selected' ? 'Selected' : 'Unselected'}
                              </button>
                            ))}
                          </div>
                        </div>

                      {bgImageMode === 'managed_single' && (
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto px-4 py-4">
                          {singlePickerImages
                            .filter((image) => selectionFilterAllows(Number(pageSingleImageId) === image.id))
                            .map((image) => {
                              if (!image) return null
                              const selected = Number(pageSingleImageId) === image.id
                              return (
                                <BackgroundPickerRow
                                  key={image.id}
                                  onClick={() => {
                                    setPageSingleImageId(image.id)
                                    setBgManagedImageId(String(image.id))
                                  }}
                                  image={image}
                                  selected={selected}
                                  mode="single"
                                  meta={`${image.width || '?'}×${image.height || '?'} · ${image.file_size ? formatBytes(image.file_size) : 'Unknown size'}`}
                                />
                              )
                            })}
                          {normalizedImageQuery && matchingManagedImages.length > singlePickerImages.length && (
                            <div className="text-xs text-slate-400">
                              Showing the first {singlePickerImages.length} matches. Narrow the search to find a specific image faster.
                            </div>
                          )}
                        </div>
                      )}
                      {bgImageMode === 'managed_rotation' && (
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto px-4 py-4">
                          {rotationPickerImages.map((image) => {
                            if (!image) return null
                            const selected = pageRotationImageIds.includes(image.id)
                            return (
                              <BackgroundPickerRow
                                key={image.id}
                                onClick={() => toggleRotationImage(image.id)}
                                image={image}
                                selected={selected}
                                mode="rotation"
                                meta={`${image.width || '?'}×${image.height || '?'} · ${image.file_size ? formatBytes(image.file_size) : 'Unknown size'}`}
                              />
                            )
                          })}
                          {normalizedImageQuery && matchingManagedImages.length > rotationPickerImages.length && (
                            <div className="text-xs text-slate-400">
                              Showing the first {rotationPickerImages.length} matches. Narrow the search to find a specific image faster.
                            </div>
                          )}
                        </div>
                      )}
                    </SettingsGroup>
                  </SettingsSection>
                  )}
                </div>
              )}

              {activeBackgroundTab === 'appearance' && (
                <SettingsSection title="Background behaviour" description="Control how the background fills the page and, for managed images, how Startboard pre-renders it before display.">
                  <SettingsGroup>
                    <SettingsRow label="Accent colour" stack>
                      <ColorField value={accent} onChange={setAccent} />
                    </SettingsRow>
                    <SettingsRow label="Default icon colour" hint="Fallback for group and bookmark icons on this page. Groups and bookmarks can override it." stack>
                      <ColorField value={iconColor} onChange={setIconColor} />
                    </SettingsRow>
                    <SettingsRow label="Bookmark title colour" hint="Default colour for bookmark labels across this page. Groups and individual bookmarks can override it." stack>
                      <ColorField value={bookmarkTitleColor} onChange={setBookmarkTitleColor} />
                    </SettingsRow>
                  </SettingsGroup>

                  {(bgImageMode === 'managed_single' || bgImageMode === 'managed_rotation') && (
                    <div className="mt-4">
                      <SettingsGroup>
                        <SettingsRow
                          label="Resize for screen"
                          hint="Stage 1. Generate a cropped image at a fixed size before Startboard fits it to the page."
                        >
                          <Toggle checked={bgRenderEnabled} onChange={setBgRenderEnabled} label="Resize for screen" />
                        </SettingsRow>
                        {bgRenderEnabled && (
                          <>
                            <SettingsRow
                              label="Render size"
                              hint="This sets the shape of the generated image, so tall or wide values should visibly change the preview. Limit: 1 to 12,000 px."
                              stack
                            >
                              <div className="grid gap-3 sm:grid-cols-2">
                                <input className={input} type="number" min={1} max={12000} value={bgRenderWidth} onChange={(e) => setBgRenderWidth(e.target.value)} placeholder="Width in px" />
                                <input className={input} type="number" min={1} max={12000} value={bgRenderHeight} onChange={(e) => setBgRenderHeight(e.target.value)} placeholder="Height in px" />
                              </div>
                            </SettingsRow>
                            <SettingsRow label="Crop anchor" hint="Keeps this area of the source image during the render crop. It does not place the image on the page." stack>
                              <CropAnchorPicker value={bgRenderPosition} onChange={setBgRenderPosition} />
                            </SettingsRow>
                          </>
                        )}
                      </SettingsGroup>
                    </div>
                  )}

                  {bgImageMode !== 'solid' && (
                    <div className="mt-4">
                      <SettingsGroup>
                        <SettingsRow label="Fit on page" hint="Stage 2. Applied after any render crop is generated." stack>
                          <ImageFitPicker value={bgImageFit} onChange={setBgImageFit} />
                        </SettingsRow>
                        {(bgImageFit === 'contain' || bgImageFit === 'scale-down') && (
                          <SettingsRow
                            label="Place on page"
                            hint="When the image does not fill the page, choose where the remaining image sits."
                            stack
                          >
                            <PagePositionPicker value={bgImagePosition} onChange={setBgImagePosition} />
                          </SettingsRow>
                        )}
                      </SettingsGroup>
                    </div>
                  )}
                </SettingsSection>
              )}

            </>
          )}

          {activeTab === 'columns' && (
            <>
              <SettingsSection title="Layout">
                <SettingsGroup>
                  <SettingsRow label="Layout mode" hint="Use your stored column flow, auto-balanced columns, or free placement.">
                    <Select className="w-44" value={layoutMode} onChange={(e) => setLayoutMode(e.target.value)}>
                      <option value="natural">Natural</option>
                      <option value="balanced">Balanced</option>
                      <option value="manual">Manual</option>
                    </Select>
                  </SettingsRow>
                  <SettingsRow label="Max columns" hint="How many columns groups can spread across. “Max” fills the available width.">
                    <Select className="w-32" value={maxCols} onChange={(e) => setMaxCols(e.target.value)}>
                      <option value={0}>Max</option>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </Select>
                  </SettingsRow>
                  <SettingsRow label="Group alignment" hint="Where the columns sit when they don’t fill the width — most visible with a fixed max card width.">
                    <Select className="w-32" value={groupAlign} onChange={(e) => setGroupAlign(e.target.value)}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </Select>
                  </SettingsRow>
                  <SettingsRow
                    label="Single-row ordering"
                    hint="Only applies when balanced layout is on and every visible group fits on one row."
                  >
                    <Select className="w-48" value={singleRowOrder} onChange={(e) => setSingleRowOrder(e.target.value)} disabled={layoutMode !== 'balanced'}>
                      <option value="natural">Natural</option>
                      <option value="tallest_first">Tallest first</option>
                    </Select>
                  </SettingsRow>
                  {layoutMode === 'manual' && (
                    <SettingsRow
                      label="Manual placement"
                      hint="Drag groups directly on the board. Startboard remembers those positions when you switch layouts."
                      stack
                    >
                      <div className="text-sm text-slate-300">
                        Groups can overlap and sit anywhere on the page in manual mode.
                      </div>
                    </SettingsRow>
                  )}
                </SettingsGroup>
              </SettingsSection>

              <SettingsSection title="Spacing & size">
                <SettingsGroup>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-sm text-white">Vertical spacing</div>
                      <RangeField value={cardGap} onChange={setCardGap} min={0} max={48} />
                    </div>
                    <div>
                      <div className="mb-1.5 text-sm text-white">Horizontal spacing</div>
                      <RangeField value={cardGapX} onChange={setCardGapX} min={0} max={48} />
                    </div>
                    <div>
                      <div className="mb-1.5 text-sm text-white">Bookmark spacing</div>
                      <RangeField value={bookmarkGap} onChange={setBookmarkGap} min={0} max={24} />
                    </div>
                    <div>
                      <div className="mb-1.5 text-sm text-white">Max card width</div>
                      <RangeField value={cardMaxWidth} onChange={setCardMaxWidth} min={0} max={560} step={20} format={(value) => (value === 0 ? 'Auto' : `${value}px`)} />
                    </div>
                  </div>
                </SettingsGroup>
              </SettingsSection>
            </>
          )}

          {activeTab === 'preferences' && (
            <>
              <SettingsSection title="Display & behaviour">
                <SettingsGroup>
                  <SettingsRow label="Page overview" hint="Show a heading and description block at the top of the page.">
                    <Toggle checked={showOverview} onChange={setShowOverview} label="Show page overview" />
                  </SettingsRow>
                  <SettingsRow label="Search bar" hint="Show the search box on this page. “Default” follows your account preference.">
                    <Select className="w-48" value={searchMode} onChange={(e) => setSearchMode(e.target.value)}>
                      <option value="inherit">Default ({preferences.show_search_bar ? 'Show' : 'Hide'})</option>
                      <option value="show">Show</option>
                      <option value="hide">Hide</option>
                    </Select>
                  </SettingsRow>
                  <SettingsRow label="Open links in a new window" hint="Open this page’s bookmarks in a new tab instead of the current one.">
                    <Toggle checked={openNewTab} onChange={setOpenNewTab} label="Open links in a new window" />
                  </SettingsRow>
                </SettingsGroup>
              </SettingsSection>

              <SettingsSection title="Analytics">
                <SettingsGroup>
                  <SettingsRow label="Page analytics" hint="Track visits and link clicks for this page.">
                    <Toggle checked={analyticsEnabled} onChange={setAnalyticsEnabled} label="Enable page analytics" />
                  </SettingsRow>
                  {user.role === 'admin' && (analyticsEnabled || page.analytics_enabled) && (
                    <SettingsRow label="Analytics reports" hint="Open the dedicated analytics page for deeper reporting and heatmap-style insight.">
                      <button className={btnSecondary} onClick={() => window.location.assign(`/analytics/${page.id}`)}>
                        <BarChart3 className="h-4 w-4" />
                        <span>Open analytics</span>
                      </button>
                    </SettingsRow>
                  )}
                </SettingsGroup>
              </SettingsSection>
            </>
          )}

          {activeTab === 'manage' && (
            <SettingsSection title="Manage page" description="Duplicate, archive, or delete this page.">
              <SettingsGroup>
                <SettingsRow label="Duplicate page" hint="Create a copy of this page with all its groups and bookmarks.">
                  <button className={btnSecondary} onClick={duplicatePage} disabled={busy}>
                    <Copy className="h-4 w-4" />
                    <span>Duplicate</span>
                  </button>
                </SettingsRow>
                <SettingsRow
                  label={page.is_archived ? 'Restore page' : 'Archive page'}
                  hint={page.is_archived
                    ? 'Bring this page back into the tab bar.'
                    : 'Hide this page from the tab bar. Restore it anytime from Preferences → Bookmarks.'}
                >
                  <button className={btnSecondary} onClick={toggleArchive} disabled={busy}>
                    {page.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    <span>{page.is_archived ? 'Restore' : 'Archive'}</span>
                  </button>
                </SettingsRow>
              </SettingsGroup>
              <div className="mt-4">
                <SettingsGroup>
                  <SettingsRow label="Delete page" hint="Permanently delete this page and all its bookmarks. This can't be undone.">
                    <button className={btnDanger} onClick={removePage} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  </SettingsRow>
                </SettingsGroup>
              </div>
            </SettingsSection>
          )}
        </div>

        {hasPreview && (
          <aside className="hidden xl:block">
            <div className="sticky top-0 space-y-3">
              <div className="px-1">
                <h2 className="text-base font-semibold text-white">Page preview</h2>
              </div>
              <PageSettingsPreview
                activeTab={activeTab}
                title={title}
                description={description}
                groups={groups}
                maxCols={Number(maxCols)}
                cardGap={cardGap}
                cardGapX={cardGapX}
                bookmarkGap={bookmarkGap}
                cardMaxWidth={cardMaxWidth}
                layoutMode={layoutMode}
                autoBalance={layoutMode === 'balanced'}
                singleRowOrder={singleRowOrder}
                bgMode={bgImageMode}
                bgColor={bgColor}
                bgImage={previewBgImage}
                bgImageFit={bgImageFit}
                bgImagePosition={bgImagePosition}
                bgRenderEnabled={bgRenderEnabled}
                bgRenderWidth={Number(bgRenderWidth) || 0}
                bgRenderHeight={Number(bgRenderHeight) || 0}
                bgRenderPosition={bgRenderPosition}
                bgRotationImages={previewRotationImages.map((image) => ({
                  id: image.id,
                  url: imagesAPI.originalUrl(image.id),
                }))}
                bgSlideshowIntervalValue={Number(bgSlideshowIntervalValue) || 30}
                bgSlideshowIntervalUnit={bgSlideshowIntervalUnit}
                bgSlideshowAdvanceMode={bgSlideshowAdvanceMode}
                accent={accent}
                iconColor={iconColor}
                showOverview={showOverview}
                searchMode={searchMode}
                searchDefault={preferences.show_search_bar}
              />
            </div>
          </aside>
        )}
      </div>
    </Modal>
  )
}

function BackgroundPickerRow({ image, selected, mode, meta, onClick }) {
  const selectedClass = mode === 'single'
    ? 'border-sky-300/45 bg-sky-400/14'
    : 'border-emerald-300/40 bg-emerald-400/12'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full items-center gap-3 rounded-xl border p-2.5 text-left transition xl:grid-cols-[120px_minmax(0,1fr)_auto] ${
        selected ? `${selectedClass} text-white` : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/8'
      }`}
    >
      <img src={imagesAPI.originalUrl(image.id)} alt={image.original_name} className="h-16 w-full rounded-lg object-cover xl:w-30" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{image.original_name}</div>
        <div className="mt-1 text-xs text-slate-400">{meta}</div>
      </div>
      <div className="flex items-center justify-start xl:justify-end">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${
            selected
              ? mode === 'single'
                ? 'border-sky-200/80 bg-sky-50 text-sky-950'
                : 'border-emerald-200/80 bg-emerald-50 text-emerald-950'
              : 'border-white/10 bg-white/6 text-transparent'
          }`}
        >
          <Check className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}

function CropAnchorPicker({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        Choose which part of the image the crop should hold onto when Startboard trims it to the render size.
      </div>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="center">Center</option>
        <option value="north">Top</option>
        <option value="south">Bottom</option>
        <option value="west">Left</option>
        <option value="east">Right</option>
        <option value="northwest">Top left</option>
      </Select>
    </div>
  )
}

function ImageFitPicker({ value, onChange }) {
  const options = [
    { value: 'cover', label: 'Cover', description: 'Fills the page and crops the overflow.', sizeClass: 'h-full w-full' },
    { value: 'contain', label: 'Contain', description: 'Shows the whole image inside the page.', sizeClass: 'h-7 w-12' },
    { value: 'fill', label: 'Fill', description: 'Stretches the image to match the page.', sizeClass: 'h-full w-full scale-x-110' },
    { value: 'scale-down', label: 'Scale down', description: 'Keeps smaller images from enlarging too aggressively.', sizeClass: 'h-6 w-10' },
  ]

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        Choose how the background image should fill the page area.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? 'border-accent/40 bg-accent/14 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/8'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                  active ? 'border-accent/40 bg-slate-950/75' : 'border-white/10 bg-slate-950/45'
                }`}>
                  <span className={`rounded-md bg-white/70 ${option.sizeClass}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PagePositionPicker({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        This places the finished image on the page. It is separate from crop anchor.
      </div>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="center">Center</option>
        <option value="north">Top</option>
        <option value="south">Bottom</option>
        <option value="west">Left</option>
        <option value="east">Right</option>
        <option value="northwest">Top left</option>
        <option value="northeast">Top right</option>
        <option value="southwest">Bottom left</option>
        <option value="southeast">Bottom right</option>
      </Select>
    </div>
  )
}

function formatBytes(value) {
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}
