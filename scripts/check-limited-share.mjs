import { chromium, expect } from '@playwright/test';

const origin = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:5174';
const storageKey = 'atlas-modes-v1';
const catalog = await (await fetch(origin + '/api/cards')).json();
const [owned, missing, previous] = Object.values(catalog.decks).flat();
const resource = catalog.resources.find(card => card.resourceType === 'common');
const link = new URL(origin);
link.searchParams.set('mode', 'pack');
link.searchParams.set('deck', btoa(`${owned.name}:3;${missing.name}:1`));
link.searchParams.set('res', btoa(`${resource.name}:2`));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 650 } });
  const dialog = page.getByRole('dialog', { name: 'Shared Limited deck' });
  const previewImport = dialog.getByRole('button', { name: 'Import into my Limited deck' });
  const confirmImport = dialog.getByRole('button', { name: 'Replace Limited deck' });
  const readStorage = () => page.evaluate(key => localStorage.getItem(key), storageKey);

  await page.goto(link.href);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`3 × ${owned.name}`);
  await expect(dialog).toContainText(`1 × ${missing.name}`);
  await expect(dialog).toContainText(`2 × ${resource.name}`);
  expect(await readStorage()).toBeNull();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/deck=/);

  const state = {
    version: 1, mode: 'pack', packsOpened: 6,
    inventory: { [owned.path]: 1, [previous.path]: 1 },
    decks: { pack: { main: { [previous.path]: 1 } } },
  };
  const saved = JSON.stringify(state);
  await page.evaluate(({ key, saved }) => localStorage.setItem(key, saved), { key: storageKey, saved });
  await page.goto(link.href);
  await previewImport.click();
  await expect(dialog.getByText('2 missing', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 missing', { exact: true })).toBeVisible();
  expect(await readStorage()).toBe(saved);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#deck-list')).toContainText(previous.name);
  expect(await readStorage()).toBe(saved);

  await page.goto(link.href);
  await previewImport.click();
  await confirmImport.click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/deck=/);
  const imported = JSON.parse(await readStorage());
  expect(imported.inventory).toEqual(state.inventory);
  expect(imported.packsOpened).toBe(6);
  expect(imported.decks.pack.main).toEqual({ [owned.path]: 1 });
  expect(imported.decks.pack.resource[resource.path]).toBe(2);
  await page.reload();
  await expect(page.locator('#deck-list')).toContainText(owned.name);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Share Deck' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const recipient = await browser.newPage();
  await recipient.goto(copied);
  const copiedDeck = recipient.getByRole('dialog', { name: 'Shared Limited deck' });
  await expect(copiedDeck).toContainText(`1 × ${owned.name}`);
  await expect(copiedDeck).toContainText(`2 × ${resource.name}`);
  await recipient.close();

  await page.goto(origin + '/?mode=pack&deck=');
  await expect(dialog.getByText('No cards')).toHaveCount(2);
  await previewImport.click();
  await expect(confirmImport).toBeHidden();
  link.searchParams.set('mode', 'normal');
  await page.goto(link.href);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#deck-list')).toContainText(missing.name);
  console.log('PASS Limited share, dismiss, import preview, confirmation, reload, empty link and Constructed share');
} finally {
  await browser.close();
}
