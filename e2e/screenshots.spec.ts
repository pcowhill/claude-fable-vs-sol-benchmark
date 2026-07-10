import { test } from '@playwright/test';

const DIR = 'artifacts/screenshots';

/**
 * Screenshot captures of the real running application.
 * Deterministic: the console opens paused at T+0 and every seek is discrete.
 */

test('main scenario at 1920×1080', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  // Advance into the mission (T+02:30) so passes, routes and the event
  // horizon are mid-flight, then inspect the active lunar relay.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.getByTestId('roster-argus-2').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/asterism-main-1920x1080.png` });
});

test('edited plan with baseline comparison at 1920×1080', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'BASELINE', exact: true }).click();
  await page
    .getByTestId('event-log')
    .getByRole('button', { name: /cold-trap traverse opens dark/i })
    .click();
  await page.getByRole('tab', { name: 'PLAN' }).click();
  await page.getByTestId('open-deploy').click();
  await page.getByTestId('deploy-name').fill('KESTREL-3');
  await page.getByTestId('deploy-phase').fill('30');
  await page.getByTestId('deploy-power').fill('180');
  await page.getByTestId('deploy-submit').click();
  await page.getByRole('tab', { name: 'COMPARE' }).click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/asterism-edited-plan-1920x1080.png` });
});

test('main scenario at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.getByTestId('roster-argus-2').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/asterism-main-1366x768.png` });
});

test('supplementary: mars transfer and solar storm at 1920×1080', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByLabel('Mission scenario').selectOption('mars-transfer');
  await page.getByTestId('roster-mule-2').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/asterism-mars-transfer-1920x1080.png` });

  await page.getByLabel('Mission scenario').selectOption('solar-storm');
  // Seek to the storm peak (T+12:00) so degraded links and rays are visible.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByTestId('roster-tycho-camp').click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/asterism-solar-storm-1920x1080.png` });
});
