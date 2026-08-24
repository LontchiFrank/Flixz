/** @format */

// In-app browsers (WhatsApp, Instagram, Facebook/Messenger, TikTok, WeChat, Line)
// run in a sandboxed WebView with storage isolated from the device's real
// Safari/Chrome. A user can be fully logged in there and still hit a blank
// localStorage every time they tap a link inside the chat app.
const IN_APP_UA_PATTERN =
	/FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|TikTok/i;

export function isInAppBrowser() {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent || navigator.vendor || "";
	return IN_APP_UA_PATTERN.test(ua);
}
