import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildPasswordResetUrl, deliverPasswordResetToken } from './resetTokenDelivery.js';
import { clearDemoMailbox, listDemoMailboxMessages } from './demoMailboxStore.js';
import { sendPasswordResetEmail } from './emailSender.js';

vi.mock('./emailSender.js', () => ({
  sendPasswordResetEmail: vi.fn()
}));

describe('resetTokenDelivery', () => {
  beforeEach(() => {
    clearDemoMailbox();
    sendPasswordResetEmail.mockReset();
  });

  it('builds a reset URL that does not leak extra query data', () => {
    const url = buildPasswordResetUrl('abc+token', 'http://localhost:5173/');
    expect(url).toBe('http://localhost:5173/reset-password?token=abc%2Btoken');
  });

  it('delivers the reset message to the demo mailbox', () => {
    deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });
    const [message] = listDemoMailboxMessages();
    expect(message.to).toBe('developer@bix.app');
    expect(message.subject).toMatch(/reset/i);
    expect(message.resetUrl).toContain('/reset-password?token=abc');
  });

  it('keeps only the latest reset message for the same address', () => {
    deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'first' });
    deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'second' });
    const listed = listDemoMailboxMessages().filter((item) => item.to === 'developer@bix.app');
    expect(listed).toHaveLength(1);
    expect(listed[0].resetUrl).toContain('token=second');
  });

  it('also attempts real email delivery alongside the demo mailbox', async () => {
    sendPasswordResetEmail.mockResolvedValue({ sent: true });

    await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });

    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'developer@bix.app',
      resetUrl: expect.stringContaining('token=abc')
    });
  });

  it('still stores the demo mailbox message and returns normally when the email send fails', async () => {
    sendPasswordResetEmail.mockRejectedValue(new Error('535 auth failed'));

    const result = await deliverPasswordResetToken({ email: 'developer@bix.app', rawToken: 'abc' });

    expect(result).toEqual({
      channel: 'email',
      resetUrl: expect.stringContaining('token=abc')
    });
    const [message] = listDemoMailboxMessages();
    expect(message.to).toBe('developer@bix.app');
  });
});
