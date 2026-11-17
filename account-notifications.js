'use strict';

(() => {
  const panel = document.getElementById('account-notifications');
  const account = window.UCPEAAccount;
  if (!panel || !account) return;

  const menu = document.getElementById('account-menu-panel');
  const field = name => document.getElementById(`account-notifications-${name}`);
  const status = field('status');
  const toggle = field('toggle');
  const test = field('test');
  const retry = field('retry');
  const buttons = [toggle, test, retry];
  const supported = window.top === window && window.isSecureContext &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const scope = new URL('./', location.href).href;
  // Until November 2026 the dashboard lived at /Pages/Work/UCPEA/. Devices that
  // turned on alerts there still hold a subscription under that old scope.
  const legacyScope = new URL('/Pages/Work/UCPEA/', location.origin).href;
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let generation = 0;
  let device;
  let pendingAction;
  let signingOut = false;
  let legacyMove;

  function show(message, { enabled = false, ready = false, canRetry = false } = {}) {
    status.textContent = message;
    toggle.setAttribute('aria-checked', String(enabled));
    toggle.setAttribute('aria-disabled', String(!ready));
    test.hidden = !ready || !enabled;
    test.removeAttribute('aria-disabled');
    retry.hidden = !canRetry;
    retry.removeAttribute('aria-disabled');
  }

  async function pushFunction(client, subscriptionId) {
    return client.functions.invoke('ucpea-push-test', {
      method: subscriptionId ? 'POST' : 'GET',
      body: subscriptionId ? { subscriptionId } : undefined,
      signal: AbortSignal.timeout(12000),
    });
  }

  async function dashboardRegistration() {
    const registration = await navigator.serviceWorker.getRegistration(scope);
    if (registration?.scope === scope) return registration;
  }

  function decodeKey(value) {
    if (!/^[A-Za-z0-9_-]{87}$/.test(value || '')) throw new Error('Missing public key');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  }

  async function registerSubscription(client, subscription) {
    const { keys } = subscription.toJSON();
    const { error } = await client.rpc('register_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
  }

  // Move alerts from the old address to this one without asking again: the
  // origin is the same, so the permission already granted still applies. The
  // old subscription is only removed once the new one is saved, so a failure
  // leaves the device receiving alerts through the old address.
  async function moveLegacySubscription(userId) {
    const legacy = await navigator.serviceWorker.getRegistration(legacyScope);
    if (!legacy || legacy.scope !== legacyScope) return;
    const old = await legacy.pushManager.getSubscription();
    if (old) {
      if (Notification.permission !== 'granted') return;
      // On a first visit the new service worker may still be installing.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(reject, 10000, new Error('Service worker not ready'))),
      ]);
      if (registration.scope !== scope) return;
      const client = await account.getClient();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { data, error } = await pushFunction(client);
        if (error) throw error;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(data?.publicKey),
        });
      }
      if (account.profile?.id !== userId || account.profile?.status !== 'active' || signingOut) return;
      await registerSubscription(client, subscription);
      await removeSubscription(client, old, userId);
    }
    await legacy.unregister();
  }

  // Without a subscription the old worker has nothing to hand over, whoever is signed in.
  async function dropUnusedLegacyWorker() {
    const legacy = await navigator.serviceWorker.getRegistration(legacyScope);
    if (legacy?.scope === legacyScope && !await legacy.pushManager.getSubscription()) await legacy.unregister();
  }

  function startLegacyMove() {
    const profile = account.profile;
    if (legacyMove || !supported || !navigator.onLine || profile?.status !== 'active') return legacyMove;
    legacyMove = moveLegacySubscription(profile.id).catch(error => {
      console.warn('UCPEA could not move notifications from the old address.', error);
    });
    legacyMove.then(() => refresh());
    return legacyMove;
  }

  async function refresh(message) {
    const profile = account.profile;
    panel.hidden = !profile;
    if (menu.hidden || panel.hidden || pendingAction || signingOut) return;
    const current = ++generation;
    const previousDevice = device?.userId === profile.id ? device : undefined;
    const enabled = Boolean(previousDevice?.subscriptionId);
    device = previousDevice;

    if (profile.status !== 'active') {
      device = undefined;
      show('Available once your membership is approved.');
      return;
    }
    if (isAppleMobile && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches) {
      show('On iPhone or iPad, add the dashboard to your Home Screen and open it from its icon to enable notifications.');
      return;
    }
    if (!supported) {
      show('This browser does not support dashboard notifications.');
      return;
    }
    if (!navigator.onLine) {
      show('Connect to the internet to manage notifications.', { enabled });
      return;
    }
    if (Notification.permission === 'denied') {
      device = undefined;
      show('Notifications are blocked. Allow them in your browser or device settings, then try again.', { canRetry: true });
      return;
    }

    if (!previousDevice) show('Checking notifications on this device…');
    for (const button of buttons) button.setAttribute('aria-disabled', 'true');
    try {
      const registration = await dashboardRegistration();
      if (!registration?.active) {
        if (current === generation) show('The dashboard is getting this device ready for notifications.', { enabled, canRetry: true });
        return;
      }
      await startLegacyMove();
      const client = await account.getClient();
      const subscription = await registration.pushManager.getSubscription();
      let subscriptionId;
      if (subscription && Notification.permission === 'granted') {
        const { data, error } = await client.from('push_subscriptions').select('id')
          .eq('endpoint', subscription.endpoint).eq('user_id', profile.id)
          .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
        if (error) throw error;
        subscriptionId = data?.id;
      }

      let publicKey;
      if (!subscriptionId) {
        const { data, error } = await pushFunction(client);
        if (error) throw error;
        publicKey = decodeKey(data?.publicKey);
      }
      if (current !== generation || account.profile?.id !== profile.id || account.profile?.status !== 'active') return;
      device = { client, registration, subscription, subscriptionId, publicKey, userId: profile.id };
      show(message || 'On this device', { enabled: Boolean(subscriptionId), ready: true });
    } catch {
      if (current === generation) show('Notifications are unavailable right now.', { enabled, canRetry: true });
    }
  }

  function run(action, pendingMessage, failureMessage) {
    if (!device || toggle.getAttribute('aria-disabled') === 'true' || pendingAction || signingOut || account.profile?.status !== 'active' ||
        account.profile.id !== device.userId) return;
    const { userId } = device;
    ++generation;
    for (const button of buttons) button.setAttribute('aria-disabled', 'true');
    status.textContent = pendingMessage;
    // Start immediately so a permission request still has the click's user activation.
    pendingAction = action(device).catch(() => failureMessage).then(message => {
      pendingAction = undefined;
      return refresh(account.profile?.id === userId ? message : undefined);
    });
  }

  async function removeSubscription(client, subscription, userId) {
    const deletion = client && userId && navigator.onLine
      ? client.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        .eq('user_id', userId).abortSignal(AbortSignal.timeout(4000)).then(result => !result.error, () => false)
      : Promise.resolve(false);
    // The browser may have already dropped the subscription when its permission was revoked.
    const unsubscribe = subscription.unsubscribe().then(() => true, () => false);
    const result = await Promise.all([deletion, unsubscribe]);
    return result.some(Boolean);
  }

  async function enableNotifications({ client, registration, publicKey, userId }) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
    if (signingOut || account.profile?.id !== userId || account.profile?.status !== 'active') return;
    await registerSubscription(client, subscription);
  }

  test.addEventListener('click', () => run(async ({ client, subscriptionId, subscription }) => {
    const { data, error } = await pushFunction(client, subscriptionId);
    if (data?.sent === true) return 'Test sent. Look for it in your device’s notifications.';
    if (error?.context?.status === 429) return 'Please wait a minute before sending another test.';
    if (error?.context?.status === 422) return 'The push service for this browser is unsupported.';
    if (error?.context?.status === 410) {
      await subscription.unsubscribe().catch(() => {});
      return 'This subscription expired. Turn notifications on again to get a new one.';
    }
    throw error || new Error('The test was not accepted');
  }, 'Sending a test…', 'Could not send the test notification. Try again.'));

  async function disableNotifications({ client, registration, subscription, userId }) {
    if (!await removeSubscription(client, subscription, userId)) throw new Error('Could not remove subscription');
    const notifications = await registration.getNotifications().catch(() => []);
    notifications.forEach(notification => notification.close());
  }

  toggle.addEventListener('click', () => {
    if (device?.subscriptionId) run(disableNotifications, 'Turning off notifications…', 'Could not turn off notifications. Try again.');
    else run(enableNotifications, 'Turning on notifications…', 'Could not turn on notifications. Try again.');
  });
  retry.addEventListener('click', () => {
    if (retry.getAttribute('aria-disabled') !== 'true') refresh();
  });
  document.addEventListener('ucpea-account', () => { ++generation; startLegacyMove(); refresh(); });
  new MutationObserver(() => refresh()).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('online', () => { startLegacyMove(); refresh(); });
  window.addEventListener('offline', () => refresh());
  if (supported) navigator.serviceWorker.addEventListener('controllerchange', () => refresh());
  if (supported) dropUnusedLegacyWorker().catch(() => {});
  startLegacyMove();
  refresh();

  window.UCPEANotifications = {
    async disconnect(client) {
      if (!supported) return;
      signingOut = true;
      ++generation;
      const userId = account.profile?.id;
      try {
        await pendingAction;
        await legacyMove;
        const registration = await dashboardRegistration();
        if (!registration) return;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await removeSubscription(client, subscription, userId);
        const notifications = await registration.getNotifications();
        notifications.forEach(notification => notification.close());
      } catch {
        // Signing out still works if push or the network is unavailable.
      } finally {
        signingOut = false;
        device = undefined;
      }
    },
  };
})();
