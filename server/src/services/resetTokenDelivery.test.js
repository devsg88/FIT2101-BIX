import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildPasswordResetUrl, deliverPasswordResetToken } from './resetTokenDelivery.js';
import { clearDemoMailbox, listDemoMailboxMessages } from './demoMailboxStore.js';
import { sendPasswordResetEmail } from './emailSender.js';

vi.mock('./emailSender.js', () => ({
  sendPasswordResetEmail: vi.fn()
}));

describe('resetTokenDelivery', () => {
  const originalFlag = process.env.DEMO_MAILBOX_ENABLED;

  beforeEach(() => {
    clearDemoMailbox();
    sendPasswordResetEmail.mockReset();
  });

  afterEach(() => {
    process.env.DEMO_MAILBOX_ENABLED = originalFlag;
  });

  it('builds a reset URL that does not leak extra query data', () => {
    const url = buildPasswordResetUrl('abc+token', 'http://localhost:5173/');
    expect(url).toBe('http://localhost:5173/reset-password?token=abc%2Btoken');
  });

  it('always attempts real email delivery, regardless of the demo mailbox flag', async () => {
    delete process.env.DEMO_MAILBOX_ENABLED;
    sendPasswordResetEmail.mockResolvedValue({ sent: true });

    await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });

    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'developer@bix.app',
      resetUrl: expect.stringContaining('token=abc')
    });
  });

  it('returns normally even when the email send fails', async () => {
    sendPasswordResetEmail.mockRejectedValue(new Error('535 auth failed'));

    const result = await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });

    expect(result).toEqual({
      channel: 'email',
      resetUrl: expect.stringContaining('token=abc')
    });
  });

  describe('when DEMO_MAILBOX_ENABLED is unset (deployed default)', () => {
    beforeEach(() => {
      delete process.env.DEMO_MAILBOX_ENABLED;
      sendPasswordResetEmail.mockResolvedValue({ sent: true });
    });

    it('never stores the reset link where it could be publicly read', async () => {
      await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });
      expect(listDemoMailboxMessages()).toHaveLength(0);
    });
  });

  describe('when DEMO_MAILBOX_ENABLED=true (local development)', () => {
    beforeEach(() => {
      process.env.DEMO_MAILBOX_ENABLED = 'true';
      sendPasswordResetEmail.mockResolvedValue({ sent: true });
    });

    it('delivers the reset message to the demo mailbox', async () => {
      await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });
      const [message] = listDemoMailboxMessages();
      expect(message.to).toBe('developer@bix.app');
      expect(message.subject).toMatch(/reset/i);
      expect(message.resetUrl).toContain('/reset-password?token=abc');
    });

    it('keeps only the latest reset message for the same address', async () => {
      await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'first' });
      await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'second' });
      const listed = listDemoMailboxMessages().filter((item) => item.to === 'developer@bix.app');
      expect(listed).toHaveLength(1);
      expect(listed[0].resetUrl).toContain('token=second');
    });

    it('still stores the demo mailbox message when the email send fails', async () => {
      sendPasswordResetEmail.mockRejectedValue(new Error('535 auth failed'));

      await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });

      const [message] = listDemoMailboxMessages();
      expect(message.to).toBe('developer@bix.app');
    });
  });
});
