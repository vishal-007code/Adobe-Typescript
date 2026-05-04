import type {Locator, Page} from "@playwright/test";

export class GmailProvider {
    readonly page: Page;
    readonly email_field: Locator;
    readonly password_field: Locator;
    readonly welcome_screen : Locator;
    readonly i_understand_button : Locator;
    readonly confirm_signIn_msg : Locator;
    readonly confirm_sign_in_button  : Locator;

    constructor(page: Page) {
        this.page = page;
        this.email_field = page.getByLabel('Email or phone');
        this.password_field = page.getByLabel('Enter your password');
        this.welcome_screen = page.getByText('Welcome to your new account');
        this.i_understand_button = page.getByRole('button');
        this.confirm_signIn_msg = page.getByText('Sign in to Adobe');
        this.confirm_sign_in_button = page.getByText('Continue');
    }

    async g_email_field( email : string ): Promise<void> {
        await this.email_field.fill(email);
        await this.page.waitForTimeout(1000);
        await this.email_field.press("Enter");
    }

    async g_password_field( password : string ): Promise<void> {
        await this.password_field.fill(password);
        await this.page.waitForTimeout(1000);
        await this.password_field.press("Enter");
    }

    async click_g_iUnderstand(): Promise<void> {
        await this.i_understand_button.click();
    }

    async click_confirm_sign_in_button(): Promise<void> {
        await this.confirm_sign_in_button.click();
    }

    async g_login( email:string , password:string): Promise<void> {
        await this.email_field.waitFor({state:'visible'});
        await this.g_email_field( email );
        await this.g_password_field( password);

        try {
            await this.welcome_screen.waitFor({ state: 'visible',timeout: 3000});
        } catch (e) {}
        if (await this.welcome_screen.isVisible()) {
            await this.click_g_iUnderstand();
        }

        try {
            await this.confirm_signIn_msg.waitFor({state: 'visible',timeout: 3000});
        } catch (e) {}
        if (await this.confirm_sign_in_button.isVisible()) {
            await this.click_confirm_sign_in_button();
        }

    }


}