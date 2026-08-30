/**
 * bench.spec.js — the page boots, and it tells you which mode it booted in.
 *
 * The banner is the one element that differs between a WebMCP-enabled origin and a
 * plain one, so it is asserted as "says one of the two true things" rather than
 * pinned to either. Everything downstream of it is mode-independent.
 */

import { test, expect } from '@playwright/test';

test('the bench loads and states which mode it is rendering from', async ({ page }) => {
  const crashes = [];
  page.on('pageerror', (err) => crashes.push(String(err)));

  await page.goto('/index.html');

  await expect(page).toHaveTitle(/mace/);
  await expect(page.locator('header.top h1')).toHaveText('mace');

  // The WebMCP banner. On the live origin the trial token is active and this reads
  // "WebMCP live · document.modelContext"; on a runner the token does not apply and
  // the bench falls back to its own state machine and says so. Both are correct;
  // "checking for WebMCP…" — the pre-boot placeholder — is not.
  const banner = page.locator('#mcp-state');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(/WebMCP live ·|WebMCP not detected/);
  await expect(banner).not.toHaveText(/checking for WebMCP/);

  // boot() only reaches the panel if every module in src/ parsed and ran. There is
  // no bundler to have caught a bad import, so this assertion is the substitute.
  await expect(page.locator('#ledger')).toContainText('tools in order');

  expect(crashes, `uncaught page errors: ${crashes.join(' | ')}`).toEqual([]);
});

test('the panel renders both columns from the pre-meeting state', async ({ page }) => {
  await page.goto('/index.html');

  // Pre-meeting, nobody in the room: only the four always-on reads plus
  // set_members_present are in order. Everything else is below quorum (§40).
  await expect(page.locator('#in-order-count')).toHaveText('5');
  await expect(page.locator('#phase')).toHaveText('pre meeting');
  await expect(page.locator('#quorum-state')).toHaveText(/QUORUM ABSENT/);
  await expect(page.locator('#stack li.empty')).toHaveText('The floor is clear.');
});
