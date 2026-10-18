// NFR-03 / SCRUM-189. Safety net for async route handlers.
//
// Express 4 does not catch a rejected promise from an async handler: the
// request never gets a response, and Node treats the rejection as unhandled,
// which by default stops the whole server process. Wrapping a handler sends
// any rejection - or synchronous throw - to next(err), so the central
// errorHandler answers it like every other failure.
//
// The current controllers already catch their own failures; this gives them,
// and any future handler, one consistent fallback rather than relying on
// every handler remembering its own try/catch.
//
//   router.get('/:projectId/board', requireAuth, requireProjectAccess, asyncHandler(getBoardController));
//
// The wrapper keeps the handler's name, so route-wiring tests that read
// handler names from router.stack still see e.g. 'getBoardController'.
export function asyncHandler(handler) {
  function wrapped(req, res, next) {
    return Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  }
  Object.defineProperty(wrapped, 'name', { value: handler.name || 'asyncHandler' });
  return wrapped;
}
