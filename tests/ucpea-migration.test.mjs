import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// The dashboard moved from /Pages/Work/UCPEA/ to /UCPEA/ on the same origin.
// account-notifications.js moves an existing push subscription to the new
// scope on load, without a permission prompt, and only then drops the old one.
const origin = 'https://example.net';
const scope = `${origin}/UCPEA/`;
const legacyScope = `${origin}/Pages/Work/UCPEA/`;
const source = await readFile(new URL('../account-notifications.js', import.meta.url), 'utf8');

function element() {
  const attributes = new Map();
  return {
    hidden: false,
    textContent: '',
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
    addEventListener() {},
  };
}

function setup({ permission = 'granted', legacySubscription = true, rpcError = null, subscribeError = null, legacy = true,
  profile = { id: 'user-1', status: 'active' } } = {}) {
  const log = [];
  const oldSubscription = legacySubscription && {
    endpoint: 'https://push.example.net/old',
    async unsubscribe() { log.push('unsubscribe old'); return true; },
  };
  const legacyRegistration = legacy && {
    scope: legacyScope,
    pushManager: { async getSubscription() { return oldSubscription || null; } },
    async unregister() { log.push('unregister old'); return true; },
  };
  const newSubscription = {
    endpoint: 'https://push.example.net/new',
    toJSON() { return { keys: { p256dh: 'p256dh', auth: 'auth' } }; },
  };
  const registration = {
    scope,
    active: {},
    pushManager: {
      async getSubscription() { return null; },
      async subscribe(options) {
        log.push(`subscribe ${options.applicationServerKey.length}`);
        if (subscribeError) throw subscribeError;
        return newSubscription;
      },
    },
  };
  const client = {
    functions: { async invoke() { return { data: { publicKey: 'B' + 'A'.repeat(86) } }; } },
    rpc(name, args) {
      log.push(`${name} ${args.p_endpoint}`);
      return { abortSignal: async () => ({ error: rpcError }) };
    },
    from(table) {
      const filters = [];
      const query = {
        delete() { return query; },
        eq(column, value) { filters.push(`${column}=${value}`); return query; },
        async abortSignal() { log.push(`delete ${table} ${filters.join(' ')}`); return { error: null }; },
      };
      return query;
    },
  };
  const elements = new Map(['account-notifications', 'account-menu-panel', 'account-notifications-status',
    'account-notifications-toggle', 'account-notifications-test', 'account-notifications-retry']
    .map(id => [id, element()]));
  elements.get('account-menu-panel').hidden = true;
  const context = {
    URL, AbortSignal, atob, setTimeout, console: { warn: (...args) => log.push(`warn ${args[0]}`) },
    isSecureContext: true,
    PushManager: function PushManager() {},
    Notification: { permission },
    location: new URL(`${scope}index.html`),
    UCPEAAccount: { profile, async getClient() { return client; } },
    navigator: {
      onLine: true, userAgent: 'Test', platform: 'Test', maxTouchPoints: 0,
      serviceWorker: {
        async getRegistration(url) { return url === legacyScope ? legacyRegistration || undefined : registration; },
        ready: Promise.resolve(registration),
        addEventListener() {},
      },
    },
    document: { getElementById: id => elements.get(id) ?? null, addEventListener() {} },
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} },
  };
  context.window = context;
  context.top = context;
  runInNewContext(source, context);
  return { log };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('moves an old-address subscription to the new scope, then removes the old one', async () => {
  const { log } = setup();
  await settle();
  assert.deepEqual(log, [
    'subscribe 65',
    'register_push_subscription https://push.example.net/new',
    'delete push_subscriptions endpoint=https://push.example.net/old user_id=user-1',
    'unsubscribe old',
    'unregister old',
  ]);
});

test('keeps the old subscription when the new one cannot be saved', async () => {
  const { log } = setup({ rpcError: new Error('offline') });
  await settle();
  assert.ok(log.includes('register_push_subscription https://push.example.net/new'));
  assert.ok(!log.some(entry => entry.endsWith(' old') || entry.startsWith('delete')));
});

test('keeps the old subscription when the browser refuses a silent subscribe', async () => {
  const { log } = setup({ subscribeError: new Error('needs a gesture') });
  await settle();
  assert.ok(!log.some(entry => entry.endsWith(' old') || entry.startsWith('delete') || entry.startsWith('register')));
});

test('never prompts: leaves alerts alone without granted permission', async () => {
  const { log } = setup({ permission: 'default' });
  await settle();
  assert.deepEqual(log, []);
});

test('unregisters an old-address worker that has no subscription', async () => {
  const { log } = setup({ legacySubscription: false });
  await settle();
  assert.ok(log.length >= 1 && log.every(entry => entry === 'unregister old'));
});

test('unregisters an unused old-address worker even when nobody is signed in', async () => {
  const { log } = setup({ legacySubscription: false, profile: null });
  await settle();
  assert.deepEqual(log, ['unregister old']);
});

test('keeps an old subscription for later when nobody is signed in', async () => {
  const { log } = setup({ profile: null });
  await settle();
  assert.deepEqual(log, []);
});

test('does nothing when there is no old-address worker', async () => {
  const { log } = setup({ legacy: false });
  await settle();
  assert.deepEqual(log, []);
});
