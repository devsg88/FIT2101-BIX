import rateLimit from 'express-rate-limit';

// Login is the one unauthenticated route whose entire purpose is guessing a
// credential, so it is the route most worth throttling: once this API is
// reachable from the public internet (not just localhost), nothing else
// stops repeated password guesses against a known email. Limits by IP, not
// by the submitted email, so it cannot be used to lock a real user out by
// deliberately failing their login.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
});
