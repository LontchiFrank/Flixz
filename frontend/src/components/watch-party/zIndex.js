/** @format */

// Single source of truth for Watch Party's internal stacking order. Keeping
// these as small, explicit, bounded numbers (rather than near-max values
// like 2147483647) is deliberate: it leaves headroom below shadcn/Radix's
// Dialog (z-50, see components/ui/dialog.jsx) so the Invite/Share/Change-
// Content dialogs always render above floating camera tiles instead of
// being silently covered by them.
export const Z = {
	FLOATING_TILE: 30, // draggable camera tiles in Floating layout
	// The player's own essential controls (play/pause, fullscreen, title)
	// must stay reachable even if a user drags a floating tile over them,
	// so they outrank tiles despite being decorative-ish overlays themselves.
	PLAYER_CHROME: 35,
	DROPDOWN: 45, // LayoutSwitcher menu, source picker menu - must beat both
	// Dialogs (Invite/Share/Change Content) use the Dialog primitive's own
	// z-50 and intentionally stay above everything in this scale.
};
