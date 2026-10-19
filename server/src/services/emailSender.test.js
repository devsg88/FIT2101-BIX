import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendPasswordResetEmail } from './emailSender.js';

function okResponse() {
  return Promise.resolve({ ok: true, status: 201, text: () => Promise.resolve('') });
}

describe('sendPasswordResetEmail', () => {
  const originalKey = process.env.BREVO_API_KEY;
  const originalSender = process.env.BREVO_SENDER_EMAIL;

  afterEach(() => {
    process.env.BREVO_API_KEY = originalKey;
    process.env.BREVO_SENDER_EMAIL = originalSender;
    vi.restoreAllMocks();
  });

  it('does nothing when Brevo credentials are not configured', async () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    global.fetch = vi.fn();

    const result = await sendPasswordResetEmail({
      to: 'developer@bix.app',
      resetUrl: 'http://localhost:5173/reset-password?token=abc'
    });

    expect(result).toEqual({ sent: false, reason: 'not-configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends via the Brevo API when credentials are configured', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_SENDER_EMAIL = 'devbix1080@gmail.com';
    global.fetch = vi.fn().mockImplementation(() => okResponse());

    const result = await sendPasswordResetEmail({
      to: 'developer@bix.app',
      resetUrl: 'http://localhost:5173/reset-password?token=abc'
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'api-key': 'xkeysib-test' });

    const body = JSON.parse(options.body);
    expect(body.sender).toEqual({ name: 'BIX', email: 'devbix1080@gmail.com' });
    expect(body.to).toEqual([{ email: 'developer@bix.app' }]);
    expect(body.subject).toMatch(/reset/i);
    expect(body.htmlContent).toContain('token=abc');
    expect(body.textContent).toContain('token=abc');

    expect(result).toEqual({ sent: true });
  });

  it('throws when the Brevo API responds with an error status', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_SENDER_EMAIL = 'devbix1080@gmail.com';
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"code":"unauthorized","message":"Key not found"}')
      })
    );

    await expect(
      sendPasswordResetEmail({
        to: 'developer@bix.app',
        resetUrl: 'http://localhost:5173/reset-password?token=abc'
      })
    ).rejects.toThrow('Brevo API responded 401');
  });
});
