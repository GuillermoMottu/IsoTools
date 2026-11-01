// One replica per tool. Use a shared quota before scaling the auth gateway.
export function createLoginProtection (now = Date.now) {
  const windowMs = 60000;
  const clients = new Map();
  let total = { count: 0, reset: 0 };
  return function admit (client) {
    const time = now();
    if (time >= total.reset) {
      clients.clear();
      total = { count: 0, reset: time + windowMs };
    }
    const count = clients.get(client) || 0;
    if (count >= 10 || total.count >= 30) return Math.max(1, Math.ceil((total.reset - time) / 1000));
    clients.set(client, count + 1);
    total.count++;
    return 0;
  };
}
