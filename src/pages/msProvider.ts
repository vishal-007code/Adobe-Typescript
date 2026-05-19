import type { Locator, Page } from "@playwright/test";

export class MsProvider {
    readonly page: Page;
    readonly email_field: Locator;
    readonly password_field: Locator;
    readonly stay_signIn_msg: Locator;
    readonly reject_stay_sign_in: Locator;
    readonly keypressDelayMs: number;


    constructor(page: Page) {
        this.page = page;
        this.email_field = page.getByLabel('Enter your email, phone, or Skype.');
        this.password_field = page.getByPlaceholder('Password');
        this.stay_signIn_msg = page.getByText('Stay signed in?');
        this.reject_stay_sign_in = page.locator('input[type="button"]');
        this.keypressDelayMs = resolvePositiveIntEnv('ADOBE_PROVIDER_KEYPRESS_DELAY_MS', 250);

    }

    async ms_email_field( email : string ): Promise<void> {
        await this.email_field.fill(email);
        await this.page.waitForTimeout(this.keypressDelayMs);
        await this.email_field.press("Enter");
    }

    async ms_password_field( password : string ): Promise<void> {
        await this.password_field.fill(password);
        await this.page.waitForTimeout(this.keypressDelayMs);
        await this.password_field.press("Enter");
    }

    async ms_reject_stay_sign_in_confirm(): Promise<void> {
        await this.reject_stay_sign_in.click();
    }

    async ms_login(email: string, password: string): Promise<void> {

        await this.page.waitForURL(/login.microsoftonline.com/);

        try {
            await this.email_field.waitFor({ state: 'visible'});
        } catch (e) {
            // If it doesn't appear, we assume Scenario 2 (Old User)
        }
        if (await this.email_field.isVisible()) {
            await this.ms_email_field(email);
            await this.password_field.waitFor({ state: 'visible' });
        }

        await this.ms_password_field(password);

        try {
            await this.stay_signIn_msg.waitFor({ state: 'visible'});
            await this.ms_reject_stay_sign_in_confirm();
        } catch (e) {
        }
    }

}

function resolvePositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
}
