'use strict';

// Fills the Committees page from committees-feed.js, which update-committees.mjs
// copies from UCPEA's website. Descriptions and Constitution references stay in
// index.html; officers, chairs, rosters and member counts come from the feed.
// Without a feed, the copy written into index.html is left as it is.
(() => {
  if (typeof UCPEACommitteesFeed === 'undefined') return;
  const view = document.getElementById('committees');
  if (!view) return;

  const { officers = [], committees = [], committeesCheckedAt } = UCPEACommitteesFeed;
  const jumpList = view.querySelector('.committee-jump ul');
  const footer = view.querySelector('.committees-footer');
  const key = name => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const count = (number, noun) => `${number} ${noun}${number === 1 ? '' : 's'}`;
  const refreshFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Keeps the "Article VII, Section 13 · " part and replaces the count after it.
  function setCount(meta, number, noun) {
    const prefix = meta.textContent.replace(/\s*(?:·\s*)?\d+\s+[a-z ]+$/i, '');
    meta.textContent = prefix ? `${prefix} · ${count(number, noun)}` : count(number, noun);
  }

  function renderOfficers() {
    const board = document.getElementById('executive-board');
    const list = board?.querySelector('.officer-list');
    if (!list || !officers.length) return;
    list.replaceChildren(...officers.map(officer => {
      const item = element('li');
      const email = element('a', '', officer.email);
      email.href = 'mailto:' + officer.email;
      // The spaces keep title, name and email apart for screen readers and copied text.
      item.append(element('span', 'officer-title', officer.title), ' ', element('strong', '', officer.name), ' ', email);
      return item;
    }));
    const meta = board.querySelector('.committee-meta');
    if (meta) setCount(meta, officers.length, 'elected officer');
  }

  function slug(name) {
    const base = 'committee-' + (key(name).replace(/ /g, '-') || 'unnamed');
    let id = base;
    for (let n = 2; document.getElementById(id); n += 1) id = `${base}-${n}`;
    return id;
  }

  // A committee the website lists that the dashboard has no description for yet.
  function addSection(committee) {
    const id = slug(committee.name);
    const section = element('section', 'committee');
    section.id = id;
    section.tabIndex = -1;
    section.setAttribute('aria-labelledby', id + '-title');
    const heading = element('h2', '', committee.name);
    heading.id = id + '-title';
    const description = element('div', 'committee-description');
    description.append(element('p', '', 'UCPEA lists this committee on its official committee list.'));
    section.append(heading, element('p', 'committee-meta'), description,
      element('p', 'committee-chair'), element('ul', 'committee-roster'));
    footer ? footer.before(section) : view.append(section);
    if (jumpList) {
      const link = element('a', '', committee.name);
      link.href = `index.html?view=committees#${id}`;
      const item = element('li');
      item.append(link);
      jumpList.append(item);
    }
    return section;
  }

  function fillSection(section, committee) {
    const meta = section.querySelector('.committee-meta');
    if (meta) setCount(meta, committee.chairs.length + committee.members.length, 'member');

    const chair = section.querySelector('.committee-chair');
    if (chair) {
      const vacant = !committee.chairs.length;
      chair.classList.toggle('committee-chair--vacant', vacant);
      chair.replaceChildren(
        element('span', '', committee.chairs.length > 1 ? 'Chairs' : 'Chair'),
        ' ' + (vacant ? 'Not listed' : committee.chairs.join(', ')),
      );
    }

    const roster = section.querySelector('.committee-roster');
    if (roster) {
      roster.setAttribute('aria-label', committee.name + ' members');
      roster.replaceChildren(...committee.members.map(name => element('li', '', name)));
    }
  }

  function renderCommittees() {
    if (!committees.length) return;
    const sections = new Map();
    for (const section of view.querySelectorAll('section.committee:not(.committee--board)')) {
      const heading = section.querySelector('h2');
      if (heading) sections.set(key(heading.textContent), section);
    }
    for (const committee of committees) {
      const name = key(committee.name);
      const section = sections.get(name) ?? addSection(committee);
      sections.delete(name);
      fillSection(section, committee);
    }
    // A committee no longer on the website's list is hidden along with its jump link.
    for (const section of sections.values()) {
      section.hidden = true;
      jumpList?.querySelector(`a[href$="#${CSS.escape(section.id)}"]`)?.closest('li')?.setAttribute('hidden', '');
    }
  }

  function renderStatus() {
    const date = new Date(committeesCheckedAt);
    if (!footer || Number.isNaN(date.getTime())) return;
    const status = element('p', 'committees-status',
      `Officers and rosters are copied from UCPEA’s website. Last checked ${refreshFormat.format(date)}.`);
    footer.prepend(status);
  }

  renderOfficers();
  renderCommittees();
  renderStatus();
})();
