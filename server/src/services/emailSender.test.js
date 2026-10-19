import { describe, it, expect, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import { sendPasswordResetEmail } from './emailSender.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() }
}));

describe('sendPasswordResetEmail', () => {
  const originalEmail = process.env.SMTP_EMAIL;
  const originalPass = process.env.SMTP_APP_PASSWORD;

  afterEach(() => {
    process.env.SMTP_EMAIL = originalEmail;
    process.env.SMTP_APP_PASSWORD = originalPass;
    vi.clearAllMocks();
  });

  it('does nothing when SMTP credentials are not configured', async () => {
    delete process.env.SMTP_EMAIL;
    delete process.env.SMTP_APP_PASSWORD;

    const result = await sendPasswordResetEmail({
      to: 'developer@bix.app',
      resetUrl: 'http://localhost:5173/reset-password?token=abc'
    });

    expect(result).toEqual({ sent: false, reason: 'not-configured' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends via Gmail SMTP when credentials are configured', async () => {
    process.env.SMTP_EMAIL = 'bix.sender@gmail.com';
    process.env.SMTP_APP_PASSWORD = 'app-password';
    const sendMail = vi.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendPasswordResetEmail({
      to: 'developer@bix.app',
      resetUrl: 'http://localhost:5173/reset-password?token=abc'
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'bix.sender@gmail.com', pass: 'app-password' }
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('bix.sender@gmail.com'),
        to: 'developer@bix.app',
        subject: expect.stringMatching(/reset/i)
      })
    );
    expect(sendMail.mock.calls[0][0].html).toContain('token=abc');
    expect(result).toEqual({ sent: true });
  });

  it('lets a send failure propagate to the caller', async () => {
    process.env.SMTP_EMAIL = 'bix.sender@gmail.com';
    process.env.SMTP_APP_PASSWORD = 'app-password';
    const sendMail = vi.fn().mockRejectedValue(new Error('535 auth failed'));
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await expect(
      sendPasswordResetEmail({
        to: 'developer@bix.app',
        resetUrl: 'http://localhost:5173/reset-password?token=abc'
      })
    ).rejects.toThrow('535 auth failed');
  });
});
