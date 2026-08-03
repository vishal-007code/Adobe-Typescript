import type {Locator, Page} from "@playwright/test";

export class GmailProvider {
    readonly page: Page;
    readonly email_field: Locator;
    readonly password_field: Locator;
    readonly welcome_screen : Locator;
    readonly i_understand_button : Locator;
    readonly confirm_signIn_msg : Locator;
    readonly confirm_sign_in_button  : Locator;

    constructor(page: Page) {
        this.page = page;
        this.email_field = page.getByLabel('Email or phone');
        this.password_field = page.getByLabel('Enter your password');
        this.welcome_screen = page.getByText('Welcome to your new account');
        this.i_understand_button = page.getByRole('button', { name: /I understand/i });
        this.confirm_signIn_msg = page.getByText('Sign in to Adobe');
        this.confirm_sign_in_button = page.getByRole('button', { name: /^Continue$/i });
    }

    async g_email_field( email : string ): Promise<void> {
        await this.email_field.fill(email);
        await this.page.waitForTimeout(1000);
        await this.email_field.press("Enter");
    }

    async g_password_field( password : string ): Promise<void> {
        try {
            await this.password_field.fill(password);
        } catch (e) {
            // The password screen never rendered. Capture what Google DID serve so a
            // cloud run is diagnosable from Cloud Logging alone — screenshots require
            // SAVE_ARTIFACTS=true plus a GCS round-trip, and the bare timeout message
            // ("waiting for getByLabel('Enter your password')") says nothing about the
            // cause: a captcha, "this browser may not be secure", "couldn't find your
            // account" and an IP block all look identical from the outside.
            //
            // Diagnostics must never mask the real failure, so this rethrows.
            await this.logUnexpectedPage();
            throw e;
        }
        await this.page.waitForTimeout(1000);
        await this.password_field.press("Enter");
    }

    /**
     * Log the current page's identity when an expected Google screen is missing.
     * Runs only on the failure path, so it adds nothing to a successful login and
     * changes no existing timeout. Query strings are stripped because Google's SSO
     * URLs carry OAuth tokens.
     */
    private async logUnexpectedPage(): Promise<void> {
        try {
            const url = this.page.url().split('?')[0];
            const title = (await this.page.title().catch(() => '')).replace(/"/g, "'");
            const body = (await this.page.locator('body')
                .innerText({ timeout: 5000 })
                .catch(() => ''))
                .replace(/\s+/g, ' ')
                .replace(/"/g, "'")
                .trim()
                .slice(0, 400);
            console.log(`[ADOBE_GOOGLE_UNEXPECTED_PAGE] url=${url} title="${title}" body="${body}"`);
        } catch {
            console.log('[ADOBE_GOOGLE_UNEXPECTED_PAGE] page state unreadable');
        }
    }

    async click_g_iUnderstand(): Promise<void> {
        await this.click_optional_button(this.i_understand_button);
    }

    async click_confirm_sign_in_button(): Promise<void> {
        await this.click_optional_button(this.confirm_sign_in_button);
    }

    private async click_optional_button(locator: Locator, timeout = 5000): Promise<void> {
        try {
            const button = locator.filter({ visible: true }).first();
            await button.waitFor({ state: 'visible', timeout });
            await button.click({ timeout });
        } catch (e) {
        }
    }

    async g_login( email:string , password:string): Promise<void> {
        await this.email_field.waitFor({state:'visible'});
        await this.g_email_field( email );
        await this.g_password_field( password);

        await this.click_g_iUnderstand();
        await this.click_confirm_sign_in_button();

    }



}