import { test, expect } from '@playwright/test';

// Helper: login before each test
async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@ncpl.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/attendance', { timeout: 10000 });
}

test.describe('Attendance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display dashboard with stats cards', async ({ page }) => {
    await expect(page.locator('text=Hi,')).toBeVisible();
    await expect(page.locator("text=Today's Status")).toBeVisible();
    await expect(page.locator('text=Present This Month')).toBeVisible();
    await expect(page.locator('text=Absent This Month')).toBeVisible();
    await expect(page.locator('text=Late This Month')).toBeVisible();
  });

  test('should display monthly summary section', async ({ page }) => {
    await expect(page.locator('text=Monthly Summary')).toBeVisible();
  });

  test('should navigate to calendar page', async ({ page }) => {
    await page.click('text=Calendar');
    await page.waitForURL('/attendance/calendar');
    await expect(page.locator('text=Attendance Calendar')).toBeVisible();
  });

  test('should display calendar with day cells', async ({ page }) => {
    await page.goto('/attendance/calendar');
    // Calendar should show days of the week
    await expect(page.locator('text=Mon')).toBeVisible();
    await expect(page.locator('text=Tue')).toBeVisible();
    await expect(page.locator('text=Wed')).toBeVisible();
  });

  test('should navigate months in calendar', async ({ page }) => {
    await page.goto('/attendance/calendar');
    const monthLabel = page.locator('span:has-text("202")');
    const initialText = await monthLabel.textContent();
    
    // Click previous month
    await page.locator('button:has(svg)').first().click();
    await expect(monthLabel).not.toHaveText(initialText || '');
  });

  test('dashboard loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/attendance');
    await page.waitForSelector("text=Today's Status", { timeout: 3000 });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3000);
  });
});
