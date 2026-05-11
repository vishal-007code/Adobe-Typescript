import {expect, Locator, Page} from "@playwright/test";

export class AdobePage {

    readonly page: Page;
    readonly email_field : Locator;
    readonly email_field_continue : Locator;
    readonly downld_icon : Locator
    readonly single_img_radio_btn : Locator;
    readonly downld_btn : Locator;
    readonly loadIndicator : Locator;
    readonly selected_card : Locator;
    readonly letsGo_btn : Locator;
    readonly sltNaccount : Locator;
    readonly cmp_option : Locator;
    readonly genratedImg : Locator;
    readonly letsGoIndicator : Locator;

    constructor(page: Page) {
        this.page = page;
        this.email_field = page.getByRole('textbox', { name: 'Email address' });
        this.downld_icon = page.getByLabel('Download').first();
        this.single_img_radio_btn = page.getByText("Selected image");
        this.downld_btn  = page.getByText("Download").last();
        this.email_field_continue = page.getByLabel('Continue');
        this.loadIndicator = page.getByTestId('firefly-skeleton');
        this.selected_card = page.locator(".selected.card");
        this.letsGo_btn = page.getByTestId('x-dialog-primary-cta');
        this.sltNaccount = page.getByRole('heading', { name: 'Select an account' });
        this.cmp_option = page.getByText('Company or School Account');
        this.genratedImg = page.getByTestId('firefly-thumbnail-image').first();
        this.letsGoIndicator = page.getByRole('heading', { name: /Help us customize your experience\./i });
    }

    async adb_login(): Promise<void> {
        try {
            await this.page.goto("https://new.express.adobe.com/");
            await this.page.waitForURL(/auth.services.adobe.com/,{waitUntil:'load'});
        } catch (e) {}
    }

    async fill_adb_email_field( email:string ): Promise<void> {
        await this.email_field.click();
        await this.email_field.clear();
        await this.email_field.pressSequentially(email, { delay: 30 });
        await this.page.waitForTimeout(300);
        await this.email_field_continue.click();
    }

    async select_cmp_option(): Promise<void> {
        try{
            await this.sltNaccount.waitFor({state:'visible',timeout: 3000});
        }catch(e){}
        if(await this.cmp_option.isVisible()) {
            await this.cmp_option.click();
        }

    }

    async wait_for_generation(): Promise<void> {
        await expect(this.genratedImg).toBeVisible();
        await expect(this.downld_icon).toBeEnabled();
        await expect(this.loadIndicator).toHaveCount(0);
    }

    async download_img(): Promise<string | null> {
        // waiting for the download event BEFORE clicking the final button
        const downloadPromise = this.page.waitForEvent('download',{timeout: 260000});
        await expect(this.downld_icon).toBeEnabled();
        await this.downld_icon.click();
        await this.single_img_radio_btn.click();
        await this.downld_btn.click();

        //  Wait for the download process to complete
        const download = await downloadPromise;

        // Save it to a specific path
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
            { timeout: 90_000 }
        );

        const providerUrl = this.page.url();
        if (!supportedProviderPattern.test(providerUrl)) {
            throw new Error(`Adobe login did not redirect to a supported provider. Current URL: ${providerUrl}`);
        }

        return providerUrl;
    }

    async waitForDashboard(): Promise<void> {
        try{
            await this.page.waitForURL(/new.express.adobe.com/);
            await expect(this.page).toHaveURL(/.*new\.express\.adobe\.com/);
        } catch(e){}
    }

    async isLetsGoIndicator_Visible(): Promise<boolean> {
        try {
            // Waits up to 5000ms (5 seconds) for the element to be visible
            await this.letsGoIndicator.waitFor({ state: 'visible', timeout: 10000 });
            return true;
        } catch (e) {
            return false;
        }
    }

    async shortcut(): Promise<void> {
       await this.page.goto("https://new.express.adobe.com/new?category=media&action=text+to+image&width=1080&height=1080&intent=general&neural-style=digital&contentClasses=art&prompt=Festival&tab=all")
    }

    async handle_letsGo(): Promise<void> {
        try{
            await this.letsGo_btn.waitFor({ state: 'visible',timeout:5000*1.5});
            await this.letsGo_btn.click({ timeout: 5000});
            console.log("--------------------------- Lets Go --------------------------------");
        }catch (e) {
            console.log("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx SKIPPED LET'S GO xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        }
    }

















}
