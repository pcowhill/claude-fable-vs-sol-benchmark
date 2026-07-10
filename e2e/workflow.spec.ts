import { expect, test, type Page } from '@playwright/test';

/** The full operator workflow the console is built around. */
test('lunar gap → relay deploy → metrics → baseline compare → export', async ({
  page,
}) => {
  await page.goto('/');

  // Explicitly select the Lunar South Pole scenario (via another scenario,
  // proving the switcher actually swaps the mission).
  const scenarioSelect = page.getByLabel('Mission scenario');
  await scenarioSelect.selectOption('mars-transfer');
  await expect(page.getByTestId('roster-mule-2')).toBeVisible();
  await scenarioSelect.selectOption('lunar-south-pole');
  await expect(page.getByTestId('roster-shackleton')).toBeVisible();

  // Capture the seeded plan as the baseline to compare against later.
  await page.getByRole('button', { name: 'BASELINE', exact: true }).click();

  // Jump to the communication-gap event: the traverse window opens dark.
  await page
    .getByTestId('event-log')
    .getByRole('button', { name: /cold-trap traverse opens dark/i })
    .click();
  await expect(page.getByTestId('met-readout')).toHaveText('T+04:00:00');

  // The gap is visible as state: rover selected by the event, no route.
  await expect(page.getByTestId('asset-inspector')).toContainText('VIREO');
  await expect(page.getByTestId('asset-inspector')).toContainText(
    'NO ROUTE TO EARTH',
  );

  // Read metrics before the edit.
  await page.getByRole('tab', { name: 'PLAN' }).click();
  const coverageBefore = await page.getByTestId('metric-coverage').textContent();
  const energyBefore = await page.getByTestId('metric-energy').textContent();
  expect(coverageBefore).toBeTruthy();

  // Deploy a relay into the gap.
  await page.getByTestId('open-deploy').click();
  await page.getByTestId('deploy-name').fill('KESTREL-3');
  await page.getByTestId('deploy-region').selectOption('lunar-orbit-1500');
  await page.getByTestId('deploy-phase').fill('30');
  await page.getByTestId('deploy-submit').click();

  // The relay lands in the plan; metrics move immediately.
  await expect(page.getByTestId('roster-user-relay-1')).toContainText('KESTREL-3');
  await page.getByRole('tab', { name: 'PLAN' }).click();
  await expect(page.getByTestId('metric-coverage')).not.toHaveText(
    coverageBefore!,
  );
  await expect(page.getByTestId('metric-energy')).not.toHaveText(energyBefore!);
  // The rover's traverse gap at T+04:00 is now covered.
  await expect(page.getByTestId('roster-vireo')).toContainText('VIA');

  // Compare against the baseline: coverage improved, energy regressed.
  await page.getByRole('tab', { name: 'COMPARE' }).click();
  await expect(page.getByTestId('delta-coverage')).toContainText('IMPROVED');
  await expect(page.getByTestId('delta-energy')).toContainText('WORSE');
  await expect(page.getByTestId('compare-verdict')).toContainText(/coverage up/i);

  // Export the plan and verify the envelope.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('asterism-lunar-south-pole-plan.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  expect(parsed.format).toBe('asterism.plan');
  expect(parsed.version).toBe(1);
  expect(parsed.scenarioId).toBe('lunar-south-pole');
  expect(parsed.plan.userRelays).toHaveLength(1);
  expect(parsed.plan.userRelays[0].name).toBe('KESTREL-3');
  expect(parsed.baseline).not.toBeNull();
});

test('malformed and incompatible imports are rejected with useful errors', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'IMPORT' }).click();

  const textarea = page.getByTestId('import-text');
  await textarea.fill('{"definitely": "not a plan"');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-errors')).toContainText(/not valid json/i);

  await textarea.fill(JSON.stringify({ format: 'asterism.plan', version: 99 }));
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-errors')).toContainText(/version/i);

  await textarea.fill(
    JSON.stringify({
      format: 'asterism.plan',
      version: 1,
      scenarioId: 'lunar-south-pole',
      timeS: 0,
      plan: {
        userRelays: [
          {
            id: 'u1',
            name: 'GHOST',
            regionId: 'areostationary',
            phaseDeg: 0,
            txPowerW: 100,
            enabled: true,
          },
        ],
        overrides: {},
        preferredRelay: {},
      },
      baseline: null,
    }),
  );
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-errors')).toContainText(
    /not a deployment region/i,
  );

  // A valid envelope imports and closes the dialog.
  await textarea.fill(
    JSON.stringify({
      format: 'asterism.plan',
      version: 1,
      scenarioId: 'solar-storm',
      timeS: 3_600,
      plan: { userRelays: [], overrides: {}, preferredRelay: {} },
      baseline: null,
    }),
  );
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-errors')).toBeHidden();
  await expect(page.getByLabel('Mission scenario')).toHaveValue('solar-storm');
  await expect(page.getByTestId('met-readout')).toHaveText('T+01:00:00');
});

async function metText(page: Page): Promise<string> {
  return (await page.getByTestId('met-readout').textContent()) ?? '';
}

test('time controls and keyboard shortcuts drive the simulation', async ({
  page,
}) => {
  await page.goto('/');

  // Scrub via arrow keys.
  await expect(page.getByTestId('met-readout')).toHaveText('T+00:00:00');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('met-readout')).toHaveText('T+00:05:00');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('met-readout')).toHaveText('T+01:05:00');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('met-readout')).toHaveText('T+00:00:00');

  // Play/pause via Space: the clock must actually advance.
  await page.keyboard.press('Space');
  await expect(page.locator('.hdr-run')).toHaveText('RUNNING');
  await page.waitForTimeout(700);
  await page.keyboard.press('Space');
  await expect(page.locator('.hdr-run')).toHaveText('HOLD');
  const t = await metText(page);
  expect(t).not.toBe('T+00:00:00');

  // Time change alters link availability state in the UI (event jump).
  await page.keyboard.press('e');
  const afterEvent = await metText(page);
  expect(afterEvent).not.toBe(t);

  // Tab shortcuts + shortcut dialog.
  await page.keyboard.press('p');
  await expect(page.getByTestId('plan-panel')).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.getByTestId('compare-panel')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toContainText('KEYBOARD REFERENCE');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('scenario switching produces different planning problems', async ({
  page,
}) => {
  await page.goto('/');
  const select = page.getByLabel('Mission scenario');

  await page.getByRole('tab', { name: 'PLAN' }).click();
  const lunarLatency = await page.getByTestId('metric-latency').textContent();

  await select.selectOption('mars-transfer');
  await expect(page.getByTestId('roster-mule-2')).toBeVisible();
  await expect(page.getByTestId('roster-mariner-k1')).toBeVisible();
  const marsLatency = await page.getByTestId('metric-latency').textContent();
  expect(marsLatency).not.toBe(lunarLatency);
  expect(marsLatency).toMatch(/m \d+s/); // interplanetary: minutes, not seconds

  await select.selectOption('solar-storm');
  await expect(page.getByTestId('roster-bastion')).toBeVisible();
  await expect(page.getByTestId('roster-tycho-camp')).toBeVisible();
});

test('asset and link inspection expose working controls', async ({ page }) => {
  await page.goto('/');

  // Select an asset directly on the visualization.
  await page.getByRole('button', { name: /PELICAN-6 — ship/ }).click();
  await expect(page.getByTestId('asset-inspector')).toContainText('PELICAN-6');

  // Select a link directly on the visualization.
  await page.locator('.mv-links .mv-link').first().click();
  await expect(page.getByTestId('link-inspector')).toBeVisible();

  // A click on empty map space clears the selection.
  await page.locator('.mv-bg').click({ position: { x: 180, y: 160 } });
  await expect(page.locator('.insp-nosel')).toBeVisible();

  // Select a relay from the roster; adjust its power from the inspector.
  await page.getByTestId('roster-argus-1').click();
  const inspector = page.getByTestId('asset-inspector');
  await expect(inspector).toContainText('ARGUS-1');
  const before = await page.getByTestId('power-readout').textContent();
  const slider = inspector.getByLabel(/transmit power/i);
  await slider.fill('380');
  await expect(page.getByTestId('power-readout')).not.toHaveText(before!);

  // Select a link from the inspector's link table → link budget appears.
  await inspector.locator('.insp-table .linklike').first().click();
  await expect(page.getByTestId('link-inspector')).toContainText('LINK BUDGET');
  await expect(page.getByTestId('link-inspector')).toContainText('PATH LOSS');
});

test('plan state persists across reloads and reset restores the seed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'PLAN' }).click();
  await page.getByTestId('open-deploy').click();
  await page.getByTestId('deploy-name').fill('PERSIST-1');
  await page.getByTestId('deploy-submit').click();
  await expect(page.getByTestId('roster-user-relay-1')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('roster-user-relay-1')).toContainText('PERSIST-1');

  await page.getByRole('button', { name: 'RESET', exact: true }).click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('roster-user-relay-1')).toBeHidden();
});
