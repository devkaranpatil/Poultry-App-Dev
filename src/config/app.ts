import app from '../../shared/app.json';

/**
 * The product name and contact, in one place for the frontend (the backend reads the same file).
 * The name, Kukkut (कुक्कुट, poultry), is set in shared/app.json: every screen, the page title, the report and the
 * emails follow it.
 */
export const APP_NAME: string = app.name;
export const SUPPORT_EMAIL: string = app.supportEmail;
