import type { Locator, Page } from "@playwright/test";

export class MsProvider {
    readonly page: Page;
    readonly email_field: Locator;
    readonly password_field: Locator;
    readonly stay_signIn_msg: Locator;
    readonly reject_stay_sign_in: Locator;


    constructor(page: Page) {
        this.page = page;
        this.email_field = page.getByLabel('Enter your email, phone, or Skype.');
        this.password_field = page.getByPlaceholder('Password');
        this.stay_signIn_msg = page.getByText('Stay signed in?');
        this.reject_stay_sign_in = page.locator('input[type="button"]');

    }

    async ms_email_field( email : string ): Promise<void> {
        await this.email_field.fill(email);
        await this.page.waitForTimeout(1000);
        await this.email_field.press("Enter");
    }

    async ms_password_field( password : string ): Promise<void> {
        await this.password_field.waitFor({state:'visible',timeout:2000})
        await this.password_field.fill(password);
        await this.page.waitForTimeout(500);
        await this.password_field.press("Enter");
    }

    async ms_reject_stay_sign_in_confirm(): Promise<void> {
        await this.reject_stay_sign_in.click();
    }

    async ms_login(email: string, password: string): Promise<void> {

        await this.page.waitForURL(/login.microsoftonline.com/);

        try {
            await this.email_field.waitFor({ state: 'visible',timeout:4000});
        } catch (e) {}

        if (await this.email_field.isVisible()) {
            await this.ms_email_field(email);
            await this.password_field.waitFor({ state: 'visible' });
        }

        await this.ms_password_field(password);

        try {
            await this.stay_signIn_msg.waitFor({ state: 'visible'});
            await this.ms_reject_stay_sign_in_confirm();
        } catch (e) {}
    }

}