// NFR-03 / SCRUM-188. The one place an error that escapes a route ends up.
//
// Controllers still answer their own expected outcomes (400 validation,
// 404 not found, 409 conflict, ...) with { message }, exactly as before. This
// handler is the safety net for everything they do not handle themselves:
// errors passed to next(err), errors thrown while handling a request, and
// errors raised by Express or its body parser.
//
// The response keeps the API's existing shape, { message }, and never
// includes the error's own message, stack or any other detail:
//   - an error that carries a 4xx status keeps that status, with a fixed
//     message for it;
//   - anything else becomes a 500 with a generic message.
//
// Registered in app.js after every route, so it only sees what the routes
// did not answer.

const CLIENT_ERROR_MESSAGES = Object.freeze({
  400: 'The request could not be processed',
  401: 'Authentication required',
  403: 'You do not have permission to perform this action',
  404: 'Not found',
  405: 'Method not allowed',
  413: 'The request is too large',
  415: 'Unsupported request format'
});

const DEFAULT_CLIENT_ERROR_MESSAGE = 'The request could not be processed';

export const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again.';

// The HTTP status an error asks for (Express and body-parser errors carry
// one), or 500 when it carries none or an invalid one.
export function statusOf(err) {
  const status = Number(err?.status ?? err?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

// Express recognises error middleware by its four parameters.
export function errorHandler(err, req, res, next) {
  // A response that has already started cannot be replaced; Express's own
  // handler closes the connection instead.
  if (res.headersSent) {
    return next(err);
  }

  const status = statusOf(err);
  const message =
    status < 500
      ? CLIENT_ERROR_MESSAGES[status] ?? DEFAULT_CLIENT_ERROR_MESSAGE
      : SERVER_ERROR_MESSAGE;

  return res.status(status).json({ message });
}
