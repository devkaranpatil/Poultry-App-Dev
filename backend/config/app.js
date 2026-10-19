// The product name and contact, shared with the frontend through shared/app.json.
const app = require("../../shared/app.json");

module.exports = { APP_NAME: app.name, SUPPORT_EMAIL: app.supportEmail };
