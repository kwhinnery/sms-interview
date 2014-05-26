// App configuration, pulled in from system environment
// Centralized here so we know what all configuration is needed for the app
module.exports = {
    // Twilio API keys
    twilio: {
        token: process.env.TWILIO_AUTH_TOKEN,
        sid: process.env.TWILIO_ACCOUNT_SID
    },

    // MongoDB connection URL
    mongoUrl: process.env.MONGODB_URL,

    // TEMPORARY: HTTP Basic username and password
    un: process.env.BASIC_UN,
    pw: process.env.BASIC_PW
};