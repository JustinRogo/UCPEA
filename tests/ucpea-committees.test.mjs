import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkCommittees, checkOfficers, parseCommittees, parseExecutiveBoard, readSnapshot,
} from '../update-committees.mjs';

// Trimmed copies of the tables on ucpea.ct.aft.org, in the markup the site uses.
const head = '<td style="background-color:hsl(0, 0%, 0%);color:white;"><strong>';
const committeesPage = `<main><div class="text-long"><table class="table"><tbody>
<tr>${head}First Name</strong></td>${head}Last Name</strong></td>${head}UConn Email Address</strong></td>${head}Committee</strong></td></tr>
<tr><td>Amy</td><td>McKeon (chair)</td><td><a href="mailto:amy.mckeon@uconn.edu">amy.mckeon@uconn.edu</a></td><td>Childcare Reimbursement</td></tr>
<tr><td>Nick</td><td>Boston</td><td><a href="mailto:nicholas.boston@uconn.edu">nicholas.boston@uconn.edu</a></td><td>Childcare Reimbursement</td></tr>
<tr><td>Yesenia (Jess)</td><td>Darling (Chair)</td><td><a href="mailto:x@uconn.edu">x@uconn.edu</a></td><td>Communications</td></tr>
<tr><td>Grace</td><td>Bennett</td><td></td><td>Communications</td></tr>
<tr><td>Grace</td><td>Bennett</td><td></td><td>Communications</td></tr>
<tr><td>Jordan</td><td>McMillan (chair)</td><td></td><td>Constitution &amp; Bylaws</td></tr>
<tr><td>--</td><td>(chair)</td><td>--</td><td>Scholarship</td></tr>
<tr><td>Rene</td><td>Rovozzo</td><td></td><td>Scholarship</td></tr>
<tr><td></td><td></td><td></td><td></td></tr>
</tbody></table></div></main>`;

const boardPage = `<article><table border="0"><tbody>
<tr height="25"><td colspan="3"><strong>Executive Board</strong></td></tr>
<tr><td>Peter Morenus</td><td>President</td><td><a href="mailto:president@ucpea.org">president@ucpea.org</a></td></tr>
<tr><td>Jen Morenus</td><td>VP for Professional Issues</td><td><a href="mailto:professionalissues@ucpea.org">professionalissues@ucpea.org</a></td></tr>
<tr><td>Yesenia "Jess" Darling</td><td>VP for Communications</td><td><a href="mailto:Communications@ucpea.org">communications@ucpea.org</a></td></tr>
</tbody></table></article>`;

test('committee rosters are grouped by committee, with chairs split out, vacant seats skipped and emails dropped', () => {
  const committees = parseCommittees(committeesPage);
  assert.deepEqual(committees, [
    { name: 'Childcare Reimbursement', chairs: ['Amy McKeon'], members: ['Nick Boston'] },
    { name: 'Communications', chairs: ['Yesenia (Jess) Darling'], members: ['Grace Bennett'] },
    { name: 'Constitution & Bylaws', chairs: ['Jordan McMillan'], members: [] },
    { name: 'Scholarship', chairs: [], members: ['Rene Rovozzo'] },
  ]);
  assert.doesNotMatch(JSON.stringify(committees), /@/);
});

test('the Executive Board keeps role emails and spells out Vice President', () => {
  assert.deepEqual(parseExecutiveBoard(boardPage), [
    { title: 'President', name: 'Peter Morenus', email: 'president@ucpea.org' },
    { title: 'Vice President for Professional Issues', name: 'Jen Morenus', email: 'professionalissues@ucpea.org' },
    { title: 'Vice President for Communications', name: 'Yesenia “Jess” Darling', email: 'communications@ucpea.org' },
  ]);
});

test('a page whose table changed shape is rejected so the last good snapshot is kept', () => {
  assert.throws(() => parseCommittees('<main><p>Committees are moving.</p></main>'), /No table/);
  assert.throws(() => parseCommittees('<table><tr><td>Name</td><td>Group</td></tr></table>'), /header/);
  assert.throws(() => checkCommittees(parseCommittees(committeesPage)), /Only 4 committees/);
  assert.throws(() => checkOfficers(parseExecutiveBoard(boardPage)), /Only 3 officers/);
});

test('the published snapshot reads back and holds no member email addresses', async () => {
  const script = await readFile(new URL('../committees-feed.js', import.meta.url), 'utf8');
  const feed = readSnapshot(script);
  assert.ok(feed.officers.length >= 5);
  assert.ok(feed.committees.length >= 5);
  assert.doesNotThrow(() => checkCommittees(feed.committees));
  assert.doesNotMatch(JSON.stringify(feed.committees), /@/);
  assert.ok(feed.officers.every(officer => officer.email.endsWith('@ucpea.org')));
});
