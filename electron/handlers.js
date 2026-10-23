/**
 * Window and app event handlers, kept free of Electron imports so they can be
 * unit-tested with plain fakes.
 */

/**
 * `will-navigate` guard. Chromium's default for a file or link dropped onto a
 * page that does not handle the drop is to navigate the top-level document to
 * it; with no navigation UI that strands the user on a raw text file or an
 * external site. Only same-origin navigation (our own server) is allowed;
 * http(s) links go to the system browser, everything else is dropped.
 */
export function willNavigateGuard(origin, shell) {
  return (event, url) => {
    if (url === origin || url.startsWith(origin + '/')) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  }
}

/**
 * `setWindowOpenHandler` guard. To Chromium a target=_blank anchor is a
 * window.open — the path the What's new link in the top bar takes — and so is
 * anything a page script asks for. No second window of this app is ever
 * opened: an http(s) URL goes to the system browser, everything else (a
 * file:, a javascript:, a lookalike scheme) is dropped, and the answer is
 * deny either way.
 */
export function windowOpenGuard(shell) {
  return ({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  }
}

/** The size the window is designed for, and the smallest it may be dragged to. */
export const WINDOW_SIZE = { width: 1360, height: 880, minWidth: 900, minHeight: 600 }

/**
 * The window's size, no larger than the work area of the screen it opens on.
 * Windows does not shrink a window that is too tall for the screen: 880 is
 * more than the 816 a 1080p screen at 125% scaling leaves above the taskbar,
 * so the bottom of the interface (the Fix button, and the toasts that report a
 * failed Retry) was drawn underneath it. The minimums are clamped as well, or
 * they would push the window past the screen all over again.
 */
export function fitToWorkArea(size, workArea) {
  return {
    width: Math.min(size.width, workArea.width),
    height: Math.min(size.height, workArea.height),
    minWidth: Math.min(size.minWidth, workArea.width),
    minHeight: Math.min(size.minHeight, workArea.height),
  }
}

/**
 * Deterministic shutdown. Electron does not await an async `before-quit`
 * listener, so `await unload()` there just races process teardown. Instead:
 * cancel the first quit, unload (bounded by `timeoutMs` so a wedged dispose
 * cannot keep the app alive), then quit for real — the second `before-quit`
 * passes straight through.
 */
export function installQuitHandler(app, loadLocal, { timeoutMs = 2000 } = {}) {
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()

    let timer
    const deadline = new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
      timer.unref?.()
    })
    Promise.race([Promise.resolve().then(loadLocal).then((local) => local.unload()), deadline])
      .catch(() => {
        /* nothing loaded, or dispose failed — quit regardless */
      })
      .finally(() => {
        clearTimeout(timer)
        app.quit()
      })
  })
}
