import { describe, it, expect, beforeEach } from 'vitest';
import { buildPasswordResetUrl, deliverPasswordResetToken } from './resetTokenDelivery.js';
import { clearDemoMailbox, listDemoMailboxMessages } from './demoMailboxStore.js';

describe('resetTokenDelivery', () => {
  beforeEach(() => {
    clearDemoMailbox();
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
});
