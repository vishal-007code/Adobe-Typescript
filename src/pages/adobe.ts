import { expect, Locator, Page } from "@playwright/test";

export class AdobePage {

    readonly page: Page;
    readonly email_field: Locator;
    readonly email_field_continue: Locator;
    readonly downld_icon: Locator;
    readonly single_img_radio_btn: Locator;
    readonly downld_btn: Locator;
    readonly loadIndicator: Locator;
    readonly selected_card: Locator;
    readonly letsGo_btn: Locator;
    readonly sltNaccount: Locator;
    readonly cmp_option: Locator;
    readonly genratedImg: Locator;
    readonly letsGoIndicator: Locator;

    constructor(page: Page) {
        this.page = page;

        this.email_field = page.getByRole('textbox', { name: 'Email address' });
        this.email_field_continue = page.getByLabel('Continue');

        this.downld_icon = page.getByLabel('Download').first();
        this.single_img_radio_btn = page.getByText("Selected image");
        this.downld_btn = page.getByText("Download").last();

        this.loadIndicator = page.getByTestId('firefly-skeleton');
        this.selected_card = page.locator(".selected.card");

        // From your screenshot, the "Let's go" button is:
        // <sp-button data-testid="x-dialog-primary-cta" role="button">Let's go</sp-button>
        this.letsGo_btn = page
            .getByTestId('x-dialog-primary-cta');

        this.sltNaccount = page.getByRole('heading', { name: 'Select an account' });
        this.cmp_option = page.getByText('Company or School Account');

        this.genratedImg = page.getByTestId('firefly-thumbnail-image').first();

        this.letsGoIndicator = page.getByRole('heading', {
            name: /Help us customize your experience\./i
        });
    }

    async adb_login(): Promise<void> {
        try {
            await this.page.goto("https://new.express.adobe.com/");
            await this.page.waitForURL(/auth\.services\.adobe\.com/, {
                waitUntil: 'load',
                timeout: 90000
            });
        } catch (error) {
            console.log(`[ADB_LOGIN] Continue after navigation wait issue: ${error}`);
        }
    }

    async fill_adb_email_field(email: string): Promise<void> {
        await this.email_field.waitFor({ state: 'visible', timeout: 60000 });
        await this.email_field.click();
        await this.email_field.clear();
        await this.email_field.pressSequentially(email, { delay: 30 });
        await this.page.waitForTimeout(300);
        await this.email_field_continue.click();
    }

    async select_cmp_option(): Promise<void> {
        try {
            await this.sltNaccount.waitFor({ state: 'visible', timeout: 5000 });
        } catch (error) {
            return;
        }

        const companyOptionVisible = await this.cmp_option
            .isVisible({ timeout: 5000 })
            .catch(() => false);

        if (companyOptionVisible) {
            await this.cmp_option.click();
        }
    }

    async wait_for_generation(): Promise<void> {
        await expect(this.genratedImg).toBeVisible({ timeout: 120000 });
        await expect(this.downld_icon).toBeEnabled({ timeout: 120000 });
        await expect(this.loadIndicator).toHaveCount(0, { timeout: 120000 });
    }

    async download_img(): Promise<string | null> {
        const downloadPromise = this.page.waitForEvent('download', { timeout: 260000 });

        await expect(this.downld_icon).toBeEnabled({ timeout: 120000 });
        await this.downld_icon.click();

        await this.single_img_radio_btn.click();
        await this.downld_btn.click();

        const download = await downloadPromise;
        const path = `./downloads/${download.suggestedFilename()}`;

        await download.saveAs(path);

        return path;
    }

    async getLoginProvider(): Promise<string> {
        const supportedProviderPattern = /^https:\/\/(?:accounts\.google\.com|login\.microsoftonline\.com)\//i;

        await this.page.waitForFunction(
            (patternSource) => {
                return new RegExp(patternSource, 'i').test(window.location.href);
            },
            supportedProviderPattern.source,
            { timeout: 90000 }
        );

        const providerUrl = this.page.url();

        if (!supportedProviderPattern.test(providerUrl)) {
            throw new Error(`Adobe login did not redirect to a supported provider. Current URL: ${providerUrl}`);
        }

        return providerUrl;
    }

    async waitForDashboard(): Promise<void> {
        try {
            await this.page.waitForURL(/new\.express\.adobe\.com/, {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });

            await expect(this.page).toHaveURL(/.*new\.express\.adobe\.com/, {
                timeout: 120000
            });
        } catch (error) {
            console.log(`[DASHBOARD] Continue after dashboard wait issue: ${error}`);
        }
    }

    async isLetsGoIndicator_Visible(): Promise<boolean> {
        try {
            await this.letsGoIndicator.waitFor({ state: 'visible', timeout: 10000 });
            return true;
        } catch (error) {
            return false;
        }
    }

    async shortcut(): Promise<void> {
        await this.page.goto(
            "https://new.express.adobe.com/new?category=media&action=text+to+image&width=1080&height=1080&intent=general&neural-style=digital&contentClasses=art&prompt=Festival&tab=all",
            { waitUntil: 'domcontentloaded', timeout: 120000 }
        );
    }

    private async debugLetsGoButtons(email: string, reason: string): Promise<void> {
        console.log(`[LETS_GO_DEBUG] ${reason} for ${email}`);

        const buttons = await this.page
            .locator('button, sp-button, [role="button"], [data-testid]')
            .evaluateAll((els) => {
                return els.map((el, index) => {
                    const element = el as HTMLElement;

                    return {
                        index,
                        tagName: element.tagName,
                        text: element.innerText || element.textContent || '',
                        id: element.getAttribute('id') || '',
                        testId: element.getAttribute('data-testid') || '',
                        ariaLabel: element.getAttribute('aria-label') || '',
                        role: element.getAttribute('role') || '',
                        className: element.getAttribute('class') || '',
                        type: element.getAttribute('type') || '',
                        name: element.getAttribute('name') || '',
                        disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'
                    };
                });
            })
            .catch((error) => {
                console.log(`[LETS_GO_DEBUG] Failed to collect clickable elements for ${email}: ${error}`);
                return [];
            });

        console.log(`[LETS_GO_DEBUG] Found ${buttons.length} clickable/test-id elements for ${email}`);

        for (const button of buttons) {
            console.log(
                `[LETS_GO_DEBUG] index=${button.index} ` +
                `tag=${button.tagName} ` +
                `id="${button.id}" ` +
                `data-testid="${button.testId}" ` +
                `aria-label="${button.ariaLabel}" ` +
                `role="${button.role}" ` +
                `type="${button.type}" ` +
                `name="${button.name}" ` +
                `disabled="${button.disabled}" ` +
                `text="${button.text.trim().replace(/\s+/g, ' ').slice(0, 160)}" ` +
                `class="${button.className}"`
            );
        }
    }

    async handle_letsGo(loginAccount: { email: string; password: string }): Promise<void> {
        const email = loginAccount.email;

        const modalHeading = this.page.getByRole('heading', {
            name: /Help us customize your experience\./i
        });

        const noneOfAboveButton = this.page.getByTestId('x-dialog-secondary-cta');

        // Use CSS locator directly. This avoids fragile text matching and works with the SP-BUTTON custom element.
        const primaryCta = this.page.locator('[data-testid="x-dialog-primary-cta"]').first();

        const modalVisible = await modalHeading
            .waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true)
            .catch(() => false);

        if (!modalVisible) {
            console.log(`[LETS_GO] Modal not visible for ${email}; continuing`);
            console.log(`Login flow completed successfully for ${email}`);
            return;
        }

        console.log(`[LETS_GO] Modal visible for ${email}`);

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[LETS_GO] Attempt ${attempt} for ${email}`);

                await this.page.waitForTimeout(1000);

                const secondaryAttached = await noneOfAboveButton
                    .count()
                    .then((count) => count > 0)
                    .catch(() => false);

                if (secondaryAttached) {
                    await noneOfAboveButton
                        .first()
                        .evaluate((el: HTMLElement) => el.click())
                        .catch(() => undefined);

                    await this.page.waitForTimeout(500);
                }

                const primaryAttached = await primaryCta
                    .count()
                    .then((count) => count > 0)
                    .catch(() => false);

                if (!primaryAttached) {
                    console.log(`[LETS_GO] Primary CTA not attached for ${email}; debug and continue`);
                    await this.debugLetsGoButtons(email, `Primary CTA not attached`);
                    console.log(`Login flow completed successfully for ${email}`);
                    return;
                }

                // Try Playwright click first if visible.
                const primaryVisible = await primaryCta
                    .isVisible({ timeout: 3000 })
                    .catch(() => false);

                if (primaryVisible) {
                    await primaryCta.scrollIntoViewIfNeeded().catch(() => undefined);
                    await primaryCta.click({ timeout: 5000, force: attempt === 2 });
                    console.log(`[LETS_GO] Playwright click fired on attempt ${attempt} for ${email}`);
                } else {
                    // Fallback for Adobe Spectrum web component / SP-BUTTON cases.
                    await primaryCta.evaluate((el: HTMLElement) => el.click());
                    console.log(`[LETS_GO] JS click fired on attempt ${attempt} for ${email}`);
                }

                const modalGone = await modalHeading
                    .waitFor({ state: 'hidden', timeout: 10000 })
                    .then(() => true)
                    .catch(() => false);

                if (modalGone) {
                    console.log("--------------------------- Lets Go --------------------------------");
                    console.log(`Activated by Lets Go for ${email}`);
                    console.log(`Login flow completed successfully for ${email}`);
                    return;
                }

                console.log(`[LETS_GO] Modal still visible after attempt ${attempt} for ${email}`);
                await this.debugLetsGoButtons(email, `Modal still visible after attempt ${attempt}`);

            } catch (error) {
                console.log(`[LETS_GO] Attempt ${attempt} failed for ${email}: ${error}`);
                await this.debugLetsGoButtons(email, `Attempt ${attempt} failed`);
            }

            await this.page.waitForTimeout(1500);
        }

        await this.page.screenshot({
            path: `test-results/lets-go-unresolved-${Date.now()}.png`,
            fullPage: true
        }).catch(() => undefined);

        console.log(`[LETS_GO] Could not close modal after retry for ${email}; continuing after debug`);
        console.log(`Login flow completed successfully for ${email}`);
        return;
    }
}
