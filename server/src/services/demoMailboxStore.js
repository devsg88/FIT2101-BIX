// US-14 — Yichi Zhang
// In-memory stand-in for an inbox. Local/demo only; lost on server restart.

const MAX_MESSAGES = 20;
let messages = [];
let nextId = 1;

export function addDemoMailboxMessage({ to, subject, body, resetUrl }) {
  const recipient = String(to || '').trim().toLowerCase();
  const message = {
    id: nextId,
    to: recipient,
    subject,
    body,
    resetUrl,
    receivedAt: new Date().toISOString()
  };
  nextId += 1;
  messages = [message, ...messages.filter((item) => item.to !== recipient)].slice(
    0,
    MAX_MESSAGES
  );
  return message;
}

export function listDemoMailboxMessages() {
  const seen = new Set();
  return messages.filter((item) => {
    if (seen.has(item.to)) {
      return false;
    }
    seen.add(item.to);
    return true;
  });
}

export function clearDemoMailbox() {
  messages = [];
  nextId = 1;
}
