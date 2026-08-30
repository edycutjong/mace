/**
 * frontier.spec.js — the claim the product is actually making, checked in a browser.
 *
 * mace's argument is that the tool frontier is a function of parliamentary state:
 * an act that is out of order does not exist to be called. The unit suite proves
 * that against the reducer; this proves the same numbers survive the trip through
 * index.html, the module graph, the async render and the DOM — which is the only
 * version of the claim a judge ever sees.
 *
 * Every number here is a state the seeded log actually reaches (src/seed.js), not a
 * figure chosen to make a test pass.
 */

import { test, expect } from '@playwright/test';

const inOrder = (page) => page.locator('#in-order .tool-name');
const blocked = (page) => page.locator('#out-of-order li.tool-blocked');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#in-order-count')).toHaveText('5'); // booted
});

test('the widest frontier this meeting ever reaches is 17 acts', async ({ page }) => {
  await page.getByRole('button', { name: 'Widest frontier' }).click();

  // A bare seconded main motion with a quorum: nothing has narrowed the field yet.
  await expect(page.locator('#in-order-count')).toHaveText('17');
  await expect(inOrder(page)).toHaveCount(17);
  await expect(page.locator('#phase')).toHaveText('open');
});

test('the tangle narrows the frontier to 15 acts', async ({ page }) => {
  await page.getByRole('button', { name: 'The tangle' }).click();

  // main → amend → amend-the-amendment, all seconded. Two acts have disappeared
  // relative to the widest frontier, and the count is the headline of that.
  await expect(page.locator('#in-order-count')).toHaveText('15');
  await expect(inOrder(page)).toHaveCount(15);
  await expect(page.locator('#stack li.frame')).toHaveCount(3);
});

test('at the tangle a third-degree amendment does not exist to be called (§12)', async ({ page }) => {
  await page.getByRole('button', { name: 'The tangle' }).click();
  await expect(page.locator('#in-order-count')).toHaveText('15');

  // THE claim, stated as two assertions that must both hold: the tool is absent
  // from the list the model can call, and it is present in the column that cites
  // the rule removing it. Absent-and-unexplained would be a bug; present-and-
  // refused would be a different product.
  await expect(
    inOrder(page).filter({ hasText: /^move_to_amend_the_amendment$/ })
  ).toHaveCount(0);

  const thirdDegree = blocked(page).filter({ hasText: 'move_to_amend_the_amendment' });
  await expect(thirdDegree).toHaveCount(1);
  await expect(thirdDegree.locator('.ronr')).toHaveText('§12');
  await expect(thirdDegree.locator('.why')).toContainText(
    'A first-degree amendment must be the immediately pending question'
  );

  // Every blocked row carries a reason — a bare list of removed names would be an
  // inspector, and the panel is meant to be the explanation.
  const reasons = page.locator('#out-of-order li.tool-blocked .why');
  await expect(reasons).toHaveCount(await blocked(page).count());
});

test('losing quorum cuts the frontier from 15 to 9 (§40)', async ({ page }) => {
  await page.getByRole('button', { name: 'The tangle' }).click();
  await expect(page.locator('#in-order-count')).toHaveText('15');

  // The board is nine with a quorum of five. Four in the room is one short, and
  // §40 overrides the phase grid: only the reads, attendance, adjourn, point of
  // order and the chair's ruling remain.
  await page.locator('#attendance input[name="present"]').fill('4');
  await page.getByRole('button', { name: 'Record attendance' }).click();

  await expect(page.locator('#present')).toHaveText('4');
  await expect(page.locator('#quorum-state')).toHaveText(/QUORUM ABSENT/);
  await expect(page.locator('#in-order-count')).toHaveText('9');
  await expect(inOrder(page)).toHaveCount(9);

  // The motions did not vanish from the record — only from what may be done.
  await expect(page.locator('#stack li.frame')).toHaveCount(3);
  await expect(
    inOrder(page).filter({ hasText: /^move_previous_question$/ })
  ).toHaveCount(0);
  await expect(
    inOrder(page).filter({ hasText: /^move_to_adjourn$/ })
  ).toHaveCount(1);
});

test('reset returns the bench to the pre-meeting frontier', async ({ page }) => {
  await page.getByRole('button', { name: 'Widest frontier' }).click();
  await expect(page.locator('#in-order-count')).toHaveText('17');

  await page.getByRole('button', { name: 'Reset' }).click();

  await expect(page.locator('#in-order-count')).toHaveText('5');
  await expect(page.locator('#phase')).toHaveText('pre meeting');
  await expect(page.locator('#stack li.empty')).toHaveText('The floor is clear.');
});
