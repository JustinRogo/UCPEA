'use strict';

// Two walkthroughs share one dialog and spotlight:
//   Help (account menu): a five-stop tour of the dashboard for everyone. It
//   plays by itself the first time someone opens the dashboard on a device.
//   Approvals & posting: for Area Stewards, UCPEA staff, and admins. It opens by
//   itself the first time one of them is signed in on a device, and the account
//   menu replays it.
(() => {
  const dialog = document.getElementById('dashboard-tutorial');
  const spotlight = document.getElementById('tutorial-spotlight');
  const title = document.getElementById('tutorial-title');
  const copy = document.getElementById('tutorial-copy');
  const progress = document.getElementById('tutorial-progress');
  const back = document.getElementById('tutorial-back');
  const next = document.getElementById('tutorial-next');
  const toolView = document.getElementById('tool-view');
  const header = document.querySelector('.site-header');
  const managerTourButton = document.getElementById('account-menu-manager-tour');

  const helpSteps = [
    {
      view: '',
      title: 'Overview',
      targets: ['.home-today', '.hero-copy', '#hero-title'],
      copy: ['Check upcoming events and the latest from Union Wire. From here, you can open the contract, find guidance in Rights & Benefits, or jump to tools like the Salary & Band Planner.'],
    },
    {
      view: 'current-contract',
      title: 'Contract',
      targets: ['.reader-search', '.searchbox', '.contract-hero h1'],
      copy: ['Search the current collective bargaining agreement or jump to an article. Find the contract language on pay, leave, job protections, and other working conditions.'],
    },
    {
      view: 'board',
      title: 'Bulletin Board',
      targets: ['.board-toolbar', '#board-title'],
      copy: [
        'Browse announcements and events from your Area and the Union-wide board. Area Stewards can post to their own Area’s board.',
        'Sign in and turn on Show notifications in the account menu to get push alerts on this device. You can receive alerts for new posts on your Area’s board or the Union-wide board when the publisher sends one.',
      ],
    },
    {
      view: 'committees',
      title: 'Committees',
      targets: ['.committee-jump', '#committees-title'],
      copy: ['See who serves on the Executive Board and UCPEA committees and what each group does. Select Join a committee to open the interest form.'],
    },
    {
      view: 'area-explorer',
      title: 'Area Explorer',
      targets: ['.mobile-map-views', '.map-toolbar', '#map-sheet'],
      copy: ['Explore UCPEA areas on the map or search by building, area, or steward to find your Area and its steward.'],
    },
  ];

  // The same rules members.js and board.js use to show their controls.
  function managerAccess(profile) {
    const active = profile?.status === 'active';
    const isAdmin = active && profile.role === 'admin';
    const isStaff = active && (profile.role === 'staff' || isAdmin);
    const stewardAreas = active ? (profile.areas || []).filter(area => area.role === 'steward') : [];
    return { isAdmin, isStaff, stewardAreas, isManager: isStaff || stewardAreas.length > 0 };
  }

  function managerSteps(profile) {
    const { isAdmin, isStaff, stewardAreas } = managerAccess(profile);
    const roleName = isAdmin ? 'an administrator' : isStaff ? 'UCPEA staff' : 'an Area Steward';
    const areaNames = stewardAreas.map(area => area.name).filter(Boolean);
    const yourAreas = areaNames.length === 1 ? areaNames[0] : 'an Area you steward';
    const steps = [
      {
        view: 'members',
        title: 'Approve new members',
        targets: ['#members-pending-list:not(:empty)', 'section[aria-labelledby="members-pending-title"]', '#members-title'],
        scroll: true,
        copy: isStaff ? [
          `As ${roleName}, you review sign-ups and post to the Bulletin Board. This tour shows you where.`,
          'New accounts from every Area wait here under Waiting for approval. Choose an Area under Approve into, then select Approve to activate the account. Decline pauses the account so it can be reviewed later.',
          'A red count on the Members link shows how many sign-ups are waiting.',
        ] : [
          `As ${roleName}, you approve sign-ups and post to your Area’s board. This tour shows you where.`,
          `People asking to join ${yourAreas} wait here under Waiting for approval. Select Approve to activate their account and add them to that Area. UCPEA staff are told about each approval.`,
          'A red count on the Members link shows how many sign-ups are waiting for you.',
        ],
      },
    ];
    if (isStaff) {
      steps.push({
        view: 'members',
        title: 'Approved by stewards',
        targets: ['#members-fyi-block', 'section[aria-labelledby="members-all-title"]'],
        scroll: true,
        copy: [
          'When a steward approves someone, they’re listed under Approved by stewards so staff know who joined. The member is already active. Select Mark all as seen once you’ve looked them over.',
          'Use All members and Manage to change Area assignments or appoint stewards.',
        ],
      });
    }
    steps.push(
      {
        view: 'board',
        title: 'Make a new post',
        targets: ['#board-new', '.board-toolbar'],
        copy: ['On the Bulletin Board, select New post to share an announcement, event, meeting, action alert, or flyer.'],
      },
      {
        view: 'board',
        compose: true,
        title: 'Choose a board',
        targets: ['.deadline-field:has(> #post-board)', '#post-board'],
        scroll: true,
        copy: [
          isStaff
            ? 'Under Board, pick Union-wide to reach every member, or pick one Area’s board.'
            : areaNames.length > 1
              ? `Under Board, pick which Area the post is for. You can post to ${areaNames.join(', ')}.`
              : `Under Board, pick ${areaNames[0] || 'your Area'}. You can post to the board of each Area you steward.`,
          'Under Who can see it, choose Members of this board, or Everyone to include people who aren’t signed in. Then add a title and a short summary. Save as draft keeps it private while you work.',
        ],
      },
      {
        view: 'board',
        compose: true,
        title: 'Send a push notification',
        targets: ['#post-notify-field'],
        scroll: true,
        copy: [
          'To alert members, check Review notification after publishing, then select Publish. You’ll see who the alert will reach before you select Send notification.',
          'For a post that’s already up, open it and select Notify subscribers.',
          `Alerts go to approved members of that board who turned on notifications. Tapping the alert opens the post.${isStaff ? '' : ' You can send one alert every five minutes.'}`,
        ],
      },
      {
        view: 'board',
        header: true,
        title: 'Get alerts yourself',
        targets: ['#account-menu-button'],
        copy: [
          `Open the account menu and turn on Show notifications on each device you use. You’ll get an alert when someone asks to join ${isStaff ? 'UCPEA' : yourAreas}, and tapping it opens Members.`,
          'Select Send me a test to make sure alerts are reaching this device. You can replay this tour from the account menu at any time.',
        ],
      },
    );
    return steps;
  }

  let steps = helpSteps;
  let stepIndex = 0;
  let startingPage;
  let tutorialPage;
  let returnFocus;
  let observedTarget;
  let positionFrame;
  let scrolledStep = -1;
  const resize = new ResizeObserver(queuePosition);
  resize.observe(dialog);
  // Members and Bulletin Board fill in after they load, so look again as they change.
  const changes = new MutationObserver(queuePosition);

  function setSpotlight(bounds, target = null) {
    if (observedTarget !== target) {
      if (observedTarget) resize.unobserve(observedTarget);
      if (target) resize.observe(target);
      observedTarget = target;
    }
    dialog.toggleAttribute('data-spotlight', Boolean(bounds));
    spotlight.hidden = !bounds;
    if (bounds) {
      const { left, top, width, height } = bounds;
      Object.assign(spotlight.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    }
  }

  // Brings a target into the space between the header and the tutorial panel,
  // once per step, so later scrolling is left to the person.
  function reveal(target, headerBottom, panelTop) {
    const rect = target.getBoundingClientRect();
    const top = headerBottom + 12;
    const bottom = panelTop - 12;
    if (rect.top >= top && rect.bottom <= bottom) return;
    const room = Math.max(0, bottom - top - rect.height);
    window.scrollBy({ top: rect.top - top - room / 2, behavior: 'instant' });
  }

  function positionSpotlight() {
    positionFrame = undefined;
    if (!dialog.open) return;
    if (copy.scrollHeight > copy.clientHeight) copy.tabIndex = 0;
    else copy.removeAttribute('tabindex');
    const step = steps[stepIndex];
    const frame = Object.hasOwn(UCPEAViews.views, step.view) ? toolView.querySelector('iframe') : null;
    const source = frame ? frame.contentDocument : document;
    const frameRect = frame?.getBoundingClientRect();
    const panelTop = dialog.getBoundingClientRect().top;
    const headerBottom = header.getBoundingClientRect().bottom;
    // Room below the page, so a field near the end can scroll above the panel.
    document.documentElement.style.setProperty('--tutorial-room', `${Math.ceil(innerHeight - panelTop)}px`);
    const minTop = step.header ? 0 : headerBottom;
    const padding = 5;
    for (const selector of step.targets) {
      const target = source?.querySelector(selector);
      if (!target?.getClientRects().length) continue;
      if (step.scroll && scrolledStep !== stepIndex) {
        scrolledStep = stepIndex;
        reveal(target, headerBottom, panelTop);
      }
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const offsetX = frameRect?.left ?? 0;
      const offsetY = frameRect?.top ?? 0;
      const left = Math.max(2, frameRect?.left ?? 0, rect.left + offsetX - padding);
      const top = Math.max(minTop + 2, frameRect?.top ?? 0, rect.top + offsetY - padding);
      const right = Math.min(document.documentElement.clientWidth - 2, frameRect?.right ?? Infinity, rect.right + offsetX + padding);
      const bottom = Math.min(panelTop - 8, frameRect?.bottom ?? Infinity, rect.bottom + offsetY + padding);
      if (right - left < 24 || bottom - top < 20) continue;
      setSpotlight({ left, top, width: right - left, height: bottom - top }, target);
      return;
    }
    setSpotlight();
  }

  function queuePosition() {
    if (dialog.open) positionFrame ??= requestAnimationFrame(positionSpotlight);
  }

  // The Bulletin Board steps open an empty New post form to point at its fields.
  function showComposer(open) {
    window.UCPEABoardTour?.showComposer(open).then(queuePosition, () => {});
  }

  function renderStep() {
    const step = steps[stepIndex];
    setSpotlight();
    scrolledStep = -1;
    tutorialPage = UCPEAViews.dashboardURL(step.view);
    UCPEADashboard.showTutorialPage(tutorialPage, startingPage.state);
    showComposer(Boolean(step.compose));
    title.textContent = step.title;
    progress.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
    copy.replaceChildren(...step.copy.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
    back.disabled = stepIndex === 0;
    next.textContent = stepIndex === steps.length - 1 ? 'Done' : 'Next';
    copy.scrollTop = 0;
    if (dialog.open) title.focus({ preventScroll: true });
    queuePosition();
  }

  function start(tourSteps, focusAfter) {
    if (startingPage || dialog.open) return;
    steps = tourSteps;
    returnFocus = focusAfter;
    startingPage = { url: location.href, state: history.state, scroll: window.scrollY };
    stepIndex = 0;
    dialog.returnValue = '';
    renderStep();
    dialog.showModal();
    document.documentElement.toggleAttribute('data-tutorial', true);
    changes.observe(document.getElementById('main-content') || document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'],
    });
    queuePosition();
  }

  document.getElementById('account-menu-tutorial').addEventListener('click', () => {
    start(helpSteps, document.getElementById('account-menu-button'));
  });

  back.addEventListener('click', () => {
    stepIndex--;
    renderStep();
  });
  next.addEventListener('click', () => {
    if (stepIndex === steps.length - 1) {
      dialog.close();
    } else {
      stepIndex++;
      renderStep();
    }
  });
  document.getElementById('tutorial-end').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    setSpotlight();
    changes.disconnect();
    document.documentElement.removeAttribute('data-tutorial');
    showComposer(false);
    if (dialog.returnValue !== 'navigation' && location.href === tutorialPage.href) {
      UCPEADashboard.showTutorialPage(startingPage.url, startingPage.state, startingPage.scroll);
      returnFocus?.focus({ preventScroll: true });
    }
    startingPage = undefined;
    returnFocus = undefined;
  });
  window.addEventListener('popstate', () => {
    if (dialog.open) dialog.close('navigation');
  });
  toolView.addEventListener('load', queuePosition, true);
  window.addEventListener('resize', queuePosition);
  window.addEventListener('scroll', queuePosition, { passive: true });

  // Waits while something else has the person's attention.
  function busy() {
    return Boolean(document.querySelector('dialog[open]')) || document.hidden ||
      document.getElementById('account-menu-button')?.getAttribute('aria-expanded') === 'true';
  }

  // ---------------------------------------------------------------------------
  // Help tour: plays once, the first time someone opens the dashboard on a device.
  // ---------------------------------------------------------------------------
  const HELP_SEEN_KEY = 'ucpea-help-tour-seen';
  let helpPending = false;

  function offerHelpTour() {
    try {
      if (localStorage.getItem(HELP_SEEN_KEY) === '1') return;
      // The offline worker is installed on the first visit, so a page it
      // already controls belongs to someone who has been here before.
      if (navigator.serviceWorker?.controller) {
        localStorage.setItem(HELP_SEEN_KEY, '1');
        return;
      }
    } catch {
      return; // without storage, it would play on every visit
    }
    // An emailed sign-in link is finishing sign-in; the tour can wait for the next visit.
    if (/[#&]access_token=/.test(location.hash)) return;
    helpPending = true;
    const play = () => {
      if (busy()) {
        setTimeout(play, 1200);
        return;
      }
      helpPending = false;
      try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* private browsing */ }
      start(helpSteps);
    };
    // Let the first page finish arriving before taking over the screen.
    setTimeout(play, 1000);
  }

  // ---------------------------------------------------------------------------
  // Approvals & posting tour: offered once per account on each device.
  // ---------------------------------------------------------------------------
  const SEEN_KEY = 'ucpea-manager-tour-seen:';
  let autoStartTimer = 0;

  function hasSeen(profile) {
    try { return localStorage.getItem(SEEN_KEY + profile.id) === '1'; } catch { return true; }
  }

  function markSeen(profile) {
    try { localStorage.setItem(SEEN_KEY + profile.id, '1'); } catch { /* private browsing */ }
  }

  function startManagerTour(focusAfter) {
    const profile = window.UCPEAAccount?.profile;
    if (!managerAccess(profile).isManager) return;
    markSeen(profile);
    start(managerSteps(profile), focusAfter);
  }

  managerTourButton?.addEventListener('click', () => {
    startManagerTour(document.getElementById('account-menu-button'));
  });

  function offerManagerTour(profile) {
    const { isManager } = managerAccess(profile);
    if (managerTourButton) managerTourButton.hidden = !isManager;
    clearTimeout(autoStartTimer);
    if (!isManager || hasSeen(profile)) return;
    // Let the page settle after sign-in before taking over the screen.
    autoStartTimer = setTimeout(() => {
      const current = window.UCPEAAccount?.profile;
      if (current?.id !== profile.id || hasSeen(current)) return;
      // Wait for the Help tour, any other dialog, or an open menu to be dismissed.
      if (helpPending || busy()) {
        offerManagerTour(current);
        return;
      }
      startManagerTour();
    }, 1200);
  }

  offerHelpTour();
  document.addEventListener('ucpea-account', event => offerManagerTour(event.detail.profile));
  // account.js runs first and has already announced a saved sign-in.
  offerManagerTour(window.UCPEAAccount?.profile);
})();
